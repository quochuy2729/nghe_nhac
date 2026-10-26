import { fakeTrack } from '@/test/fixtures';
import type { EngineEvent } from '../types';
import { NativeAudioEngine, nativeArtworkUri, toNativeItem } from './NativeAudioEngine';
import type { NativeEvents, NativePlayEvent, NativePlayerPlugin, NativeState } from './nativePlayer';

/** Plugin giả: ghi lại lệnh, cho test bắn sự kiện native. */
class FakePlayer implements NativePlayerPlugin {
  calls: [string, unknown][] = [];
  handlers: { [K in keyof NativeEvents]?: (e: NativeEvents[K]) => void } = {};
  pending: NativePlayEvent[] = [];
  state: NativeState = { playing: false, buffering: false, index: -1, trackId: '', sec: 0, durationSec: 0 };

  private rec(name: string, arg?: unknown) {
    this.calls.push([name, arg]);
  }
  async setWindow(o: Parameters<NativePlayerPlugin['setWindow']>[0]) { this.rec('setWindow', o); }
  async appendWindow(o: Parameters<NativePlayerPlugin['appendWindow']>[0]) { this.rec('appendWindow', o); }
  async setUpcoming(o: Parameters<NativePlayerPlugin['setUpcoming']>[0]) { this.rec('setUpcoming', o); }
  async play() { this.rec('play'); }
  async pause() { this.rec('pause'); }
  async seek(o: { sec: number }) { this.rec('seek', o); }
  async skipTo(o: { index: number }) { this.rec('skipTo', o); }
  async getState() { return this.state; }
  async drainEvents() {
    const events = this.pending;
    this.pending = [];
    return { events };
  }
  async setUiVisible(o: { visible: boolean }) { this.rec('setUiVisible', o); }
  async setLiked(o: { liked: boolean }) { this.rec('setLiked', o); }
  async addListener<K extends keyof NativeEvents>(event: K, cb: (e: NativeEvents[K]) => void) {
    this.handlers[event] = cb as never;
    return { remove: async () => undefined };
  }
  fire<K extends keyof NativeEvents>(event: K, e: NativeEvents[K]) {
    (this.handlers[event] as ((e: NativeEvents[K]) => void) | undefined)?.(e);
  }
  last(name: string) {
    return this.calls.filter(([n]) => n === name).at(-1)?.[1];
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let plugin: FakePlayer;
let now: number;
let visibility: (v: boolean) => void;
let engine: NativeAudioEngine;
let events: EngineEvent[];

beforeEach(async () => {
  plugin = new FakePlayer();
  now = 10_000;
  visibility = () => undefined;
  engine = new NativeAudioEngine({
    plugin,
    now: () => now,
    isVisible: () => true,
    onVisibilityChange: (cb) => (visibility = cb),
  });
  events = [];
  engine.on((e) => events.push(e));
  await flush();
  events.length = 0;
});

const item = (n: number) => ({ track: fakeTrack(n, { artworkUrl: `https://localhost/_capacitor_file_/data/cache/covers/${n}.jpg` }), url: `content://tree/doc${n}` });

describe('NativeAudioEngine', () => {
  it('setWindow đổi bài sang dạng native (id, content:// URI, thời lượng ms, ảnh bìa file://)', async () => {
    await engine.setWindow([item(1), item(2)], 0, 12.5);

    expect(plugin.last('setWindow')).toEqual({
      items: [
        { id: 'folder:1', uri: 'content://tree/doc1', title: 'Bài thử 1', artist: 'Nghệ sĩ thử', durationMs: 120000, artworkUri: 'file:///data/cache/covers/1.jpg' },
        { id: 'folder:2', uri: 'content://tree/doc2', title: 'Bài thử 2', artist: 'Nghệ sĩ thử', durationMs: 120000, artworkUri: 'file:///data/cache/covers/2.jpg' },
      ],
      startIndex: 0,
      startMs: 12500,
    });
  });

  it('đổi bài tự động ở native → trackChanged (kèm lý do) và lấy lịch sử', async () => {
    await engine.setWindow([item(1), item(2)], 0);
    plugin.pending = [{ trackId: 'folder:1', playedMs: 118_000, durationMs: 120_000, endedAt: 777 }];

    plugin.fire('trackChanged', { index: 1, trackId: 'folder:2', reason: 'auto' });
    await flush();

    expect(events).toContainEqual({ type: 'trackChanged', index: 1, reason: 'auto', trackId: 'folder:2' });
    expect(events).toContainEqual({
      type: 'history',
      events: [{ trackId: 'folder:1', playedSec: 118, durationSec: 120, endedAt: 777 }],
    });
  });

  it('nạp thêm vào cửa sổ bằng appendWindow / setUpcoming', async () => {
    await engine.setWindow([item(1)], 0);
    await engine.appendWindow([item(2), item(3)]);
    await engine.setUpcoming([item(4)]);

    expect((plugin.last('appendWindow') as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(['folder:2', 'folder:3']);
    expect((plugin.last('setUpcoming') as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(['folder:4']);
  });

  it('không gọi native khi appendWindow rỗng', async () => {
    await engine.appendWindow([]);
    expect(plugin.calls.some(([n]) => n === 'appendWindow')).toBe(false);
  });

  it('drain lịch sử khi app quay lại foreground: lượt nghe lúc khóa màn hình không mất, bài đã đổi được báo', async () => {
    await engine.setWindow([item(1), item(2), item(3)], 0);
    plugin.pending = [
      { trackId: 'folder:1', playedMs: 100_000, durationMs: 120_000, endedAt: 1 },
      { trackId: 'folder:2', playedMs: 119_000, durationMs: 120_000, endedAt: 2 },
    ];
    plugin.state = { playing: true, buffering: false, index: 2, trackId: 'folder:3', sec: 30, durationSec: 120 };

    visibility(true);
    await flush();

    const history = events.find((e) => e.type === 'history');
    expect(history && history.type === 'history' && history.events.map((h) => h.trackId)).toEqual(['folder:1', 'folder:2']);
    expect(events).toContainEqual({ type: 'trackChanged', index: 2, reason: 'auto', trackId: 'folder:3' });
    expect(events).toContainEqual({ type: 'state', playing: true, buffering: false });
    expect(plugin.pending).toHaveLength(0); // đã lấy ra, không bị ghi hai lần
    expect(plugin.last('setUiVisible')).toEqual({ visible: true });
  });

  it('ended → báo hết cửa sổ để store quyết định (lặp/xáo/tự phát)', async () => {
    plugin.fire('ended', {});
    await flush();
    expect(events).toContainEqual({ type: 'ended' });
  });

  it('lỗi file và nút ♥ trên notification chuyển về JS', async () => {
    plugin.fire('error', { trackId: 'folder:5', message: 'mất quyền' });
    plugin.fire('remote', { action: 'toggleLike', trackId: 'folder:5' });
    expect(events).toContainEqual({ type: 'error', trackId: 'folder:5', message: 'mất quyền' });
    expect(events).toContainEqual({ type: 'remote', action: 'toggleLike' });
  });

  it('getPosition nội suy theo thời gian trôi qua khi đang phát', async () => {
    plugin.fire('position', { sec: 10, durationSec: 100 });
    plugin.fire('state', { playing: true, buffering: false });
    now += 2500;
    expect(engine.getPosition()).toBeCloseTo(12.5, 1);

    plugin.fire('state', { playing: false, buffering: false });
    now += 5000;
    expect(engine.getPosition()).toBeCloseTo(12.5, 1); // dừng thì đứng yên
  });

  it('seek/skipTo/play/pause/setLiked gọi xuống plugin', async () => {
    await engine.play();
    await engine.pause();
    await engine.seek(42);
    await engine.skipTo(3);
    await engine.setLiked(true);
    expect(plugin.calls.map(([n]) => n)).toEqual(['play', 'pause', 'seek', 'skipTo', 'setLiked']);
    expect(plugin.last('seek')).toEqual({ sec: 42 });
    expect(engine.managesQueue).toBe(true);
  });
});

describe('nativeArtworkUri / toNativeItem', () => {
  it('chỉ giữ ảnh bìa native đọc được', () => {
    expect(nativeArtworkUri('https://localhost/_capacitor_file_/data/x.jpg')).toBe('file:///data/x.jpg');
    expect(nativeArtworkUri('file:///a.jpg')).toBe('file:///a.jpg');
    expect(nativeArtworkUri('data:image/jpeg;base64,AAA')).toBeUndefined();
    expect(nativeArtworkUri(undefined)).toBeUndefined();
  });
  it('bỏ trường rỗng', () => {
    const n = toNativeItem({ track: fakeTrack(7), url: 'content://x' });
    expect(n).not.toHaveProperty('artworkUri');
    expect(n).not.toHaveProperty('album');
  });
});
