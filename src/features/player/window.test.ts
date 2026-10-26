import { fakeTracks } from '@/test/fixtures';
import * as Q from './queue';
import { itemsAfter, needsTopUp, TOP_UP_AT, upcomingItems, WINDOW_AHEAD, windowFromQueue } from './window';

const tracks = fakeTracks(40); // id folder:1 … folder:40
const mk = (start: number, repeat: Q.RepeatMode = 'off') => Q.createQueue(tracks, start, { repeat });

describe('windowFromQueue', () => {
  it('bài hiện tại + tối đa 20 bài kế, không vòng lại', () => {
    const w = windowFromQueue(mk(0));
    expect(w).toHaveLength(1 + WINDOW_AHEAD);
    expect(w[0].track.id).toBe('folder:1');
    expect(windowFromQueue(mk(35))).toHaveLength(5);
  });

  it('hàng đợi rỗng → cửa sổ rỗng; lặp một bài → chỉ bài đó', () => {
    expect(windowFromQueue(Q.emptyQueue)).toEqual([]);
    expect(windowFromQueue(mk(3, 'one')).map((i) => i.track.id)).toEqual(['folder:4']);
  });

  it('upcomingItems bỏ bài đang phát', () => {
    expect(upcomingItems(mk(10)).map((i) => i.track.id)[0]).toBe('folder:12');
  });
});

describe('needsTopUp', () => {
  it('nạp thêm khi còn ≤ 5 bài phía sau', () => {
    expect(needsTopUp(21, 0, 'off')).toBe(false);
    expect(needsTopUp(21, 20 - TOP_UP_AT, 'off')).toBe(true);
    expect(needsTopUp(21, 20, 'all')).toBe(true);
  });
  it('không nạp khi lặp một bài hoặc chưa có bài', () => {
    expect(needsTopUp(1, 0, 'one')).toBe(false);
    expect(needsTopUp(0, -1, 'off')).toBe(false);
  });
});

describe('itemsAfter', () => {
  it('lấy các bài ngay sau uid cho trước', () => {
    const q = mk(0);
    const w = windowFromQueue(q);
    const after = itemsAfter(q, w.at(-1)!.uid, 5);
    expect(after.map((i) => i.track.id)).toEqual(['folder:22', 'folder:23', 'folder:24', 'folder:25', 'folder:26']);
  });
  it('uid lạ hoặc hết hàng đợi → rỗng', () => {
    const q = mk(0);
    expect(itemsAfter(q, 'nope', 5)).toEqual([]);
    expect(itemsAfter(q, q.items.at(-1)!.uid, 5)).toEqual([]);
  });
});
