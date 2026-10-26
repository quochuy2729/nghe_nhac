import { getAllEvents, resetDBForTests } from '@/lib/db';
import {
  MAX_EVENTS,
  capEvents,
  classifyPlay,
  createListenTracker,
  loadHistory,
  migrateLegacyHistory,
  useHistory,
} from './history';

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

describe('capEvents', () => {
  it('giữ phần mới nhất và trả phần bị bỏ', () => {
    const evs = [1, 2, 3, 4, 5].map((t) => ({ t }));
    expect(capEvents(evs, 3)).toEqual({ kept: [{ t: 3 }, { t: 4 }, { t: 5 }], dropped: [{ t: 1 }, { t: 2 }] });
    expect(capEvents(evs, 10).dropped).toEqual([]);
    expect(MAX_EVENTS).toBe(20_000);
  });
});

describe('useHistory', () => {
  beforeEach(async () => {
    await resetDBForTests();
    useHistory.setState({ events: [] });
  });

  it('chỉ ghi lượt nghe đủ dài; mỗi lượt có uuid, thiết bị và được lưu vào IndexedDB', async () => {
    const { record } = useHistory.getState();
    record('a', 2, 200);
    expect(useHistory.getState().events).toHaveLength(0);
    record('folder:1', 190, 200, 1234);
    const [ev] = useHistory.getState().events;
    expect(ev).toMatchObject({ trackId: 'folder:1', t: 1234, sec: 190, dur: 200, kind: 'complete', device: 'iphone', synced: 0 });
    expect(ev.id).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(async () => expect((await getAllEvents()).map((e) => e.id)).toEqual([ev.id]));
  });

  it('clear xóa cả trong IndexedDB', async () => {
    useHistory.getState().record('folder:1', 190, 200);
    await vi.waitFor(async () => expect(await getAllEvents()).toHaveLength(1));
    useHistory.getState().clear();
    await vi.waitFor(async () => expect(await getAllEvents()).toHaveLength(0));
  });
});

describe('migrate lịch sử từ localStorage', () => {
  const legacy = (events: unknown[]) => JSON.stringify({ state: { events }, version: 1 });
  const old = [
    { id: 'folder:a', t: 1000, sec: 200, kind: 'complete' },
    { id: 'folder:b', t: 2000, sec: 12, kind: 'skip' },
    { id: 'folder:a', t: 3000, sec: 90, kind: 'partial' },
  ];

  beforeEach(async () => {
    await resetDBForTests();
    useHistory.setState({ events: [] });
    localStorage.clear();
  });

  it('chuyển đủ sự kiện sang IndexedDB (uuid, device), rồi xóa key cũ', async () => {
    localStorage.setItem('nn-history', legacy(old));
    expect(await migrateLegacyHistory()).toBe(3);
    expect(localStorage.getItem('nn-history')).toBeNull();
    const rows = await getAllEvents();
    expect(rows.map((r) => [r.trackId, r.t, r.sec, r.kind])).toEqual([
      ['folder:a', 1000, 200, 'complete'],
      ['folder:b', 2000, 12, 'skip'],
      ['folder:a', 3000, 90, 'partial'],
    ]);
    expect(rows.every((r) => /^[0-9a-f-]{36}$/.test(r.id) && r.device === 'iphone' && r.synced === 0)).toBe(true);
  });

  it('chạy lần hai không nhân đôi, kể cả khi key cũ còn nguyên (bị ngắt giữa chừng)', async () => {
    localStorage.setItem('nn-history', legacy(old));
    await migrateLegacyHistory();
    expect(await migrateLegacyHistory()).toBe(0);
    expect(await getAllEvents()).toHaveLength(3);

    localStorage.setItem('nn-history', legacy(old)); // giả lập: lần trước chưa kịp xóa key
    await migrateLegacyHistory();
    expect(await getAllEvents()).toHaveLength(3);
  });

  it('bỏ qua bản ghi hỏng nhưng giữ bản ghi tốt; JSON hỏng không làm app lỗi', async () => {
    localStorage.setItem('nn-history', legacy([...old, { id: 1 }, null, { id: 'x', t: 1, sec: 1, kind: 'lạ' }].filter(Boolean)));
    expect(await migrateLegacyHistory()).toBe(3);
    localStorage.setItem('nn-history', '{không phải json');
    expect(await migrateLegacyHistory()).toBe(0);
    expect(localStorage.getItem('nn-history')).toBeNull();
  });

  it('loadHistory nạp vào bộ nhớ, gồm cả lượt vừa ghi trong lúc đang nạp', async () => {
    localStorage.setItem('nn-history', legacy(old));
    useHistory.getState().record('folder:new', 190, 200, 5000);
    await loadHistory();
    const ev = useHistory.getState().events;
    expect(ev.map((e) => e.t)).toEqual([1000, 2000, 3000, 5000]);
    expect(localStorage.getItem('nn-history')).toBeNull();
  });
});
