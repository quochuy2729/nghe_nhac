/** Độ giống nhau về âm thanh giữa hai bài (cosine trên vector đặc trưng đã căn giữa). Hàm thuần. */
import type { AudioFeatures } from '@/lib/db';

/** Chuẩn hóa BPM về [0,1] (70–180); không có BPM → 0.5 (trung tính). */
export function bpmNorm(bpm: number | null | undefined): number {
  if (!bpm) return 0.5;
  return Math.min(1, Math.max(0, (bpm - 70) / 110));
}

/** Độ lệch chuẩn gần đúng của MFCC 1…12 (cố định, để hai máy cho cùng kết quả). */
const MFCC_SIGMA = [25, 15, 12, 10, 9, 8, 7, 6, 6, 5, 5, 4];
const W_BASIC = 2;
const W_MFCC = 0.5;

/** 5 chỉ số chính, căn quanh 0.5 → [-0.5, 0.5]. */
export function basicVector(f: AudioFeatures): number[] {
  return [f.energy - 0.5, f.brightness - 0.5, f.onsetRate - 0.5, f.dynamics - 0.5, bpmNorm(f.bpm) - 0.5];
}

export function featureVector(f: AudioFeatures): number[] {
  const mf = MFCC_SIGMA.map((s, i) => ((f.mfcc[i + 1] ?? 0) / s) * W_MFCC);
  return [...basicVector(f).map((x) => x * W_BASIC), ...mf];
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 0..1: 1 = giống hệt, 0.5 = không liên quan, 0 = đối nghịch. */
export function audioSim(a: AudioFeatures, b: AudioFeatures): number {
  return (cosine(featureVector(a), featureVector(b)) + 1) / 2;
}
