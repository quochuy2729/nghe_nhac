import type { Track } from '@/providers/types';
import { providerOf } from '@/providers';

type Resolver = (track: Track) => Promise<string | null>;

/** Các resolver ưu tiên (vd bản tải offline trong IndexedDB) — đăng ký ở P4. */
const preResolvers: Resolver[] = [];

export function addPreResolver(r: Resolver): void {
  preResolvers.push(r);
}

export async function resolvePlayableUrl(track: Track): Promise<string> {
  for (const r of preResolvers) {
    const url = await r(track);
    if (url) return url;
  }
  return providerOf(track).getStreamUrl(track);
}
