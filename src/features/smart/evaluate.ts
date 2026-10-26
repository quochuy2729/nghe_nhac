/**
 * Đánh giá luật của playlist thông minh (docs/ARCHITECTURE.md §3) — hàm thuần, nhận `now`/`rng`.
 * Playlist tự cập nhật vì mỗi lần xem đều đánh giá lại trên thư viện/lịch sử hiện tại.
 */
import type { AudioFeatures, PlayEvent } from '@/lib/db';
import { normalizeText } from '@/lib/text';
import type { Track } from '@/providers/types';
import { artistNames } from '@/features/recommend/engine';
import { moodOf } from '@/features/recommend/mood';
import type { Rule, RuleField, RuleOp, SmartPlaylist } from './types';

const DAY = 86_400_000;

export interface EvalContext {
  now: number;
  liked: ReadonlySet<string>;
  events: readonly PlayEvent[];
  features?: ReadonlyMap<string, AudioFeatures>;
  rng?: () => number;
}

interface Stats {
  plays: number;
  lastPlayed: number | null;
}

export function playStats(events: readonly PlayEvent[]): Map<string, Stats> {
  const m = new Map<string, Stats>();
  for (const e of events) {
    if (e.kind === 'skip') continue;
    const s = m.get(e.trackId) ?? { plays: 0, lastPlayed: null };
    s.plays++;
    s.lastPlayed = Math.max(s.lastPlayed ?? 0, e.t);
    m.set(e.trackId, s);
  }
  return m;
}

/** Toán tử cho từng loại trường (để UI chỉ hiện lựa chọn hợp lệ). */
export const TEXT_FIELDS: RuleField[] = ['genre', 'artist', 'album', 'folder', 'mood'];
export const NUMBER_FIELDS: RuleField[] = ['year', 'bpm', 'plays', 'lastPlayedDays', 'addedDays'];

export const TEXT_OPS: RuleOp[] = ['is', 'isNot', 'contains'];
export const NUMBER_OPS: RuleOp[] = ['is', 'gt', 'lt', 'between'];

export function opsFor(field: RuleField): RuleOp[] {
  if (field === 'liked') return ['is'];
  if (field === 'mood') return ['is', 'isNot'];
  return NUMBER_FIELDS.includes(field) ? NUMBER_OPS : TEXT_OPS;
}

function textMatches(candidates: string[], op: RuleOp, value: unknown): boolean {
  const v = normalizeText(String(value));
  const norm = candidates.map(normalizeText).filter(Boolean);
  switch (op) {
    case 'is':
      return norm.some((c) => c === v);
    case 'isNot':
      return !norm.some((c) => c === v);
    case 'contains':
      return norm.some((c) => c.includes(v));
    default:
      return false;
  }
}

function numberMatches(n: number | undefined, op: RuleOp, value: Rule['value']): boolean {
  if (op === 'isNot') return n === undefined || n !== Number(value);
  if (n === undefined || Number.isNaN(n)) return false;
  switch (op) {
    case 'is':
      return n === Number(value);
    case 'gt':
      return n > Number(value);
    case 'lt':
      return n < Number(value);
    case 'between': {
      if (!Array.isArray(value)) return false;
      const [a, b] = value;
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
    default:
      return false;
  }
}

export function matchesRule(t: Track, rule: Rule, ctx: EvalContext, stats: Map<string, Stats>): boolean {
  const st = stats.get(t.id);
  const f = ctx.features?.get(t.id);
  switch (rule.field) {
    case 'genre':
      return textMatches(t.genre ?? [], rule.op, rule.value);
    case 'artist': {
      const names = [...artistNames(t.artist, t.albumArtist)];
      // "is": khớp đúng tên một nghệ sĩ trong "A feat. B"; "contains": khớp chuỗi
      return rule.op === 'contains' ? textMatches([t.artist, t.albumArtist ?? '', ...names], rule.op, rule.value) : textMatches(names, rule.op, rule.value);
    }
    case 'album':
      return textMatches(t.album ? [t.album] : [], rule.op, rule.value);
    case 'folder':
      return textMatches(t.folder ? [t.folder] : [], rule.op, rule.value);
    case 'mood': {
      if (!f) return rule.op === 'isNot';
      return textMatches([moodOf(f)], rule.op, rule.value);
    }
    case 'liked': {
      const want = rule.value === true || rule.value === 'true' || rule.value === 1;
      return ctx.liked.has(t.id) === want;
    }
    case 'year':
      return numberMatches(t.year, rule.op, rule.value);
    case 'bpm':
      return numberMatches(t.bpm ?? f?.bpm ?? undefined, rule.op, rule.value);
    case 'plays':
      return numberMatches(st?.plays ?? 0, rule.op, rule.value);
    case 'lastPlayedDays':
      // chưa nghe bao giờ = vô hạn ngày → "chưa nghe 30 ngày" gồm cả bài chưa từng nghe
      return numberMatches(st?.lastPlayed != null ? (ctx.now - st.lastPlayed) / DAY : Infinity, rule.op, rule.value);
    case 'addedDays':
      return numberMatches(t.addedAt != null ? (ctx.now - t.addedAt) / DAY : Infinity, rule.op, rule.value);
    default:
      return false;
  }
}

export function sortTracks(tracks: Track[], sort: SmartPlaylist['sort'], ctx: EvalContext, stats: Map<string, Stats>): Track[] {
  const out = tracks.slice();
  switch (sort) {
    case 'added':
      return out.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case 'plays':
      return out.sort((a, b) => (stats.get(b.id)?.plays ?? 0) - (stats.get(a.id)?.plays ?? 0));
    case 'lastPlayed':
      return out.sort((a, b) => (stats.get(b.id)?.lastPlayed ?? 0) - (stats.get(a.id)?.lastPlayed ?? 0));
    case 'title':
      return out.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    case 'random': {
      const rng = ctx.rng ?? Math.random;
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  }
}

/** Các bài khớp luật (theo `match` all/any), đã sắp xếp và cắt `limit`. Không có luật nào = rỗng. */
export function evaluateRules(
  tracks: readonly Track[],
  pl: Pick<SmartPlaylist, 'rules' | 'match' | 'sort' | 'limit'>,
  ctx: EvalContext,
): Track[] {
  if (!pl.rules.length) return [];
  const stats = playStats(ctx.events);
  const hit = tracks.filter((t) => {
    const results = pl.rules.map((r) => matchesRule(t, r, ctx, stats));
    return pl.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  });
  const sorted = sortTracks(hit, pl.sort, ctx, stats);
  return pl.limit && pl.limit > 0 ? sorted.slice(0, pl.limit) : sorted;
}

/** Mẫu có sẵn để tạo nhanh. */
export const SMART_TEMPLATES: Array<Pick<SmartPlaylist, 'name' | 'rules' | 'match' | 'sort' | 'limit'>> = [
  {
    name: 'Thích + chưa nghe 30 ngày',
    rules: [
      { field: 'liked', op: 'is', value: true },
      { field: 'lastPlayedDays', op: 'gt', value: 30 },
    ],
    match: 'all',
    sort: 'random',
  },
  { name: 'Sôi động > 120 BPM', rules: [{ field: 'bpm', op: 'gt', value: 120 }], match: 'all', sort: 'plays' },
  { name: 'Mới thêm 14 ngày', rules: [{ field: 'addedDays', op: 'lt', value: 14 }], match: 'all', sort: 'added' },
];
