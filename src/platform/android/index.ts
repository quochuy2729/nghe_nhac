import { addPreResolver } from '@/features/player/resolve';
import type { Platform } from '../types';
import { WebDecoder } from '../web/WebDecoder';
import { NativeAudioEngine } from './NativeAudioEngine';
import { SafLibrarySource } from './SafLibrarySource';

/**
 * Android (Capacitor): đọc thẳng thư mục qua SAF (G2) và phát bằng Media3 trong PlaybackService (G3).
 * Các cap EQ/chuẩn hóa/crossfade/tốc độ/hẹn giờ bật dần ở G6, analyze ở G5.
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
      eq: false,
      normalize: false,
      crossfade: false,
      gapless: true,
      speed: false,
      sleepTimer: false,
      analyze: false,
    },
    library,
    engine: new NativeAudioEngine(),
    decoder: new WebDecoder(),
  };
}
