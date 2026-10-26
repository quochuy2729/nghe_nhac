import { analyzeNow, pauseAnalysis, useAnalyze, useAnalyzeSettings } from '@/features/analyze/service';
import { platform } from '@/platform';

const STATE_TEXT: Record<string, string> = {
  idle: 'Chưa chạy',
  running: 'Đang phân tích…',
  waiting: 'Chờ điều kiện (app mở, đủ pin, không đang phát nhạc)',
  paused: 'Đã tạm dừng',
  done: 'Đã phân tích xong',
};

/** Phân tích âm thanh (tempo, năng lượng, độ sáng…) để gợi ý và trộn thông minh sát hơn. Ẩn nếu nền tảng không hỗ trợ. */
export default function AnalyzeSection() {
  const { total, done, failed, state } = useAnalyze();
  const auto = useAnalyzeSettings((s) => s.auto);
  const setAuto = useAnalyzeSettings((s) => s.setAuto);
  if (!platform.caps.analyze) return null;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const running = state === 'running';

  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 text-lg font-bold">Phân tích âm thanh</h2>
      <div className="rounded-lg bg-surface-2 p-4 text-sm">
        <p role="status">
          <span className="font-semibold">
            {done}/{total} bài
          </span>
          <span className="text-muted"> · {STATE_TEXT[state] ?? state}</span>
          {failed > 0 && <span className="text-muted"> · {failed} bài không đọc được</span>}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ phân tích">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {running ? (
            <button type="button" className="chip" onClick={pauseAnalysis}>
              Tạm dừng
            </button>
          ) : (
            <button type="button" className="chip chip-active" disabled={!total || done >= total} onClick={analyzeNow}>
              Phân tích ngay
            </button>
          )}
        </div>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span>
            Tự phân tích nền
            <span className="block text-xs text-muted">Chỉ khi app đang mở; Android cần đang sạc hoặc pin &gt; 40%.</span>
          </span>
          <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#2dd4bf]" checked={auto} onChange={(e) => setAuto(e.target.checked)} aria-label="Tự phân tích nền" />
        </label>
        <p className="mt-3 text-xs text-muted">Chỉ phân tích 45 giây mỗi bài; kết quả được đồng bộ nên máy còn lại khỏi tính lại.</p>
      </div>
    </section>
  );
}
