import type { LibraryBackend, LibrarySnapshot } from './types';

const KEY = 'nn-guest-library';

export function readGuest(): LibrarySnapshot {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as LibrarySnapshot;
      return { liked: v.liked ?? [], playlists: v.playlists ?? [] };
    }
  } catch {
    // dữ liệu hỏng → bắt đầu lại
  }
  return { liked: [], playlists: [] };
}

function write(s: LibrarySnapshot) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearGuest(): void {
  localStorage.removeItem(KEY);
}

function update(fn: (s: LibrarySnapshot) => LibrarySnapshot): Promise<void> {
  write(fn(readGuest()));
  return Promise.resolve();
}

/** Bỏ streamUrl (link có thể hết hạn) và artwork dạng blob: khi lưu. */
function strip<T extends { streamUrl?: string }>(t: T): T {
  const { streamUrl: _s, ...rest } = t;
  return rest as T;
}

export const guestBackend: LibraryBackend = {
  kind: 'guest',
  load: () => Promise.resolve(readGuest()),
  like: (track) =>
    update((s) => ({ ...s, liked: [strip(track), ...s.liked.filter((t) => t.id !== track.id)] })),
  unlike: (id) => update((s) => ({ ...s, liked: s.liked.filter((t) => t.id !== id) })),
  createPlaylist: (name, id) =>
    update((s) => ({ ...s, playlists: [...s.playlists, { id, name, createdAt: new Date().toISOString(), tracks: [] }] })),
  renamePlaylist: (id, name) =>
    update((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)) })),
  deletePlaylist: (id) => update((s) => ({ ...s, playlists: s.playlists.filter((p) => p.id !== id) })),
  appendToPlaylist: (id, tracks) =>
    update((s) => ({
      ...s,
      playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, ...tracks.map(strip)] } : p)),
    })),
  setPlaylistTracks: (id, tracks) =>
    update((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: tracks.map(strip) } : p)) })),
};
