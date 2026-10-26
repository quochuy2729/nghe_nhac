/** Backend Supabase: liked_tracks, playlists, playlist_tracks (nhạc nằm ở folder trên PC, không lên Storage). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderId, Track } from '@/providers/types';
import type { LibraryBackend, LibrarySnapshot, Playlist } from './types';

export interface TrackRow {
  id: string;
  provider: ProviderId;
  title: string;
  artist: string;
  album: string | null;
  duration_sec: number;
  artwork_url: string | null;
  downloadable: boolean;
}

export function trackToRow(t: Track): TrackRow {
  return {
    id: t.id,
    provider: t.provider,
    title: t.title.slice(0, 300) || 'Không tên',
    artist: t.artist.slice(0, 300),
    album: t.album?.slice(0, 300) ?? null,
    duration_sec: Math.max(0, Math.round(t.durationSec || 0)),
    // ảnh blob:/quá lớn không có ý nghĩa trên máy khác
    artwork_url: t.artworkUrl && !t.artworkUrl.startsWith('blob:') && t.artworkUrl.length < 200000 ? t.artworkUrl : null,
    downloadable: t.downloadable,
  };
}

export function rowToTrack(r: TrackRow): Track {
  return {
    id: r.id,
    provider: r.provider,
    title: r.title,
    artist: r.artist,
    album: r.album ?? undefined,
    durationSec: r.duration_sec,
    artworkUrl: r.artwork_url ?? undefined,
    downloadable: r.downloadable,
  };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

interface LikedRow {
  added_at: string;
  track: TrackRow | null;
}
interface PlaylistRow {
  id: string;
  name: string;
  created_at: string;
  playlist_tracks: Array<{ position: number; track: TrackRow | null }>;
}

export function createCloudBackend(sb: SupabaseClient, userId: string): LibraryBackend {
  async function ensureTracks(tracks: Track[]) {
    if (!tracks.length) return;
    const rows = [...new Map(tracks.map((t) => [t.id, trackToRow(t)])).values()];
    check(await sb.from('tracks').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
  }

  return {
    kind: 'cloud',

    async load(): Promise<LibrarySnapshot> {
      const [liked, playlists] = await Promise.all([
        sb.from('liked_tracks').select('added_at, track:tracks(*)').order('added_at', { ascending: false }),
        sb
          .from('playlists')
          .select('id, name, created_at, playlist_tracks(position, track:tracks(*))')
          .order('created_at', { ascending: true }),
      ]);
      const likedRows = check(liked) as unknown as LikedRow[];
      const plRows = check(playlists) as unknown as PlaylistRow[];
      return {
        liked: likedRows.filter((r) => r.track).map((r) => rowToTrack(r.track!)),
        playlists: plRows.map(
          (p): Playlist => ({
            id: p.id,
            name: p.name,
            createdAt: p.created_at,
            tracks: p.playlist_tracks
              .slice()
              .sort((a, b) => a.position - b.position)
              .filter((pt) => pt.track)
              .map((pt) => rowToTrack(pt.track!)),
          }),
        ),
      };
    },

    async like(track) {
      await ensureTracks([track]);
      check(
        await sb
          .from('liked_tracks')
          .upsert({ user_id: userId, track_id: track.id }, { onConflict: 'user_id,track_id', ignoreDuplicates: true }),
      );
    },

    async unlike(trackId) {
      check(await sb.from('liked_tracks').delete().eq('user_id', userId).eq('track_id', trackId));
    },

    async createPlaylist(name, id) {
      check(await sb.from('playlists').insert({ id, user_id: userId, name }));
    },

    async renamePlaylist(id, name) {
      check(await sb.from('playlists').update({ name, updated_at: new Date().toISOString() }).eq('id', id));
    },

    async deletePlaylist(id) {
      check(await sb.from('playlists').delete().eq('id', id));
    },

    async appendToPlaylist(id, tracks) {
      await ensureTracks(tracks);
      check(await sb.rpc('append_playlist_tracks', { p_playlist: id, p_tracks: tracks.map((t) => t.id) }));
    },

    async setPlaylistTracks(id, tracks) {
      await ensureTracks(tracks);
      check(await sb.rpc('replace_playlist_tracks', { p_playlist: id, p_tracks: tracks.map((t) => t.id) }));
    },
  };
}
