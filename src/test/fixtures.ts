import type { Track } from '@/providers/types';

export function fakeTrack(n: number, extra: Partial<Track> = {}): Track {
  return {
    id: `folder:${n}`,
    provider: 'folder',
    title: `Bài thử ${n}`,
    artist: 'Nghệ sĩ thử',
    durationSec: 120,
    downloadable: true,
    ...extra,
  };
}

export function fakeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => fakeTrack(i + 1));
}

/** RNG xác định (mulberry32) để test shuffle lặp lại được. */
export function seededRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seqUid(): () => string {
  let i = 0;
  return () => `u${++i}`;
}
