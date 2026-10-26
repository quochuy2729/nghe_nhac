import { Capacitor } from '@capacitor/core';
import { createAndroidPlatform } from './android';
import type { Platform } from './types';
import { createWebPlatform } from './web';

/** Chọn nền tảng một lần lúc khởi động: APK Capacitor → android, còn lại → web. */
export const platform: Platform = Capacitor.isNativePlatform() ? createAndroidPlatform() : createWebPlatform();

export type { Platform, PlatformCaps, LibrarySource, AudioEngine, AudioDecoder, EngineEvent } from './types';
