/** Cầu nối giữa engine thuần và dữ liệu thật của app (thư viện folder, lịch sử, bài đã thích). */
import { useFolder } from '@/providers/folder';
import type { Track } from '@/providers/types';
import { useLibrary } from '@/features/library/store';
import { recommend, similarTo, type Signals } from './engine';
import { useHistory } from './history';

export function currentSignals(now = Date.now()): Signals {
  return {
    library: useFolder.getState().tracks,
    events: useHistory.getState().events,
    liked: new Set(useLibrary.getState().liked.map((t) => t.id)),
    now,
  };
}

/** Danh sách "radio" bắt đầu từ một bài: các bài giống nhất (không kèm chính bài đó). */
export function similarForTrack(seed: Track, limit = 30): Track[] {
  return similarTo(seed, currentSignals(), { limit }).map((x) => x.track);
}

/** Bài nối tiếp khi hàng đợi hết: giống bài vừa nghe, tránh bài đã có trong hàng đợi. */
export function autoplayTracks(seed: Track, queueIds: Iterable<string>, limit = 10): Track[] {
  const exclude = new Set(queueIds);
  const found = similarTo(seed, currentSignals(), { limit, exclude }).map((x) => x.track);
  if (found.length >= Math.min(limit, 3)) return found;
  return recommend(currentSignals(), { limit, exclude }).map((x) => x.track);
}
