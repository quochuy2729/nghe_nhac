/**
 * "Đang muốn nghe gì": vector ý định = trung bình có trọng số đặc trưng các bài trong PHIÊN hiện tại
 * (các lượt nghe cách nhau < 30 phút). complete +1, partial +0.4, skip −0.7, giảm ×0.8 cho mỗi bài cũ hơn.
 */
import type { AudioFeatures, PlayEvent } from '@/lib/db';
import { basicVector, bpmNorm } from './audioSim';
import { moodOf, type Mood } from './mood';

export const SESSION_GAP_MS = 30 * 60_000;
const KIND_W: Record<PlayEvent['kind'], number> = { complete: 1, partial: 0.4, skip: -0.7 };
const AGE_DECAY = 0.8;

export interface Intent {
  /** [energy, brightness, onsetRate, dynamics, bpm chuẩn hóa], mỗi chiều ∈ [0,1] */
  vec: number[];
  /** BPM trung bình của các bài được nghe (không tính bài bị bỏ qua) */
  bpm: number | null;
  mood: Mood;
  /** số lượt nghe có đặc trưng trong phiên */
  count: number;
}

const toVec = (f: AudioFeatures): number[] => basicVector(f).map((x) => x + 0.5);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Các lượt nghe của phiên hiện tại, mới → cũ. Rỗng nếu lượt gần nhất đã quá 30 phút so với `now`. */
export function currentSession(events: readonly PlayEvent[], now: number): PlayEvent[] {
  const sorted = [...events].sort((a, b) => b.t - a.t);
  if (!sorted.length || now - sorted[0].t > SESSION_GAP_MS) return [];
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].t - sorted[i].t > SESSION_GAP_MS) break;
    out.push(sorted[i]);
  }
  return out;
}

export function computeIntent(events: readonly PlayEvent[], features: ReadonlyMap<string, AudioFeatures>, now: number): Intent | null {
  const session = currentSession(events, now).filter((e) => features.has(e.trackId));
  if (!session.length) return null;

  const pos = [0, 0, 0, 0, 0];
  const neg = [0, 0, 0, 0, 0];
  let posW = 0;
  let negW = 0;
  let bpmSum = 0;
  let bpmW = 0;
  session.forEach((e, i) => {
    const f = features.get(e.trackId)!;
    const w = KIND_W[e.kind] * AGE_DECAY ** i;
    const v = toVec(f);
    if (w > 0) {
      posW += w;
      v.forEach((x, k) => (pos[k] += w * x));
      if (f.bpm) {
        bpmSum += w * f.bpm;
        bpmW += w;
      }
    } else {
      negW += -w;
      v.forEach((x, k) => (neg[k] += -w * x));
    }
  });

  // Chưa có bài nào được nghe trọn thì lấy điểm giữa làm gốc rồi đẩy ra xa các bài bị bỏ qua.
  const posMean = posW ? pos.map((x) => x / posW) : [0.5, 0.5, 0.5, 0.5, 0.5];
  const negMean = negW ? neg.map((x) => x / negW) : posMean;
  const push = 0.35 * (negW / (posW + negW || 1)) * (posW ? 1 : 1.5);
  const vec = posMean.map((p, k) => clamp01(p + push * (p - negMean[k])));
  const bpm = bpmW ? Math.round(bpmSum / bpmW) : null;
  return {
    vec,
    bpm,
    mood: moodOf({ energy: vec[0], brightness: vec[1], dynamics: vec[3], bpm: bpm ?? (vec[4] === 0.5 ? null : 70 + vec[4] * 110) }),
    count: session.length,
  };
}

/** 0..1: bài có đặc trưng gần vector ý định bao nhiêu. */
export function intentScore(intent: Intent, f: AudioFeatures): number {
  const v = toVec(f);
  let d = 0;
  for (let k = 0; k < 5; k++) d += (v[k] - intent.vec[k]) ** 2;
  return 1 - Math.sqrt(d / 5) / 0.7;
}

export function describeIntent(intent: Intent, label: (m: Mood) => string): string {
  const parts = [label(intent.mood)];
  if (intent.bpm) parts.push(`~${intent.bpm} BPM`);
  return parts.join(' · ');
}

export { bpmNorm };
