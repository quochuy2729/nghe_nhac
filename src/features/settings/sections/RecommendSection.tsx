import { toast } from '@/components/toastStore';
import { useHistory } from '@/features/recommend/history';
import { wipeHistory } from '@/features/sync/start';
import { useRecommendSettings } from '@/features/recommend/settings';
import { hasSupabase } from '@/lib/env';

export default function RecommendSection() {
  const plays = useHistory((s) => s.events.length);
  const autoplay = useRecommendSettings((s) => s.autoplay);
  const setAutoplay = useRecommendSettings((s) => s.setAutoplay);

  return (
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
            <span className="block text-xs text-muted">{plays} lượt · dùng để đoán gu của bạn; đã đăng nhập thì được đồng bộ giữa các máy.</span>
          </span>
          <button
            type="button"
            className="chip shrink-0"
            disabled={!plays}
            onClick={() => {
              if (window.confirm('Xóa toàn bộ lịch sử nghe trên máy này VÀ trên máy chủ (nếu đã đăng nhập)? Gợi ý sẽ phải học lại từ đầu.')) {
                wipeHistory().catch((err: Error) => toast(`Chưa xóa được: ${err.message}`));
              }
            }}
          >
            Xóa
          </button>
        </li>
        <li className="flex justify-between p-4">
          <span>Tài khoản đồng bộ (Supabase)</span>
          <span className={hasSupabase ? 'text-accent' : 'text-muted'}>{hasSupabase ? 'Đã cấu hình' : 'Chế độ khách'}</span>
        </li>
      </ul>
    </section>
  );
}
