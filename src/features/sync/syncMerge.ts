/**
 * Gộp dữ liệu giữa hai máy — hàm thuần (xem docs/ARCHITECTURE.md §4).
 * - Bản ghi có phiên bản (`updatedAt`): last-write-wins; hòa thì chọn theo quy tắc xác định để hai máy
 *   luôn hội tụ về cùng một kết quả dù gộp theo thứ tự nào (giao hoán, lũy đẳng).
 * - Lượt nghe: hợp theo `id`, đẩy lại cả lô cũng không nhân đôi.
 */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface Versioned {
  updatedAt: number;
  /** xóa mềm */
  deleted?: boolean;
}

/** Bản thắng: `updatedAt` lớn hơn; bằng nhau thì bản đã xóa thắng, rồi so chuỗi JSON cho ổn định. */
export function pickWinner<T extends Versioned>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export interface MergeResult<T> {
  /** toàn bộ sau khi gộp */
  merged: T[];
  /** bản ghi mà bản BÊN KIA thắng → cần ghi vào bên "local" */
  applyLocal: T[];
  /** bản ghi mà local thắng và khác bên kia → cần đẩy lên */
  pushRemote: T[];
}

/** Gộp hai danh sách bản ghi có khóa `key`. */
export function mergeVersioned<T extends Versioned>(local: readonly T[], remote: readonly T[], key: (t: T) => string): MergeResult<T> {
  const l = new Map(local.map((t) => [key(t), t]));
  const r = new Map(remote.map((t) => [key(t), t]));
  const merged: T[] = [];
  const applyLocal: T[] = [];
  const pushRemote: T[] = [];
  for (const k of new Set([...l.keys(), ...r.keys()])) {
    const a = l.get(k);
    const b = r.get(k);
    if (a && !b) {
      merged.push(a);
      pushRemote.push(a);
    } else if (b && !a) {
      merged.push(b);
      applyLocal.push(b);
    } else if (a && b) {
      const w = pickWinner(a, b);
      merged.push(w);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (w === b) applyLocal.push(b);
      else pushRemote.push(a);
    }
  }
  return { merged, applyLocal, pushRemote };
}

/** Hợp hai danh sách lượt nghe theo `id` (lũy đẳng); kết quả cũ → mới. */
export function mergeEvents<T extends { id: string; t: number }>(local: readonly T[], remote: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));
}

/**
 * Mốc để pull theo `updated_at`: lùi lại 5 phút. Máy có đồng hồ chậm có thể ghi `updated_at` nhỏ hơn mốc
 * mà máy này đã đọc → nếu không lùi sẽ bỏ sót mãi mãi. Gộp lũy đẳng nên đọc lại vài bản ghi là vô hại.
 */
export function pullSince(cursorMs: number | null): number | null {
  return cursorMs === null ? null : Math.max(0, cursorMs - CLOCK_SKEW_MS);
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Chờ trước lần thử lại thứ `attempt` (0 = lần đầu): 5 s, 10 s, … tối đa 5 phút, cộng nhiễu ≤ 20%. */
export function backoffMs(attempt: number, rng: () => number = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempt), 5 * 60_000);
  return Math.round(base * (1 + 0.2 * rng()));
}
