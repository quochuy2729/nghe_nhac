/**
 * Trích đặc trưng âm thanh — hàm thuần, xác định (cùng input → cùng output), chạy trong Web Worker.
 * Đầu vào: PCM mono Float32 (thường 45 giây, 22 050 Hz). Xem docs/ARCHITECTURE.md §6.
 * Mọi giá trị chuẩn hóa về [0,1] theo hằng số CỐ ĐỊNH (không theo thư viện) để hai máy cho cùng kết quả.
 */
import Meyda from 'meyda';
import type { AudioFeatures } from '@/lib/db';

export const SAMPLE_RATE = 22_050;
const FRAME = 2048;
const HOP = 1024;
const N_MFCC = 13;
/** Khung ngắn cho đường bao onset (BPM cần độ phân giải thời gian cao hơn). */
const ENV_FRAME = 512;
const ENV_HOP = 256;

const MIN_BPM = 70;
const MAX_BPM = 180;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}

function std(a: ArrayLike<number>, m = mean(a)): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return a.length ? Math.sqrt(s / a.length) : 0;
}

function rmsOf(x: Float32Array, start: number, len: number): number {
  let s = 0;
  const end = Math.min(x.length, start + len);
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / len);
}

/** Đường bao năng lượng khung ngắn và độ tăng (nửa sóng) của nó = đường bao onset. */
export function onsetEnvelope(pcm: Float32Array): Float32Array {
  const n = Math.max(0, Math.floor((pcm.length - ENV_FRAME) / ENV_HOP) + 1);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r = rmsOf(pcm, i * ENV_HOP, ENV_FRAME);
    env[i] = Math.max(0, r - prev);
    prev = r;
  }
  return env;
}

/** Số onset/giây: đỉnh vượt (trung bình + 1σ), cách nhau ≥ 0,1 s. */
export function onsetsPerSecond(env: Float32Array, envRate: number): number {
  if (env.length < 3) return 0;
  const m = mean(env);
  const th = m + std(env, m);
  const minGap = Math.max(1, Math.round(0.1 * envRate));
  let count = 0;
  let last = -minGap;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > th && env[i] >= env[i - 1] && env[i] > env[i + 1] && i - last >= minGap) {
      count++;
      last = i;
    }
  }
  return count / (env.length / envRate);
}

/**
 * BPM = đỉnh tự tương quan của đường bao onset trong 70–180 BPM (nội suy parabol cho độ chính xác dưới 1 khung),
 * gộp nửa/gấp đôi về khoảng 80–160 khi có đỉnh tương đương.
 */
export function estimateBpm(env: Float32Array, envRate: number): { bpm: number | null; conf: number } {
  const n = env.length;
  const lagMin = Math.max(2, Math.floor((envRate * 60) / MAX_BPM));
  const lagMax = Math.min(n - 2, Math.ceil((envRate * 60) / MIN_BPM));
  if (lagMax <= lagMin + 2) return { bpm: null, conf: 0 };
  const m = mean(env);
  const e = Float32Array.from(env, (v) => v - m);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += e[i] * e[i];
  if (energy < 1e-12) return { bpm: null, conf: 0 };

  const r = new Float64Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag];
    r[lag] = s / energy;
  }
  let best = lagMin;
  for (let lag = lagMin; lag <= lagMax; lag++) if (r[lag] > r[best]) best = lag;
  if (r[best] < 0.05) return { bpm: null, conf: 0 };

  const refine = (lag: number): number => {
    const a = r[lag - 1];
    const b = r[lag];
    const c = r[lag + 1];
    const d = a - 2 * b + c;
    return d < 0 ? lag + (0.5 * (a - c)) / d : lag;
  };
  let bpm = (60 * envRate) / refine(best);
  const peakAt = (bpmTarget: number): number => {
    const lag = Math.round((60 * envRate) / bpmTarget);
    if (lag < lagMin || lag > lagMax) return 0;
    // Đỉnh của đường bao hẹp nên nhịp thật có thể lệch vài khung so với lag làm tròn.
    let p = 0;
    for (let l = Math.max(lagMin - 1, lag - 2); l <= Math.min(lagMax + 1, lag + 2); l++) p = Math.max(p, r[l]);
    return p;
  };
  if (bpm < 80 && peakAt(bpm * 2) >= 0.6 * r[best]) bpm *= 2;
  else if (bpm > 160 && peakAt(bpm / 2) >= 0.6 * r[best]) bpm /= 2;
  return { bpm: Math.round(bpm * 10) / 10, conf: clamp01(r[best]) };
}

export function extractFeatures(pcm: Float32Array, sampleRate = SAMPLE_RATE): AudioFeatures {
  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = FRAME;
  Meyda.numberOfMFCCCoefficients = N_MFCC;
  Meyda.windowingFunction = 'hanning';

  const rmsDb: number[] = [];
  const centroidHz: number[] = [];
  const mfccSum = new Float64Array(N_MFCC);
  let frames = 0;
  const frame = new Float32Array(FRAME);
  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    frame.set(pcm.subarray(start, start + FRAME));
    const f = Meyda.extract(['rms', 'spectralCentroid', 'mfcc'], frame) as {
      rms: number;
      spectralCentroid: number;
      mfcc: number[];
    } | null;
    if (!f) continue;
    frames++;
    rmsDb.push(20 * Math.log10(Math.max(f.rms, 1e-6)));
    // Frame im lặng không có trọng tâm phổ có nghĩa: bỏ khỏi trung bình độ sáng.
    if (f.rms > 1e-4 && Number.isFinite(f.spectralCentroid)) centroidHz.push((f.spectralCentroid * sampleRate) / FRAME);
    for (let k = 0; k < N_MFCC; k++) mfccSum[k] += Number.isFinite(f.mfcc[k]) ? f.mfcc[k] : 0;
  }

  const env = onsetEnvelope(pcm);
  const envRate = sampleRate / ENV_HOP;
  const onsetRate = onsetsPerSecond(env, envRate);
  const { bpm, conf } = estimateBpm(env, envRate);

  let meanRms = 0;
  for (const d of rmsDb) meanRms += 10 ** (d / 20);
  meanRms = frames ? meanRms / frames : 0;
  const loudnessDb = 20 * Math.log10(Math.max(meanRms, 1e-6));
  const hz = centroidHz.length ? mean(centroidHz) : 200;

  const onsetNorm = clamp01(onsetRate / 6);
  return {
    v: 1,
    bpm,
    bpmConf: Math.round(conf * 1000) / 1000,
    energy: clamp01(0.7 * clamp01((loudnessDb + 40) / 30) + 0.3 * onsetNorm),
    loudnessDb: Math.round(loudnessDb * 10) / 10,
    brightness: clamp01(Math.log2(Math.max(hz, 200) / 200) / Math.log2(6000 / 200)),
    onsetRate: onsetNorm,
    dynamics: clamp01(std(rmsDb) / 12),
    mfcc: Array.from(mfccSum, (s) => (frames ? Math.round((s / frames) * 1000) / 1000 : 0)),
    analyzedSec: Math.round(pcm.length / sampleRate),
  };
}
