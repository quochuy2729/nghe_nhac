/**
 * Lịch sử nghe (chỉ lưu trên máy này). Mỗi lần nghe một bài được phân loại:
 * nghe gần hết = thích, bỏ qua sớm = không thích. Engine dùng để đoán gu hiện tại.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

export type PlayKind = 'complete' | 'partial' | 'skip';

export interface PlayEvent {
  /** id bài (`folder:…`) */
  id: string;
  /** thời điểm kết thúc lần nghe (ms) */
  t: number;
  /** số giây thực sự đã nghe */
  sec: number;
  kind: PlayKind;
}

/** Dưới ngưỡng này coi là bấm nhầm, không ghi lại. */
export const MIN_LISTEN_SEC = 5;
export const MAX_EVENTS = 3000;

/**
 * Phân loại một lần nghe. `null` = quá ngắn, bỏ qua.
 * - complete: nghe ≥ 80% bài (hoặc còn dưới 8 giây là hết)
 * - skip: bỏ qua trong 30 giây đầu / 30% đầu của bài ngắn
 */
export function classifyPlay(playedSec: number, durationSec: number): PlayKind | null {
  if (!(playedSec >= MIN_LISTEN_SEC)) return null;
  if (durationSec > 0) {
    if (playedSec >= Math.min(durationSec * 0.8, durationSec - 8)) return 'complete';
    if (playedSec < Math.min(30, durationSec * 0.3)) return 'skip';
    return 'partial';
  }
  return playedSec >= 120 ? 'complete' : playedSec < 30 ? 'skip' : 'partial';
}

interface HistoryState {
  events: PlayEvent[];
  record: (id: string, playedSec: number, durationSec: number, now?: number) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      events: [],
      record: (id, playedSec, durationSec, now = Date.now()) => {
        const kind = classifyPlay(playedSec, durationSec);
        if (!kind) return;
        set((s) => ({ events: [...s.events, { id, t: now, sec: Math.round(playedSec), kind }].slice(-MAX_EVENTS) }));
      },
      clear: () => set({ events: [] }),
    }),
    { name: 'nn-history', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ events: s.events }) as HistoryState },
  ),
);

/**
 * Theo dõi thời gian nghe thực của bài đang phát (bỏ qua đoạn tua: chỉ cộng khi
 * thời gian tăng đều theo nhịp `timeupdate`).
 */
export function createListenTracker(record: (id: string, playedSec: number, durationSec: number) => void) {
  let cur: { id: string; dur: number; played: number; last: number } | null = null;
  return {
    begin(id: string, durationSec: number) {
      cur = { id, dur: durationSec, played: 0, last: 0 };
    },
    tick(currentTime: number) {
      if (!cur) return;
      const d = currentTime - cur.last;
      if (d > 0 && d < 2.5) cur.played += d;
      cur.last = currentTime;
    },
    /** Cập nhật thời lượng thật khi tag không có. */
    setDuration(durationSec: number) {
      if (cur && durationSec > 0) cur.dur = durationSec;
    },
    end() {
      if (cur) record(cur.id, cur.played, cur.dur);
      cur = null;
    },
  };
}
