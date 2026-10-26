/**
 * Logic hàng đợi thuần (không đụng DOM) để dễ test.
 * - `original`: thứ tự gốc — dùng để khôi phục khi tắt shuffle.
 * - `items`: thứ tự phát hiện tại (đã xáo nếu bật shuffle).
 */
import type { Track } from '@/providers/types';

export type RepeatMode = 'off' | 'all' | 'one';
export type Rng = () => number;

export interface QueueItem {
  uid: string;
  track: Track;
  /** Bài do "trộn thông minh" chèn thêm (gắn nhãn ✨), không thuộc danh sách gốc. */
  suggested?: boolean;
}

export interface QueueState {
  original: QueueItem[];
  items: QueueItem[];
  index: number;
  shuffle: boolean;
  /** Với shuffle = true: true là "trộn thông minh" (xem recommend/smartShuffle). */
  smart?: boolean;
  repeat: RepeatMode;
}

/** play: phát bài ở `index`; restart: tua về 0 và phát; stop: dừng ở bài `index`. */
export type PlaybackAction = 'play' | 'restart' | 'stop';

export interface Step {
  state: QueueState;
  action: PlaybackAction;
}

/** Ngưỡng (giây) để nút "Bài trước" quay về đầu bài thay vì lùi bài. */
export const PREV_RESTART_THRESHOLD_SEC = 3;

let uidCounter = 0;
export function makeUid(): string {
  uidCounter += 1;
  return `q${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

export const emptyQueue: QueueState = {
  original: [],
  items: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
};

export function currentItem(state: QueueState): QueueItem | undefined {
  return state.items[state.index];
}

/** Fisher–Yates, trả mảng mới. */
export function fisherYates<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Xáo hàng đợi nhưng giữ bài đang phát ở đầu. */
export function shuffleKeepCurrent(items: readonly QueueItem[], index: number, rng: Rng = Math.random): QueueItem[] {
  if (index < 0 || index >= items.length) return fisherYates(items, rng);
  const current = items[index];
  const rest = items.filter((_, i) => i !== index);
  return [current, ...fisherYates(rest, rng)];
}

export function createQueue(
  tracks: readonly Track[],
  startIndex: number,
  opts: { shuffle?: boolean; repeat?: RepeatMode; rng?: Rng; uid?: () => string } = {},
): QueueState {
  const uid = opts.uid ?? makeUid;
  const original = tracks.map((track) => ({ uid: uid(), track }));
  if (original.length === 0) return { ...emptyQueue, shuffle: !!opts.shuffle, repeat: opts.repeat ?? 'off' };
  const start = Math.min(Math.max(startIndex, 0), original.length - 1);
  const shuffle = !!opts.shuffle;
  return {
    original,
    items: shuffle ? shuffleKeepCurrent(original, start, opts.rng) : original,
    index: shuffle ? 0 : start,
    shuffle,
    repeat: opts.repeat ?? 'off',
  };
}

export function setShuffle(state: QueueState, on: boolean, rng: Rng = Math.random): QueueState {
  if (on === state.shuffle) return state;
  const cur = currentItem(state);
  if (on) {
    return { ...state, shuffle: true, items: shuffleKeepCurrent(state.items, state.index, rng), index: cur ? 0 : -1 };
  }
  // Về thứ tự gốc: bỏ bài ✨ chèn thêm; đang phát bài ✨ thì quay về đầu danh sách.
  const items = state.original;
  const at = cur ? items.findIndex((it) => it.uid === cur.uid) : -1;
  return { ...state, shuffle: false, smart: false, items, index: cur && at < 0 ? 0 : at };
}

/**
 * Đặt thứ tự mới cho các bài SAU bài đang phát (trộn thông minh). `original` giữ nguyên để tắt trộn là về
 * đúng thứ tự cũ; bài ✨ chỉ nằm trong `items`.
 */
export function applySmartOrder(state: QueueState, upcoming: readonly QueueItem[]): QueueState {
  const cur = currentItem(state);
  return { ...state, shuffle: true, smart: true, items: [...(cur ? [cur] : []), ...upcoming], index: cur ? 0 : -1 };
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** Vòng shuffle mới khi hết hàng đợi (repeat all): tránh phát lại ngay bài vừa xong. */
function reshuffleRound(state: QueueState, rng: Rng): QueueItem[] {
  const last = currentItem(state);
  const round = fisherYates(state.original, rng);
  if (last && round.length > 1 && round[0].uid === last.uid) {
    const j = 1 + Math.floor(rng() * (round.length - 1));
    [round[0], round[j]] = [round[j], round[0]];
  }
  return round;
}

/**
 * Sang bài kế tiếp.
 * @param auto true khi gọi từ sự kiện `ended` (repeat one → phát lại bài hiện tại).
 */
export function next(state: QueueState, opts: { auto?: boolean; rng?: Rng } = {}): Step {
  const { items, index, repeat } = state;
  if (items.length === 0) return { state, action: 'stop' };
  if (opts.auto && repeat === 'one') return { state, action: 'restart' };
  if (index < items.length - 1) return { state: { ...state, index: index + 1 }, action: 'play' };
  // Hết hàng đợi
  if (repeat === 'all' || repeat === 'one') {
    if (state.shuffle) {
      return { state: { ...state, items: reshuffleRound(state, opts.rng ?? Math.random), index: 0 }, action: 'play' };
    }
    return { state: { ...state, index: 0 }, action: 'play' };
  }
  return { state: { ...state, index: 0 }, action: 'stop' };
}

/** Về bài trước; nếu đã phát > 3s thì tua về đầu bài. */
export function prev(state: QueueState, currentTimeSec: number): Step {
  const { items, index, repeat } = state;
  if (items.length === 0) return { state, action: 'stop' };
  if (currentTimeSec > PREV_RESTART_THRESHOLD_SEC) return { state, action: 'restart' };
  if (index > 0) return { state: { ...state, index: index - 1 }, action: 'play' };
  if (repeat === 'all') return { state: { ...state, index: items.length - 1 }, action: 'play' };
  return { state, action: 'restart' };
}

export function jumpTo(state: QueueState, uid: string): QueueState {
  const i = state.items.findIndex((it) => it.uid === uid);
  return i < 0 ? state : { ...state, index: i };
}

function insertAt<T>(arr: readonly T[], at: number, add: readonly T[]): T[] {
  return [...arr.slice(0, at), ...add, ...arr.slice(at)];
}

/** Chèn ngay sau bài đang phát. */
export function playNext(state: QueueState, tracks: readonly Track[], uid: () => string = makeUid): QueueState {
  const add = tracks.map((track) => ({ uid: uid(), track }));
  if (state.items.length === 0) return { ...state, original: add, items: add, index: add.length ? 0 : -1 };
  const cur = currentItem(state);
  const origPos = cur ? state.original.findIndex((it) => it.uid === cur.uid) : state.original.length - 1;
  const original = insertAt(state.original, origPos + 1, add);
  const items = state.shuffle ? insertAt(state.items, state.index + 1, add) : original;
  return { ...state, original, items };
}

/** Thêm vào cuối hàng đợi. */
export function enqueue(state: QueueState, tracks: readonly Track[], uid: () => string = makeUid): QueueState {
  const add = tracks.map((track) => ({ uid: uid(), track }));
  if (state.items.length === 0) return { ...state, original: add, items: add, index: add.length ? 0 : -1 };
  const original = [...state.original, ...add];
  const items = state.shuffle ? [...state.items, ...add] : original;
  return { ...state, original, items };
}

/** Xóa một bài (không xóa bài đang phát). */
export function removeItem(state: QueueState, uid: string): QueueState {
  const cur = currentItem(state);
  if (!cur || cur.uid === uid) return state;
  const items = state.items.filter((it) => it.uid !== uid);
  const original = state.original.filter((it) => it.uid !== uid);
  return { ...state, items, original, index: items.findIndex((it) => it.uid === cur.uid) };
}

/** Đổi vị trí trong thứ tự phát hiện tại. */
export function moveItem(state: QueueState, from: number, to: number): QueueState {
  const n = state.items.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
  const cur = currentItem(state);
  const items = state.items.slice();
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return {
    ...state,
    items,
    original: state.shuffle ? state.original : items,
    index: cur ? items.findIndex((it) => it.uid === cur.uid) : -1,
  };
}

/** Các bài sẽ phát tiếp theo (sau bài hiện tại). */
export function upcoming(state: QueueState): QueueItem[] {
  return state.items.slice(state.index + 1);
}
