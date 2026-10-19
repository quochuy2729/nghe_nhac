import { useNavigate } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { NextIcon } from '@/components/Icons';
import { useArtworkColor } from '@/lib/color';
import { PlayPauseButton } from './Controls';
import { useCurrentTrack } from './hooks';
import { player, usePlayback } from './store';
import { LikeButton } from './slots';

export function MiniPlayer() {
  const track = useCurrentTrack();
  const navigate = useNavigate();
  const color = useArtworkColor(track?.artworkUrl);
  const progress = usePlayback((s) => (s.duration > 0 ? Math.min(1, s.currentTime / s.duration) : 0));
  if (!track) return null;

  return (
    <div className="fixed inset-x-2 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Mở trình phát: ${track.title} – ${track.artist}`}
        onClick={() => navigate('/player')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/player')}
        className="relative flex items-center gap-3 overflow-hidden rounded-lg py-2 pl-2 pr-1 shadow-lg transition-colors duration-500"
        style={{ backgroundColor: color }}
      >
        <Artwork src={track.artworkUrl} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <p className="truncate text-xs text-white/70">{track.artist}</p>
        </div>
        <LikeButton track={track} size={22} />
        <PlayPauseButton size="sm" />
        <button
          type="button"
          aria-label="Bài tiếp theo"
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            player.next();
          }}
        >
          <NextIcon size={22} />
        </button>
        <div className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-white/20">
          <div className="h-full rounded bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
