import { platform } from './index';
import type { Platform } from './types';

/** Cho UI: `const { caps } = usePlatform()`. Nền tảng cố định suốt phiên nên không cần state. */
export function usePlatform(): Platform {
  return platform;
}
