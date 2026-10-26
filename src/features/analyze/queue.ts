/**
 * Hàng đợi phân tích nền (docs/ARCHITECTURE.md §6): mỗi lần một bài, đoạn 45 giây quanh điểm 35% thời lượng.
 * Logic điều phối thuần — mọi phụ thuộc (giải mã, trích, lưu, điều kiện chạy) được tiêm vào để test.
 */
import type { AudioFeatures } from '@/lib/db';
import type { Track } from '@/providers/types';

export const SEGMENT_SEC = 45;

/** Đoạn cần giải mã: 45 giây quanh 35% thời lượng; bài ngắn hơn 45 giây thì lấy cả bài. */
export function segmentFor(durationSec: number): { start: number; dur: number } {
  if (!(durationSec > SEGMENT_SEC)) return { start: 0, dur: SEGMENT_SEC };
  const centre = durationSec * 0.35;
  const start = Math.min(durationSec - SEGMENT_SEC, Math.max(0, centre - SEGMENT_SEC / 2));
  return { start: Math.round(start * 10) / 10, dur: SEGMENT_SEC };
}

export interface RunConditions {
  platform: 'web' | 'android';
  appVisible: boolean;
  isPlaying: boolean;
  /** null = trình duyệt không cho biết (iOS) */
  charging: boolean | null;
  batteryLevel: number | null;
}

/** Chỉ chạy khi app đang mở; Poco: đang sạc hoặc pin > 40%; iPhone: không chạy khi đang phát nhạc. */
export function canRunNow(c: RunConditions): boolean {
  if (!c.appVisible) return false;
  if (c.platform === 'android') return c.charging === true || c.batteryLevel === null || c.batteryLevel > 0.4;
  return !c.isPlaying;
}

export type QueueState = 'idle' | 'running' | 'waiting' | 'paused' | 'done';

export interface Progress {
  total: number;
  done: number;
  failed: number;
  state: QueueState;
  current?: string;
}

export interface AnalysisDeps {
  tracks: () => readonly Track[];
  has: (trackId: string) => boolean;
  decode: (track: Track, startSec: number, durSec: number) => Promise<Float32Array>;
  analyze: (pcm: Float32Array) => Promise<AudioFeatures>;
  save: (trackId: string, features: AudioFeatures) => Promise<void>;
  /** Lấy đặc trưng đã có trên server (máy kia tính) trước khi tự tính. */
  refreshRemote: () => Promise<void>;
  canRun: () => boolean;
  onProgress: (p: Progress) => void;
  /** Nhường luồng giữa các bài để UI không giật. */
  yieldNow?: () => Promise<void>;
}

export function createAnalysisQueue(deps: AnalysisDeps) {
  let running = false;
  let paused = false;
  const failed = new Set<string>();
  const yieldNow = deps.yieldNow ?? (() => new Promise<void>((r) => setTimeout(r, 0)));

  const snapshot = (state: QueueState, current?: string): Progress => {
    const all = deps.tracks();
    const done = all.filter((t) => deps.has(t.id)).length;
    return { total: all.length, done, failed: failed.size, state, ...(current ? { current } : {}) };
  };

  /** Phân tích dần các bài chưa có đặc trưng. `force` bỏ qua điều kiện pin/phát nhạc (nút "Phân tích ngay"). */
  async function run(force = false): Promise<Progress> {
    if (running) return snapshot('running');
    running = true;
    paused = false;
    try {
      try {
        await deps.refreshRemote();
      } catch {
        // offline: cứ tự tính
      }
      for (;;) {
        const next = deps.tracks().find((t) => !deps.has(t.id) && !failed.has(t.id));
        if (!next) {
          const p = snapshot('done');
          deps.onProgress(p);
          return p;
        }
        if (paused) {
          const p = snapshot('paused');
          deps.onProgress(p);
          return p;
        }
        if (!force && !deps.canRun()) {
          const p = snapshot('waiting');
          deps.onProgress(p);
          return p;
        }
        deps.onProgress(snapshot('running', next.id));
        try {
          const seg = segmentFor(next.durationSec);
          const pcm = await deps.decode(next, seg.start, seg.dur);
          if (pcm.length < 22_050) throw new Error('Đoạn nhạc quá ngắn');
          await deps.save(next.id, await deps.analyze(pcm));
        } catch {
          failed.add(next.id); // không thử lại trong phiên này
        }
        await yieldNow();
      }
    } finally {
      running = false;
    }
  }

  return {
    run,
    pause() {
      paused = true;
    },
    isRunning: () => running,
    progress: (state: QueueState = 'idle') => snapshot(state),
  };
}
