import { addPreResolver } from '@/features/player/resolve';
import type { Track } from '@/providers/types';
import type { Platform } from '../types';
import { Capacitor } from '@capacitor/core';
import { WebDecoder } from '../web/WebDecoder';
import { NativeAudioEngine } from './NativeAudioEngine';
import { SafLibrarySource } from './SafLibrarySource';

/**
 * Android (Capacitor): đọc thẳng thư mục qua SAF (G2) và phát bằng Media3 trong PlaybackService (G3).
 * Các cap EQ/chuẩn hóa/crossfade/tốc độ/hẹn giờ bật dần ở G6, analyze ở G5.
 */
/** Phân tích âm thanh tạm dùng WebDecoder đọc file qua WebView (G6 thay bằng NativeDecoder). */
async function safBlob(track: Track): Promise<Blob | null> {
  if (track.source?.kind !== 'saf') return null;
  const res = await fetch(Capacitor.convertFileSrc(track.source.uri));
  return res.ok ? res.blob() : null;
}

export function createAndroidPlatform(): Platform {
  const library = new SafLibrarySource();
  // Bài SAF không có blob trong IndexedDB: đưa content:// URI cho Media3.
  addPreResolver((track) => (track.source?.kind === 'saf' ? library.resolve(track) : Promise.resolve(null)));
  return {
    id: 'android',
    caps: {
      folderLink: true,
      noCopy: true,
      eq: false,
      normalize: false,
      crossfade: false,
      gapless: true,
      speed: false,
      sleepTimer: false,
      analyze: true,
    },
    library,
    engine: new NativeAudioEngine(),
    decoder: new WebDecoder(safBlob),
  };
}
