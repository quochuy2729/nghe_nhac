import { CheckCircleIcon, DownloadIcon } from '@/components/Icons';
import { toast } from '@/components/toastStore';
import type { Track } from '@/providers/types';
import { cancelDownload, canDownload, downloadTrack, removeDownload, useDownloads } from './manager';

export function DownloadButton({ track, size = 24 }: { track: Track; size?: number }) {
  const done = useDownloads((s) => !!s.ids[track.id]);
  const active = useDownloads((s) => s.active[track.id]);
  if (!canDownload(track)) return null;

  if (active?.state === 'downloading') {
    const p = active.progress;
    const r = size / 2 - 2;
    const c = 2 * Math.PI * r;
    return (
      <button type="button" className="icon-btn" aria-label={`Đang tải ${p >= 0 ? Math.round(p * 100) + '%' : ''}, chạm để hủy`} onClick={() => cancelDownload(track.id)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={p < 0 ? 'animate-spin' : ''} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2.5" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2.5"
            strokeDasharray={c}
            strokeDashoffset={p < 0 ? c * 0.7 : c * (1 - p)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  if (done) {
    return (
      <button
        type="button"
        className="icon-btn text-accent"
        aria-label="Đã tải về — chạm để xóa bản tải"
        onClick={() => {
          if (track.provider === 'local') {
            toast('File của bạn đã ở trên máy này');
            return;
          }
          if (window.confirm(`Xóa bản tải của “${track.title}”?`)) void removeDownload(track);
        }}
      >
        <CheckCircleIcon size={size} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`icon-btn ${active?.state === 'error' ? 'text-red-300' : 'text-white/80'}`}
      aria-label="Tải về để nghe offline"
      onClick={() =>
        downloadTrack(track)
          .then(() => toast(`Đã tải “${track.title}”`))
          .catch((e: Error) => e.name !== 'AbortError' && toast(`Không tải được: ${e.message}`))
      }
    >
      <DownloadIcon size={size} />
    </button>
  );
}

export function DownloadedDot({ trackId }: { trackId: string }) {
  const done = useDownloads((s) => !!s.ids[trackId]);
  if (!done) return null;
  return (
    <span aria-label="Đã tải về" className="inline-flex shrink-0 text-accent">
      <CheckCircleIcon size={12} />
    </span>
  );
}
