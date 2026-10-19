/** Audius public API — không cần key. Host được chọn qua https://api.audius.co. */
import { getJson } from '@/lib/http';
import type { MusicProvider, Track } from './types';

const APP_NAME = 'nghe_nhac';
const GATEWAY = 'https://api.audius.co';
const PAGE_SIZE = 25;

export interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  user: { name: string; handle?: string };
  artwork?: { '150x150'?: string; '480x480'?: string; '1000x1000'?: string } | null;
  is_downloadable?: boolean;
  is_streamable?: boolean;
  is_stream_gated?: boolean;
  is_delete?: boolean;
}

export function mapAudiusTrack(t: AudiusTrack): Track {
  return {
    id: `audius:${t.id}`,
    provider: 'audius',
    title: t.title,
    artist: t.user?.name || t.user?.handle || 'Không rõ',
    durationSec: Number(t.duration) || 0,
    artworkUrl: t.artwork?.['480x480'] || t.artwork?.['150x150'] || undefined,
    downloadable: t.is_downloadable === true,
  };
}

export function isPlayableAudius(t: AudiusTrack): boolean {
  return t.is_streamable !== false && !t.is_stream_gated && !t.is_delete;
}

let hostPromise: Promise<string> | null = null;

/** Chọn ngẫu nhiên một discovery node; lỗi thì dùng gateway. */
export function getAudiusHost(): Promise<string> {
  if (!hostPromise) {
    hostPromise = getJson<{ data: string[] }>(GATEWAY, { timeoutMs: 6000 })
      .then((r) => (r.data?.length ? r.data[Math.floor(Math.random() * r.data.length)] : GATEWAY))
      .catch(() => GATEWAY);
  }
  return hostPromise;
}

async function list(path: string, params: Record<string, string>): Promise<Track[]> {
  const host = await getAudiusHost();
  const qs = new URLSearchParams({ app_name: APP_NAME, ...params });
  try {
    const r = await getJson<{ data: AudiusTrack[] }>(`${host}/v1${path}?${qs}`);
    return (r.data ?? []).filter(isPlayableAudius).map(mapAudiusTrack);
  } catch (err) {
    hostPromise = null; // lần sau chọn node khác
    throw err;
  }
}

function id(track: Track) {
  return encodeURIComponent(track.id.slice('audius:'.length));
}

export const audiusProvider: MusicProvider = {
  id: 'audius',
  label: 'Audius',
  search(q, page = 0) {
    return list('/tracks/search', { query: q, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  },
  featured() {
    return list('/tracks/trending', { limit: String(PAGE_SIZE) });
  },
  async getStreamUrl(track) {
    return `${await getAudiusHost()}/v1/tracks/${id(track)}/stream?app_name=${APP_NAME}`;
  },
  async getDownloadUrl(track) {
    if (!track.downloadable) return null;
    return `${await getAudiusHost()}/v1/tracks/${id(track)}/download?app_name=${APP_NAME}`;
  },
};
