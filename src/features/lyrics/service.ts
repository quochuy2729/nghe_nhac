import type { Track } from '@/providers/types';
import { providerOf } from '@/providers';
import { getLyricsRecord, putLyricsRecord, type LyricsRecord } from '@/lib/db';
import { fetchLrclib } from './lrclib';
import { parseLrc, type LrcLine } from './lrc';

export type Lyrics =
  | { kind: 'synced'; lines: LrcLine[]; source: string }
  | { kind: 'plain'; text: string; source: string }
  | { kind: 'none' };

/** Không tìm thấy thì thử lại sau 3 ngày (LRCLIB được bổ sung liên tục). */
const NOT_FOUND_TTL_MS = 3 * 24 * 3600 * 1000;

export function toLyrics(rec: Pick<LyricsRecord, 'synced' | 'plain' | 'source'>): Lyrics {
  if (rec.synced) {
    const lines = parseLrc(rec.synced).lines;
    if (lines.length) return { kind: 'synced', lines, source: rec.source };
  }
  if (rec.plain?.trim()) return { kind: 'plain', text: rec.plain.trim(), source: rec.source };
  return { kind: 'none' };
}

function fromText(text: string, source: string): Pick<LyricsRecord, 'synced' | 'plain' | 'source'> {
  const synced = parseLrc(text).lines.length > 0;
  return { synced: synced ? text : null, plain: synced ? null : text, source };
}

export async function loadLyrics(track: Track, signal?: AbortSignal): Promise<Lyrics> {
  const cached = await getLyricsRecord(track.id).catch(() => undefined);
  if (cached && (cached.synced || cached.plain || Date.now() - cached.fetchedAt < NOT_FOUND_TTL_MS)) {
    return toLyrics(cached);
  }

  // 1. Lời đi kèm nguồn (file .lrc của bạn, demo)
  const own = await providerOf(track).getLyrics?.(track).catch(() => null);
  if (own) {
    const rec = { trackId: track.id, ...fromText(own, track.provider === 'local' ? 'file' : 'provider'), fetchedAt: Date.now() };
    return toLyrics(rec);
  }
  if (track.provider === 'mock') return { kind: 'none' };

  // 2. LRCLIB
  const hit = await fetchLrclib(track, signal);
  const rec: LyricsRecord = {
    trackId: track.id,
    synced: hit?.syncedLyrics ?? null,
    plain: hit?.plainLyrics ?? null,
    source: 'lrclib',
    fetchedAt: Date.now(),
  };
  await putLyricsRecord(rec).catch(() => undefined);
  return toLyrics(rec);
}
