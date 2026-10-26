import type { AudioFeatures } from '@/lib/db';
import { fakeTracks } from '@/test/fixtures';
import { canRunNow, createAnalysisQueue, segmentFor, type AnalysisDeps, type Progress } from './queue';

const feat = { v: 1, bpm: 100 } as unknown as AudioFeatures;

function setup(n: number, over: Partial<AnalysisDeps> = {}) {
  const tracks = fakeTracks(n);
  const have = new Set<string>();
  const progress: Progress[] = [];
  const deps: AnalysisDeps = {
    tracks: () => tracks,
    has: (id) => have.has(id),
    decode: vi.fn(async () => new Float32Array(44_100)),
    analyze: vi.fn(async () => feat),
    save: vi.fn(async (id: string) => void have.add(id)),
    refreshRemote: vi.fn(async () => undefined),
    canRun: () => true,
    onProgress: (p) => progress.push(p),
    yieldNow: async () => undefined,
    ...over,
  };
  return { tracks, have, progress, deps, queue: createAnalysisQueue(deps) };
}

describe('segmentFor', () => {
  it('45 giây quanh điểm 35% thời lượng', () => {
    expect(segmentFor(200)).toEqual({ start: 47.5, dur: 45 });
  });
  it('bài ngắn lấy từ đầu; bài rất dài không vượt quá cuối', () => {
    expect(segmentFor(30).start).toBe(0);
    expect(segmentFor(0).start).toBe(0);
    const s = segmentFor(50);
    expect(s.start + s.dur).toBeLessThanOrEqual(50);
  });
});

describe('canRunNow', () => {
  const base = { platform: 'android' as const, appVisible: true, isPlaying: false, charging: false, batteryLevel: 0.8 };
  it('không chạy khi app không hiển thị', () => {
    expect(canRunNow({ ...base, appVisible: false })).toBe(false);
  });
  it('Poco: pin > 40% hoặc đang sạc', () => {
    expect(canRunNow(base)).toBe(true);
    expect(canRunNow({ ...base, batteryLevel: 0.3 })).toBe(false);
    expect(canRunNow({ ...base, batteryLevel: 0.1, charging: true })).toBe(true);
    expect(canRunNow({ ...base, batteryLevel: null, charging: null })).toBe(true);
  });
  it('Poco: vẫn phân tích được khi đang phát nhạc', () => {
    expect(canRunNow({ ...base, isPlaying: true })).toBe(true);
  });
  it('iPhone: không chạy khi đang phát nhạc', () => {
    const ios = { ...base, platform: 'web' as const, charging: null, batteryLevel: null };
    expect(canRunNow(ios)).toBe(true);
    expect(canRunNow({ ...ios, isPlaying: true })).toBe(false);
  });
});

describe('createAnalysisQueue', () => {
  it('phân tích lần lượt từng bài chưa có, lưu, báo tiến độ x/y', async () => {
    const { queue, have, deps, progress } = setup(3);
    have.add('folder:1'); // đã có sẵn (vd từ server)
    const p = await queue.run();
    expect(p).toMatchObject({ state: 'done', total: 3, done: 3, failed: 0 });
    expect(deps.save).toHaveBeenCalledTimes(2);
    expect(deps.decode).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'folder:2' }), 19.5, 45);
    expect(progress.some((x) => x.state === 'running' && x.done === 1)).toBe(true);
  });

  it('kéo đặc trưng từ server trước khi tự tính', async () => {
    const order: string[] = [];
    const { queue } = setup(1, {
      refreshRemote: async () => void order.push('remote'),
      decode: async () => (order.push('decode'), new Float32Array(44_100)),
    });
    await queue.run();
    expect(order).toEqual(['remote', 'decode']);
  });

  it('điều kiện không thỏa → dừng ở trạng thái chờ, "Phân tích ngay" thì bỏ qua điều kiện', async () => {
    const { queue, deps } = setup(2, { canRun: () => false });
    expect((await queue.run()).state).toBe('waiting');
    expect(deps.save).not.toHaveBeenCalled();
    expect((await queue.run(true)).state).toBe('done');
    expect(deps.save).toHaveBeenCalledTimes(2);
  });

  it('bài lỗi (giải mã/đoạn quá ngắn) được bỏ qua, không kẹt hàng đợi', async () => {
    let n = 0;
    const { queue } = setup(3, {
      decode: async () => {
        if (++n === 1) throw new Error('hỏng');
        return n === 2 ? new Float32Array(10) : new Float32Array(44_100);
      },
    });
    const p = await queue.run();
    expect(p).toMatchObject({ state: 'done', done: 1, failed: 2 });
  });

  it('tạm dừng giữa chừng, chạy tiếp được', async () => {
    let calls = 0;
    const s = setup(3, {
      analyze: async () => {
        if (++calls === 1) s.queue.pause();
        return feat;
      },
    });
    const q = s.queue;
    expect((await q.run()).state).toBe('paused');
    expect(s.have.size).toBe(1);
    expect((await q.run()).state).toBe('done');
    expect(s.have.size).toBe(3);
  });

  it('gọi chồng không chạy hai vòng song song', async () => {
    const { queue, deps } = setup(2);
    const [a, b] = await Promise.all([queue.run(), queue.run()]);
    expect(deps.save).toHaveBeenCalledTimes(2);
    expect([a.state, b.state]).toContain('done');
  });
});
