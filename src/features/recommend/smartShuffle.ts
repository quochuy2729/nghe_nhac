/**
 * Trộn thông minh (docs/ARCHITECTURE.md §5), hàm thuần:
 * 1. thứ tự ngẫu nhiên có trọng số (Efraimidis–Spirakis, w = 0.5 + điểm);
 * 2. ràng buộc: không hai bài cùng nghệ sĩ liền nhau; |Δenergy| giữa hai bài kế tiếp ưu tiên ≤ 0.35
 *    (greedy trong top-5 có ngẫu nhiên, nới dần khi không còn lựa chọn);
 * 3. tùy chọn "chèn gợi ý ✨": cứ 4 bài thì thêm 1 bài ngoài danh sách (không ghi vào playlist).
 */
import type { AudioFeatures } from '@/lib/db';
import type { Track } from '@/providers/types';
import { artistNames } from './engine';

export const ENERGY_STEP = 0.35;
const TOP_K = 5;

export interface SmartShuffleOptions {
  rng?: () => number;
  features?: ReadonlyMap<string, AudioFeatures>;
  /** điểm ưa thích (≥ 0 càng cao càng sớm); mặc định 0 */
  score?: (t: Track) => number;
  /** bài ngoài danh sách để chèn ✨ */
  inject?: readonly Track[];
  injectEvery?: number;
}

export interface SmartShuffleResult {
  tracks: Track[];
  /** id các bài được chèn thêm (gắn nhãn ✨) */
  suggestedIds: Set<string>;
}

/** Nghệ sĩ chính (để đếm); '' nếu không rõ. */
function primaryArtist(t: Track): string {
  return [...artistNames(t.artist, t.albumArtist)][0] ?? '';
}

function sharesArtist(a: Track | undefined, b: Track): boolean {
  if (!a) return false;
  const x = artistNames(a.artist, a.albumArtist);
  for (const n of artistNames(b.artist, b.albumArtist)) if (x.has(n)) return true;
  return false;
}

export function smartShuffle(input: readonly Track[], opts: SmartShuffleOptions = {}): SmartShuffleResult {
  const rng = opts.rng ?? Math.random;
  const energyOf = (t: Track | undefined): number | undefined => (t ? opts.features?.get(t.id)?.energy : undefined);
  const energyOk = (a: Track | undefined, b: Track): boolean => {
    const ea = energyOf(a);
    const eb = energyOf(b);
    return ea === undefined || eb === undefined || Math.abs(ea - eb) <= ENERGY_STEP;
  };

  // 1. thứ tự ngẫu nhiên có trọng số: khóa = u^(1/w), lớn trước
  const remaining = input
    .map((t) => ({ t, key: rng() ** (1 / Math.max(0.05, 0.5 + (opts.score?.(t) ?? 0))) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.t);

  // 2. greedy theo ràng buộc
  const out: Track[] = [];
  while (remaining.length) {
    const prev = out[out.length - 1];
    // Một nghệ sĩ chiếm quá nửa số bài còn lại thì BẮT BUỘC xếp họ ngay (xen kẽ), kẻo cuối danh sách dồn cùng nghệ sĩ.
    const counts = new Map<string, number>();
    for (const c of remaining) counts.set(primaryArtist(c), (counts.get(primaryArtist(c)) ?? 0) + 1);
    const forced = [...counts].find(([a, n]) => a !== '' && n * 2 > remaining.length)?.[0];
    const forcedPool = forced === undefined ? [] : remaining.filter((c) => primaryArtist(c) === forced && !sharesArtist(prev, c));
    if (forcedPool.length) {
      const best = forcedPool.find((c) => energyOk(prev, c)) ?? forcedPool[0];
      out.push(remaining.splice(remaining.indexOf(best), 1)[0]);
      continue;
    }
    const top = remaining.slice(0, TOP_K).filter((c) => !sharesArtist(prev, c) && energyOk(prev, c));
    let pick: number;
    if (top.length) {
      pick = remaining.indexOf(top[Math.floor(rng() * top.length)]);
    } else {
      // Nới: bỏ giới hạn top-5, vẫn tránh trùng nghệ sĩ và chọn bài gần năng lượng nhất.
      let best = -1;
      let bestD = Infinity;
      remaining.forEach((c, i) => {
        if (sharesArtist(prev, c)) return;
        const ea = energyOf(prev);
        const eb = energyOf(c);
        const d = ea === undefined || eb === undefined ? 0 : Math.abs(ea - eb);
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      });
      pick = best >= 0 ? best : 0; // chỉ còn bài cùng nghệ sĩ
    }
    out.push(remaining.splice(pick, 1)[0]);
  }

  // 3. chèn gợi ý
  const suggestedIds = new Set<string>();
  const every = opts.injectEvery ?? 4;
  if (opts.inject?.length && every > 0) {
    const have = new Set(out.map((t) => t.id));
    const pool = opts.inject.filter((t) => !have.has(t.id));
    const merged: Track[] = [];
    out.forEach((t, i) => {
      merged.push(t);
      if ((i + 1) % every === 0 && i < out.length - 1) {
        const k = pool.findIndex((c) => !sharesArtist(t, c) && !sharesArtist(out[i + 1], c));
        if (k >= 0) {
          const [s] = pool.splice(k, 1);
          merged.push(s);
          suggestedIds.add(s.id);
        }
      }
    });
    return { tracks: merged, suggestedIds };
  }
  return { tracks: out, suggestedIds };
}
