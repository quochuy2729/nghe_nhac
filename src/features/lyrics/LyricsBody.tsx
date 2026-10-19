import type { Track } from '@/providers/types';
import { useLyrics } from './hooks';
import { LyricsView } from './LyricsView';

/** Toàn bộ trạng thái: đang tải / lỗi / synced / plain / chưa có. */
export function LyricsBody({ track, compact = false, className = '' }: { track: Track; compact?: boolean; className?: string }) {
  const { lyrics, error, loading, reload } = useLyrics(track);

  if (loading) {
    return (
      <div className={`space-y-4 ${compact ? 'py-6' : 'px-1 py-10'}`} aria-busy="true" aria-label="Đang tải lời">
        {[80, 60, 72, 50].map((w, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-white/15" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-10 text-center">
        <p className="mb-3 text-white/80">Không tải được lời: {error}</p>
        <button type="button" className="chip" onClick={reload}>
          Thử lại
        </button>
      </div>
    );
  }
  if (!lyrics || lyrics.kind === 'none') {
    return <p className="py-10 text-center text-lg font-semibold text-white/70">Chưa có lời cho bài này.</p>;
  }
  if (lyrics.kind === 'plain') {
    return (
      <div className={`overflow-y-auto ${className}`}>
        <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Lời chưa đồng bộ thời gian</p>
        <p className={`whitespace-pre-line font-bold leading-relaxed text-white/90 ${compact ? 'text-lg' : 'text-2xl'}`}>{lyrics.text}</p>
        {!compact && <Attribution source={lyrics.source} />}
      </div>
    );
  }
  return (
    <LyricsView lines={lyrics.lines} compact={compact} className={className} footer={!compact && <Attribution source={lyrics.source} />} />
  );
}

function Attribution({ source }: { source: string }) {
  const label = source === 'lrclib' ? 'Lời bài hát từ LRCLIB' : source === 'file' ? 'Lời từ file .lrc của bạn' : 'Lời demo (tự viết)';
  return <p className="pt-8 text-center text-xs text-white/60">{label}</p>;
}
