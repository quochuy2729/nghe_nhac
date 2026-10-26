/** Chạy trích đặc trưng trong Web Worker (tạo lười ở lần dùng đầu); không có Worker thì chạy tại chỗ. */
import type { AudioFeatures } from '@/lib/db';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { ok: (f: AudioFeatures) => void; fail: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: number; features?: AudioFeatures; error?: string }>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.features) w.ok(e.data.features);
    else w.fail(new Error(e.data.error ?? 'Phân tích lỗi'));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.fail(new Error('Worker phân tích bị lỗi'));
    waiting.clear();
    worker = null;
  };
  return worker;
}

export async function analyzePcm(pcm: Float32Array, sampleRate = 22_050): Promise<AudioFeatures> {
  const w = getWorker();
  if (!w) {
    const { extractFeatures } = await import('./extract');
    return extractFeatures(pcm, sampleRate);
  }
  return new Promise((ok, fail) => {
    const id = ++seq;
    waiting.set(id, { ok, fail });
    // Chuyển quyền sở hữu buffer sang worker (không sao chép).
    w.postMessage({ id, pcm, sampleRate }, [pcm.buffer]);
  });
}
