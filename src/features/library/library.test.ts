import { guestBackend, readGuest } from './guest';
import { rowToTrack, trackToRow } from './cloud';
import { library, useLibrary } from './store';
import { fakeTrack } from '@/test/fixtures';

beforeEach(() => {
  localStorage.clear();
  useLibrary.setState({ liked: [], playlists: [], mode: 'guest', status: 'ready', error: null, lastSync: 0 });
});

describe('guestBackend', () => {
  it('like/unlike lưu localStorage, bài mới lên đầu, không trùng', async () => {
    await guestBackend.like(fakeTrack(1));
    await guestBackend.like(fakeTrack(2));
    await guestBackend.like(fakeTrack(1));
    expect(readGuest().liked.map((t) => t.id)).toEqual(['folder:1', 'folder:2']);
    await guestBackend.unlike('folder:1');
    expect(readGuest().liked.map((t) => t.id)).toEqual(['folder:2']);
  });

  it('playlist CRUD + bỏ streamUrl khi lưu', async () => {
    await guestBackend.createPlaylist('A', 'p1');
    await guestBackend.appendToPlaylist('p1', [fakeTrack(1, { streamUrl: 'https://x' }), fakeTrack(2)]);
    await guestBackend.renamePlaylist('p1', 'B');
    let p = readGuest().playlists[0];
    expect(p.name).toBe('B');
    expect(p.tracks[0].streamUrl).toBeUndefined();
    await guestBackend.setPlaylistTracks('p1', [fakeTrack(2)]);
    p = readGuest().playlists[0];
    expect(p.tracks.map((t) => t.id)).toEqual(['folder:2']);
    await guestBackend.deletePlaylist('p1');
    expect(readGuest().playlists).toEqual([]);
  });
});

describe('library store (chế độ khách)', () => {
  it('toggleLike cập nhật state và lưu', async () => {
    await library.toggleLike(fakeTrack(5));
    expect(library.isLiked('folder:5')).toBe(true);
    expect(readGuest().liked).toHaveLength(1);
    await library.toggleLike(fakeTrack(5));
    expect(library.isLiked('folder:5')).toBe(false);
  });

  it('tạo playlist, thêm, đổi chỗ, xóa bài', async () => {
    const id = await library.createPlaylist('  Chạy bộ  ', [fakeTrack(1)]);
    await library.addToPlaylist(id, [fakeTrack(2), fakeTrack(3)]);
    await library.movePlaylistTrack(id, 2, 0);
    let p = useLibrary.getState().playlists.find((x) => x.id === id)!;
    expect(p.name).toBe('Chạy bộ');
    expect(p.tracks.map((t) => t.id)).toEqual(['folder:3', 'folder:1', 'folder:2']);
    await library.removeFromPlaylist(id, 1);
    p = useLibrary.getState().playlists.find((x) => x.id === id)!;
    expect(p.tracks.map((t) => t.id)).toEqual(['folder:3', 'folder:2']);
    expect(readGuest().playlists[0].tracks.map((t) => t.id)).toEqual(['folder:3', 'folder:2']);
  });
});

describe('cloud mapping', () => {
  it('trackToRow/rowToTrack khứ hồi, bỏ artwork blob:', () => {
    const t = fakeTrack(1, { album: 'X', artworkUrl: 'https://img' });
    expect(rowToTrack(trackToRow(t))).toEqual({ ...t });
    expect(trackToRow(fakeTrack(2, { artworkUrl: 'blob:abc' })).artwork_url).toBeNull();
  });
});
