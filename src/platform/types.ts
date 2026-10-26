/**
 * Hợp đồng giữa UI/features và từng nền tảng (xem docs/ARCHITECTURE.md §2).
 * UI chỉ gọi qua `platform` (src/platform/index.ts); khác biệt Web/Android nằm hết trong src/platform/<id>/.
 */
import type { Track } from '@/providers/types';

export interface PlatformCaps {
  folderLink: boolean;
  noCopy: boolean;
  eq: boolean;
  normalize: boolean;
  crossfade: boolean;
  gapless: boolean;
  speed: boolean;
  sleepTimer: boolean;
  analyze: boolean;
}

export interface LibrarySource {
  /** Web: mở <input>; Android: SAF OpenDocumentTree + persist permission. */
  addFolder(): Promise<void>;
  /** Chỉ web: chọn nhiều file lẻ (iOS Safari không phải lúc nào cũng cho chọn thư mục). */
  addFiles?(): Promise<void>;
  listFolders(): Promise<{ id: string; label: string }[]>;
  removeFolder(id: string): Promise<void>;
  /** Quét tăng dần: chỉ đọc tag file mới/đổi (theo id + mtime). Gọi khi mở app (Android). */
  rescan(onProgress?: (done: number, total: number) => void): Promise<{ added: number; removed: number }>;
  /** URL để engine phát (web: blob URL; android: content:// URI đưa thẳng cho Media3). */
  resolve(track: Track): Promise<string>;
  artwork(track: Track): Promise<string | null>;
  lyricsFile(track: Track): Promise<string | null>; // .lrc cùng tên
}

export type EngineEvent =
  | { type: 'state'; playing: boolean; buffering: boolean }
  | { type: 'position'; sec: number; durationSec: number } // ~4 lần/giây khi app mở
  | { type: 'trackChanged'; index: number; reason: 'auto' | 'user' | 'error' }
  | { type: 'ended' } // hết hàng đợi đã đẩy xuống
  | { type: 'error'; trackId: string; message: string }
  | { type: 'remote'; action: 'next' | 'prev' | 'play' | 'pause' };

export interface AudioEngine {
  /**
   * JS là chủ hàng đợi; đẩy xuống "cửa sổ" bài hiện tại + tối đa 20 bài kế. Native tự chuyển bài khi màn hình tắt.
   * Cửa sổ rỗng = dừng và bỏ bài hiện tại.
   */
  setWindow(items: { track: Track; url: string }[], startIndex: number, startSec?: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(sec: number): Promise<void>;
  skipTo(index: number): Promise<void>;
  /** Nội suy từ event cuối + thời gian trôi qua (dùng cho lyrics). */
  getPosition(): number;
  setSpeed?(x: number): Promise<void>;
  setEq?(bandsDb: number[]): Promise<void>; // 5 hoặc 10 band
  setGainDb?(db: number): Promise<void>; // chuẩn hóa âm lượng theo bài
  setCrossfade?(sec: number): Promise<void>;
  /**
   * Chỉ web: gọi ĐỒNG BỘ trong handler chạm của người dùng để mở khóa <audio> trên iOS
   * (lần phát đầu tiên bắt buộc đến từ thao tác chạm).
   */
  unlock?(): void;
  on(cb: (e: EngineEvent) => void): () => void;
}

export interface AudioDecoder {
  /** PCM mono Float32 tại `sampleRate`, đoạn [startSec, startSec+durSec). */
  decodeSegment(track: Track, startSec: number, durSec: number, sampleRate: 22050): Promise<Float32Array>;
}

export interface Platform {
  id: 'web' | 'android';
  caps: PlatformCaps;
  library: LibrarySource;
  engine: AudioEngine;
  decoder: AudioDecoder;
}
