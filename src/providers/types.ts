export type ProviderId = 'jamendo' | 'audius' | 'local' | 'mock';

/**
 * Metadata một bài hát. `id` là khóa toàn cục dạng `<provider>:<sourceId>`
 * (vd `jamendo:12345`) để lưu chung một bảng `tracks` trên Supabase.
 */
export interface Track {
  id: string;
  provider: ProviderId;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artworkUrl?: string;
  /** Provider cho phép tải về (hoặc là file của chính người dùng). */
  downloadable: boolean;
  /** URL stream đã biết sẵn (vd Jamendo trả kèm khi search). */
  streamUrl?: string;
  /** Đường dẫn file trong Supabase Storage (chỉ track local đã upload). */
  storagePath?: string;
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
  /** Lời bài hát LRC kèm theo nguồn (vd mock, file .lrc local). */
  getLyrics?(track: Track): Promise<string | null>;
}

export function sourceId(track: Pick<Track, 'id'>): string {
  const i = track.id.indexOf(':');
  return i >= 0 ? track.id.slice(i + 1) : track.id;
}
