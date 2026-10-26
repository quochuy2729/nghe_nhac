import { addPreResolver } from '@/features/player/resolve';
import type { Platform } from '../types';
import { NativeAudioEngine } from './NativeAudioEngine';
import { NativeDecoder } from './NativeDecoder';
import { SafLibrarySource } from './SafLibrarySource';
import { shareImageAndroid } from './share';

/**
 * Android (Capacitor): đọc thẳng thư mục qua SAF (G2), phát bằng Media3 trong PlaybackService (G3),
 * EQ / chuẩn hóa / crossfade / tốc độ / hẹn giờ native (G6) và giải mã phân tích bằng MediaCodec (G6).
 */
export function createAndroidPlatform(): Platform {
  const library = new SafLibrarySource();
  // Bài SAF không có blob trong IndexedDB: đưa content:// URI cho Media3.
  addPreResolver((track) => (track.source?.kind === 'saf' ? library.resolve(track) : Promise.resolve(null)));
  return {
    id: 'android',
    caps: {
      folderLink: true,
      noCopy: true,
      eq: true,
      normalize: true,
      crossfade: true,
      gapless: true,
      speed: true,
      sleepTimer: true,
      analyze: true,
    },
    shareImage: shareImageAndroid,
    library,
    engine: new NativeAudioEngine(),
    decoder: new NativeDecoder(),
  };
}
