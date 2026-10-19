/** Client LRCLIB (https://lrclib.net) — lấy lời lúc runtime, không lưu lên server. */
import { getJson, HttpError } from '@/lib/http';
import type { Track } from '@/providers/types';

const API = 'https://lrclib.net/api';
const DURATION_TOLERANCE_SEC = 2;

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** Bỏ phần thừa hay gặp trong tên bài: (feat. …), [Official Video], - Remastered… */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](feat\.?|ft\.?|official|lyrics?|audio|video|mv|hd|remaster(ed)?)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster(ed)?|radio edit|live).*$/i, '')
    .trim();
}

export function cleanArtist(artist: string): string {
  return artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0].trim();
}

/** Chọn bản khớp nhất: lệch thời lượng ≤ 2s, ưu tiên có syncedLyrics. */
export function pickBest(results: LrclibRecord[], durationSec: number): LrclibRecord | null {
  const ok = results.filter(
    (r) => !durationSec || !r.duration || Math.abs(r.duration - durationSec) <= DURATION_TOLERANCE_SEC,
  );
  if (!ok.length) return null;
  const score = (r: LrclibRecord) =>
    (r.syncedLyrics ? 0 : 1000) + (r.plainLyrics || r.syncedLyrics ? 0 : 10_000) + Math.abs((r.duration || 0) - durationSec);
  return ok.slice().sort((a, b) => score(a) - score(b))[0];
}

export async function fetchLrclib(track: Pick<Track, 'title' | 'artist' | 'album' | 'durationSec'>, signal?: AbortSignal): Promise<LrclibRecord | null> {
  const title = cleanTitle(track.title);
  const artist = cleanArtist(track.artist);
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (track.album) params.set('album_name', track.album);
  if (track.durationSec) params.set('duration', String(Math.round(track.durationSec)));

  try {
    const exact = await getJson<LrclibRecord>(`${API}/get?${params}`, { signal });
    if (exact && (exact.syncedLyrics || exact.plainLyrics)) return exact;
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 404)) throw err;
  }

  const search = await getJson<LrclibRecord[]>(`${API}/search?${new URLSearchParams({ q: `${artist} ${title}` })}`, { signal });
  return pickBest(Array.isArray(search) ? search : [], track.durationSec);
}
