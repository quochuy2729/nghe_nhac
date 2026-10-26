import { useEffect } from 'react';
import { useAuth } from '@/features/auth/store';
import { refreshPending, useSync } from '@/features/sync/syncService';
import { syncNow } from '@/features/sync/start';
import { hasSupabase } from '@/lib/env';

function ago(ms: number | null): string {
  if (!ms) return 'chưa lần nào';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(ms).toLocaleDateString('vi-VN');
}

/** Chỉ báo đồng bộ nhỏ: lần cuối, số thay đổi đang chờ, lỗi (nếu có). */
export default function SyncSection() {
  const { status, lastSyncAt, pending, error } = useSync();
  const loggedIn = useAuth((s) => !!s.user);

  useEffect(() => {
    void refreshPending();
  }, []);

  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 text-lg font-bold">Đồng bộ</h2>
      <div className="rounded-lg bg-surface-2 p-4 text-sm">
        {!hasSupabase ? (
          <p className="text-muted">Chưa cấu hình Supabase: mọi dữ liệu chỉ nằm trên máy này (xem README).</p>
        ) : !loggedIn ? (
          <p className="text-muted">
            Đang ở chế độ khách: {pending} thay đổi được giữ trên máy, sẽ tự đẩy lên khi bạn đăng nhập.
          </p>
        ) : (
          <>
            <p role="status">
              {status === 'syncing' ? 'Đang đồng bộ…' : `Lần cuối: ${ago(lastSyncAt)}`}
              <span className="text-muted"> · {pending} thay đổi đang chờ</span>
            </p>
            {error && <p className="mt-1 text-xs text-red-400">Lỗi: {error} — sẽ tự thử lại.</p>}
            <button type="button" className="chip mt-3" disabled={status === 'syncing'} onClick={() => void syncNow()}>
              Đồng bộ ngay
            </button>
          </>
        )}
        <p className="mt-3 text-xs text-muted">
          Đồng bộ: like, playlist, lịch sử nghe, đặc trưng âm thanh, tag sửa tay, playlist thông minh. Không bao giờ tải file nhạc lên.
        </p>
      </div>
    </section>
  );
}
