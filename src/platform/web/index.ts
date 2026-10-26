import type { Platform } from '../types';
import { WebAudioEngine } from './WebAudioEngine';
import { WebDecoder } from './WebDecoder';
import { WebImportSource } from './WebImportSource';

export function createWebPlatform(): Platform {
  return {
    id: 'web',
    // Chỉ bật cap khi đã có cài đặt thật; các phase sau (G5/G6) bật dần.
    caps: {
      folderLink: false,
      noCopy: false,
      eq: false,
      normalize: false,
      crossfade: false,
      gapless: false,
      speed: false,
      sleepTimer: false,
      analyze: false,
    },
    library: new WebImportSource(),
    engine: new WebAudioEngine(),
    decoder: new WebDecoder(),
  };
}
