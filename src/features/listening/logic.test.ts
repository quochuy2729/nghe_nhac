import {
  clampBands,
  clampSpeed,
  dragTarget,
  evaluateSleep,
  normalizeGainDb,
  parseReplayGain,
  presetFor,
  resumePoint,
  shouldRemember,
  sleepLabel,
  sleepOff,
  startSleepAtEndOfTrack,
  startSleepMinutes,
  swipeToRemove,
  trackGainDb,
  trimRemembered,
} from './logic';

const T = 1_000_000;

describe('hẹn giờ tắt', () => {
  it('theo phút: chưa tới giờ thì tiếp tục, tới giờ thì dừng và về Tắt', () => {
    const s = startSleepMinutes(T, 15);
    expect(evaluateSleep(s, { now: T + 14 * 60_000, trackId: 'a' })).toMatchObject({ stop: false, volume: 1 });
    const r = evaluateSleep(s, { now: T + 15 * 60_000, trackId: 'a' });
    expect(r.stop).toBe(true);
    expect(r.state).toEqual(sleepOff);
  });

  it('10 giây cuối giảm âm lượng dần về 0', () => {
    const s = startSleepMinutes(T, 5);
    const end = T + 5 * 60_000;
    expect(evaluateSleep(s, { now: end - 10_000, trackId: 'a' }).volume).toBe(1);
    expect(evaluateSleep(s, { now: end - 5_000, trackId: 'a' }).volume).toBeCloseTo(0.5, 5);
    expect(evaluateSleep(s, { now: end - 1_000, trackId: 'a' }).volume).toBeCloseTo(0.1, 5);
  });

  it('"hết bài này": dừng khi bài kết thúc hoặc khi sang bài khác', () => {
    const s = startSleepAtEndOfTrack('a');
    expect(evaluateSleep(s, { now: T, trackId: 'a' }).stop).toBe(false);
    expect(evaluateSleep(s, { now: T, trackId: 'a', ended: true })).toMatchObject({ stop: true, state: sleepOff });
    expect(evaluateSleep(s, { now: T, trackId: 'b' }).stop).toBe(true);
  });

  it('tắt thì không làm gì', () => {
    expect(evaluateSleep(sleepOff, { now: T, trackId: 'a', ended: true })).toEqual({ state: sleepOff, stop: false, volume: 1 });
  });

  it('nhãn hiển thị', () => {
    expect(sleepLabel(sleepOff, T)).toBe('Tắt');
    expect(sleepLabel(startSleepAtEndOfTrack('a'), T)).toBe('Hết bài này');
    expect(sleepLabel(startSleepMinutes(T, 30), T + 60_000)).toBe('Còn 29 phút');
  });
});

describe('chuẩn hóa âm lượng', () => {
  it('gain = clamp(−14 − loudness, −8, +6)', () => {
    expect(normalizeGainDb(-14)).toBe(0);
    expect(normalizeGainDb(-20)).toBe(6);
    expect(normalizeGainDb(-30)).toBe(6); // chặn trên
    expect(normalizeGainDb(-8)).toBe(-6);
    expect(normalizeGainDb(0)).toBe(-8); // chặn dưới
  });

  it('bài master to và bài master nhỏ về gần cùng mức sau khi áp gain', () => {
    const loud = -8;
    const quiet = -19;
    expect(Math.abs(loud + normalizeGainDb(loud) - (quiet + normalizeGainDb(quiet)))).toBeLessThan(1);
  });

  it('ReplayGain ưu tiên hơn độ ồn đã phân tích', () => {
    expect(trackGainDb({ replayGainDb: -6, loudnessDb: -20 })).toBe(-2);
    expect(trackGainDb({ loudnessDb: -20 })).toBe(6);
    expect(trackGainDb({})).toBe(0);
    expect(trackGainDb({ replayGainDb: 20 })).toBe(6);
  });

  it('đọc tag ReplayGain', () => {
    expect(parseReplayGain('-6.50 dB')).toBe(-6.5);
    expect(parseReplayGain('+3,2 dB')).toBe(3.2);
    expect(parseReplayGain(-1.5)).toBe(-1.5);
    expect(parseReplayGain('abc')).toBeNull();
    expect(parseReplayGain(undefined)).toBeNull();
  });
});

describe('nhớ vị trí', () => {
  it('chỉ nhớ bài dài hơn 10 phút', () => {
    expect(shouldRemember(600)).toBe(false);
    expect(shouldRemember(601)).toBe(true);
  });

  it('mở lại thì phát tiếp từ chỗ cũ; quá đầu/cuối thì từ đầu', () => {
    expect(resumePoint(1234.7, 3600)).toBe(1234);
    expect(resumePoint(3, 3600)).toBe(0);
    expect(resumePoint(3595, 3600)).toBe(0);
    expect(resumePoint(1234, 300)).toBe(0); // bài ngắn không nhớ
    expect(resumePoint(undefined, 3600)).toBe(0);
  });

  it('giữ 30 vị trí mới nhất', () => {
    const map = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`t${i}`, { sec: 100, at: i }]));
    const kept = trimRemembered(map);
    expect(Object.keys(kept)).toHaveLength(30);
    expect(kept.t39).toBeDefined();
    expect(kept.t9).toBeUndefined();
  });
});

describe('EQ và tốc độ', () => {
  it('nhận ra preset hoặc tự chỉnh; chặn ±12 dB; thiếu band → 0', () => {
    expect(presetFor([0, 0, 0, 0, 0])).toBe('flat');
    expect(presetFor([6, 4, 1, -1, -1])).toBe('bass');
    expect(presetFor([1, 0, 0, 0, 0])).toBe('custom');
    expect(clampBands([20, -20, 3])).toEqual([12, -12, 3, 0, 0]);
  });

  it('tốc độ 0.5–2× theo bước 0.05', () => {
    expect(clampSpeed(0.2)).toBe(0.5);
    expect(clampSpeed(5)).toBe(2);
    expect(clampSpeed(1.234)).toBe(1.25);
    expect(clampSpeed(NaN)).toBe(1);
  });
});

describe('kéo thả / vuốt hàng đợi', () => {
  it('vị trí đích theo quãng kéo, trong giới hạn', () => {
    expect(dragTarget(3, 112, 56, 10)).toBe(5);
    expect(dragTarget(3, -200, 56, 10)).toBe(0);
    expect(dragTarget(8, 500, 56, 10)).toBe(9);
    expect(dragTarget(0, 20, 56, 1)).toBe(0);
  });

  it('chỉ xóa khi vuốt trái đủ xa và chủ yếu ngang', () => {
    expect(swipeToRemove(-100, 5)).toBe(true);
    expect(swipeToRemove(-50, 0)).toBe(false);
    expect(swipeToRemove(100, 0)).toBe(false);
    expect(swipeToRemove(-100, 90)).toBe(false); // đang cuộn dọc
  });
});
