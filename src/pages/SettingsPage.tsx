import { Link } from 'react-router-dom';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { AuthPanel } from '@/features/auth/AuthPanel';
import { useDownloads } from '@/features/downloads/manager';
import { ImportMusic } from '@/features/folder/ImportMusic';
import { useHistory } from '@/features/recommend/history';
import { useRecommendSettings } from '@/features/recommend/settings';
import { hasSupabase } from '@/lib/env';
import { formatBytes } from '@/lib/utils';

export function SettingsPage() {
  const items = useDownloads((s) => s.items);
  const total = items.reduce((a, i) => a + i.size, 0);
  const plays = useHistory((s) => s.events.length);
  const clearHistory = useHistory((s) => s.clear);
  const autoplay = useRecommendSettings((s) => s.autoplay);
  const setAutoplay = useRecommendSettings((s) => s.setAutoplay);

  return (
    <div className="pb-6">
      <CollectionHeaderBack title="Cài đặt" />
      <section className="px-4">
        <h2 className="mb-2 mt-2 text-lg font-bold">Tài khoản</h2>
        <AuthPanel />
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Nhạc trên điện thoại này</h2>
        <div className="rounded-lg bg-surface-2 p-4 text-sm">
          <p>
            <span className="font-semibold">{items.length} bài</span> · {formatBytes(total)}{' '}
            <Link to="/library/downloads" className="ml-1 text-accent">
              Quản lý
            </Link>
          </p>
          <p className="mb-4 mt-1 text-xs text-muted">
            Mỗi điện thoại có kho nhạc riêng: thêm nhạc trên máy nào thì nghe được trên máy đó. Chọn lại thư mục khi có bài mới; bài đã có sẽ được bỏ qua.
          </p>
          <ImportMusic />
        </div>
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Gợi ý nhạc</h2>
        <ul className="divide-y divide-white/10 rounded-lg bg-surface-2 text-sm">
          <li className="flex items-center justify-between gap-3 p-4">
            <span>
              Tự phát nhạc tương tự
              <span className="block text-xs text-muted">Hết hàng đợi thì nối thêm bài giống bài vừa nghe.</span>
            </span>
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#2dd4bf]" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} aria-label="Tự phát nhạc tương tự" />
          </li>
          <li className="flex items-center justify-between gap-3 p-4">
            <span>
              Lịch sử nghe
              <span className="block text-xs text-muted">{plays} lượt · chỉ lưu trên máy này, dùng để đoán gu của bạn.</span>
            </span>
            <button
              type="button"
              className="chip shrink-0"
              disabled={!plays}
              onClick={() => {
                if (window.confirm('Xóa toàn bộ lịch sử nghe? Gợi ý sẽ phải học lại từ đầu.')) clearHistory();
              }}
            >
              Xóa
            </button>
          </li>
          <li className="flex justify-between p-4">
            <span>Đồng bộ like/playlist (Supabase)</span>
            <span className={hasSupabase ? 'text-accent' : 'text-muted'}>{hasSupabase ? 'Đã cấu hình' : 'Chế độ khách'}</span>
          </li>
        </ul>
      </section>
      <p className="mt-6 px-4 text-xs text-muted">Nghe Nhạc v{__APP_VERSION__}. Phát nhạc có sẵn trong điện thoại của bạn.</p>
    </div>
  );
}
