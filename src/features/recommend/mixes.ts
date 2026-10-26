/** Các mix tự động trên Trang chủ (docs/ARCHITECTURE.md §5). Hàm thuần: nhận Signals + rng/now. */
import type { AudioFeatures } from '@/lib/db';
import type { Track } from '@/providers/types';
import { recommend, type Mix, type Signals } from './engine';
import { describeIntent, computeIntent } from './intent';
import { hourSlot, moodOf, MOOD_LABEL, SLOT_LABEL, type Mood } from './mood';

const DAY = 86_400_000;
const MIN_MIX = 6;

export interface IntentMix {
  /** Chip "Đang hợp: Chill · ~90 BPM" */
  chip: string;
  tracks: Track[];
}

/** "Đang muốn nghe": bài hợp nhất với ý định hiện tại (chỉ khi có phiên đang nghe và có đặc trưng). */
export function intentMix(s: Signals, limit = 20): IntentMix | null {
  if (!s.features?.size) return null;
  const intent = computeIntent(s.events, s.features, s.now);
  if (!intent || intent.count < 2) return null;
  const recent = new Set(s.events.filter((e) => s.now - e.t < 30 * 60_000).map((e) => e.trackId));
  const tracks = recommend(s, { limit, exclude: recent }).map((x) => x.track);
  return tracks.length ? { chip: `Đang hợp: ${describeIntent(intent, (m) => MOOD_LABEL[m])}`, tracks } : null;
}

/** Mix theo giờ: gu dài hạn riêng của khung giờ hiện tại ("Mix buổi sáng"). Cần ≥ 5 lượt nghe trong khung đó. */
export function timeMix(s: Signals, limit = 25): Mix | null {
  const slot = hourSlot(new Date(s.now));
  const events = s.events.filter((e) => hourSlot(new Date(e.t)) === slot && e.kind !== 'skip');
  if (events.length < 5) return null;
  const tracks = recommend({ ...s, events }, { limit }).map((x) => x.track);
  return tracks.length >= MIN_MIX ? { id: `time:${slot}`, title: `Mix ${SLOT_LABEL[slot]}`, tracks } : null;
}

/** Tối đa `max` mix theo tâm trạng (ước lượng từ đặc trưng), nhóm lớn nhất trước. */
export function moodMixes(library: readonly Track[], features: ReadonlyMap<string, AudioFeatures>, rng: () => number, max = 4, size = 30): Mix[] {
  const groups = new Map<Mood, Track[]>();
  for (const t of library) {
    const f = features.get(t.id);
    if (!f) continue;
    const m = moodOf(f);
    if (m === 'khac') continue;
    groups.set(m, [...(groups.get(m) ?? []), t]);
  }
  return [...groups]
    .filter(([, ts]) => ts.length >= MIN_MIX)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, max)
    .map(([m, ts]) => ({
      id: `mood:${m}`,
      title: `Mix ${MOOD_LABEL[m]}`,
      tracks: ts
        .map((t) => ({ t, k: rng() }))
        .sort((a, b) => a.k - b.k)
        .slice(0, size)
        .map((x) => x.t),
    }));
}

/** On Repeat: nghe nhiều nhất 30 ngày qua (không tính lượt bỏ qua). */
export function onRepeat(s: Signals, limit = 30): Track[] {
  const byId = new Map(s.library.map((t) => [t.id, t]));
  const count = new Map<string, number>();
  for (const e of s.events) if (e.kind !== 'skip' && s.now - e.t <= 30 * DAY) count.set(e.trackId, (count.get(e.trackId) ?? 0) + 1);
  return [...count]
    .filter(([id, n]) => n >= 2 && byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id)!);
}

/** Lâu rồi chưa nghe: từng nghe trọn ≥ 3 lần nhưng 60 ngày nay chưa nghe lại. */
export function longTimeNoSee(s: Signals, limit = 30): Track[] {
  const byId = new Map(s.library.map((t) => [t.id, t]));
  const stat = new Map<string, { complete: number; last: number }>();
  for (const e of s.events) {
    if (e.kind === 'skip') continue;
    const cur = stat.get(e.trackId) ?? { complete: 0, last: 0 };
    if (e.kind === 'complete') cur.complete++;
    cur.last = Math.max(cur.last, e.t);
    stat.set(e.trackId, cur);
  }
  return [...stat]
    .filter(([id, v]) => byId.has(id) && v.complete >= 3 && s.now - v.last >= 60 * DAY)
    .sort((a, b) => b[1].complete - a[1].complete)
    .slice(0, limit)
    .map(([id]) => byId.get(id)!);
}

/** Khám phá trong thư viện: bài ít được nghe (≤ 1 lượt) nhưng giống gu hiện tại. */
export function discoverInLibrary(s: Signals, limit = 30): Track[] {
  const plays = new Map<string, number>();
  for (const e of s.events) if (e.kind !== 'skip') plays.set(e.trackId, (plays.get(e.trackId) ?? 0) + 1);
  const exclude = new Set(s.library.filter((t) => (plays.get(t.id) ?? 0) > 1).map((t) => t.id));
  return recommend(s, { limit, exclude }).map((x) => x.track);
}
