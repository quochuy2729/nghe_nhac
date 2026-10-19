import type { Track } from '@/providers/types';

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seekTo: (sec: number) => void;
  seekBy: (deltaSec: number) => void;
}

const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

function guessType(url: string): string | undefined {
  if (url.startsWith('data:image/svg')) return 'image/svg+xml';
  if (/\.png($|\?)/i.test(url)) return 'image/png';
  if (/\.jpe?g($|\?)/i.test(url)) return 'image/jpeg';
  return undefined;
}

export function setMediaMetadata(track: Track | undefined): void {
  if (!supported()) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const artwork: MediaImage[] = track.artworkUrl
    ? ['96x96', '256x256', '512x512'].map((sizes) => ({ src: track.artworkUrl!, sizes, type: guessType(track.artworkUrl!) }))
    : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? '',
    artwork,
  });
}

export function setMediaPlaybackState(state: 'playing' | 'paused' | 'none'): void {
  if (!supported()) return;
  navigator.mediaSession.playbackState = state;
}

export function setMediaPosition(duration: number, position: number, playbackRate = 1): void {
  if (!supported() || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(Math.max(position, 0), duration),
      playbackRate,
    });
  } catch {
    // Một số trình duyệt ném lỗi khi trạng thái chưa hợp lệ — bỏ qua.
  }
}

export function registerMediaHandlers(h: MediaHandlers): void {
  if (!supported()) return;
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // action không được hỗ trợ trên trình duyệt này
    }
  };
  set('play', () => h.play());
  set('pause', () => h.pause());
  set('stop', () => h.pause());
  set('previoustrack', () => h.previous());
  set('nexttrack', () => h.next());
  set('seekto', (d) => {
    if (d.seekTime != null) h.seekTo(d.seekTime);
  });
  // Không đăng ký seekbackward/seekforward: trên iOS chúng thay thế nút bài trước/sau
  // ở màn hình khóa. Tua 10s vẫn có qua phím tắt trong app (h.seekBy).
}
