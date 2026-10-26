/**
 * Dữ liệu cục bộ được đồng bộ nhưng chưa có store riêng trong IndexedDB: playlist thông minh và cài đặt
 * người dùng (lưu trong store `meta`). Mọi lần ghi đi qua đây để luôn kèm một dòng outbox.
 */
import { getMeta, setMeta } from '@/lib/db';
import type { SmartPlaylist } from '@/features/smart/types';
import { enqueue } from './outbox';
import { iso } from './rows';

const SMART_KEY = 'smart_playlists';
const SETTINGS_KEY = 'user_settings';

export interface UserSettings {
  data: Record<string, unknown>;
  updatedAt: number;
}

/** Cả bản đã xóa mềm (cần giữ để đồng bộ việc xóa). UI nên lọc `!deleted`. */
export async function getAllSmartPlaylists(): Promise<SmartPlaylist[]> {
  return (await getMeta<SmartPlaylist[]>(SMART_KEY)) ?? [];
}

export function smartToRow(p: SmartPlaylist): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    data: { rules: p.rules, match: p.match, sort: p.sort, ...(p.limit ? { limit: p.limit } : {}) },
    updated_at: iso(p.updatedAt),
    deleted: !!p.deleted,
  };
}

export function rowToSmart(r: Record<string, unknown>, updatedAt: number): SmartPlaylist {
  const d = (r.data ?? {}) as Partial<SmartPlaylist>;
  return {
    id: String(r.id),
    name: String(r.name),
    rules: d.rules ?? [],
    match: d.match ?? 'all',
    sort: d.sort ?? 'random',
    ...(d.limit ? { limit: d.limit } : {}),
    updatedAt,
    ...(r.deleted ? { deleted: true } : {}),
  };
}

/** Thay toàn bộ danh sách (dùng khi gộp từ server — không đưa vào outbox). */
export async function replaceSmartPlaylists(list: SmartPlaylist[]): Promise<void> {
  await setMeta(SMART_KEY, list);
}

/** Tạo/sửa/xóa mềm một playlist thông minh và xếp hàng đẩy lên. */
export async function saveSmartPlaylist(p: SmartPlaylist): Promise<void> {
  const next = { ...p, updatedAt: p.updatedAt || Date.now() };
  const all = (await getAllSmartPlaylists()).filter((x) => x.id !== next.id);
  await setMeta(SMART_KEY, [...all, next]);
  await enqueue('smart_playlists', 'upsert', smartToRow(next));
}

export async function getUserSettings(): Promise<UserSettings | undefined> {
  return getMeta<UserSettings>(SETTINGS_KEY);
}

export async function replaceUserSettings(s: UserSettings): Promise<void> {
  await setMeta(SETTINGS_KEY, s);
}

/** Gộp `patch` vào cài đặt đồng bộ (preset EQ, tùy chọn gợi ý…) và xếp hàng đẩy lên. */
export async function saveUserSettings(patch: Record<string, unknown>, now = Date.now()): Promise<UserSettings> {
  const cur = await getUserSettings();
  const next: UserSettings = { data: { ...(cur?.data ?? {}), ...patch }, updatedAt: now };
  await setMeta(SETTINGS_KEY, next);
  await enqueue('user_settings', 'upsert', { data: next.data, updated_at: iso(now) });
  return next;
}
