/**
 * Engine web: một <audio> toàn cục + Media Session. JS (features/player/store) là chủ hàng đợi nên
 * cửa sổ chỉ phát `items[startIndex]`; hết bài thì báo `ended` để store chuyển bài.
 */
import type { Track } from '@/providers/types';
import type { AudioEngine, EngineEvent } from '../types';
import { getAudio, unlockAudio } from './audio';
import { registerMediaHandlers, setMediaMetadata, setMediaPlaybackState, setMediaPosition } from './mediaSession';

type Item = { track: Track; url: string };

export class WebAudioEngine implements AudioEngine {
  private listeners = new Set<(e: EngineEvent) => void>();
  private items: Item[] = [];
  private index = -1;
  private buffering = false;
  private attached = false;

  private emit(e: EngineEvent) {
    for (const cb of this.listeners) cb(e);
  }

  private current(): Track | undefined {
    return this.items[this.index]?.track;
  }

  private emitState() {
    const a = getAudio();
    this.emit({ type: 'state', playing: !a.paused, buffering: this.buffering });
  }

  private emitPosition() {
    const a = getAudio();
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (this.current()?.durationSec ?? 0);
    this.emit({ type: 'position', sec: a.currentTime || 0, durationSec: dur });
  }

  /** Gắn listener cho <audio> và Media Session ở lần dùng đầu tiên (không đụng DOM lúc import). */
  private attach() {
    if (this.attached) return;
    this.attached = true;
    const a = getAudio();

    a.addEventListener('play', () => {
      setMediaPlaybackState('playing');
      this.emitState();
    });
    a.addEventListener('pause', () => {
      setMediaPlaybackState('paused');
      this.emitState();
    });
    a.addEventListener('playing', () => {
      this.buffering = false;
      this.emitState();
    });
    a.addEventListener('waiting', () => {
      this.buffering = true;
      this.emitState();
    });
    a.addEventListener('canplay', () => {
      this.buffering = false;
      this.emitState();
    });
    a.addEventListener('timeupdate', () => this.emitPosition());
    a.addEventListener('durationchange', () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        this.emitPosition();
        setMediaPosition(a.duration, a.currentTime, a.playbackRate);
      }
    });
    a.addEventListener('seeked', () => setMediaPosition(a.duration, a.currentTime, a.playbackRate));
    a.addEventListener('ended', () => this.emit({ type: 'ended' }));
    a.addEventListener('error', () => {
      // Bỏ qua lỗi khi src rỗng (vd lúc reset).
      if (!a.currentSrc || a.currentSrc.startsWith('data:')) return;
      this.emit({ type: 'error', trackId: this.current()?.id ?? '', message: 'Không phát được bài này.' });
    });

    registerMediaHandlers({
      play: () => this.emit({ type: 'remote', action: 'play' }),
      pause: () => this.emit({ type: 'remote', action: 'pause' }),
      previous: () => this.emit({ type: 'remote', action: 'prev' }),
      next: () => this.emit({ type: 'remote', action: 'next' }),
      seekTo: (t) => void this.seek(t),
      seekBy: (d) => void this.seek(this.getPosition() + d),
    });

    if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  }

  async setWindow(items: Item[], startIndex: number, startSec = 0): Promise<void> {
    this.attach();
    const a = getAudio();
    this.items = items;
    this.index = startIndex;
    const cur = items[startIndex];
    if (!cur) {
      this.buffering = false;
      a.pause();
      a.removeAttribute('src');
      setMediaMetadata(undefined);
      setMediaPlaybackState('none');
      return;
    }
    setMediaMetadata(cur.track);
    this.buffering = true; // đang nạp bài mới, hết khi `canplay`/`playing`
    a.src = cur.url;
    if (startSec > 0) a.currentTime = startSec;
  }

  async play(): Promise<void> {
    this.attach();
    await getAudio().play();
  }

  async pause(): Promise<void> {
    this.attach();
    getAudio().pause();
  }

  async seek(sec: number): Promise<void> {
    this.attach();
    const a = getAudio();
    a.currentTime = sec;
    setMediaPosition(a.duration, sec, a.playbackRate);
  }

  async skipTo(index: number): Promise<void> {
    if (index < 0 || index >= this.items.length) return;
    const wasPlaying = !getAudio().paused;
    await this.setWindow(this.items, index);
    this.emit({ type: 'trackChanged', index, reason: 'user' });
    if (wasPlaying) await this.play();
  }

  getPosition(): number {
    return getAudio().currentTime || 0;
  }

  unlock(): void {
    unlockAudio();
  }

  on(cb: (e: EngineEvent) => void): () => void {
    this.attach();
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
