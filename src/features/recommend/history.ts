/**
 * Lịch sử nghe, lưu trong IndexedDB (store `events`, chỉ trên máy này; G4 sẽ đồng bộ). Mỗi lần nghe được
 * phân loại: nghe gần hết = thích, bỏ qua sớm = không thích. Engine dùng để đoán gu hiện tại.
 */
import { create } from 'zustand';
import { clearEvents, deleteEvents, getAllEvents, putEvents, type PlayEvent, type StoredPlayEvent } from '@/lib/db';
import { uuid, uuidFrom } from '@/lib/id';
import { platform } from '@/platform';

export type { PlayEvent };
export type PlayKind = PlayEvent['kind'];

/** Dưới ngưỡng này coi là bấm nhầm, không ghi lại. */
export const MIN_LISTEN_SEC = 5;
/** Giữ tối đa chừng này lượt nghe trên máy. */
export const MAX_EVENTS = 20_000;

const LEGACY_KEY = 'nn-history';

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

/** Giữ `max` lượt mới nhất; trả cả phần bị bỏ để xóa khỏi IndexedDB. */
export function capEvents<T extends { t: number }>(events: readonly T[], max: number): { kept: T[]; dropped: T[] } {
  if (events.length <= max) return { kept: events.slice(), dropped: [] };
  const cut = events.length - max;
  return { kept: events.slice(cut), dropped: events.slice(0, cut) };
}

function currentDevice(): PlayEvent['device'] {
  return platform.id === 'android' ? 'poco' : 'iphone';
}

interface HistoryState {
  events: StoredPlayEvent[];
  record: (trackId: string, playedSec: number, durationSec: number, now?: number) => void;
  clear: () => void;
}

const sortByTime = (a: { t: number }, b: { t: number }) => a.t - b.t;

export const useHistory = create<HistoryState>()((set, get) => ({
  events: [],
  record: (trackId, playedSec, durationSec, now = Date.now()) => {
    const kind = classifyPlay(playedSec, durationSec);
    if (!kind) return;
    const ev: StoredPlayEvent = {
      id: uuid(),
      trackId,
      t: now,
      sec: Math.round(playedSec),
      dur: Math.round(durationSec),
      kind,
      device: currentDevice(),
      synced: 0,
    };
    const { kept, dropped } = capEvents([...get().events, ev], MAX_EVENTS);
    set({ events: kept });
    void putEvents([ev]).catch(() => undefined);
    if (dropped.length) void deleteEvents(dropped.map((d) => d.id)).catch(() => undefined);
  },
  clear: () => {
    set({ events: [] });
    void clearEvents().catch(() => undefined);
  },
}));

/**
 * Chuyển lịch sử cũ từ localStorage (`nn-history`) sang IndexedDB rồi xóa key cũ.
 * id sinh xác định từ nội dung lượt nghe nên nếu bị ngắt giữa chừng và chạy lại cũng không nhân đôi.
 */
export async function migrateLegacyHistory(): Promise<number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;

  let old: Array<{ id?: unknown; t?: unknown; sec?: unknown; kind?: unknown }> = [];
  try {
    const parsed = JSON.parse(raw) as { state?: { events?: unknown } };
    if (Array.isArray(parsed?.state?.events)) old = parsed.state.events;
  } catch {
    // dữ liệu hỏng: bỏ, vẫn xóa key để không thử lại mãi
  }

  const device = currentDevice();
  const rows: StoredPlayEvent[] = [];
  for (const e of old) {
    if (typeof e.id !== 'string' || typeof e.t !== 'number' || typeof e.sec !== 'number') continue;
    if (e.kind !== 'complete' && e.kind !== 'partial' && e.kind !== 'skip') continue;
    rows.push({
      id: uuidFrom(`${e.id}|${e.t}|${e.sec}|${e.kind}`),
      trackId: e.id,
      t: e.t,
      sec: e.sec,
      dur: 0,
      kind: e.kind,
      device,
      synced: 0,
    });
  }
  if (rows.length) await putEvents(rows);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  return rows.length;
}

/** Nạp lịch sử vào bộ nhớ khi mở app (đã gồm migrate). Các lượt ghi trong lúc đang nạp được giữ lại. */
export async function loadHistory(): Promise<void> {
  try {
    await migrateLegacyHistory();
    const stored = await getAllEvents();
    const byId = new Map<string, StoredPlayEvent>(stored.map((e) => [e.id, e]));
    for (const e of useHistory.getState().events) byId.set(e.id, e);
    const { kept } = capEvents([...byId.values()].sort(sortByTime), MAX_EVENTS);
    useHistory.setState({ events: kept });
  } catch {
    // IndexedDB không dùng được: vẫn chạy với lịch sử trong bộ nhớ
  }
}

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
