/** Jamendo API v3 — nhạc Creative Commons. Cần VITE_JAMENDO_CLIENT_ID. */
import { env } from '@/lib/env';
import { getJson } from '@/lib/http';
import type { MusicProvider, Track } from './types';

const API = 'https://api.jamendo.com/v3.0';
const PAGE_SIZE = 25;

export interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  album_name?: string;
  image?: string;
  album_image?: string;
  audio: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
}

interface JamendoResponse {
  headers: { status: string; code: number; error_message?: string };
  results: JamendoTrack[];
}

export function mapJamendoTrack(t: JamendoTrack): Track {
  const downloadable = t.audiodownload_allowed === true && !!t.audiodownload;
  return {
    id: `jamendo:${t.id}`,
    provider: 'jamendo',
    title: t.name,
    artist: t.artist_name,
    album: t.album_name || undefined,
    durationSec: Number(t.duration) || 0,
    artworkUrl: t.image || t.album_image || undefined,
    downloadable,
    streamUrl: t.audio || undefined,
  };
}

/** Cache URL tải của từng bài (không nằm trong Track để không lưu lên server). */
const downloadUrls = new Map<string, string>();

async function query(params: Record<string, string>): Promise<Track[]> {
  const qs = new URLSearchParams({
    client_id: env.jamendoClientId,
    format: 'json',
    limit: String(PAGE_SIZE),
    audioformat: 'mp32',
    imagesize: '300',
    ...params,
  });
  const data = await getJson<JamendoResponse>(`${API}/tracks/?${qs}`);
  if (data.headers.status !== 'success') throw new Error(data.headers.error_message || 'Jamendo trả lỗi');
  return data.results.map((r) => {
    if (r.audiodownload_allowed && r.audiodownload) downloadUrls.set(`jamendo:${r.id}`, r.audiodownload);
    return mapJamendoTrack(r);
  });
}

async function lookup(track: Track): Promise<JamendoTrack | undefined> {
  const qs = new URLSearchParams({ client_id: env.jamendoClientId, format: 'json', id: track.id.slice('jamendo:'.length), audioformat: 'mp32' });
  const data = await getJson<JamendoResponse>(`${API}/tracks/?${qs}`);
  return data.results[0];
}

export const jamendoProvider: MusicProvider = {
  id: 'jamendo',
  label: 'Jamendo',
  search(q, page = 0) {
    return query({ search: q, offset: String(page * PAGE_SIZE), order: 'relevance' });
  },
  featured() {
    return query({ order: 'popularity_week' });
  },
  async getStreamUrl(track) {
    if (track.streamUrl) return track.streamUrl;
    const t = await lookup(track);
    if (!t?.audio) throw new Error('Không lấy được link phát từ Jamendo');
    return t.audio;
  },
  async getDownloadUrl(track) {
    if (!track.downloadable) return null;
    const hit = downloadUrls.get(track.id);
    if (hit) return hit;
    const t = await lookup(track);
    return t?.audiodownload_allowed && t.audiodownload ? t.audiodownload : null;
  },
};
