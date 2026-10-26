/**
 * Thống kê kiểu Wrapped — hàm thuần trên lịch sử nghe (docs/ARCHITECTURE.md §3 PlayEvent).
 * Mọi tính toán theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè) nên chuỗi ngày nghe liên tiếp
 * qua nửa đêm đúng với ngày của người dùng dù máy ở múi giờ nào.
 */
import type { AudioFeatures, PlayEvent } from '@/lib/db';
import { normalizeText } from '@/lib/text';
import type { Track } from '@/providers/types';
import { splitArtists } from '@/features/library/browse';
import { moodOf, type Mood } from '@/features/recommend/mood';

export const VN_OFFSET_MS = 7 * 3_600_000;
const DAY = 86_400_000;

export type RangeKind = 'week' | 'month' | 'year' | 'custom';
export type DeviceFilter = 'all' | 'poco' | 'iphone';

export interface Period {
  /** [start, end) tính bằng ms UTC */
  start: number;
  end: number;
}

/** Nửa đêm (giờ VN) của ngày/tháng/năm đã cho, đổi ra ms UTC. */
const vnMidnight = (y: number, m: number, d: number): number => Date.UTC(y, m, d) - VN_OFFSET_MS;

export function localParts(t: number): { day: number; weekday: number; hour: number; y: number; m: number; d: number } {
  const x = t + VN_OFFSET_MS;
  const dt = new Date(x);
  return {
    day: Math.floor(x / DAY),
    weekday: (dt.getUTCDay() + 6) % 7, // 0 = thứ Hai … 6 = Chủ nhật
    hour: dt.getUTCHours(),
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth(),
    d: dt.getUTCDate(),
  };
}

export function periodFor(kind: RangeKind, now: number, custom?: Period): Period {
  const p = localParts(now);
  switch (kind) {
    case 'week': {
      const start = vnMidnight(p.y, p.m, p.d - p.weekday);
      return { start, end: start + 7 * DAY };
    }
    case 'month':
      return { start: vnMidnight(p.y, p.m, 1), end: vnMidnight(p.y, p.m + 1, 1) };
    case 'year':
      return { start: vnMidnight(p.y, 0, 1), end: vnMidnight(p.y + 1, 0, 1) };
    default:
      return custom ?? { start: now - 30 * DAY, end: now };
  }
}

export function previousPeriod(kind: RangeKind, cur: Period): Period {
  const p = localParts(cur.start);
  switch (kind) {
    case 'week':
      return { start: cur.start - 7 * DAY, end: cur.start };
    case 'month':
      return { start: vnMidnight(p.y, p.m - 1, 1), end: cur.start };
    case 'year':
      return { start: vnMidnight(p.y - 1, 0, 1), end: cur.start };
    default:
      return { start: cur.start - (cur.end - cur.start), end: cur.start };
  }
}

export interface RankItem {
  key: string;
  name: string;
  subtitle?: string;
  minutes: number;
  plays: number;
  trackId?: string;
}

export interface Totals {
  minutes: number;
  plays: number;
  distinctTracks: number;
}

export interface Stats extends Totals {
  period: Period;
  /** tỷ lệ lượt bỏ qua / tất cả lượt (0..1) */
  skipRate: number;
  topTracks: RankItem[];
  topArtists: RankItem[];
  topGenres: RankItem[];
  topAlbums: RankItem[];
  /** [thứ 0=T2..6=CN][giờ 0..23] = phút nghe */
  heatmap: number[][];
  busiest: { weekday: number; hour: number } | null;
  longestStreak: number;
  currentStreak: number;
  moods: Array<{ mood: Mood; minutes: number }>;
  /** nghệ sĩ lần đầu được nghe trong kỳ */
  newArtists: RankItem[];
  previous: Totals;
  /** % thay đổi so với kỳ trước; null nếu kỳ trước không có dữ liệu */
  delta: { minutes: number | null; plays: number | null; distinctTracks: number | null };
}

export interface StatsInput {
  events: readonly PlayEvent[];
  tracks: readonly Track[];
  features?: ReadonlyMap<string, AudioFeatures>;
  period: Period;
  previous: Period;
  device?: DeviceFilter;
  now: number;
  top?: number;
}

const pct = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

/** Độ dài chuỗi ngày liên tiếp dài nhất trong tập ngày (đã là số nguyên ngày). */
export function longestRun(days: Iterable<number>): number {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Chuỗi ngày đang diễn ra: tính lùi từ hôm nay (hoặc hôm qua nếu hôm nay chưa nghe). */
export function currentRun(days: ReadonlySet<number>, today: number): number {
  let d = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(d)) {
    n++;
    d--;
  }
  return n;
}

interface Acc {
  name: string;
  subtitle?: string;
  minutes: number;
  plays: number;
  trackId?: string;
}

function rank(m: Map<string, Acc>, top: number): RankItem[] {
  return [...m]
    .map(([key, a]) => ({ key, ...a, minutes: Math.round(a.minutes * 10) / 10 }))
    .sort((a, b) => b.minutes - a.minutes || b.plays - a.plays || a.name.localeCompare(b.name, 'vi'))
    .slice(0, top);
}

function bump(m: Map<string, Acc>, key: string, init: Omit<Acc, 'minutes' | 'plays'>, minutes: number, plays: number) {
  const a = m.get(key) ?? { ...init, minutes: 0, plays: 0 };
  a.minutes += minutes;
  a.plays += plays;
  m.set(key, a);
}

function totalsOf(events: readonly PlayEvent[], from: number, to: number, device: DeviceFilter): Totals {
  let sec = 0;
  let plays = 0;
  const ids = new Set<string>();
  for (const e of events) {
    if (e.t < from || e.t >= to || (device !== 'all' && e.device !== device)) continue;
    sec += e.sec;
    if (e.kind !== 'skip') plays++;
    ids.add(e.trackId);
  }
  return { minutes: Math.round((sec / 60) * 10) / 10, plays, distinctTracks: ids.size };
}

export function computeStats(input: StatsInput): Stats {
  const { events, tracks, features, period, previous, now } = input;
  const device = input.device ?? 'all';
  const top = input.top ?? 10;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  // Chuẩn hóa chuỗi (bỏ dấu) rất tốn, nên chỉ làm một lần cho mỗi bài thay vì mỗi lượt nghe.
  interface Info {
    artists: Array<{ key: string; name: string }>;
    genres: Array<{ key: string; name: string }>;
    album: string;
    mood: Mood | null;
  }
  const infoOf = new Map<string, Info>();
  const info = (t: Track): Info => {
    let i = infoOf.get(t.id);
    if (!i) {
      const f = features?.get(t.id);
      const m = f ? moodOf(f) : null;
      i = {
        artists: splitArtists(t.albumArtist || t.artist).map((name) => ({ key: normalizeText(name), name })),
        genres: (t.genre ?? []).map((name) => ({ key: normalizeText(name), name })),
        album: t.album ? normalizeText(t.album) : '',
        mood: m && m !== 'khac' ? m : null,
      };
      infoOf.set(t.id, i);
    }
    return i;
  };

  const trackMap = new Map<string, Acc>();
  const artistMap = new Map<string, Acc>();
  const genreMap = new Map<string, Acc>();
  const albumMap = new Map<string, Acc>();
  const moodMin = new Map<Mood, number>();
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const days = new Set<number>();
  const allDays = new Set<number>();
  const firstSeen = new Map<string, number>(); // nghệ sĩ → lần nghe đầu tiên (toàn bộ lịch sử)
  let sec = 0;
  let plays = 0;
  let skips = 0;
  let count = 0;
  const distinct = new Set<string>();

  for (const e of events) {
    if (device !== 'all' && e.device !== device) continue;
    const t = byId.get(e.trackId);
    if (e.kind !== 'skip') {
      if (t) {
        for (const { key } of info(t).artists) {
          const prev = firstSeen.get(key);
          if (prev === undefined || e.t < prev) firstSeen.set(key, e.t);
        }
      }
    }
    const lp = localParts(e.t);
    allDays.add(lp.day);
    if (e.t < period.start || e.t >= period.end) continue;

    const minutes = e.sec / 60;
    const isPlay = e.kind !== 'skip';
    count++;
    sec += e.sec;
    if (isPlay) plays++;
    else skips++;
    distinct.add(e.trackId);
    days.add(lp.day);
    heatmap[lp.weekday][lp.hour] += minutes;

    bump(trackMap, e.trackId, { name: t?.title ?? 'Bài đã xóa', subtitle: t?.artist, trackId: e.trackId }, minutes, isPlay ? 1 : 0);
    if (!t) continue;
    const ti = info(t);
    for (const a of ti.artists) bump(artistMap, a.key, { name: a.name }, minutes, isPlay ? 1 : 0);
    for (const g of ti.genres) bump(genreMap, g.key, { name: g.name }, minutes, isPlay ? 1 : 0);
    if (ti.album) bump(albumMap, ti.album, { name: t.album!, subtitle: t.albumArtist || t.artist }, minutes, isPlay ? 1 : 0);
    if (ti.mood) moodMin.set(ti.mood, (moodMin.get(ti.mood) ?? 0) + minutes);
  }

  let busiest: Stats['busiest'] = null;
  let best = 0;
  heatmap.forEach((row, weekday) =>
    row.forEach((v, hour) => {
      if (v > best) {
        best = v;
        busiest = { weekday, hour };
      }
    }),
  );

  const newArtists = new Map<string, Acc>();
  for (const [k, a] of artistMap) {
    const first = firstSeen.get(k);
    if (first !== undefined && first >= period.start && first < period.end) newArtists.set(k, a);
  }

  const cur: Totals = { minutes: Math.round((sec / 60) * 10) / 10, plays, distinctTracks: distinct.size };
  const prev = totalsOf(events, previous.start, previous.end, device);

  return {
    period,
    ...cur,
    skipRate: count ? Math.round((skips / count) * 1000) / 1000 : 0,
    topTracks: rank(trackMap, top),
    topArtists: rank(artistMap, top),
    topGenres: rank(genreMap, top),
    topAlbums: rank(albumMap, top),
    heatmap: heatmap.map((r) => r.map((v) => Math.round(v * 10) / 10)),
    busiest,
    longestStreak: longestRun(days),
    currentStreak: currentRun(allDays, localParts(now).day),
    moods: [...moodMin].map(([mood, minutes]) => ({ mood, minutes: Math.round(minutes * 10) / 10 })).sort((a, b) => b.minutes - a.minutes),
    newArtists: rank(newArtists, top),
    previous: prev,
    delta: { minutes: pct(cur.minutes, prev.minutes), plays: pct(cur.plays, prev.plays), distinctTracks: pct(cur.distinctTracks, prev.distinctTracks) },
  };
}
