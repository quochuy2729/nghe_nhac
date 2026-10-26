import type { OverrideRecord } from '@/lib/db';
import type { Track } from '@/providers/types';

/**
 * Track hiển thị = track ⊕ tag sửa tay. Chỉ ghi đè các trường có giá trị trong patch
 * (chuỗi rỗng bị bỏ qua để không xóa nhầm tên bài); không đổi object gốc.
 */
export function applyOverride(track: Track, override?: Pick<OverrideRecord, 'patch'> | null): Track {
  if (!override) return track;
  const out: Track = { ...track };
  for (const [key, value] of Object.entries(override.patch)) {
    if (value === undefined || value === null || value === '') continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}
