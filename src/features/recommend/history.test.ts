import { classifyPlay, createListenTracker, useHistory, MAX_EVENTS } from './history';

describe('classifyPlay', () => {
  it('quá ngắn → bỏ qua', () => {
    expect(classifyPlay(3, 200)).toBeNull();
  });
  it('bỏ qua sớm = skip, nghe gần hết = complete, giữa chừng = partial', () => {
    expect(classifyPlay(12, 200)).toBe('skip');
    expect(classifyPlay(100, 200)).toBe('partial');
    expect(classifyPlay(165, 200)).toBe('complete');
    expect(classifyPlay(195, 200)).toBe('complete');
  });
  it('bài ngắn: ngưỡng skip theo 30% độ dài', () => {
    expect(classifyPlay(15, 40)).toBe('partial');
    expect(classifyPlay(10, 40)).toBe('skip');
    expect(classifyPlay(33, 40)).toBe('complete');
  });
  it('không biết thời lượng', () => {
    expect(classifyPlay(10, 0)).toBe('skip');
    expect(classifyPlay(130, 0)).toBe('complete');
  });
});

describe('createListenTracker', () => {
  it('cộng thời gian nghe thật, bỏ đoạn tua', () => {
    const rec = vi.fn();
    const tr = createListenTracker(rec);
    tr.begin('folder:1', 100);
    for (let s = 0.25; s <= 20; s += 0.25) tr.tick(s); // nghe 20s
    tr.tick(90); // tua tới 90s: không tính
    for (let s = 90.25; s <= 95; s += 0.25) tr.tick(s); // nghe thêm ~5s
    tr.end();
    expect(rec).toHaveBeenCalledTimes(1);
    const [id, played, dur] = rec.mock.calls[0];
    expect(id).toBe('folder:1');
    expect(played).toBeGreaterThan(24);
    expect(played).toBeLessThan(26);
    expect(dur).toBe(100);
  });

  it('end() lần hai không ghi lại; setDuration cập nhật thời lượng', () => {
    const rec = vi.fn();
    const tr = createListenTracker(rec);
    tr.begin('x', 0);
    tr.setDuration(50);
    tr.end();
    tr.end();
    expect(rec).toHaveBeenCalledTimes(1);
    expect(rec.mock.calls[0][2]).toBe(50);
  });
});

describe('useHistory', () => {
  beforeEach(() => useHistory.getState().clear());

  it('chỉ ghi lượt nghe đủ dài và giữ tối đa MAX_EVENTS', () => {
    const { record } = useHistory.getState();
    record('a', 2, 200);
    expect(useHistory.getState().events).toHaveLength(0);
    for (let i = 0; i < MAX_EVENTS + 5; i++) record(`t${i}`, 190, 200, i);
    const ev = useHistory.getState().events;
    expect(ev).toHaveLength(MAX_EVENTS);
    expect(ev[0].id).toBe('t5');
    expect(ev.at(-1)?.kind).toBe('complete');
  });
});
