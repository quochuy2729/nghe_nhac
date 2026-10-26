/** Nhớ vị trí nghe của bài dài (podcast/mix): lưu trong store `meta`, giữ 30 bài mới nhất. */
import { getMeta, setMeta } from '@/lib/db';
import { resumePoint, shouldRemember, trimRemembered, type Remembered } from './logic';

const KEY = 'resume';
let cache: Record<string, Remembered> = {};
let lastSave = 0;

export async function loadResume(): Promise<void> {
  cache = (await getMeta<Record<string, Remembered>>(KEY)) ?? {};
}

/** Giây cần phát tiếp (0 = từ đầu). Đồng bộ để dùng ngay khi nạp bài. */
export function getResumeSec(trackId: string, durationSec: number): number {
  return resumePoint(cache[trackId]?.sec, durationSec);
}

/** Lưu vị trí; `throttleMs` để sự kiện vị trí 4 lần/giây không ghi IndexedDB liên tục. */
export function rememberPosition(trackId: string, sec: number, durationSec: number, now = Date.now(), throttleMs = 10_000): void {
  if (!shouldRemember(durationSec)) return;
  if (throttleMs && now - lastSave < throttleMs) return;
  lastSave = now;
  cache = trimRemembered({ ...cache, [trackId]: { sec, at: now } });
  void setMeta(KEY, cache).catch(() => undefined);
}

/** Nghe hết bài: lần sau phát từ đầu. */
export function forgetPosition(trackId: string): void {
  if (!(trackId in cache)) return;
  const { [trackId]: _drop, ...rest } = cache;
  void _drop;
  cache = rest;
  void setMeta(KEY, cache).catch(() => undefined);
}
