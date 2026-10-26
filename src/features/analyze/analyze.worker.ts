/** Web Worker: chạy extractFeatures ngoài luồng giao diện. Tải lười, không nằm trong bundle chính. */
import { extractFeatures } from './extract';

interface Req {
  id: number;
  pcm: Float32Array;
  sampleRate: number;
}

const ctx = self as unknown as {
  onmessage: ((e: { data: Req }) => void) | null;
  postMessage(m: unknown): void;
};

ctx.onmessage = (e) => {
  const { id, pcm, sampleRate } = e.data;
  try {
    ctx.postMessage({ id, features: extractFeatures(pcm, sampleRate) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
