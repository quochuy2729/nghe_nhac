/** Hợp đồng JS ↔ plugin Kotlin `NativePlayer` (android/.../plugins/NativePlayerPlugin.kt). */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeItem {
  /** id bài (`folder:…`) */
  id: string;
  /** content:// URI đưa thẳng cho ExoPlayer */
  uri: string;
  title: string;
  artist: string;
  album?: string;
  /** file:// hoặc content:// của ảnh bìa */
  artworkUri?: string;
  durationMs: number;
  /** dB, áp native khi bài bắt đầu nếu chuẩn hóa đang bật */
  gainDb?: number;
}

/** Lượt nghe native ghi lại (cả lúc app ở nền). */
export interface NativePlayEvent {
  trackId: string;
  playedMs: number;
  durationMs: number;
  endedAt: number;
}

export interface NativeState {
  playing: boolean;
  buffering: boolean;
  index: number;
  trackId: string;
  sec: number;
  durationSec: number;
}

export interface NativeEvents {
  state: { playing: boolean; buffering: boolean };
  position: { sec: number; durationSec: number };
  trackChanged: { index: number; trackId: string; reason: 'auto' | 'user' | 'error' };
  ended: Record<string, never>;
  error: { trackId: string; message: string };
  remote: { action: 'toggleLike'; trackId: string };
  sleep: { active: boolean };
}

export interface NativePlayerPlugin {
  setWindow(o: { items: NativeItem[]; startIndex: number; startMs: number }): Promise<void>;
  appendWindow(o: { items: NativeItem[] }): Promise<void>;
  setUpcoming(o: { items: NativeItem[] }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(o: { sec: number }): Promise<void>;
  skipTo(o: { index: number }): Promise<void>;
  getState(): Promise<NativeState>;
  drainEvents(): Promise<{ events: NativePlayEvent[] }>;
  setUiVisible(o: { visible: boolean }): Promise<void>;
  setLiked(o: { liked: boolean }): Promise<void>;
  setSpeed(o: { speed: number; preservePitch: boolean }): Promise<void>;
  setEq(o: { bands: number[]; enabled: boolean }): Promise<void>;
  setNormalize(o: { enabled: boolean }): Promise<void>;
  setCrossfade(o: { sec: number }): Promise<void>;
  setSleepTimer(o: { endAt: number; endOfTrack: boolean }): Promise<void>;
  addListener<K extends keyof NativeEvents>(event: K, cb: (e: NativeEvents[K]) => void): Promise<PluginListenerHandle>;
}

export const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayer');
