import { fakeTrack } from '@/test/fixtures';
import { getAudioBlob, getLyricsRecord, getTrack, putAudio, putTrack, resetDBForTests } from '@/lib/db';
import {
  folderOf,
  folderProvider,
  guessFromFileName,
  importFiles,
  isAudioFile,
  isLrcFile,
  loadFolder,
  normalizeGenres,
  searchTracks,
  trackIdFor,
  useFolder,
} from './folder';

beforeEach(async () => {
  await resetDBForTests();
  vi.restoreAllMocks();
  useFolder.setState({ tracks: [], status: 'idle', error: null });
});

/** jsdom không giải mã audio: giả lập <audio> báo lỗi để probeDuration trả 0 ngay. */
function stubAudioProbe() {
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = create(tag);
    if (tag === 'audio') queueMicrotask(() => (el as HTMLAudioElement).onerror?.(new Event('error')));
    return el;
  }) as typeof document.createElement);
}

describe('helpers', () => {
  it('đoán tên bài/nghệ sĩ từ tên file', () => {
    expect(guessFromFileName('Ca Sĩ A - Bài B.mp3')).toEqual({ artist: 'Ca Sĩ A', title: 'Bài B' });
    expect(guessFromFileName('track_01.flac')).toEqual({ title: 'track 01' });
  });

  it('nhận diện file audio và lrc', () => {
    expect(isAudioFile({ name: 'a.mp3', type: '' })).toBe(true);
    expect(isAudioFile({ name: 'a.bin', type: 'audio/mpeg' })).toBe(true);
    expect(isAudioFile({ name: 'a.txt', type: 'text/plain' })).toBe(false);
    expect(isLrcFile({ name: 'a.LRC' })).toBe(true);
  });

  it('normalizeGenres tách và bỏ trùng', () => {
    expect(normalizeGenres(['Pop/Rock; Indie', 'pop'])).toEqual(['Pop', 'Rock', 'Indie']);
    expect(normalizeGenres(undefined)).toEqual([]);
  });

  it('id theo tên + dung lượng: ổn định, khác nhau giữa các file, không phụ thuộc NFC/NFD', () => {
    const a = trackIdFor({ name: 'Bài.mp3', size: 100 });
    expect(a).toMatch(/^folder:[0-9a-f]{14}$/);
    expect(trackIdFor({ name: 'Bài.mp3', size: 100 })).toBe(a);
    expect(trackIdFor({ name: 'Bài.mp3', size: 101 })).not.toBe(a);
    expect(trackIdFor({ name: 'Bài2.mp3', size: 100 })).not.toBe(a);
    // iOS có thể trả tên file dạng NFD (dấu tách rời)
    expect(trackIdFor({ name: 'Bài.mp3'.normalize('NFD'), size: 100 })).toBe(a);
  });
});

describe('searchTracks', () => {
  const tracks = [
    fakeTrack(1, { title: 'Đừng Làm Trái Tim Anh Đau', artist: 'Sơn Tùng M-TP' }),
    fakeTrack(2, { title: 'Hello', artist: 'Adele', genre: ['Soul'] }),
  ];
  it('không phân biệt dấu/hoa thường, mọi từ khóa đều phải khớp', () => {
    expect(searchTracks(tracks, 'dung lam trai tim').map((t) => t.id)).toEqual(['folder:1']);
    expect(searchTracks(tracks, 'SON TUNG').map((t) => t.id)).toEqual(['folder:1']);
    expect(searchTracks(tracks, 'adele soul').map((t) => t.id)).toEqual(['folder:2']);
    expect(searchTracks(tracks, 'adele pop')).toEqual([]);
  });
  it('rỗng → trả tất cả', () => {
    expect(searchTracks(tracks, '  ')).toHaveLength(2);
  });
});

describe('importFiles', () => {
  it('lưu file + thông tin, ghép .lrc cùng tên, bỏ qua file lạ', async () => {
    stubAudioProbe();
    const mp3 = new File([new Uint8Array([1, 2, 3])], 'Nghệ sĩ - Bài.mp3', { type: 'audio/mpeg' });
    const lrc = new File(['[00:01.00]Dòng giả'], 'Nghệ sĩ - Bài.lrc');
    const txt = new File(['x'], 'ghi chú.txt', { type: 'text/plain' });
    const progress: number[] = [];
    const r = await importFiles([mp3, lrc, txt], (d) => progress.push(d));

    expect(r.skipped).toEqual(['ghi chú.txt']);
    expect(r.failed).toEqual([]);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ provider: 'folder', title: 'Bài', artist: 'Nghệ sĩ', downloadable: true });
    expect(r.added[0].id).toBe(trackIdFor(mp3));
    expect((await getAudioBlob(r.added[0].id))?.size).toBe(3);
    expect((await getTrack(r.added[0].id))?.title).toBe('Bài');
    expect(await getLyricsRecord(r.added[0].id)).toMatchObject({ synced: '[00:01.00]Dòng giả', source: 'file' });
    expect(await folderProvider.getLyrics!(r.added[0])).toBe('[00:01.00]Dòng giả');
    expect(progress.at(-1)).toBe(2);
  });

  it('nạp lại cùng file thì bỏ qua (không nhân đôi)', async () => {
    stubAudioProbe();
    const f = () => new File([new Uint8Array([1, 2, 3])], 'A - B.mp3', { type: 'audio/mpeg' });
    expect((await importFiles([f()])).added).toHaveLength(1);
    const again = await importFiles([f()]);
    expect(again.added).toHaveLength(0);
    expect(again.existing).toBe(1);
    await loadFolder();
    expect(useFolder.getState().tracks).toHaveLength(1);
  });
});

describe('track.folder / source', () => {
  it('lấy thư mục từ webkitRelativePath; chọn file lẻ thì không có', async () => {
    stubAudioProbe();
    const inFolder = new File([new Uint8Array([1])], 'a.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(inFolder, 'webkitRelativePath', { value: 'Nhạc/Pop/a.mp3' });
    const loose = new File([new Uint8Array([2])], 'b.mp3', { type: 'audio/mpeg' });
    const r = await importFiles([inFolder, loose]);
    const a = r.added.find((t) => t.title === 'a')!;
    const b = r.added.find((t) => t.title === 'b')!;
    expect(folderOf(inFolder)).toBe('Nhạc/Pop');
    expect(a).toMatchObject({ folder: 'Nhạc/Pop', source: { kind: 'idb' } });
    expect(b.folder).toBeUndefined();
    expect(b.source).toEqual({ kind: 'idb' });
  });
});

describe('loadFolder + folderProvider', () => {
  it('đọc thư viện từ IndexedDB, bài mới thêm lên đầu', async () => {
    await putTrack(fakeTrack(1));
    await new Promise((r) => setTimeout(r, 5));
    await putTrack(fakeTrack(2));
    await loadFolder();
    expect(useFolder.getState()).toMatchObject({ status: 'ready' });
    expect(useFolder.getState().tracks.map((t) => t.id)).toEqual(['folder:2', 'folder:1']);
    expect((await folderProvider.search('thử 1')).map((t) => t.id)).toEqual(['folder:1']);
  });

  it('getStreamUrl: có file → blob URL; chưa có trên máy này → lỗi dễ hiểu', async () => {
    const t = fakeTrack(1);
    await expect(folderProvider.getStreamUrl(t)).rejects.toThrow('chưa có trên điện thoại này');
    await putAudio(t.id, new Blob(['abc'], { type: 'audio/mpeg' }));
    expect(await folderProvider.getStreamUrl(t)).toMatch(/^blob:/);
  });
});
