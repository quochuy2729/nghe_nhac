import { getAllEvents, getFeatures, getOverride, putFeatures, putOverride, resetDBForTests } from '@/lib/db';
import { getAllSmartPlaylists, getUserSettings, saveSmartPlaylist, saveUserSettings } from './localData';
import { clearTable, enqueue, pending, pendingCount, pendingForTable } from './outbox';
import { eventToRow, featuresToRow, iso, type Row } from './rows';
import { CLOCK_SKEW_MS } from './syncMerge';
import { createScheduler, pullAll, pushOutbox, runSync, useSync, type SyncClient, type SyncDeps } from './syncService';

/** Server giả: lưu hàng theo bảng; có thể bắt nó "mất mạng" sau N lần gọi. */
class FakeServer implements SyncClient {
  tables = new Map<string, Row[]>();
  calls: string[] = [];
  failAfter = Infinity;
  private n = 0;

  private gate() {
    if (++this.n > this.failAfter) throw new Error('Failed to fetch');
  }
  rows(t: string): Row[] {
    return this.tables.get(t) ?? [];
  }
  async insertIgnore(table: string, rows: Row[]) {
    this.gate();
    this.calls.push(`insert:${table}:${rows.length}`);
    const cur = this.rows(table);
    for (const r of rows) if (!cur.some((x) => x.id === r.id)) cur.push({ ...r, created_at: iso(1_000 + cur.length) });
    this.tables.set(table, cur);
  }
  async upsert(table: string, rows: Row[]) {
    this.gate();
    this.calls.push(`upsert:${table}:${rows.length}`);
    const key = (r: Row) => String(r.track_id ?? r.id ?? 'me');
    const cur = this.rows(table).filter((x) => !rows.some((r) => key(r) === key(x)));
    this.tables.set(table, [...cur, ...rows]);
  }
  async selectSince(table: string, column: 'created_at' | 'updated_at', since: string | null, limit: number) {
    this.gate();
    return this.rows(table)
      .filter((r) => !since || String(r[column]) >= since)
      .sort((a, b) => String(a[column]).localeCompare(String(b[column])))
      .slice(0, limit);
  }
  async deleteAll(table: string) {
    this.gate();
    this.tables.set(table, []);
  }
}

let server: FakeServer;
let deps: SyncDeps;
const ev = (id: string, t: number) => ({ id, trackId: 'folder:1', t, sec: 100, dur: 120, kind: 'complete' as const, device: 'poco' as const });

beforeEach(async () => {
  await resetDBForTests();
  server = new FakeServer();
  deps = { client: server };
  useSync.setState({ status: 'idle', lastSyncAt: null, pending: 0, error: null });
});

describe('pushOutbox', () => {
  it('đẩy theo lô 500, xóa khỏi outbox sau khi server nhận', async () => {
    for (let i = 0; i < 1200; i++) await enqueue('play_events', 'insert', eventToRow(ev(`e${i}`, i)));
    const n = await pushOutbox(deps);
    expect(n).toBe(1200);
    expect(server.calls).toEqual(['insert:play_events:500', 'insert:play_events:500', 'insert:play_events:200']);
    expect(await pendingCount()).toBe(0);
  });

  it('mất mạng giữa chừng: lô đã gửi bị xóa, phần còn lại vẫn nằm trong outbox, gửi lại không mất/không trùng', async () => {
    for (let i = 0; i < 1200; i++) await enqueue('play_events', 'insert', eventToRow(ev(`e${i}`, i)));
    server.failAfter = 1; // lô đầu qua, lô hai mất mạng

    await expect(pushOutbox(deps)).rejects.toThrow('Failed to fetch');
    expect(server.rows('play_events')).toHaveLength(500);
    expect(await pendingCount()).toBe(700);

    server.failAfter = Infinity;
    await pushOutbox(deps);
    expect(server.rows('play_events')).toHaveLength(1200);
    expect(await pendingCount()).toBe(0);
  });

  it('đẩy lại cùng lô (server nhận rồi nhưng client chưa kịp xóa) không sinh bản trùng', async () => {
    await enqueue('play_events', 'insert', eventToRow(ev('same', 1)));
    await pushOutbox(deps);
    await enqueue('play_events', 'insert', eventToRow(ev('same', 1)));
    await pushOutbox(deps);
    expect(server.rows('play_events')).toHaveLength(1);
  });

  it('giữ thứ tự giữa các bảng và gộp nhiều lần sửa cùng một bản ghi trong một lô', async () => {
    await enqueue('track_overrides', 'upsert', { track_id: 'folder:1', patch: { title: 'A' }, updated_at: iso(1) });
    await enqueue('track_overrides', 'upsert', { track_id: 'folder:1', patch: { title: 'B' }, updated_at: iso(2) });
    await enqueue('play_events', 'insert', eventToRow(ev('x', 1)));
    await pushOutbox(deps);
    expect(server.calls).toEqual(['upsert:track_overrides:1', 'insert:play_events:1']);
    expect((server.rows('track_overrides')[0].patch as { title: string }).title).toBe('B');
  });

  it('phát lại thao tác thư viện theo thứ tự; lỗi giữa chừng thì giữ phần còn lại', async () => {
    await enqueue('library', 'upsert', { fn: 'like', args: [1] });
    await enqueue('library', 'upsert', { fn: 'unlike', args: [1] });
    await enqueue('library', 'upsert', { fn: 'like', args: [2] });
    const seen: string[] = [];
    const replayLibrary = async (r: Row) => {
      if (seen.length === 2) throw new Error('Failed to fetch');
      seen.push(`${r.fn}${(r.args as number[])[0]}`);
    };
    await expect(pushOutbox({ ...deps, replayLibrary })).rejects.toThrow();
    expect(seen).toEqual(['like1', 'unlike1']);
    expect(await pendingForTable('library')).toBe(1);
  });
});

describe('guest → đăng nhập lần đầu', () => {
  it('thay đổi ghi lúc chưa đăng nhập (không user_id) được đẩy lên hết khi có client', async () => {
    await enqueue('play_events', 'insert', eventToRow(ev('g1', 1)));
    await enqueue('play_events', 'insert', eventToRow(ev('g2', 2)));
    const saved = await saveUserSettings({ eq: 'bass' }, 5000);
    expect(saved.data).toEqual({ eq: 'bass' });
    await saveSmartPlaylist({ id: 'p1', name: 'Mix', rules: [], match: 'all', sort: 'random', updatedAt: 10 });
    expect(await pendingCount()).toBe(4);

    await runSync(deps);

    expect(await pendingCount()).toBe(0);
    expect(server.rows('play_events').map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(server.rows('play_events')[0]).not.toHaveProperty('user_id');
    expect(server.rows('user_settings')).toHaveLength(1);
    expect(server.rows('smart_playlists')[0].name).toBe('Mix');
    expect(useSync.getState().status).toBe('idle');
    expect(useSync.getState().lastSyncAt).not.toBeNull();
  });
});

describe('pullAll', () => {
  it('nhận lượt nghe từ máy khác, đánh dấu đã đồng bộ và không nhân đôi khi pull lại', async () => {
    server.tables.set('play_events', [{ ...eventToRow(ev('r1', 500)), created_at: iso(1000) }]);
    const onEventsPulled = vi.fn();
    await pullAll({ ...deps, onEventsPulled });
    await pullAll({ ...deps, onEventsPulled });
    const all = await getAllEvents();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'r1', synced: 1, trackId: 'folder:1' });
    expect(onEventsPulled).toHaveBeenCalled();
  });

  it('features/overrides: LWW theo updated_at — bản local mới hơn không bị bản cũ trên server đè', async () => {
    await putFeatures({ trackId: 'folder:1', features: { v: 1 } as never, updatedAt: 9000 });
    await putOverride({ trackId: 'folder:1', patch: { title: 'local' }, updatedAt: 9000 });
    server.tables.set('track_features', [{ ...featuresToRow({ trackId: 'folder:1', features: { v: 1, bpm: 1 } as never, updatedAt: 1000 }) }]);
    server.tables.set('track_overrides', [{ track_id: 'folder:1', patch: { title: 'server-cũ' }, updated_at: iso(1000) }]);

    await pullAll(deps);
    expect((await getOverride('folder:1'))?.patch.title).toBe('local');
    expect((await getFeatures('folder:1'))?.updatedAt).toBe(9000);

    server.tables.set('track_overrides', [{ track_id: 'folder:1', patch: { title: 'server-mới' }, updated_at: iso(20_000) }]);
    await pullAll(deps);
    expect((await getOverride('folder:1'))?.patch.title).toBe('server-mới');
  });

  it('pull lùi 5 phút: nhận được bản ghi từ máy có đồng hồ chậm', async () => {
    const base = 10 * 60_000;
    server.tables.set('track_overrides', [{ track_id: 'folder:a', patch: { title: 'A' }, updated_at: iso(base) }]);
    await pullAll(deps); // con trỏ = base
    // Máy kia đồng hồ chậm 4 phút ghi sau, nhưng updated_at nhỏ hơn con trỏ.
    server.tables.get('track_overrides')!.push({ track_id: 'folder:b', patch: { title: 'B' }, updated_at: iso(base - 4 * 60_000) });
    await pullAll(deps);
    expect((await getOverride('folder:b'))?.patch.title).toBe('B');
    expect(CLOCK_SKEW_MS).toBe(300_000);
  });

  it('playlist thông minh: gộp LWW, bản xóa mềm mới hơn thắng; cài đặt lấy bản mới hơn', async () => {
    await saveSmartPlaylist({ id: 'p1', name: 'Cũ', rules: [], match: 'all', sort: 'random', updatedAt: 100 });
    await saveSmartPlaylist({ id: 'p2', name: 'Chỉ local', rules: [], match: 'any', sort: 'title', updatedAt: 100 });
    server.tables.set('smart_playlists', [
      { id: 'p1', name: 'Cũ', data: { rules: [], match: 'all', sort: 'random' }, updated_at: iso(200), deleted: true },
      { id: 'p3', name: 'Từ server', data: { rules: [], match: 'all', sort: 'added', limit: 20 }, updated_at: iso(50), deleted: false },
    ]);
    await saveUserSettings({ eq: 'flat' }, 100);
    server.tables.set('user_settings', [{ data: { eq: 'bass' }, updated_at: iso(300) }]);

    await pullAll(deps);

    const all = await getAllSmartPlaylists();
    expect(all.find((p) => p.id === 'p1')?.deleted).toBe(true);
    expect(all.find((p) => p.id === 'p2')?.name).toBe('Chỉ local');
    expect(all.find((p) => p.id === 'p3')).toMatchObject({ sort: 'added', limit: 20 });
    expect((await getUserSettings())?.data).toEqual({ eq: 'bass' });
  });
});

describe('xóa lịch sử', () => {
  it('clearTable bỏ các dòng chờ của riêng bảng đó', async () => {
    await enqueue('play_events', 'insert', { id: 'a' });
    await enqueue('track_overrides', 'upsert', { track_id: 'x' });
    await clearTable('play_events');
    expect((await pending()).map((r) => r.table)).toEqual(['track_overrides']);
  });
});

describe('scheduler', () => {
  function env(getDeps: () => SyncDeps | null) {
    const timers: { fn: () => void; ms: number }[] = [];
    return {
      timers,
      scheduler: createScheduler({
        getDeps,
        setTimer: (fn, ms) => timers.push({ fn, ms }) - 1,
        clearTimer: () => undefined,
        rng: () => 0,
      }),
    };
  }

  it('chưa đăng nhập: không gọi server, chỉ cập nhật số thay đổi chờ', async () => {
    await enqueue('play_events', 'insert', eventToRow(ev('q', 1)));
    const { scheduler, timers } = env(() => null);
    await scheduler.trigger();
    expect(useSync.getState().pending).toBe(1);
    expect(timers).toHaveLength(0);
  });

  it('thành công → hẹn 10 phút; lỗi mạng → backoff 5 s rồi 10 s, dữ liệu vẫn còn', async () => {
    await enqueue('play_events', 'insert', eventToRow(ev('q', 1)));
    server.failAfter = 0;
    const { scheduler, timers } = env(() => deps);
    await scheduler.trigger();
    await scheduler.trigger();
    expect(timers.map((t) => t.ms)).toEqual([5_000, 10_000]);
    expect(useSync.getState().status).toBe('error');
    expect(await pendingCount()).toBe(1);

    server.failAfter = Infinity;
    await scheduler.trigger();
    expect(timers.at(-1)!.ms).toBe(600_000);
    expect(await pendingCount()).toBe(0);
    expect(useSync.getState().status).toBe('idle');
  });
});
