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
  /** Android: tự quét lại khi mở app / quay lại foreground. Trả hàm hủy. Web không cần. */
  startAutoRescan?(): () => void;
  /** URL để engine phát (web: blob URL; android: content:// URI đưa thẳng cho Media3). */
  resolve(track: Track): Promise<string>;
  artwork(track: Track): Promise<string | null>;
  lyricsFile(track: Track): Promise<string | null>; // .lrc cùng tên
}

export type EngineEvent =
  | { type: 'state'; playing: boolean; buffering: boolean }
  | { type: 'position'; sec: number; durationSec: number } // ~4 lần/giây khi app mở
  | { type: 'trackChanged'; index: number; reason: 'auto' | 'user' | 'error'; trackId?: string }
  | { type: 'ended' } // hết hàng đợi đã đẩy xuống
  | { type: 'error'; trackId: string; message: string }
  /** Hẹn giờ native đã hết/bị hủy (`active: false`) hoặc đã bắt đầu. */
  | { type: 'sleep'; active: boolean }
  | { type: 'remote'; action: 'next' | 'prev' | 'play' | 'pause' | 'toggleLike' }
  /** Lượt nghe do native ghi (kể cả lúc app ở nền), lấy ra khi app mở/quay lại. */
  | { type: 'history'; events: { trackId: string; playedSec: number; durationSec: number; endedAt: number }[] };

/** Một bài trong cửa sổ đẩy xuống engine. `gainDb` = chuẩn hóa âm lượng (dB) áp khi bài bắt đầu. */
export interface WindowItem {
  track: Track;
  url: string;
  gainDb?: number;
}

export interface AudioEngine {
  /**
   * true = engine tự chuyển bài trong "cửa sổ" (native, chạy cả khi tắt màn hình); store phải đồng bộ hàng đợi
   * theo `trackChanged`, nạp thêm bằng `appendWindow` và tự ghi lịch sử từ `history` thay vì đo thời gian nghe ở JS.
   */
  readonly managesQueue?: boolean;
  /** Thêm bài vào cuối cửa sổ mà không làm gián đoạn bài đang phát. */
  appendWindow?(items: WindowItem[]): Promise<void>;
  /** Thay các bài SAU bài đang phát (hàng đợi vừa đổi). */
  setUpcoming?(items: WindowItem[]): Promise<void>;
  /** Trạng thái thích của bài đang phát (nút thích trên notification). */
  setLiked?(liked: boolean): Promise<void>;
  /**
   * JS là chủ hàng đợi; đẩy xuống "cửa sổ" bài hiện tại + tối đa 20 bài kế. Native tự chuyển bài khi màn hình tắt.
   * Cửa sổ rỗng = dừng và bỏ bài hiện tại.
   */
  setWindow(items: WindowItem[], startIndex: number, startSec?: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(sec: number): Promise<void>;
  skipTo(index: number): Promise<void>;
  /** Nội suy từ event cuối + thời gian trôi qua (dùng cho lyrics). */
  getPosition(): number;
  /** Tốc độ 0.5–2×; `preservePitch` = giữ cao độ. */
  setSpeed?(x: number, preservePitch?: boolean): Promise<void>;
  setEq?(bandsDb: number[], enabled?: boolean): Promise<void>; // 5 band
  setGainDb?(db: number): Promise<void>; // chuẩn hóa âm lượng theo bài
  setCrossfade?(sec: number): Promise<void>;
  /** Bật/tắt áp `gainDb` theo bài (chuẩn hóa âm lượng). */
  setNormalize?(enabled: boolean): Promise<void>;
  /**
   * Hẹn giờ chạy NATIVE (vẫn đúng giờ khi tắt màn hình): `endAt` = mốc tuyệt đối (epoch ms) hoặc null; `endOfTrack` = dừng khi hết bài.
   * Engine không có hàm này (web) thì store tự kiểm trong sự kiện `position`.
   */
  setSleepTimer?(opts: { endAt: number | null; endOfTrack: boolean }): Promise<void>;
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
