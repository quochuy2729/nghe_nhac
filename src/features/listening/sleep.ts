/**
 * Hẹn giờ tắt. Android: chạy NATIVE (vẫn đúng giờ khi tắt màn hình, giảm âm lượng 10 giây cuối).
 * Web: kiểm trong sự kiện `position` (timeupdate) — không dùng setTimeout vì iOS làm chậm timer khi ở nền.
 */
import { create } from 'zustand';
import { platform } from '@/platform';
import { evaluateSleep, sleepOff, startSleepAtEndOfTrack, startSleepMinutes, type SleepState } from './logic';

export const useSleep = create<{ state: SleepState }>()(() => ({ state: sleepOff }));

const set = (state: SleepState) => useSleep.setState({ state });
const nativeTimer = () => typeof platform.engine.setSleepTimer === 'function';

export const sleep = {
  startMinutes(minutes: number, now = Date.now()) {
    const s = startSleepMinutes(now, minutes);
    set(s);
    if (s.kind === 'minutes') void platform.engine.setSleepTimer?.({ endAt: s.endAt, endOfTrack: false });
  },

  startEndOfTrack(trackId: string) {
    set(startSleepAtEndOfTrack(trackId));
    void platform.engine.setSleepTimer?.({ endAt: null, endOfTrack: true });
  },

  cancel() {
    set(sleepOff);
    void platform.engine.setSleepTimer?.({ endAt: null, endOfTrack: false });
  },

  /** Native báo hẹn giờ đã chạy xong. */
  nativeFinished() {
    set(sleepOff);
  },
};

/**
 * Gọi từ sự kiện vị trí / hết bài của engine không có hẹn giờ native. Trả true khi phải dừng phát.
 * Engine có hẹn giờ native thì luôn false (native tự dừng).
 */
export function sleepShouldStop(input: { now?: number; trackId: string | null; ended?: boolean }): boolean {
  if (nativeTimer()) return false;
  const cur = useSleep.getState().state;
  if (cur.kind === 'off') return false;
  const r = evaluateSleep(cur, { now: input.now ?? Date.now(), trackId: input.trackId, ended: input.ended });
  if (r.state !== cur) set(r.state);
  return r.stop;
}
