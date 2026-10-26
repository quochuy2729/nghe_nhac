import { getAllEvents, getLyricsRecord, getTrack, putEvents, resetDBForTests } from '@/lib/db';
import { trackIdFor } from '@/lib/id';
import { loadFolder, useFolder } from '@/providers/folder';
import type { MusicLibraryPlugin, NativeFolder, ScanItem, TagResult } from './musicLibrary';
import { SafLibrarySource } from './SafLibrarySource';
import { createThrottledRunner } from './safScan';

/** Bộ nhớ giả của plugin Kotlin: thư mục → danh sách file; đếm số lần đọc tag/lời. */
class FakePlugin implements MusicLibraryPlugin {
  folders: NativeFolder[] = [];
  files = new Map<string, ScanItem[]>();
  failScan = new Set<string>();
  tagCalls: string[][] = [];
  textCalls: string[] = [];
  texts = new Map<string, string>();
  private listeners = new Set<(e: { scanId: string; items: ScanItem[] }) => void>();

  async pickFolder() {
    return { folder: this.folders[0] ?? null };
  }
  async listFolders() {
    return { folders: this.folders };
  }
  async removeFolder({ id }: { id: string }) {
    this.folders = this.folders.filter((f) => f.id !== id);
  }
  async scan({ folderId, scanId }: { folderId: string; scanId: string }) {
    if (this.failScan.has(folderId)) throw new Error('mất quyền');
    const items = this.files.get(folderId) ?? [];
    // Bắn theo lô 2 để kiểm tra việc gom nhiều lô.
    for (let i = 0; i < items.length; i += 2) this.listeners.forEach((cb) => cb({ scanId, items: items.slice(i, i + 2) }));
    return { total: items.length };
  }
  async readTags({ uris }: { uris: string[] }) {
    this.tagCalls.push(uris);
    const tags: TagResult[] = uris.map((uri) => ({ uri, ok: true, title: `T:${uri.split('/').pop()}`, artist: 'A', genre: 'Pop;(13)', durationSec: 200.4 }));
    return { tags };
  }
  async artwork() {
    return { path: null };
  }
  async readText({ uri }: { uri: string }) {
    this.textCalls.push(uri);
    return { text: this.texts.get(uri) ?? null };
  }
  async addListener(_event: 'scanBatch', cb: (e: { scanId: string; items: ScanItem[] }) => void) {
    this.listeners.add(cb);
    return { remove: async () => void this.listeners.delete(cb) };
  }

  add(folderId: string, relDir: string, name: string, size: number, mtime = 1000, lrc?: { uri: string; mtime: number }) {
    const list = this.files.get(folderId) ?? [];
    list.push({ uri: `content://${folderId}/${relDir}/${name}`, relDir, name, size, mtime, ...(lrc ? { lrcUri: lrc.uri, lrcMtime: lrc.mtime } : {}) });
    this.files.set(folderId, list);
  }
  remove(folderId: string, name: string) {
    this.files.set(folderId, (this.files.get(folderId) ?? []).filter((f) => f.name !== name));
  }
}

let plugin: FakePlugin;
let src: SafLibrarySource;
let clock = 1_000_000;

beforeEach(async () => {
  await resetDBForTests();
  useFolder.setState({ tracks: [], status: 'idle', error: null });
  plugin = new FakePlugin();
  plugin.folders = [
    { id: 'treeA', label: 'Music' },
    { id: 'treeB', label: 'Download' },
  ];
  clock = 1_000_000;
  src = new SafLibrarySource({ plugin, toUrl: (p) => `https://localhost/x/${p}`, now: () => clock++ });
});

const idOf = (name: string, size: number) => trackIdFor({ name, size });

describe('SafLibrarySource.rescan', () => {
  it('thêm bài mới: đọc tag, dựng id/folder/source đúng', async () => {
    plugin.add('treeA', 'Pop', 'a.mp3', 100);
    plugin.add('treeA', '', 'b.mp3', 200);
    plugin.add('treeA', 'Pop', 'c.mp3', 300);

    expect(await src.rescan()).toEqual({ added: 3, removed: 0 });

    const a = await getTrack(idOf('a.mp3', 100));
    expect(a).toMatchObject({
      title: 'T:a.mp3',
      artist: 'A',
      genre: ['Pop'], // "(13)" kiểu ID3v1 bị bỏ
      durationSec: 200,
      folder: 'Music/Pop',
      source: { kind: 'saf', uri: 'content://treeA/Pop/a.mp3', mtime: 1000, folderId: 'treeA' },
    });
    expect((await getTrack(idOf('b.mp3', 200)))?.folder).toBe('Music');
    expect(useFolder.getState().tracks).toHaveLength(3);
  });

  it('quét lại không đổi gì: không đọc tag, không ghi', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    await src.rescan();
    plugin.tagCalls = [];

    expect(await src.rescan()).toEqual({ added: 0, removed: 0 });
    expect(plugin.tagCalls).toHaveLength(0);
  });

  it('bài biến mất bị xóa khỏi thư viện nhưng lịch sử nghe vẫn còn', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    plugin.add('treeA', '', 'b.mp3', 200);
    await src.rescan();
    const idA = idOf('a.mp3', 100);
    await putEvents([{ id: 'e1', trackId: idA, t: 1, sec: 100, dur: 100, kind: 'complete', device: 'poco', synced: 0 }]);

    plugin.remove('treeA', 'a.mp3');
    expect(await src.rescan()).toEqual({ added: 0, removed: 1 });

    expect(await getTrack(idA)).toBeUndefined();
    expect(await getTrack(idOf('b.mp3', 200))).toBeDefined();
    expect((await getAllEvents()).map((e) => e.trackId)).toEqual([idA]);
    expect(useFolder.getState().tracks.map((t) => t.id)).toEqual([idOf('b.mp3', 200)]);
  });

  it('đổi tên file: bài cũ bị xóa, bài mới được thêm (id đổi theo tên)', async () => {
    plugin.add('treeA', '', 'old.mp3', 100);
    await src.rescan();

    plugin.remove('treeA', 'old.mp3');
    plugin.add('treeA', '', 'new.mp3', 100);

    expect(await src.rescan()).toEqual({ added: 1, removed: 1 });
    expect(await getTrack(idOf('old.mp3', 100))).toBeUndefined();
    expect((await getTrack(idOf('new.mp3', 100)))?.title).toBe('T:new.mp3');
  });

  it('cùng file ở hai thư mục: chỉ một bài; xóa một bản thì bài còn, xóa cả hai mới mất', async () => {
    plugin.add('treeA', '', 'same.mp3', 500);
    plugin.add('treeB', 'Dl', 'same.mp3', 500);
    const id = idOf('same.mp3', 500);

    expect(await src.rescan()).toEqual({ added: 1, removed: 0 });
    expect(useFolder.getState().tracks).toHaveLength(1);
    expect((await getTrack(id))?.source).toMatchObject({ folderId: 'treeA' });

    // Xóa bản đang dùng → bài chuyển sang bản còn lại, không đọc lại tag.
    plugin.remove('treeA', 'same.mp3');
    plugin.tagCalls = [];
    expect(await src.rescan()).toEqual({ added: 0, removed: 0 });
    expect(plugin.tagCalls).toHaveLength(0);
    expect(await getTrack(id)).toMatchObject({ folder: 'Download/Dl', source: { folderId: 'treeB', uri: 'content://treeB/Dl/same.mp3' } });

    plugin.remove('treeB', 'same.mp3');
    expect(await src.rescan()).toEqual({ added: 0, removed: 1 });
    expect(await getTrack(id)).toBeUndefined();
  });

  it('file đổi mtime: đọc lại tag đúng file đó và giữ addedAt', async () => {
    plugin.add('treeA', '', 'a.mp3', 100, 1000);
    plugin.add('treeA', '', 'b.mp3', 200, 1000);
    await src.rescan();
    const before = await getTrack(idOf('a.mp3', 100));

    plugin.files.set(
      'treeA',
      plugin.files.get('treeA')!.map((f) => (f.name === 'a.mp3' ? { ...f, mtime: 2000 } : f)),
    );
    plugin.tagCalls = [];
    expect(await src.rescan()).toEqual({ added: 0, removed: 0 });

    expect(plugin.tagCalls).toEqual([['content://treeA//a.mp3']]);
    const after = await getTrack(idOf('a.mp3', 100));
    expect(after?.source).toMatchObject({ mtime: 2000 });
    expect(after?.addedAt).toBe(before?.addedAt);
  });

  it('thư mục quét lỗi (mất quyền): giữ nguyên bài của nó', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    plugin.add('treeB', '', 'b.mp3', 200);
    await src.rescan();

    plugin.failScan.add('treeB');
    expect(await src.rescan()).toEqual({ added: 0, removed: 0 });
    expect(useFolder.getState().tracks).toHaveLength(2);
  });

  it('quét thiếu lô (total không khớp) thì không suy ra bài bị xóa', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    plugin.add('treeA', '', 'b.mp3', 200);
    await src.rescan();

    const scan = plugin.scan.bind(plugin);
    plugin.scan = async (o) => ({ total: (await scan(o)).total + 1 });
    expect(await src.rescan()).toEqual({ added: 0, removed: 0 });
    expect(useFolder.getState().tracks).toHaveLength(2);
  });

  it('ghép .lrc cùng tên và chỉ đọc lại khi file lời đổi', async () => {
    plugin.add('treeA', '', 'a.mp3', 100, 1000, { uri: 'content://treeA//a.lrc', mtime: 5 });
    plugin.texts.set('content://treeA//a.lrc', '[00:01.00]xin chào');
    await src.rescan();

    const id = idOf('a.mp3', 100);
    expect((await getLyricsRecord(id))?.synced).toContain('xin chào');
    expect(await src.lyricsFile({ id } as never)).toContain('xin chào');

    plugin.textCalls = [];
    await src.rescan();
    expect(plugin.textCalls).toHaveLength(0);

    plugin.files.get('treeA')![0].lrcMtime = 6;
    plugin.texts.set('content://treeA//a.lrc', '[00:01.00]đã sửa');
    await src.rescan();
    expect(plugin.textCalls).toHaveLength(1);
    expect((await getLyricsRecord(id))?.synced).toContain('đã sửa');
  });

  it('đọc tag theo lô 50', async () => {
    for (let i = 0; i < 120; i++) plugin.add('treeA', '', `s${i}.mp3`, 10 + i);
    const progress: number[] = [];
    await src.rescan((done) => progress.push(done));
    expect(plugin.tagCalls.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(progress.at(-1)).toBe(120);
  });

  it('bỏ liên kết thư mục: xóa bài của thư mục đó khỏi thư viện', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    plugin.add('treeB', '', 'b.mp3', 200);
    await src.rescan();

    await src.removeFolder('treeB');
    await loadFolder();
    expect(useFolder.getState().tracks.map((t) => t.id)).toEqual([idOf('a.mp3', 100)]);
    expect(await src.listFolders()).toEqual([{ id: 'treeA', label: 'Music' }]);
  });

  it('resolve trả URL WebView của content:// URI', async () => {
    plugin.add('treeA', '', 'a.mp3', 100);
    await src.rescan();
    const t = (await getTrack(idOf('a.mp3', 100)))!;
    expect(await src.resolve(t)).toBe('https://localhost/x/content://treeA//a.mp3');
  });
});

describe('createThrottledRunner', () => {
  it('bỏ lần gọi khi đang chạy hoặc chưa đủ 5 giây kể từ lần chạy trước', async () => {
    let t = 0;
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const trigger = createThrottledRunner(run, 5000, () => t);

    expect(trigger()).toBe(true);
    t = 1000;
    expect(trigger()).toBe(false); // đang chạy
    release();
    await new Promise((r) => setTimeout(r, 0));

    t = 4999;
    expect(trigger()).toBe(false); // chưa đủ 5 giây
    t = 5000;
    expect(trigger()).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
