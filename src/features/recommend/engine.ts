/**
 * Gợi ý bài tương tự, kiểu "radio" của Spotify, chỉ dùng dữ liệu có sẵn trong máy:
 *  1. giống nhau về nội dung: nghệ sĩ, thể loại, album, năm, BPM (từ tag)
 *  2. gu dài hạn: lịch sử nghe + bài đã thích, giảm dần theo thời gian
 *  3. "đang muốn nghe gì": vài bài vừa nghe được ưu tiên hơn gu dài hạn
 *  4. đồng nghe: những bài hay được nghe liền nhau
 * Toàn bộ là hàm thuần (nhận rng/now) để test được.
 */
import type { AudioFeatures } from '@/lib/db';
import { normalizeText } from '@/lib/text';
import type { Track } from '@/providers/types';
import { contentSim } from './contentSim';
import { computeIntent, intentScore, type Intent } from './intent';
import type { PlayEvent, PlayKind } from './history';

const DAY = 86_400_000;

export type Rng = () => number;

/* ───────────── 1. Giống nhau về nội dung ───────────── */

interface Features {
  artists: Set<string>;
  genres: Set<string>;
  album: string;
  year?: number;
  bpm?: number;
}

const featureCache = new WeakMap<Track, Features>();

const UNKNOWN_ARTIST = normalizeText('Không rõ nghệ sĩ');

/** "A feat. B & C" → {a, b, c} */
export function artistNames(...raw: Array<string | undefined>): Set<string> {
  const out = new Set<string>();
  for (const r of raw) {
    if (!r) continue;
    // "x"/"feat" chỉ là dấu nối khi đứng riêng giữa hai khoảng trắng (nghệ sĩ tên "X" giữ nguyên).
    for (const part of r.replace(/[()[\]]/g, ' ').split(/\s*[,&;/+]\s*|\s+(?:feat\.?|ft\.?|x|và|with)\s+/i)) {
      const n = normalizeText(part);
      if (n && n !== UNKNOWN_ARTIST) out.add(n);
    }
  }
  return out;
}

function featuresOf(t: Track): Features {
  let f = featureCache.get(t);
  if (!f) {
    f = {
      artists: artistNames(t.artist, t.albumArtist),
      genres: new Set((t.genre ?? []).map(normalizeText).filter(Boolean)),
      album: t.album ? normalizeText(t.album) : '',
      year: t.year,
      bpm: t.bpm,
    };
    featureCache.set(t, f);
  }
  return f;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** BPM nửa/gấp đôi vẫn coi là hợp nhịp (90 ≈ 180). */
function bpmCloseness(a: number, b: number): number {
  const d = Math.min(Math.abs(a - b), Math.abs(a - b * 2), Math.abs(a * 2 - b));
  return Math.max(0, 1 - d / 40);
}

const W = { artist: 0.35, genre: 0.3, album: 0.1, year: 0.1, bpm: 0.15 };

/**
 * Độ giống nhau 0..1. Chỉ tính các đặc trưng mà CẢ HAI bài đều có, rồi chuẩn hóa
 * trọng số, nên thư viện thiếu tag vẫn cho kết quả hợp lý (dựa vào nghệ sĩ).
 */
export function contentSimilarity(a: Track, b: Track): number {
  if (a.id === b.id) return 1;
  const fa = featuresOf(a);
  const fb = featuresOf(b);
  let sum = 0;
  let weight = 0;
  if (fa.artists.size && fb.artists.size) {
    weight += W.artist;
    for (const x of fa.artists) {
      if (fb.artists.has(x)) {
        sum += W.artist;
        break;
      }
    }
  }
  if (fa.genres.size && fb.genres.size) {
    weight += W.genre;
    sum += W.genre * jaccard(fa.genres, fb.genres);
  }
  if (fa.album && fb.album) {
    weight += W.album;
    if (fa.album === fb.album) sum += W.album;
  }
  if (fa.year && fb.year) {
    weight += W.year;
    sum += W.year * Math.max(0, 1 - Math.abs(fa.year - fb.year) / 20);
  }
  if (fa.bpm && fb.bpm) {
    weight += W.bpm;
    sum += W.bpm * bpmCloseness(fa.bpm, fb.bpm);
  }
  return weight ? sum / weight : 0;
}

/* ───────────── 2. Gu dài hạn ───────────── */

const KIND_WEIGHT: Record<PlayKind, number> = { complete: 1, partial: 0.35, skip: -0.8 };
export const LIKE_WEIGHT = 1.5;
const HALF_LIFE_DAYS = 21;

export function recencyDecay(ageMs: number): number {
  return 0.5 ** (Math.max(0, ageMs) / DAY / HALF_LIFE_DAYS);
}

/** Điểm yêu thích từng bài (có thể âm nếu hay bị bỏ qua). */
export function trackAffinity(events: readonly PlayEvent[], liked: ReadonlySet<string>, now: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.trackId, (m.get(e.trackId) ?? 0) + KIND_WEIGHT[e.kind] * recencyDecay(now - e.t));
  for (const id of liked) m.set(id, (m.get(id) ?? 0) + LIKE_WEIGHT);
  return m;
}

/* ───────────── 4. Đồng nghe ───────────── */

const SESSION_GAP_MS = 30 * 60_000;
const CO_WINDOW = 3;

export type CoPlay = Map<string, Map<string, number>>;

/** Hai bài được nghe (không bỏ qua) liền nhau trong cùng phiên → tăng điểm cho cặp. */
export function buildCoPlay(events: readonly PlayEvent[]): CoPlay {
  const co: CoPlay = new Map();
  const add = (a: string, b: string, w: number) => {
    if (a === b) return;
    let row = co.get(a);
    if (!row) co.set(a, (row = new Map()));
    row.set(b, (row.get(b) ?? 0) + w);
  };
  const good = events.filter((e) => e.kind !== 'skip').sort((x, y) => x.t - y.t);
  for (let i = 0; i < good.length; i++) {
    for (let k = 1; k <= CO_WINDOW && i + k < good.length; k++) {
      if (good[i + k].t - good[i + k - 1].t > SESSION_GAP_MS) break;
      add(good[i].trackId, good[i + k].trackId, 1 / k);
      add(good[i + k].trackId, good[i].trackId, 1 / k);
    }
  }
  return co;
}

/* ───────────── Điểm tổng hợp ───────────── */

export interface Signals {
  library: readonly Track[];
  /** Đặc trưng âm thanh đã phân tích (G5). Thiếu thì gợi ý chỉ dựa vào tag + hành vi nghe. */
  features?: ReadonlyMap<string, AudioFeatures>;
  events: readonly PlayEvent[];
  liked: ReadonlySet<string>;
  now: number;
  rng?: Rng;
}

const SESSION_SIZE = 6;
const TASTE_SIZE = 60;
const SESSION_DECAY = 0.8;

interface Prepared {
  /** Độ giống tổng hợp (tag + âm thanh nếu có). */
  sim: (a: Track, b: Track) => number;
  intent: Intent | null;
  features: ReadonlyMap<string, AudioFeatures>;
  byId: Map<string, Track>;
  affinity: Map<string, number>;
  /** Bài vừa nghe (mới nhất trước), không tính bài bị bỏ qua. */
  session: Track[];
  taste: Array<{ track: Track; w: number }>;
  tasteNorm: number;
  co: CoPlay;
  recentlyPlayed: Map<string, number>;
}

function prepare(s: Signals): Prepared {
  const byId = new Map(s.library.map((t) => [t.id, t]));
  const affinity = trackAffinity(s.events, s.liked, s.now);
  const sorted = [...s.events].sort((a, b) => b.t - a.t);
  const session: Track[] = [];
  for (const e of sorted) {
    const t = byId.get(e.trackId);
    if (e.kind !== 'skip' && t && !session.includes(t)) session.push(t);
    if (session.length >= SESSION_SIZE) break;
  }
  const taste = [...affinity]
    .map(([id, w]) => ({ track: byId.get(id), w }))
    .filter((x): x is { track: Track; w: number } => !!x.track && Math.abs(x.w) > 0.05)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, TASTE_SIZE);
  const recentlyPlayed = new Map<string, number>();
  for (const e of sorted) if (!recentlyPlayed.has(e.trackId)) recentlyPlayed.set(e.trackId, e.t);
  const features = s.features ?? new Map<string, AudioFeatures>();
  return {
    sim: (a, b) => contentSim(a, b, contentSimilarity(a, b), features.get(a.id), features.get(b.id)),
    intent: features.size ? computeIntent(s.events, features, s.now) : null,
    features,
    byId,
    affinity,
    session,
    taste,
    tasteNorm: taste.reduce((n, x) => n + Math.abs(x.w), 0),
    co: buildCoPlay(s.events),
    recentlyPlayed,
  };
}

function sessionScore(p: Prepared, c: Track): number {
  let sum = 0;
  let w = 0;
  p.session.forEach((t, i) => {
    const wi = SESSION_DECAY ** i;
    sum += wi * p.sim(c, t);
    w += wi;
  });
  return w ? sum / w : 0;
}

function tasteScore(p: Prepared, c: Track): number {
  if (!p.tasteNorm) return 0;
  let sum = 0;
  for (const { track, w } of p.taste) sum += w * p.sim(c, track);
  return sum / p.tasteNorm;
}

function coScore(p: Prepared, c: Track, seeds: readonly Track[]): number {
  let sum = 0;
  for (const s of seeds) sum += p.co.get(s.id)?.get(c.id) ?? 0;
  return Math.min(1, sum / 3);
}

export interface Scored {
  track: Track;
  score: number;
}

/**
 * Gợi ý "dành cho bạn": hợp với bài vừa nghe + gu dài hạn, tránh bài vừa nghe/hay bị bỏ qua.
 * Chưa có lịch sử thì trả về ngẫu nhiên.
 */
export function recommend(s: Signals, opts: { limit?: number; exclude?: ReadonlySet<string> } = {}): Scored[] {
  const rng = s.rng ?? Math.random;
  const limit = opts.limit ?? 20;
  const pool = s.library.filter((t) => !opts.exclude?.has(t.id));
  const p = prepare(s);
  if (!p.session.length && !p.taste.length) {
    return shuffle(pool, rng)
      .slice(0, limit)
      .map((track) => ({ track, score: 0 }));
  }
  const scored = pool.map((track) => {
    const parts: Array<[number, number]> = [];
    if (p.session.length) parts.push([0.5, sessionScore(p, track)]);
    if (p.taste.length) parts.push([0.3, tasteScore(p, track)]);
    if (p.session.length && p.co.size) parts.push([0.2, coScore(p, track, p.session)]);
    const feat = p.features.get(track.id);
    if (p.intent && feat) parts.push([0.25, intentScore(p.intent, feat)]);
    const wsum = parts.reduce((n, [w]) => n + w, 0);
    let score = parts.reduce((n, [w, v]) => n + w * v, 0) / wsum;
    const last = p.recentlyPlayed.get(track.id);
    if (last !== undefined && s.now - last < 6 * 3_600_000) score -= 0.25;
    const aff = p.affinity.get(track.id) ?? 0;
    if (aff < 0) score += 0.4 * Math.max(aff, -1);
    score += rng() * 0.06;
    return { track, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** "Bài tương tự" cho một bài cụ thể (radio): nội dung + đồng nghe, hơi nghiêng theo gu. */
export function similarTo(seed: Track, s: Signals, opts: { limit?: number; exclude?: ReadonlySet<string> } = {}): Scored[] {
  const rng = s.rng ?? Math.random;
  const p = prepare(s);
  const scored = s.library
    .filter((t) => t.id !== seed.id && !opts.exclude?.has(t.id))
    .map((track) => {
      let score = 0.7 * p.sim(seed, track) + 0.2 * coScore(p, track, [seed]);
      if (p.taste.length) score += 0.1 * Math.max(0, tasteScore(p, track));
      const aff = p.affinity.get(track.id) ?? 0;
      if (aff < 0) score += 0.3 * Math.max(aff, -1);
      score += rng() * 0.05;
      return { track, score };
    });
  return scored.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 30);
}

/* ───────────── Lý do gợi ý, danh sách trộn ───────────── */

export interface SessionReason {
  kind: 'artist' | 'genre';
  name: string;
}

/** Mô tả "đang muốn nghe gì": nghệ sĩ/thể loại nổi bật nhất trong vài bài vừa nghe. */
export function describeSession(s: Signals): SessionReason | null {
  const p = prepare(s);
  const recent = p.session.slice(0, 5);
  if (recent.length < 2) return null;
  const count = (keys: (t: Track) => string[]) => {
    const m = new Map<string, number>();
    recent.forEach((t, i) => {
      for (const k of new Set(keys(t))) m.set(k, (m.get(k) ?? 0) + SESSION_DECAY ** i);
    });
    return [...m].sort((a, b) => b[1] - a[1])[0];
  };
  const artist = count((t) => (t.artist && normalizeText(t.artist) !== UNKNOWN_ARTIST ? [t.artist] : []));
  if (artist && artist[1] >= 1.8) return { kind: 'artist', name: artist[0] };
  const genre = count((t) => t.genre ?? []);
  if (genre && genre[1] >= 1.8) return { kind: 'genre', name: genre[0] };
  return null;
}

export interface Mix {
  id: string;
  title: string;
  tracks: Track[];
}

const MIN_MIX_TRACKS = 6;

/**
 * Vài danh sách trộn theo thể loại/nghệ sĩ mà bạn hay nghe (hoặc lớn nhất nếu chưa có lịch sử).
 */
export function buildMixes(s: Signals, opts: { max?: number; size?: number } = {}): Mix[] {
  const rng = s.rng ?? Math.random;
  const max = opts.max ?? 4;
  const size = opts.size ?? 30;
  const affinity = trackAffinity(s.events, s.liked, s.now);
  type Group = { id: string; title: string; tracks: Track[]; heat: number };
  const groups = new Map<string, Group>();
  const put = (key: string, title: string, t: Track) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { id: key, title, tracks: [], heat: 0 }));
    g.tracks.push(t);
    g.heat += Math.max(0, affinity.get(t.id) ?? 0);
  };
  for (const t of s.library) {
    for (const g of t.genre ?? []) put(`genre:${normalizeText(g)}`, `Mix ${g}`, t);
    const first = [...artistNames(t.albumArtist || t.artist)][0];
    if (first) put(`artist:${first}`, `Mix ${(t.albumArtist || t.artist).split(/\s*[,&;/]\s*/)[0]}`, t);
  }
  return [...groups.values()]
    .filter((g) => g.tracks.length >= MIN_MIX_TRACKS)
    .sort((a, b) => b.heat - a.heat || b.tracks.length - a.tracks.length)
    .slice(0, max)
    .map((g) => ({
      id: g.id,
      title: g.title,
      tracks: g.tracks
        .map((t) => ({ t, k: (affinity.get(t.id) ?? 0) + rng() * 0.8 }))
        .sort((a, b) => b.k - a.k)
        .slice(0, size)
        .map((x) => x.t),
    }));
}

/** Nghe gần đây nhất trước, bỏ trùng và bỏ bài bị bỏ qua. */
export function recentlyPlayedTracks(events: readonly PlayEvent[], library: readonly Track[], limit = 12): Track[] {
  const byId = new Map(library.map((t) => [t.id, t]));
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => b.t - a.t)) {
    if (e.kind === 'skip' || seen.has(e.trackId)) continue;
    seen.add(e.trackId);
    const t = byId.get(e.trackId);
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function newestTracks(library: readonly Track[], limit = 12): Track[] {
  return [...library].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, limit);
}

function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
