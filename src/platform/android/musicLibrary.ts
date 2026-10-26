/** Hợp đồng JS ↔ plugin Kotlin `MusicLibrary` (android/.../plugins/MusicLibraryPlugin.kt). */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface ScanItem {
  uri: string;
  /** thư mục chứa file, tương đối so với thư mục gốc đã chọn ("" = ngay trong gốc) */
  relDir: string;
  name: string;
  size: number;
  mtime: number;
  lrcUri?: string;
  lrcMtime?: number;
}

export interface TagResult {
  uri: string;
  ok?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  /** chuỗi thô từ tag, vd "Pop;Rock" hoặc "(13)" */
  genre?: string;
  year?: number;
  durationSec?: number;
  /** đường dẫn tuyệt đối tới ảnh bìa trong cache của app */
  artworkPath?: string;
}

export interface NativeFolder {
  id: string;
  label: string;
  /** false = quyền đọc thư mục đã bị thu hồi */
  accessible?: boolean;
}

export interface MusicLibraryPlugin {
  pickFolder(): Promise<{ folder: NativeFolder | null }>;
  listFolders(): Promise<{ folders: NativeFolder[] }>;
  removeFolder(opts: { id: string }): Promise<void>;
  /** Kết quả đi qua sự kiện `scanBatch` (≤ 200 file/lô); promise trả tổng số file đã bắn. */
  scan(opts: { folderId: string; scanId: string }): Promise<{ total: number }>;
  readTags(opts: { uris: string[] }): Promise<{ tags: TagResult[] }>;
  artwork(opts: { uri: string }): Promise<{ path: string | null }>;
  readText(opts: { uri: string }): Promise<{ text: string | null }>;
  /** PCM mono int16 @ sampleRate của đoạn [startSec, startSec+durSec), ghi vào file trong cache. */
  decodeSegment(opts: { uri: string; startSec: number; durSec: number; sampleRate: number }): Promise<{ path: string; samples: number }>;
  addListener(
    event: 'scanBatch',
    cb: (e: { scanId: string; items: ScanItem[] }) => void,
  ): Promise<PluginListenerHandle>;
}

export const MusicLibrary = registerPlugin<MusicLibraryPlugin>('MusicLibrary');
