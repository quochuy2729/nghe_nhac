/** Nối syncService với app: auth, foreground, mạng, đồng hồ 10 phút. Gọi một lần lúc khởi động. */
import { useAuth } from '@/features/auth/store';
import { library, replayLibrary } from '@/features/library/store';
import { loadHistory, useHistory } from '@/features/recommend/history';
import { supabase } from '@/lib/supabase';
import { clearTable } from './outbox';
import { createSupabaseSyncClient } from './supabaseClient';
import { createScheduler, refreshPending, type SyncDeps } from './syncService';

function currentDeps(): SyncDeps | null {
  if (!supabase || !useAuth.getState().user) return null;
  return {
    client: createSupabaseSyncClient(supabase),
    replayLibrary,
    onEventsPulled: loadHistory,
  };
}

let scheduler: ReturnType<typeof createScheduler> | null = null;

/** Chạy đồng bộ ngay (nút "Đồng bộ ngay"). */
export function syncNow(): Promise<void> {
  return scheduler ? scheduler.trigger() : Promise.resolve();
}

export function startSync(): () => void {
  if (scheduler) return () => undefined;
  const s = createScheduler({
    getDeps: currentDeps,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  });
  scheduler = s;

  const run = () => {
    void s.trigger().then(() => {
      // Thao tác like/playlist vừa được phát lại: tải lại cho khớp với server.
      if (currentDeps()) void library.refresh();
    });
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', run);
  let lastUser = useAuth.getState().user?.id ?? null;
  const unsub = useAuth.subscribe((a) => {
    const id = a.user?.id ?? null;
    if (id !== lastUser) {
      lastUser = id;
      run(); // đăng nhập lần đầu: đẩy hết những gì đã ghi lúc là khách
    }
  });
  void refreshPending();
  run();

  return () => {
    s.stop();
    scheduler = null;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', run);
    unsub();
  };
}

/** Xóa lịch sử nghe trên máy này VÀ trên server. Lỗi mạng thì ném ra và giữ nguyên (không xóa nửa vời). */
export async function wipeHistory(): Promise<void> {
  if (supabase && useAuth.getState().user) await createSupabaseSyncClient(supabase).deleteAll('play_events');
  await clearTable('play_events');
  useHistory.getState().clear();
  await refreshPending();
}
