/** Sửa tag trong app: lưu thành override (không ghi vào file nhạc), xếp hàng đồng bộ `track_overrides`, làm mới thư viện. */
import { getAllOverrides, putOverride, type OverrideRecord } from '@/lib/db';
import { enqueue } from '@/features/sync/outbox';
import { overrideToRow } from '@/features/sync/rows';
import { loadFolder } from '@/providers/folder';

export type TagPatch = OverrideRecord['patch'];

/** Bỏ trường rỗng/không đổi để sửa hàng loạt chỉ đụng đúng thứ người dùng nhập. */
export function cleanPatch(p: TagPatch): TagPatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out as TagPatch;
}

/** Gộp `patch` vào override hiện có của từng bài. Trả số bài đã sửa. */
export async function saveOverrides(trackIds: readonly string[], patch: TagPatch, now = Date.now()): Promise<number> {
  const clean = cleanPatch(patch);
  if (!trackIds.length || !Object.keys(clean).length) return 0;
  const existing = new Map((await getAllOverrides()).map((o) => [o.trackId, o]));
  for (const trackId of trackIds) {
    const rec: OverrideRecord = { trackId, patch: { ...(existing.get(trackId)?.patch ?? {}), ...clean }, updatedAt: now };
    await putOverride(rec);
    await enqueue('track_overrides', 'upsert', overrideToRow(rec));
  }
  await loadFolder();
  return trackIds.length;
}

/** "Khôi phục tag gốc": patch rỗng (vẫn là một phiên bản mới nên máy kia cũng khôi phục theo). */
export async function restoreOriginal(trackIds: readonly string[], now = Date.now()): Promise<void> {
  for (const trackId of trackIds) {
    const rec: OverrideRecord = { trackId, patch: {}, updatedAt: now };
    await putOverride(rec);
    await enqueue('track_overrides', 'upsert', overrideToRow(rec));
  }
  await loadFolder();
}

/** Tên thể loại "Pop, Rock" → ["Pop", "Rock"]. */
export function parseGenres(text: string): string[] {
  return text
    .split(/[;,/]/)
    .map((g) => g.trim())
    .filter(Boolean);
}
