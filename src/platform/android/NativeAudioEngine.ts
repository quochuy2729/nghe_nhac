/**
 * Engine Android: ExoPlayer trong PlaybackService (Media3). JS chỉ đẩy "cửa sổ" hàng đợi; native tự chuyển bài
 * (kể cả khi tắt màn hình) và ghi lượt nghe vào hàng chờ để JS lấy khi mở lại app.
 */
import type { AudioEngine, EngineEvent, WindowItem } from '../types';
import { NativePlayer, type NativeItem, type NativePlayerPlugin } from './nativePlayer';

type Item = WindowItem;

/** Ảnh bìa trong WebView là `http(s)://localhost/_capacitor_file_/<path>`; native cần `file://<path>`. */
export function nativeArtworkUri(artworkUrl: string | undefined): string | undefined {
  if (!artworkUrl) return undefined;
  const m = artworkUrl.match(/\/_capacitor_file_(\/.*)$/);
  if (m) return `file://${m[1]}`;
  return artworkUrl.startsWith('file://') || artworkUrl.startsWith('content://') ? artworkUrl : undefined;
}

export function toNativeItem({ track, url, gainDb }: Item): NativeItem {
  const artworkUri = nativeArtworkUri(track.artworkUrl);
  return {
    id: track.id,
    uri: url,
    title: track.title,
    artist: track.artist,
    ...(track.album ? { album: track.album } : {}),
    ...(artworkUri ? { artworkUri } : {}),
    durationMs: Math.round(track.durationSec * 1000),
    ...(gainDb ? { gainDb } : {}),
  };
}

export interface NativeEngineDeps {
  plugin: NativePlayerPlugin;
  now: () => number;
  /** true khi WebView đang hiện (bỏ qua sự kiện vị trí khi ẩn). */
  isVisible: () => boolean;
  onVisibilityChange: (cb: (visible: boolean) => void) => void;
}

const defaultDeps = (): NativeEngineDeps => ({
  plugin: NativePlayer,
  now: Date.now,
  isVisible: () => document.visibilityState === 'visible',
  onVisibilityChange: (cb) => document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible')),
});

export class NativeAudioEngine implements AudioEngine {
  readonly managesQueue = true;
  private listeners = new Set<(e: EngineEvent) => void>();
  private readonly deps: NativeEngineDeps;
  private started = false;
  private index = -1;
  private playing = false;
  private pos = { sec: 0, at: 0 };

  constructor(deps: Partial<NativeEngineDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  private emit(e: EngineEvent) {
    for (const cb of this.listeners) cb(e);
  }

  /** Đăng ký listener native một lần (lúc có người nghe đầu tiên) và đồng bộ khi app quay lại. */
  private start() {
    if (this.started) return;
    this.started = true;
    const { plugin } = this.deps;
    void plugin.addListener('state', (e) => {
      // Chốt vị trí nội suy trước khi đổi trạng thái (dừng thì phải đứng yên đúng chỗ vừa tới).
      this.pos = { sec: this.getPosition(), at: this.deps.now() };
      this.playing = e.playing;
      this.emit({ type: 'state', playing: e.playing, buffering: e.buffering });
    });
    void plugin.addListener('position', (e) => {
      this.pos = { sec: e.sec, at: this.deps.now() };
      this.emit({ type: 'position', sec: e.sec, durationSec: e.durationSec });
    });
    void plugin.addListener('trackChanged', (e) => {
      this.index = e.index;
      this.pos = { sec: 0, at: this.deps.now() };
      this.emit({ type: 'trackChanged', index: e.index, reason: e.reason, trackId: e.trackId });
      void this.drainHistory(); // bài trước vừa kết thúc → lượt nghe của nó đã nằm trong hàng chờ
    });
    void plugin.addListener('ended', () => {
      this.playing = false;
      this.emit({ type: 'ended' });
      void this.drainHistory();
    });
    void plugin.addListener('error', (e) => this.emit({ type: 'error', trackId: e.trackId, message: e.message }));
    void plugin.addListener('sleep', (e) => this.emit({ type: 'sleep', active: e.active }));
    void plugin.addListener('remote', (e) => this.emit({ type: 'remote', action: e.action }));
    this.deps.onVisibilityChange((visible) => {
      void plugin.setUiVisible({ visible });
      if (visible) void this.resync();
    });
    void this.resync();
  }

  /** Lấy lượt nghe native đã ghi và báo cho store. Gọi khi mở app, quay lại foreground và khi đổi bài. */
  async drainHistory(): Promise<void> {
    try {
      const { events } = await this.deps.plugin.drainEvents();
      if (!events.length) return;
      this.emit({
        type: 'history',
        events: events.map((e) => ({ trackId: e.trackId, playedSec: e.playedMs / 1000, durationSec: e.durationMs / 1000, endedAt: e.endedAt })),
      });
    } catch {
      // plugin chưa sẵn sàng: lần sau lấy tiếp, native vẫn giữ trong hàng chờ
    }
  }

  /** App vừa mở/hiện lại: native có thể đã chuyển bài trong lúc màn hình tắt. */
  private async resync(): Promise<void> {
    await this.drainHistory();
    try {
      const s = await this.deps.plugin.getState();
      this.playing = s.playing;
      this.pos = { sec: s.sec, at: this.deps.now() };
      if (s.index >= 0 && s.index !== this.index) {
        this.index = s.index;
        this.emit({ type: 'trackChanged', index: s.index, reason: 'auto', trackId: s.trackId });
      }
      this.emit({ type: 'state', playing: s.playing, buffering: s.buffering });
      if (s.index >= 0) this.emit({ type: 'position', sec: s.sec, durationSec: s.durationSec });
    } catch {
      // chưa có phiên phát
    }
  }

  async setWindow(items: Item[], startIndex: number, startSec = 0): Promise<void> {
    this.start();
    this.index = items.length ? startIndex : -1;
    this.pos = { sec: startSec, at: this.deps.now() };
    await this.deps.plugin.setWindow({ items: items.map(toNativeItem), startIndex, startMs: Math.round(startSec * 1000) });
  }

  async appendWindow(items: Item[]): Promise<void> {
    if (items.length) await this.deps.plugin.appendWindow({ items: items.map(toNativeItem) });
  }

  async setUpcoming(items: Item[]): Promise<void> {
    await this.deps.plugin.setUpcoming({ items: items.map(toNativeItem) });
  }

  async play(): Promise<void> {
    this.start();
    await this.deps.plugin.play();
  }

  async pause(): Promise<void> {
    await this.deps.plugin.pause();
  }

  async seek(sec: number): Promise<void> {
    this.pos = { sec, at: this.deps.now() };
    await this.deps.plugin.seek({ sec });
  }

  async skipTo(index: number): Promise<void> {
    this.index = index;
    this.pos = { sec: 0, at: this.deps.now() };
    await this.deps.plugin.skipTo({ index });
  }

  async setSpeed(x: number, preservePitch = true): Promise<void> {
    await this.deps.plugin.setSpeed({ speed: x, preservePitch });
  }

  async setEq(bandsDb: number[], enabled = true): Promise<void> {
    await this.deps.plugin.setEq({ bands: bandsDb, enabled });
  }

  async setNormalize(enabled: boolean): Promise<void> {
    await this.deps.plugin.setNormalize({ enabled });
  }

  async setCrossfade(sec: number): Promise<void> {
    await this.deps.plugin.setCrossfade({ sec });
  }

  async setSleepTimer(opts: { endAt: number | null; endOfTrack: boolean }): Promise<void> {
    await this.deps.plugin.setSleepTimer({ endAt: opts.endAt ?? 0, endOfTrack: opts.endOfTrack });
  }

  async setLiked(liked: boolean): Promise<void> {
    await this.deps.plugin.setLiked({ liked });
  }

  /** Nội suy từ sự kiện vị trí cuối (native bắn mỗi 250 ms) để lyrics chạy mượt. */
  getPosition(): number {
    if (!this.playing) return this.pos.sec;
    return this.pos.sec + (this.deps.now() - this.pos.at) / 1000;
  }

  on(cb: (e: EngineEvent) => void): () => void {
    this.start();
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
