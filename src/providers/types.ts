/** Nguồn nhạc duy nhất: file nhạc bạn nạp vào điện thoại (xem providers/folder.ts). */
export type ProviderId = 'folder';

/**
 * Metadata một bài hát. `id` là khóa toàn cục dạng `<provider>:<sourceId>`
 * (vd `folder:0a3fa9c1d20b7e`, hash của tên file + dung lượng) để lưu chung một bảng `tracks` trên Supabase.
 */
export interface Track {
  id: string;
  provider: ProviderId;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  /** Thể loại từ tag, đã tách (["Pop", "Indie"]). Dùng cho gợi ý. */
  genre?: string[];
  year?: number;
  bpm?: number;
  durationSec: number;
  artworkUrl?: string;
  /** Luôn true với bài nạp vào máy; giữ trường để khớp schema Supabase. */
  downloadable: boolean;
  /** Thời điểm nạp vào máy (ms) — dùng cho "Mới thêm". */
  addedAt?: number;
  /** Đường dẫn thư mục tương đối (vd "Nhạc/Pop"), để duyệt theo thư mục. */
  folder?: string;
  /** Nơi giữ file: IndexedDB (web) hoặc URI SAF (Android, không sao chép file). */
  source?:
    | { kind: 'idb' }
    | { kind: 'saf'; uri: string; mtime: number; folderId?: string; lrc?: { uri: string; mtime: number } };
  /** URL stream đã biết sẵn (không dùng cho nhạc trên máy; giữ cho tương thích dữ liệu đã lưu). */
  streamUrl?: string;
}

export interface MusicProvider {
  id: ProviderId;
  label: string;
  search(q: string, page?: number): Promise<Track[]>;
  /** Danh sách gợi ý cho Trang chủ (không bắt buộc). */
  featured?(): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>;
  /** null = không cho tải. */
  getDownloadUrl?(track: Track): Promise<string | null>;
  /** Lời bài hát LRC kèm theo (file .lrc đã nạp cùng file nhạc). */
  getLyrics?(track: Track): Promise<string | null>;
}

export function sourceId(track: Pick<Track, 'id'>): string {
  const i = track.id.indexOf(':');
  return i >= 0 ? track.id.slice(i + 1) : track.id;
}
