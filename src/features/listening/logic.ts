/**
 * Logic thuần cho trải nghiệm nghe (G6): hẹn giờ tắt, chuẩn hóa âm lượng, nhớ vị trí, EQ, tốc độ.
 * Không đụng DOM/engine để test được (nhận `now` làm tham số).
 */

/* ───────── Hẹn giờ tắt ───────── */

export const SLEEP_MINUTES = [5, 15, 30, 45, 60] as const;
/** Giảm âm lượng dần trong chừng này ms cuối (Android). */
export const SLEEP_FADE_MS = 10_000;

export type SleepState =
  | { kind: 'off' }
  | { kind: 'minutes'; endAt: number }
  /** dừng khi hết bài đang phát (`trackId`) */
  | { kind: 'track'; trackId: string };

export const sleepOff: SleepState = { kind: 'off' };

export const startSleepMinutes = (now: number, minutes: number): SleepState => ({ kind: 'minutes', endAt: now + minutes * 60_000 });
export const startSleepAtEndOfTrack = (trackId: string): SleepState => ({ kind: 'track', trackId });

export interface SleepInput {
  now: number;
  /** bài đang phát (null nếu không có) */
  trackId: string | null;
  /** bài vừa phát hết (sự kiện `ended`) */
  ended?: boolean;
}

export interface SleepResult {
  state: SleepState;
  /** true = phải dừng phát ngay */
  stop: boolean;
  /** hệ số âm lượng 0..1 (giảm dần ở 10 giây cuối) */
  volume: number;
}

export function evaluateSleep(state: SleepState, input: SleepInput): SleepResult {
  if (state.kind === 'off') return { state, stop: false, volume: 1 };
  if (state.kind === 'minutes') {
    const remaining = state.endAt - input.now;
    if (remaining <= 0) return { state: sleepOff, stop: true, volume: 1 };
    return { state, stop: false, volume: remaining < SLEEP_FADE_MS ? remaining / SLEEP_FADE_MS : 1 };
  }
  // "hết bài này": dừng khi bài đó kết thúc, hoặc đã sang bài khác (vd bấm next → coi như hết bài)
  if (input.ended || (input.trackId !== null && input.trackId !== state.trackId)) return { state: sleepOff, stop: true, volume: 1 };
  return { state, stop: false, volume: 1 };
}

export function sleepLabel(state: SleepState, now: number): string {
  if (state.kind === 'off') return 'Tắt';
  if (state.kind === 'track') return 'Hết bài này';
  const min = Math.max(1, Math.ceil((state.endAt - now) / 60_000));
  return `Còn ${min} phút`;
}

/* ───────── Chuẩn hóa âm lượng ───────── */

export const TARGET_LOUDNESS_DB = -14;
export const GAIN_MIN_DB = -8;
export const GAIN_MAX_DB = 6;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** gain = clamp(−14 dB − loudnessDb, −8, +6). */
export function normalizeGainDb(loudnessDb: number): number {
  return clamp(TARGET_LOUDNESS_DB - loudnessDb, GAIN_MIN_DB, GAIN_MAX_DB);
}

/** "-6.5 dB" / "+3.2" / số → dB; không hợp lệ → null. */
export function parseReplayGain(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(?:db)?$/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

/**
 * Gain cho một bài. Có tag ReplayGain thì dùng (chuẩn tham chiếu −18 LUFS → dời +4 dB về mục tiêu −14),
 * không thì tính từ độ ồn đã phân tích; chưa có gì thì 0.
 */
export function trackGainDb(src: { replayGainDb?: number | null; loudnessDb?: number | null }): number {
  if (typeof src.replayGainDb === 'number') return clamp(src.replayGainDb + 4, GAIN_MIN_DB, GAIN_MAX_DB);
  if (typeof src.loudnessDb === 'number') return normalizeGainDb(src.loudnessDb);
  return 0;
}

/* ───────── Nhớ vị trí bài dài ───────── */

/** Bài dài hơn 10 phút (podcast/mix) thì nhớ vị trí. */
export const LONG_TRACK_SEC = 600;
export const MAX_REMEMBERED = 30;

export const shouldRemember = (durationSec: number): boolean => durationSec > LONG_TRACK_SEC;

export interface Remembered {
  sec: number;
  at: number;
}

/** Vị trí phát tiếp: chưa nghe được 5 giây hoặc gần hết (còn < 10 giây) thì phát từ đầu. */
export function resumePoint(savedSec: number | undefined, durationSec: number): number {
  if (savedSec === undefined || !shouldRemember(durationSec)) return 0;
  return savedSec < 5 || savedSec > durationSec - 10 ? 0 : Math.floor(savedSec);
}

/** Giữ tối đa `max` vị trí mới nhất. */
export function trimRemembered(map: Record<string, Remembered>, max = MAX_REMEMBERED): Record<string, Remembered> {
  const keep = Object.entries(map)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, max);
  return Object.fromEntries(keep);
}

/* ───────── EQ ───────── */

export const EQ_BANDS_HZ = [60, 230, 910, 3600, 14000] as const;
export const EQ_LIMIT_DB = 12;

export type EqPresetId = 'flat' | 'bass' | 'vocal' | 'acoustic' | 'edm' | 'custom';

export const EQ_PRESETS: Record<Exclude<EqPresetId, 'custom'>, { label: string; bands: number[] }> = {
  flat: { label: 'Phẳng', bands: [0, 0, 0, 0, 0] },
  bass: { label: 'Bass', bands: [6, 4, 1, -1, -1] },
  vocal: { label: 'Vocal', bands: [-2, 0, 3, 3, 1] },
  acoustic: { label: 'Acoustic', bands: [3, 2, 1, 2, 3] },
  edm: { label: 'EDM', bands: [5, 3, -1, 2, 4] },
};

export const EQ_PRESET_LABELS: Record<EqPresetId, string> = {
  flat: 'Phẳng',
  bass: 'Bass',
  vocal: 'Vocal',
  acoustic: 'Acoustic',
  edm: 'EDM',
  custom: 'Tự chỉnh',
};

export function clampBands(bands: readonly number[]): number[] {
  return EQ_BANDS_HZ.map((_, i) => clamp(Number.isFinite(bands[i]) ? bands[i] : 0, -EQ_LIMIT_DB, EQ_LIMIT_DB));
}

/** Băng đang chỉnh trùng preset nào thì trả về preset đó, không thì 'custom'. */
export function presetFor(bands: readonly number[]): EqPresetId {
  const b = clampBands(bands);
  for (const [id, p] of Object.entries(EQ_PRESETS)) if (p.bands.every((v, i) => v === b[i])) return id as EqPresetId;
  return 'custom';
}

/* ───────── Tốc độ ───────── */

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;

export function clampSpeed(x: number): number {
  return Number.isFinite(x) ? Math.round(clamp(x, SPEED_MIN, SPEED_MAX) * 20) / 20 : 1;
}

/* ───────── Sắp xếp hàng đợi bằng kéo thả / vuốt ───────── */

/** Vị trí mới của hàng đang kéo sau khi di chuyển `dy` px (mỗi hàng cao `rowH`). */
export function dragTarget(from: number, dy: number, rowH: number, length: number): number {
  return clamp(from + Math.round(dy / rowH), 0, Math.max(0, length - 1));
}

/** Vuốt ngang đủ xa (về bên trái) và chủ yếu theo chiều ngang thì xóa. */
export function swipeToRemove(dx: number, dy: number, threshold = 80): boolean {
  return dx <= -threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
}
