import { visibleRange } from './virtual';

describe('visibleRange', () => {
  it('5000 dòng: chỉ dựng vài chục dòng quanh vùng nhìn thấy', () => {
    const r = visibleRange(5000, 60, 30_000, 800, 100, 6);
    expect(r.end - r.start).toBeLessThan(40);
    expect(r.start).toBeLessThanOrEqual(Math.floor((30_000 - 100) / 60));
    expect(r.end).toBeGreaterThanOrEqual(Math.ceil((30_000 + 800 - 100) / 60));
    expect(r.padTop + (r.end - r.start) * 60 + r.padBottom).toBe(5000 * 60); // tổng chiều cao giữ nguyên
  });

  it('đầu danh sách và cuối danh sách không tràn', () => {
    expect(visibleRange(100, 50, 0, 600, 0)).toMatchObject({ start: 0, padTop: 0 });
    const end = visibleRange(100, 50, 100 * 50, 600, 0);
    expect(end.end).toBe(100);
    expect(end.padBottom).toBe(0);
    expect(end.start).toBeLessThanOrEqual(100);
  });

  it('danh sách còn nằm dưới màn hình (listOffsetTop lớn) thì chưa dựng gì nhiều', () => {
    const r = visibleRange(1000, 60, 0, 700, 5000, 2);
    expect(r.end - r.start).toBeLessThanOrEqual(2);
  });

  it('rỗng', () => {
    expect(visibleRange(0, 60, 0, 600)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });
});
