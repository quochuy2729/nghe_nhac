import type { Platform } from './types';
import { createWebPlatform } from './web';

/**
 * Chọn nền tảng một lần lúc khởi động. G2 sẽ thêm: `Capacitor.isNativePlatform()` → android.
 */
export const platform: Platform = createWebPlatform();

export type { Platform, PlatformCaps, LibrarySource, AudioEngine, AudioDecoder, EngineEvent } from './types';
