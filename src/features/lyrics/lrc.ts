/**
 * Parser định dạng LRC.
 * - `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]`, `[mm:ss:xx]`; phút có thể > 99.
 * - Nhiều timestamp trên một dòng: `[00:12.00][01:30.50]Điệp khúc`.
 * - `[offset:±ms]`: dương = lời hiện SỚM hơn (theo đặc tả LRC).
 * - Bỏ dòng metadata (`[ar:]`, `[ti:]`, `[al:]`, `[by:]`, `[length:]`…), bỏ timestamp từng chữ `<mm:ss.xx>`.
 */
export interface LrcLine {
  timeMs: number;
  text: string;
}

export interface ParsedLrc {
  lines: LrcLine[];
  offsetMs: number;
  meta: Record<string, string>;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-zA-Z#]+):(.*)\]$/;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function toMs(min: string, sec: string, frac: string | undefined): number {
  let ms = 0;
  if (frac) ms = frac.length === 1 ? Number(frac) * 100 : frac.length === 2 ? Number(frac) * 10 : Number(frac);
  return Number(min) * 60_000 + Number(sec) * 1000 + ms;
}

export function parseLrc(src: string): ParsedLrc {
  const meta: Record<string, string> = {};
  const raw: Array<LrcLine & { order: number }> = [];
  let offsetMs = 0;
  let order = 0;

  for (const rawLine of src.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    // timestamp chỉ tính khi nằm liên tiếp ở đầu dòng
    while ((m = TIME_TAG.exec(line)) && m.index === lastEnd) {
      times.push(toMs(m[1], m[2], m[3]));
      lastEnd = TIME_TAG.lastIndex;
    }

    if (times.length === 0) {
      const mm = line.match(META_TAG);
      if (mm) {
        const key = mm[1].toLowerCase();
        const value = mm[2].trim();
        meta[key] = value;
        if (key === 'offset') {
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n)) offsetMs = n;
        }
      }
      continue;
    }

    const text = line.slice(lastEnd).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    for (const t of times) raw.push({ timeMs: t, text, order: order++ });
  }

  const lines = raw
    .map((l) => ({ ...l, timeMs: Math.max(0, l.timeMs - offsetMs) }))
    .sort((a, b) => a.timeMs - b.timeMs || a.order - b.order)
    .map(({ timeMs, text }) => ({ timeMs, text }));

  return { lines, offsetMs, meta };
}

/** Có ít nhất một timestamp hợp lệ? */
export function isSyncedLrc(src: string): boolean {
  return parseLrc(src).lines.length > 0;
}

/** Chỉ số dòng đang hát tại `timeMs` (binary search). -1 nếu chưa tới dòng đầu. */
export function activeLineIndex(lines: readonly LrcLine[], timeMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
