/** contentSim(a,b) = wTag·tagSim + wAudio·audioSim (docs/ARCHITECTURE.md §5). Hàm thuần, không phụ thuộc engine. */
import type { AudioFeatures } from '@/lib/db';
import type { Track } from '@/providers/types';
import { audioSim } from './audioSim';

/** Tag thưa = một trong hai bài không có thể loại. */
export function tagsSparse(a: Track, b: Track): boolean {
  return !(a.genre?.length && b.genre?.length);
}

/** Thiếu đặc trưng thì wAudio = 0; tag thưa thì wAudio = 0.6, còn lại 0.4. */
export function combineSim(tagSim: number, audio: number | undefined, sparse: boolean): number {
  if (audio === undefined) return tagSim;
  const wAudio = sparse ? 0.6 : 0.4;
  return (1 - wAudio) * tagSim + wAudio * audio;
}

export function contentSim(a: Track, b: Track, tagSim: number, fa?: AudioFeatures, fb?: AudioFeatures): number {
  if (a.id === b.id) return 1;
  return combineSim(tagSim, fa && fb ? audioSim(fa, fb) : undefined, tagsSparse(a, b));
}
