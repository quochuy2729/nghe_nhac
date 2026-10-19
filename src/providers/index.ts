import type { MusicProvider, ProviderId, Track } from './types';
import { mockProvider } from './mock';

const registry = new Map<ProviderId, MusicProvider>([[mockProvider.id, mockProvider]]);

export function registerProvider(p: MusicProvider): void {
  registry.set(p.id, p);
}

export function getProvider(id: ProviderId): MusicProvider {
  const p = registry.get(id);
  if (!p) throw new Error(`Chưa hỗ trợ nguồn "${id}"`);
  return p;
}

export function providerOf(track: Track): MusicProvider {
  return getProvider(track.provider);
}

export type { MusicProvider, ProviderId, Track };
