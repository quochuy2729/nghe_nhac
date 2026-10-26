/**
 * Tâm trạng ƯỚC LƯỢNG từ đặc trưng âm thanh bằng luật cố định (không phải học máy) và khung giờ trong ngày.
 */
import type { AudioFeatures } from '@/lib/db';

export type Mood = 'soi-dong' | 'chill' | 'sau-lang' | 'tap-trung' | 'khac';

export const MOOD_LABEL: Record<Mood, string> = {
  'soi-dong': 'Sôi động',
  chill: 'Chill',
  'sau-lang': 'Sâu lắng',
  'tap-trung': 'Tập trung',
  khac: 'Khác',
};

export interface MoodInput {
  energy: number;
  brightness: number;
  dynamics: number;
  bpm: number | null;
}

/** Thứ tự kiểm tra quan trọng: sôi động → sâu lắng → chill → tập trung. */
export function moodOf(f: MoodInput): Mood {
  const { energy, brightness, dynamics, bpm } = f;
  if (energy >= 0.6 && (bpm === null ? energy >= 0.7 : bpm >= 115)) return 'soi-dong';
  if (energy <= 0.4 && brightness <= 0.35) return 'sau-lang';
  if (energy <= 0.4 && (bpm === null || bpm < 100)) return 'chill';
  if (energy > 0.4 && energy < 0.65 && dynamics <= 0.4) return 'tap-trung'; // năng lượng vừa, ổn định
  return 'khac';
}

export const moodOfFeatures = (f: AudioFeatures): Mood => moodOf(f);

/** 6 khung giờ: 0–5, 5–9, 9–12, 12–17, 17–21, 21–24. */
export type HourSlot = 0 | 1 | 2 | 3 | 4 | 5;

export const SLOT_LABEL: Record<HourSlot, string> = {
  0: 'đêm khuya',
  1: 'sáng sớm',
  2: 'buổi sáng',
  3: 'buổi chiều',
  4: 'buổi tối',
  5: 'khuya',
};

export function hourSlot(date: Date): HourSlot {
  const h = date.getHours();
  return h < 5 ? 0 : h < 9 ? 1 : h < 12 ? 2 : h < 17 ? 3 : h < 21 ? 4 : 5;
}
