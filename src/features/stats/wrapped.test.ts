import { fakeTrack } from '@/test/fixtures';
import { periodFor, previousPeriod, computeStats, VN_OFFSET_MS } from './compute';
import { buildWrappedCards, formatMinutes, top50Name, tracksForTop, wrapLines } from './wrapped';
import type { PlayEvent } from '@/lib/db';

const NOW = Date.UTC(2026, 11, 20, 5, 0) - VN_OFFSET_MS;
const tracks = [1, 2, 3].map((n) => fakeTrack(n, { title: `Bài ${n}`, artist: `NS ${n}`, genre: ['Pop'] }));
let i = 0;
const ev = (id: string, daysAgo: number, sec = 200): PlayEvent => ({ id: `e${++i}`, trackId: id, t: NOW - daysAgo * 86_400_000, sec, dur: 210, kind: 'complete', device: 'poco' });

function stats(events: PlayEvent[]) {
  const period = periodFor('year', NOW);
  return computeStats({ events, tracks, period, previous: previousPeriod('year', period), now: NOW, top: 50 });
}

describe('Wrapped', () => {
  const events = [ev('folder:1', 1), ev('folder:1', 2), ev('folder:2', 3), ev('folder:3', 40, 60), ev('folder:77', 5)];
  const s = stats(events);

  it('dựng 5–6 thẻ: tổng, top bài, nghệ sĩ, thể loại, thói quen, nghệ sĩ mới', () => {
    const cards = buildWrappedCards(s, 'Năm 2026');
    expect(cards.map((c) => c.id)).toEqual(['total', 'top-track', 'top-artist', 'genres', 'habits', 'discover']);
    expect(cards[0].kicker).toBe('Năm 2026');
    expect(cards[1].headline).toBe('Bài 1');
    expect(cards[2].headline).toBe('NS 1');
    expect(cards.every((c) => c.colors.length === 2 && c.headline)).toBe(true);
  });

  it('không có dữ liệu thì chỉ còn thẻ tổng (không thẻ rỗng)', () => {
    expect(buildWrappedCards(stats([]), 'Năm 2026').map((c) => c.id)).toEqual(['total']);
  });

  it('playlist "Top 50 năm YYYY" chỉ gồm bài còn trong thư viện, đúng thứ tự', () => {
    const list = tracksForTop(s, tracks, 50);
    expect(list.map((t) => t.id)).toEqual(['folder:1', 'folder:2', 'folder:3']);
    expect(tracksForTop(s, tracks, 2)).toHaveLength(2);
    expect(top50Name(2026)).toBe('Top 50 năm 2026');
  });

  it('định dạng phút và ngắt dòng', () => {
    expect(formatMinutes(45)).toBe('45 phút');
    expect(formatMinutes(60)).toBe('1 giờ');
    expect(formatMinutes(135)).toBe('2 giờ 15 phút');
    expect(wrapLines('một hai ba bốn năm', 9, (t) => t.length)).toEqual(['một hai', 'ba bốn', 'năm']);
    expect(wrapLines('', 10, (t) => t.length)).toEqual([]);
  });
});
