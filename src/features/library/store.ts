import { create } from 'zustand';
import type { Track } from '@/providers/types';
import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/id';
import { toast } from '@/components/toastStore';
import { useAuth } from '@/features/auth/store';
import { clearGuest, guestBackend, readGuest } from './guest';
import { createCloudBackend } from './cloud';
import type { LibraryBackend, LibrarySnapshot, Playlist } from './types';

interface LibraryState extends LibrarySnapshot {
  mode: 'guest' | 'cloud';
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  lastSync: number;
}

export const useLibrary = create<LibraryState>()(() => ({
  mode: 'guest',
  status: 'loading',
  error: null,
  liked: [],
  playlists: [],
  lastSync: 0,
}));

type CloudBackend = ReturnType<typeof createCloudBackend>;
let backend: LibraryBackend = guestBackend;

/** Cập nhật lạc quan: đổi UI ngay, lỗi thì hoàn tác và báo. */
async function mutate(apply: (s: LibrarySnapshot) => LibrarySnapshot, remote: () => Promise<void>, failMsg: string) {
  const prev = useLibrary.getState();
  useLibrary.setState(apply(prev));
  try {
    await remote();
  } catch (err) {
    useLibrary.setState({ liked: prev.liked, playlists: prev.playlists });
    toast(`${failMsg}: ${(err as Error).message}`);
    throw err;
  }
}

const quiet = (p: Promise<void>): Promise<void> => p.catch(() => undefined);

function mapPlaylist(id: string, fn: (p: Playlist) => Playlist) {
  return (s: LibrarySnapshot) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? fn(p) : p)) });
}

export const library = {
  async refresh(): Promise<void> {
    const b = backend;
    if (useLibrary.getState().lastSync === 0) useLibrary.setState({ status: 'loading' });
    try {
      const snap = await b.load();
      if (b !== backend) return;
      useLibrary.setState({ ...snap, status: 'ready', error: null, lastSync: Date.now() });
    } catch (err) {
      if (b !== backend) return;
      useLibrary.setState({ status: 'error', error: (err as Error).message });
    }
  },

  isLiked(id: string): boolean {
    return useLibrary.getState().liked.some((t) => t.id === id);
  },

  toggleLike(track: Track): Promise<void> {
    if (library.isLiked(track.id)) {
      return quiet(
        mutate((s) => ({ ...s, liked: s.liked.filter((t) => t.id !== track.id) }), () => backend.unlike(track.id), 'Không bỏ thích được'),
      );
    }
    return quiet(
      mutate((s) => ({ ...s, liked: [track, ...s.liked] }), () => backend.like(track), 'Không lưu được bài yêu thích'),
    );
  },

  async createPlaylist(name: string, initial: Track[] = []): Promise<string> {
    const id = uuid();
    const clean = name.trim().slice(0, 100) || 'Playlist mới';
    await mutate(
      (s) => ({ ...s, playlists: [...s.playlists, { id, name: clean, createdAt: new Date().toISOString(), tracks: initial }] }),
      async () => {
        await backend.createPlaylist(clean, id);
        if (initial.length) await backend.appendToPlaylist(id, initial);
      },
      'Không tạo được playlist',
    );
    return id;
  },

  renamePlaylist(id: string, name: string): Promise<void> {
    const clean = name.trim().slice(0, 100);
    if (!clean) return Promise.resolve();
    return quiet(mutate(mapPlaylist(id, (p) => ({ ...p, name: clean })), () => backend.renamePlaylist(id, clean), 'Không đổi tên được'));
  },

  deletePlaylist(id: string): Promise<void> {
    return quiet(
      mutate((s) => ({ ...s, playlists: s.playlists.filter((p) => p.id !== id) }), () => backend.deletePlaylist(id), 'Không xóa được playlist'),
    );
  },

  addToPlaylist(id: string, tracks: Track[]): Promise<void> {
    return quiet(
      mutate(mapPlaylist(id, (p) => ({ ...p, tracks: [...p.tracks, ...tracks] })), () => backend.appendToPlaylist(id, tracks), 'Không thêm được vào playlist'),
    );
  },

  removeFromPlaylist(id: string, index: number): Promise<void> {
    const pl = useLibrary.getState().playlists.find((p) => p.id === id);
    if (!pl) return Promise.resolve();
    const tracks = pl.tracks.filter((_, i) => i !== index);
    return quiet(mutate(mapPlaylist(id, (p) => ({ ...p, tracks })), () => backend.setPlaylistTracks(id, tracks), 'Không xóa được khỏi playlist'));
  },

  movePlaylistTrack(id: string, from: number, to: number): Promise<void> {
    const pl = useLibrary.getState().playlists.find((p) => p.id === id);
    if (!pl || to < 0 || to >= pl.tracks.length) return Promise.resolve();
    const tracks = pl.tracks.slice();
    const [m] = tracks.splice(from, 1);
    tracks.splice(to, 0, m);
    return quiet(mutate(mapPlaylist(id, (p) => ({ ...p, tracks })), () => backend.setPlaylistTracks(id, tracks), 'Không đổi thứ tự được'));
  },
};

/** Đẩy dữ liệu chế độ khách lên tài khoản vừa đăng nhập (một lần). */
async function mergeGuestInto(b: CloudBackend) {
  const guest = readGuest();
  if (!guest.liked.length && !guest.playlists.length) return;
  for (const t of guest.liked.slice().reverse()) await b.like(t);
  for (const p of guest.playlists) {
    const id = uuid();
    await b.createPlaylist(p.name, id);
    if (p.tracks.length) await b.appendToPlaylist(id, p.tracks);
  }
  clearGuest();
  toast('Đã chuyển thư viện trên máy này vào tài khoản');
}

let started = false;

export function initLibrary(): void {
  if (started) return;
  started = true;

  const apply = async (userId: string | null) => {
    if (userId && supabase) {
      const c = createCloudBackend(supabase, userId);
      backend = c;
      useLibrary.setState({ mode: 'cloud', lastSync: 0 });
      try {
        await mergeGuestInto(c);
      } catch (err) {
        toast(`Chưa chuyển được thư viện khách: ${(err as Error).message}`);
      }
    } else {
      backend = guestBackend;
      useLibrary.setState({ mode: 'guest', lastSync: 0 });
    }
    await library.refresh();
  };

  let currentUser: string | null | undefined;
  const onAuth = () => {
    const { ready, user } = useAuth.getState();
    if (!ready) return;
    const id = user?.id ?? null;
    if (id === currentUser) return;
    currentUser = id;
    void apply(id);
  };
  useAuth.subscribe(onAuth);
  onAuth();

  // Đồng bộ giữa 2 máy: tải lại khi app quay lại foreground / có mạng lại.
  const maybeRefresh = () => {
    const { mode, lastSync } = useLibrary.getState();
    if (mode === 'cloud' && document.visibilityState === 'visible' && Date.now() - lastSync > 10_000) void library.refresh();
  };
  document.addEventListener('visibilitychange', maybeRefresh);
  window.addEventListener('online', maybeRefresh);
  window.addEventListener('focus', maybeRefresh);
}
