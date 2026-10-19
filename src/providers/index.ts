import { hasJamendo } from '@/lib/env';
import type { MusicProvider, ProviderId, Track } from './types';
import { mockProvider } from './mock';
import { jamendoProvider } from './jamendo';
import { audiusProvider } from './audius';
import { localProvider } from './local';

const registry = new Map<ProviderId, MusicProvider>(
  [mockProvider, jamendoProvider, audiusProvider, localProvider].map((p) => [p.id, p]),
);

export function getProvider(id: ProviderId): MusicProvider {
  const p = registry.get(id);
  if (!p) throw new Error(`Chưa hỗ trợ nguồn "${id}"`);
  return p;
}

export function providerOf(track: Track): MusicProvider {
  return getProvider(track.provider);
}

/** Nguồn hiển thị trong tab Tìm kiếm. Không có Jamendo key → dùng Demo (mock). */
export function searchSources(): MusicProvider[] {
  return [hasJamendo ? jamendoProvider : mockProvider, audiusProvider, localProvider];
}

export type { MusicProvider, ProviderId, Track };
