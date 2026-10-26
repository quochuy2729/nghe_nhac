import { useHistory } from '@/features/recommend/history';
import { useRecommendSettings } from '@/features/recommend/settings';
import { hasSupabase } from '@/lib/env';

export default function RecommendSection() {
  const plays = useHistory((s) => s.events.length);
  const clearHistory = useHistory((s) => s.clear);
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
            <span className="block text-xs text-muted">{plays} lượt · lưu trên máy này, dùng để đoán gu của bạn.</span>
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
  );
}
