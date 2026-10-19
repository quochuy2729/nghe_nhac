import { Link } from 'react-router-dom';
import { ChevronDownIcon } from '@/components/Icons';
import { useArtworkColor } from '@/lib/color';
import { useGoBack } from '@/lib/useGoBack';
import { useCurrentTrack } from '@/features/player/hooks';
import { SeekBar } from '@/features/player/SeekBar';
import { PlayPauseButton } from '@/features/player/Controls';
import { LyricsBody } from '@/features/lyrics/LyricsBody';

export function LyricsPage() {
  const track = useCurrentTrack();
  const color = useArtworkColor(track?.artworkUrl);
  const goBack = useGoBack();

  return (
    <div className="flex h-full flex-col pt-safe-t transition-colors duration-700" style={{ backgroundColor: color }}>
      <header className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={goBack} aria-label="Đóng lời bài hát" className="icon-btn">
          <ChevronDownIcon size={28} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-semibold">{track?.title ?? 'Lời bài hát'}</p>
          <p className="truncate text-sm text-white/70">{track?.artist}</p>
        </div>
        <span className="w-11" aria-hidden="true" />
      </header>
      <div className="min-h-0 flex-1 px-6">
        {track ? (
          <LyricsBody track={track} className="h-full" />
        ) : (
          <div className="py-16 text-center text-white/80">
            <p className="mb-4">Chưa có bài nào đang phát.</p>
            <Link to="/search" className="chip">
              Tìm bài hát
            </Link>
          </div>
        )}
      </div>
      {track && (
        <footer className="px-6 pb-[calc(12px+env(safe-area-inset-bottom))] pt-1" style={{ background: `linear-gradient(0deg, ${color} 70%, transparent)` }}>
          <SeekBar />
          <div className="flex justify-center">
            <PlayPauseButton />
          </div>
        </footer>
      )}
    </div>
  );
}
