import type { Track } from '@/providers/types';

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  tracks: Track[];
}

export interface LibrarySnapshot {
  liked: Track[];
  playlists: Playlist[];
}

/** Lưu trữ thư viện: chế độ khách (localStorage) hoặc Supabase. */
export interface LibraryBackend {
  kind: 'guest' | 'cloud';
  load(): Promise<LibrarySnapshot>;
  like(track: Track): Promise<void>;
  unlike(trackId: string): Promise<void>;
  createPlaylist(name: string, id: string): Promise<void>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  appendToPlaylist(id: string, tracks: Track[]): Promise<void>;
  /** Ghi đè toàn bộ thứ tự (xóa/đổi chỗ). */
  setPlaylistTracks(id: string, tracks: Track[]): Promise<void>;
}
