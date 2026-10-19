/** Backend Supabase: liked_tracks, playlists, playlist_tracks, user_files (+ Storage). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_AUDIO_BUCKET } from '@/lib/supabase';
import { getAudioBlob } from '@/lib/db';
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

export function rowToTrack(r: TrackRow, storagePath?: string): Track {
  return {
    id: r.id,
    provider: r.provider,
    title: r.title,
    artist: r.artist,
    album: r.album ?? undefined,
    durationSec: r.duration_sec,
    artworkUrl: r.artwork_url ?? undefined,
    downloadable: r.downloadable,
    ...(storagePath ? { storagePath } : {}),
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

export function createCloudBackend(sb: SupabaseClient, userId: string): LibraryBackend & {
  uploadLocalFile(track: Track): Promise<string>;
  signedUrl(path: string): Promise<string>;
  listMyFiles(): Promise<Track[]>;
} {
  let paths = new Map<string, string>();

  async function ensureTracks(tracks: Track[]) {
    if (!tracks.length) return;
    const rows = [...new Map(tracks.map((t) => [t.id, trackToRow(t)])).values()];
    check(await sb.from('tracks').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
  }

  const withPath = (r: TrackRow) => rowToTrack(r, paths.get(r.id));

  return {
    kind: 'cloud',

    async load(): Promise<LibrarySnapshot> {
      const [files, liked, playlists] = await Promise.all([
        sb.from('user_files').select('track_id, storage_path'),
        sb.from('liked_tracks').select('added_at, track:tracks(*)').order('added_at', { ascending: false }),
        sb
          .from('playlists')
          .select('id, name, created_at, playlist_tracks(position, track:tracks(*))')
          .order('created_at', { ascending: true }),
      ]);
      paths = new Map((check(files) ?? []).map((f: { track_id: string; storage_path: string }) => [f.track_id, f.storage_path]));
      const likedRows = check(liked) as unknown as LikedRow[];
      const plRows = check(playlists) as unknown as PlaylistRow[];
      return {
        liked: likedRows.filter((r) => r.track).map((r) => withPath(r.track!)),
        playlists: plRows.map(
          (p): Playlist => ({
            id: p.id,
            name: p.name,
            createdAt: p.created_at,
            tracks: p.playlist_tracks
              .slice()
              .sort((a, b) => a.position - b.position)
              .filter((pt) => pt.track)
              .map((pt) => withPath(pt.track!)),
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

    /** Upload file local lên bucket riêng tư `user-audio/{uid}/...`. */
    async uploadLocalFile(track) {
      if (track.provider !== 'local') throw new Error('Chỉ upload được file của bạn.');
      const blob = await getAudioBlob(track.id);
      if (!blob) throw new Error('File không có trên máy này.');
      const ext = (blob.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
      const path = `${userId}/${track.id.slice('local:'.length)}.${ext}`;
      check(
        await sb.storage.from(USER_AUDIO_BUCKET).upload(path, blob, {
          upsert: true,
          contentType: blob.type || 'application/octet-stream',
        }),
      );
      await ensureTracks([track]);
      check(
        await sb
          .from('user_files')
          .upsert({ user_id: userId, track_id: track.id, storage_path: path, size_bytes: blob.size }, { onConflict: 'user_id,track_id' }),
      );
      paths.set(track.id, path);
      return path;
    },

    async signedUrl(path) {
      const data = check(await sb.storage.from(USER_AUDIO_BUCKET).createSignedUrl(path, 60 * 60 * 6));
      if (!data?.signedUrl) throw new Error('Không lấy được link file trên đám mây.');
      return data.signedUrl;
    },

    async listMyFiles() {
      const rows = check(
        await sb.from('user_files').select('storage_path, track:tracks(*)').order('created_at', { ascending: false }),
      ) as unknown as Array<{ storage_path: string; track: TrackRow | null }>;
      return rows.filter((r) => r.track).map((r) => rowToTrack(r.track!, r.storage_path));
    },
  };
}
