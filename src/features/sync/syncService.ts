/**
 * Đồng bộ Supabase (docs/ARCHITECTURE.md §4): push outbox theo lô 500, pull theo con trỏ, gộp last-write-wins.
 * Không dùng Realtime. Lỗi mạng thì giữ nguyên outbox và thử lại với backoff.
 */
import { create } from 'zustand';
import { getFeatures, getMeta, getOverride, putEvents, putFeatures, putOverride, setMeta } from '@/lib/db';
import { pending, pendingCount, removeSent } from './outbox';
import { getAllSmartPlaylists, getUserSettings, replaceSmartPlaylists, replaceUserSettings, rowToSmart } from './localData';
import { iso, ms, rowToEvent, rowToFeatures, rowToOverride, type Row } from './rows';
import { backoffMs, mergeVersioned, pullSince } from './syncMerge';

export const BATCH = 500;
const PAGE = 1000;

/** Phần Supabase mà sync cần — tách ra để test bằng client giả. */
export interface SyncClient {
  insertIgnore(table: string, rows: Row[]): Promise<void>;
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  /** hàng có `column` ≥ `since` (ISO), cũ → mới, tối đa `limit` */
  selectSince(table: string, column: 'created_at' | 'updated_at', since: string | null, limit: number): Promise<Row[]>;
  deleteAll(table: string): Promise<void>;
}

export const CONFLICT_KEY: Record<string, string> = {
  track_features: 'user_id,track_id',
  track_overrides: 'user_id,track_id',
  smart_playlists: 'id',
  user_settings: 'user_id',
};

export interface SyncDeps {
  client: SyncClient;
  /** Phát lại một thao tác like/playlist đã xếp hàng lúc mất mạng (bảng `library`). */
  replayLibrary?: (row: Row) => Promise<void>;
  /** Máy khác vừa đổi cài đặt đồng bộ (`user_settings.data`): áp vào app. */
  onSettingsPulled?: (data: Record<string, unknown>) => void;
  /** Gọi sau khi pull lượt nghe mới để làm mới bộ nhớ (useHistory). */
  onEventsPulled?: () => Promise<void> | void;
  now?: () => number;
}

/** Khóa gộp trong một lô upsert (Postgres không cho một lệnh chạm cùng hàng hai lần). */
function rowKey(table: string, row: Row): string {
  if (table === 'smart_playlists') return String(row.id);
  if (table === 'user_settings') return 'me';
  return String(row.track_id);
}

/** Đẩy outbox. Mỗi lô thành công mới xóa khỏi outbox; lỗi thì ném ra và phần còn lại vẫn nằm yên. */
export async function pushOutbox(deps: SyncDeps): Promise<number> {
  let pushed = 0;
  for (;;) {
    const rows = await pending(BATCH);
    if (!rows.length) return pushed;
    // Chạy liên tiếp cùng (bảng, thao tác) để giữ nguyên thứ tự ghi.
    const head = rows[0];
    const run = [];
    for (const r of rows) {
      if (r.table !== head.table || r.op !== head.op) break;
      run.push(r);
    }
    const seqs = run.map((r) => r.seq!);
    if (head.table === 'library') {
      if (!deps.replayLibrary) throw new Error('Chưa sẵn sàng đồng bộ thư viện');
      for (const r of run) {
        await deps.replayLibrary(r.row);
        await removeSent([r.seq!]);
        pushed++;
      }
      continue;
    }
    if (head.op === 'insert') {
      await deps.client.insertIgnore(head.table, run.map((r) => r.row));
    } else if (head.op === 'upsert') {
      const last = new Map(run.map((r) => [rowKey(head.table, r.row), r.row]));
      await deps.client.upsert(head.table, [...last.values()], CONFLICT_KEY[head.table] ?? 'id');
    }
    await removeSent(seqs);
    pushed += run.length;
  }
}

interface PullSpec {
  table: string;
  column: 'created_at' | 'updated_at';
  apply: (rows: Row[], deps: SyncDeps) => Promise<void>;
}

const cursorKey = (table: string) => `sync:cursor:${table}`;

const SPECS: PullSpec[] = [
  {
    table: 'play_events',
    column: 'created_at',
    async apply(rows, deps) {
      await putEvents(rows.map(rowToEvent));
      await deps.onEventsPulled?.();
    },
  },
  {
    table: 'track_features',
    column: 'updated_at',
    async apply(rows) {
      for (const r of rows) {
        const remote = rowToFeatures(r);
        const local = await getFeatures(remote.trackId);
        if (!local || remote.updatedAt > local.updatedAt) await putFeatures(remote);
      }
    },
  },
  {
    table: 'track_overrides',
    column: 'updated_at',
    async apply(rows) {
      for (const r of rows) {
        const remote = rowToOverride(r);
        const local = await getOverride(remote.trackId);
        if (!local || remote.updatedAt > local.updatedAt) await putOverride(remote);
      }
    },
  },
  {
    table: 'smart_playlists',
    column: 'updated_at',
    async apply(rows) {
      const remote = rows.map((r) => rowToSmart(r, ms(r.updated_at)));
      const local = await getAllSmartPlaylists();
      const { merged } = mergeVersioned(local, remote, (p) => p.id);
      await replaceSmartPlaylists(merged);
    },
  },
  {
    table: 'user_settings',
    column: 'updated_at',
    async apply(rows, deps) {
      const r = rows.at(-1);
      if (!r) return;
      const remote = { data: (r.data ?? {}) as Record<string, unknown>, updatedAt: ms(r.updated_at) };
      const local = await getUserSettings();
      if (!local || remote.updatedAt > local.updatedAt) {
        await replaceUserSettings(remote);
        deps.onSettingsPulled?.(remote.data);
      }
    },
  },
];

/** Kéo dữ liệu mới từ server. Trả số hàng đã nhận. */
export async function pullAll(deps: SyncDeps): Promise<number> {
  let total = 0;
  for (const spec of SPECS) {
    const stored = await getMeta<number>(cursorKey(spec.table));
    // Bảng theo updated_at: lùi 5 phút để không sót bản ghi từ máy có đồng hồ chậm (gộp lũy đẳng nên vô hại).
    let since = spec.column === 'updated_at' ? pullSince(stored ?? null) : (stored ?? null);
    for (;;) {
      const rows = await deps.client.selectSince(spec.table, spec.column, since === null ? null : iso(since), PAGE);
      if (!rows.length) break;
      await spec.apply(rows, deps);
      total += rows.length;
      const newest = Math.max(...rows.map((r) => ms(r[spec.column])));
      if (newest > (stored ?? 0)) await setMeta(cursorKey(spec.table), newest);
      // `>=` ở server nên trang sau lặp lại hàng biên; dừng khi không tiến thêm được hoặc hết dữ liệu.
      if (rows.length < PAGE || newest === since) break;
      since = newest;
    }
  }
  return total;
}

/* ───────── trạng thái hiển thị ───────── */

interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  pending: number;
  error: string | null;
}

export const useSync = create<SyncState>()(() => ({ status: 'idle', lastSyncAt: null, pending: 0, error: null }));

export async function refreshPending(): Promise<void> {
  useSync.setState({ pending: await pendingCount() });
}

let running: Promise<void> | null = null;

/** Một lượt đồng bộ (push rồi pull). Gọi chồng thì dùng chung lượt đang chạy. */
export function runSync(deps: SyncDeps): Promise<void> {
  running ??= (async () => {
    useSync.setState({ status: 'syncing', error: null });
    try {
      await pushOutbox(deps);
      await pullAll(deps);
      useSync.setState({ status: 'idle', lastSyncAt: (deps.now ?? Date.now)(), error: null });
      await setMeta('sync:last', (deps.now ?? Date.now)());
    } catch (err) {
      useSync.setState({ status: 'error', error: (err as Error).message });
      throw err;
    } finally {
      await refreshPending();
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/* ───────── lịch chạy ───────── */

export interface SchedulerEnv {
  /** null = chưa đăng nhập hoặc chưa cấu hình Supabase (chỉ cập nhật số thay đổi chờ) */
  getDeps: () => SyncDeps | null;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  rng?: () => number;
}

/**
 * Chạy sync khi `trigger()` được gọi (mở app, quay lại foreground, có mạng, đổi tài khoản).
 * Thất bại → tự thử lại sau backoff; thành công → mỗi 10 phút kiểm lại nếu còn outbox.
 */
export function createScheduler(env: SchedulerEnv) {
  let attempt = 0;
  let timer: unknown = null;

  const arm = (delay: number) => {
    if (timer !== null) env.clearTimer(timer);
    timer = env.setTimer(() => void trigger(), delay);
  };

  async function trigger(): Promise<void> {
    const deps = env.getDeps();
    if (!deps) {
      await refreshPending();
      return;
    }
    try {
      await runSync(deps);
      attempt = 0;
      arm(10 * 60_000);
    } catch {
      arm(backoffMs(attempt++, env.rng));
    }
  }

  return {
    trigger,
    stop() {
      if (timer !== null) env.clearTimer(timer);
      timer = null;
    },
  };
}
