import { addPreResolver } from '@/features/player/resolve';
import type { Platform } from '../types';
import { WebAudioEngine } from '../web/WebAudioEngine';
import { WebDecoder } from '../web/WebDecoder';
import { SafLibrarySource } from './SafLibrarySource';

/**
 * Android (Capacitor). G2: đọc thẳng thư mục qua SAF; phát tạm bằng <audio> đọc `content://` qua
 * `convertFileSrc` (G3 thay bằng Media3). Các cap còn lại bật dần ở G3/G5/G6.
 */
export function createAndroidPlatform(): Platform {
  const library = new SafLibrarySource();
  // Bài SAF không có blob trong IndexedDB: đưa URL content:// cho engine.
  addPreResolver((track) => (track.source?.kind === 'saf' ? library.resolve(track) : Promise.resolve(null)));
  return {
    id: 'android',
    caps: {
      folderLink: true,
      noCopy: true,
      eq: false,
      normalize: false,
      crossfade: false,
      gapless: false,
      speed: false,
      sleepTimer: false,
      analyze: false,
    },
    library,
    engine: new WebAudioEngine(),
    decoder: new WebDecoder(),
  };
}
