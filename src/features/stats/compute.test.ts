import type { AudioFeatures, PlayEvent } from '@/lib/db';
import { fakeTrack } from '@/test/fixtures';
import { computeStats, currentRun, localParts, longestRun, periodFor, previousPeriod, VN_OFFSET_MS, type StatsInput } from './compute';

const MIN = 60_000;
const DAY = 86_400_000;
/** 2026-10-26 (Thứ Hai) 12:00 giờ VN. */
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0) - VN_OFFSET_MS;
/** Mốc theo giờ VN: vn(y, m, d, h, min). */
const vn = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - VN_OFFSET_MS;

let n = 0;
const ev = (trackId: string, t: number, sec = 180, kind: PlayEvent['kind'] = 'complete', device: PlayEvent['device'] = 'poco'): PlayEvent => ({
  id: `e${++n}`,
  trackId,
  t,
  sec,
  dur: 200,
  kind,
  device,
});

const tracks = [
  fakeTrack(1, { title: 'Một', artist: 'Mỹ Tâm feat. Hà Anh Tuấn', genre: ['Pop'], album: 'Tâm 9' }),
  fakeTrack(2, { title: 'Hai', artist: 'Hà Anh Tuấn', genre: ['Pop', 'Ballad'], album: 'Sao' }),
  fakeTrack(3, { title: 'Ba', artist: 'Sơn Tùng', genre: ['Rap'] }),
];

function input(events: PlayEvent[], over: Partial<StatsInput> = {}): StatsInput {
  const period = periodFor('month', NOW);
  return { events, tracks, period, previous: previousPeriod('month', period), now: NOW, ...over };
}

describe('kỳ thống kê theo giờ VN', () => {
  it('tuần bắt đầu từ thứ Hai 00:00 giờ VN', () => {
    const p = periodFor('week', NOW);
    expect(p.start).toBe(vn(2026, 10, 26));
    expect(p.end - p.start).toBe(7 * DAY);
    const sun = periodFor('week', vn(2026, 11, 1, 23, 30)); // Chủ nhật cuối tuần
    expect(sun.start).toBe(vn(2026, 10, 26));
  });

  it('tháng và năm theo lịch; kỳ trước liền kề', () => {
    const m = periodFor('month', NOW);
    expect(m).toEqual({ start: vn(2026, 10, 1), end: vn(2026, 11, 1) });
    expect(previousPeriod('month', m)).toEqual({ start: vn(2026, 9, 1), end: vn(2026, 10, 1) });
    const y = periodFor('year', NOW);
    expect(y).toEqual({ start: vn(2026, 1, 1), end: vn(2027, 1, 1) });
    expect(previousPeriod('year', y).start).toBe(vn(2025, 1, 1));
    expect(previousPeriod('week', periodFor('week', NOW)).end).toBe(vn(2026, 10, 26));
    const c = { start: vn(2026, 10, 10), end: vn(2026, 10, 20) };
    expect(periodFor('custom', NOW, c)).toEqual(c);
    expect(previousPeriod('custom', c)).toEqual({ start: c.start - 10 * DAY, end: c.start });
  });

  it('nửa đêm giờ VN: 23:59 và 00:01 thuộc hai ngày khác nhau dù cùng giờ UTC gần nhau', () => {
    const a = localParts(vn(2026, 10, 25, 23, 59));
    const b = localParts(vn(2026, 10, 26, 0, 1));
    expect(b.day - a.day).toBe(1);
    expect(a.weekday).toBe(6); // Chủ nhật
    expect(b.weekday).toBe(0); // Thứ Hai
    expect(b.hour).toBe(0);
  });
});

describe('chuỗi ngày nghe liên tiếp', () => {
  it('longestRun / currentRun', () => {
    expect(longestRun([1, 2, 3, 5, 6, 9])).toBe(3);
    expect(longestRun([])).toBe(0);
    expect(longestRun([4, 4, 4])).toBe(1);
    expect(currentRun(new Set([8, 9, 10]), 10)).toBe(3);
    expect(currentRun(new Set([8, 9]), 10)).toBe(2); // hôm nay chưa nghe, vẫn giữ chuỗi
    expect(currentRun(new Set([7]), 10)).toBe(0);
  });

  it('chuỗi qua nửa đêm giờ VN: 23:50 hôm trước + 00:10 hôm sau = 2 ngày liên tiếp', () => {
    const events = [ev('folder:1', vn(2026, 10, 23, 23, 50)), ev('folder:1', vn(2026, 10, 24, 0, 10)), ev('folder:1', vn(2026, 10, 25, 9, 0))];
    const s = computeStats(input(events));
    expect(s.longestStreak).toBe(3);
  });

  it('nghe 23:50 UTC (= 06:50 sáng VN hôm sau) tính vào ngày VN, không phải ngày UTC', () => {
    const t = Date.UTC(2026, 9, 24, 23, 50); // 24/10 23:50 UTC = 25/10 06:50 VN
    expect(localParts(t).d).toBe(25);
    const s = computeStats(input([ev('folder:1', t), ev('folder:1', Date.UTC(2026, 9, 25, 3, 0))])); // 25/10 10:00 VN
    expect(s.longestStreak).toBe(1);
  });

  it('chuỗi hiện tại tính cả lịch sử trước kỳ', () => {
    const events = [ev('folder:1', vn(2026, 10, 24, 20)), ev('folder:1', vn(2026, 10, 25, 20)), ev('folder:1', vn(2026, 10, 26, 8))];
    expect(computeStats(input(events, { period: periodFor('week', NOW), previous: previousPeriod('week', periodFor('week', NOW)) })).currentStreak).toBe(3);
  });
});

describe('computeStats', () => {
  const events = [
    ev('folder:1', vn(2026, 10, 5, 8, 0), 180),
    ev('folder:1', vn(2026, 10, 6, 8, 30), 180),
    ev('folder:2', vn(2026, 10, 6, 21, 0), 120),
    ev('folder:3', vn(2026, 10, 7, 21, 0), 10, 'skip'),
    ev('folder:3', vn(2026, 10, 7, 21, 5), 200, 'complete', 'iphone'),
    ev('folder:99', vn(2026, 10, 8, 10, 0), 60), // bài đã bị xóa khỏi thư viện
    ev('folder:1', vn(2026, 9, 10, 8, 0), 600), // kỳ trước (tháng 9)
  ];

  it('tổng phút, số lượt (không tính bỏ qua), số bài khác nhau, tỷ lệ bỏ qua', () => {
    const s = computeStats(input(events));
    expect(s.minutes).toBe(Math.round(((180 + 180 + 120 + 10 + 200 + 60) / 60) * 10) / 10);
    expect(s.plays).toBe(5);
    expect(s.distinctTracks).toBe(4);
    expect(s.skipRate).toBeCloseTo(1 / 6, 3);
  });

  it('top bài / nghệ sĩ (tách feat.) / thể loại / album xếp theo phút', () => {
    const s = computeStats(input(events));
    expect(s.topTracks[0]).toMatchObject({ trackId: 'folder:1', name: 'Một', plays: 2 });
    expect(s.topTracks.find((t) => t.trackId === 'folder:99')?.name).toBe('Bài đã xóa');
    const artists = Object.fromEntries(s.topArtists.map((a) => [a.name, a.minutes]));
    expect(artists['Mỹ Tâm']).toBe(6); // 2 lượt × 3 phút
    expect(artists['Hà Anh Tuấn']).toBe(8); // bài 1 (feat., 6') + bài 2 (2')
    expect(s.topGenres.map((g) => g.name)).toContain('Ballad');
    expect(s.topGenres[0].name).toBe('Pop');
    expect(s.topAlbums.map((a) => a.name)).toEqual(['Tâm 9', 'Sao']);
  });

  it('lọc theo máy', () => {
    const poco = computeStats(input(events, { device: 'poco' }));
    const iphone = computeStats(input(events, { device: 'iphone' }));
    expect(iphone.plays).toBe(1);
    expect(iphone.topTracks[0].trackId).toBe('folder:3');
    expect(poco.plays + iphone.plays).toBe(computeStats(input(events)).plays);
  });

  it('heatmap giờ × thứ (giờ VN) và giờ cao điểm', () => {
    const s = computeStats(input(events));
    // 05/10/2026 = Thứ Hai 08:00 → heatmap[0][8] = 3 phút
    expect(s.heatmap[0][8]).toBe(3);
    // 06/10 = Thứ Ba 08:30 và 21:00
    expect(s.heatmap[1][8]).toBe(3);
    expect(s.heatmap[1][21]).toBe(2);
    // 07/10 = Thứ Tư 21:00 (skip 10s) + 21:05 (200s)
    expect(s.heatmap[2][21]).toBeCloseTo((10 + 200) / 60, 1);
    expect(s.busiest).toEqual({ weekday: 2, hour: 21 }); // Thứ Tư 21h: 3,5 phút là ô nhiều nhất
    expect(s.heatmap.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(s.minutes, 0);
  });

  it('so sánh với kỳ trước', () => {
    const s = computeStats(input(events));
    expect(s.previous).toEqual({ minutes: 10, plays: 1, distinctTracks: 1 });
    expect(s.delta.plays).toBe(400); // 1 → 5 lượt
    const empty = computeStats(input(events.slice(0, 1), { previous: { start: 0, end: 1 } }));
    expect(empty.delta.minutes).toBeNull();
  });

  it('nghệ sĩ mới phát hiện: lần đầu nghe nằm trong kỳ', () => {
    const s = computeStats(input(events));
    // Mỹ Tâm & Hà Anh Tuấn đã nghe từ tháng 9 → không mới; Sơn Tùng mới trong tháng 10.
    expect(s.newArtists.map((a) => a.name)).toEqual(['Sơn Tùng']);
  });

  it('phân bố mood từ đặc trưng âm thanh', () => {
    const f = (energy: number, bpm: number): AudioFeatures => ({ v: 1, bpm, bpmConf: 1, energy, loudnessDb: -14, brightness: 0.5, onsetRate: 0.5, dynamics: 0.3, mfcc: [], analyzedSec: 45 });
    const features = new Map([
      ['folder:1', f(0.2, 80)],
      ['folder:3', f(0.9, 130)],
    ]);
    const s = computeStats(input(events, { features }));
    expect(s.moods.map((m) => m.mood)).toEqual(['chill', 'soi-dong']);
    expect(s.moods[0].minutes).toBe(6);
  });

  it('không có dữ liệu thì mọi thứ rỗng, không chia cho 0', () => {
    const s = computeStats(input([]));
    expect(s).toMatchObject({ minutes: 0, plays: 0, skipRate: 0, longestStreak: 0, currentStreak: 0, busiest: null });
    expect(s.topTracks).toEqual([]);
  });
});

describe('hiệu năng', () => {
  it('20 000 lượt nghe tính trong < 200 ms', () => {
    const many: PlayEvent[] = [];
    const lib = Array.from({ length: 800 }, (_, i) => fakeTrack(i + 1, { artist: `NS ${i % 120}`, genre: [`G${i % 15}`], album: `AL ${i % 90}` }));
    for (let i = 0; i < 20_000; i++) many.push(ev(`folder:${(i * 7) % 800 + 1}`, NOW - (i % 300) * 2 * 3_600_000 - (i % 17) * MIN, 120 + (i % 90), i % 9 === 0 ? 'skip' : 'complete', i % 3 ? 'poco' : 'iphone'));
    const period = periodFor('year', NOW);
    // Lấy lần chạy nhanh nhất trong 3 lần để CI chậm/GC bất chợt không làm test chập chờn.
    let best = Infinity;
    let plays = 0;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      plays = computeStats({ events: many, tracks: lib, period, previous: previousPeriod('year', period), now: NOW }).plays;
      best = Math.min(best, performance.now() - t0);
    }
    expect(plays).toBeGreaterThan(10_000);
    expect(best).toBeLessThan(200);
  });
});
