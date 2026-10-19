import type { ReactNode } from 'react';
import type { Track } from '@/providers/types';
import { Artwork } from './Artwork';
import { useCurrentItem } from '@/features/player/hooks';
import { usePlayback } from '@/features/player/store';
import { cx, formatTime } from '@/lib/utils';

export function TrackRow({
  track,
  onPlay,
  right,
  badges,
}: {
  track: Track;
  onPlay: () => void;
  right?: ReactNode;
  badges?: ReactNode;
}) {
  const cur = useCurrentItem();
  const isPlaying = usePlayback((s) => s.isPlaying);
  const active = cur?.track.id === track.id;

  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4">
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left active:opacity-70">
        <Artwork src={track.artworkUrl} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className={cx('flex items-center gap-1.5 truncate text-[15px] font-medium', active && 'text-accent')}>
            {active && isPlaying && <EqBars />}
            <span className="truncate">{track.title}</span>
          </span>
          <span className="flex items-center gap-1.5 truncate text-[13px] text-muted">
            {badges}
            <span className="truncate">{track.artist}</span>
            {track.durationSec > 0 && <span className="shrink-0">· {formatTime(track.durationSec)}</span>}
          </span>
        </span>
      </button>
      {right}
    </div>
  );
}

function EqBars() {
  return (
    <span aria-label="Đang phát" className="flex h-3 shrink-0 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="eq-bar w-[3px] rounded-sm bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
