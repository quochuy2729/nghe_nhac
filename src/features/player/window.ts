/**
 * "Cửa sổ" hàng đợi đẩy xuống engine native (xem platform/types.ts › AudioEngine.managesQueue).
 * Logic thuần: chọn bài nào nằm trong cửa sổ, khi nào cần nạp thêm.
 */
import type { QueueItem, QueueState } from './queue';

/** Số bài tối đa phía sau bài hiện tại trong cửa sổ. */
export const WINDOW_AHEAD = 20;
/** Còn ≤ chừng này bài phía sau thì nạp thêm. */
export const TOP_UP_AT = 5;

/** Bài hiện tại + tối đa `ahead` bài kế (không vòng lại đầu: hết cửa sổ thì JS quyết định lặp/xáo/tự phát). */
export function windowFromQueue(queue: QueueState, ahead = WINDOW_AHEAD): QueueItem[] {
  const cur = queue.items[queue.index];
  if (!cur) return [];
  // Lặp một bài: để JS tự phát lại khi `ended`, không đưa bài khác vào cửa sổ.
  if (queue.repeat === 'one') return [cur];
  return queue.items.slice(queue.index, queue.index + 1 + ahead);
}

/** Các bài sau bài đang phát, theo thứ tự hàng đợi hiện tại. */
export function upcomingItems(queue: QueueState, ahead = WINDOW_AHEAD): QueueItem[] {
  return windowFromQueue(queue, ahead).slice(1);
}

/** Cần nạp thêm khi số bài còn lại phía sau bài đang phát (trong cửa sổ) ≤ ngưỡng. */
export function needsTopUp(windowLength: number, windowIndex: number, repeat: QueueState['repeat']): boolean {
  if (repeat === 'one' || windowIndex < 0) return false;
  return windowLength - 1 - windowIndex <= TOP_UP_AT;
}

/** Tối đa `count` bài ngay sau bài có uid `lastUid` trong hàng đợi. */
export function itemsAfter(queue: QueueState, lastUid: string | undefined, count: number): QueueItem[] {
  const i = queue.items.findIndex((it) => it.uid === lastUid);
  if (i < 0 || count <= 0) return [];
  return queue.items.slice(i + 1, i + 1 + count);
}
