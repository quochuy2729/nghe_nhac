import type { MusicProvider, ProviderId, Track } from './types';
import { folderProvider } from './folder';

const registry = new Map<ProviderId, MusicProvider>([[folderProvider.id, folderProvider]]);

export function getProvider(id: ProviderId): MusicProvider {
  const p = registry.get(id);
  if (!p) throw new Error(`Chưa hỗ trợ nguồn "${id}"`);
  return p;
}

export function providerOf(track: Track): MusicProvider {
  return getProvider(track.provider);
}

export { folderProvider };
export type { MusicProvider, ProviderId, Track };
