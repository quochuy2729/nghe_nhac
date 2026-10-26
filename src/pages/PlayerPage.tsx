import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGoBack } from '@/lib/useGoBack';
import { Artwork } from '@/components/Artwork';
import { ChevronDownIcon, MicIcon, QueueIcon } from '@/components/Icons';
import { useArtworkColor } from '@/lib/color';
import { TransportControls } from '@/features/player/Controls';
import { SeekBar } from '@/features/player/SeekBar';
import { QueueSheet } from '@/features/player/QueueSheet';
import { useCurrentTrack } from '@/features/player/hooks';
import { useQueueStore, usePlayback, player } from '@/features/player/store';
import { LikeButton } from '@/features/library/LikeButton';
import { LyricsCard } from '@/features/lyrics/LyricsCard';

export function PlayerPage() {
  const track = useCurrentTrack();
  const context = useQueueStore((s) => s.context);
  const error = usePlayback((s) => s.error);
  const color = useArtworkColor(track?.artworkUrl);
  const goBack = useGoBack();
  const [queueOpen, setQueueOpen] = useState(false);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 pb-[calc(16px+env(safe-area-inset-bottom))] pt-safe-t transition-colors duration-700"
      style={{ background: `linear-gradient(180deg, ${color} 0%, #121212 85%)` }}
    >
      <header className="flex items-center justify-between py-2">
        <button type="button" onClick={goBack} aria-label="Thu nhỏ trình phát" className="icon-btn -ml-3">
          <ChevronDownIcon size={28} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[11px] uppercase tracking-widest text-white/70">Đang phát từ</p>
          <p className="truncate text-sm font-semibold">{context || 'Hàng đợi'}</p>
        </div>
        <button type="button" onClick={() => setQueueOpen(true)} aria-label="Mở hàng đợi" className="icon-btn -mr-3">
          <QueueIcon size={24} />
        </button>
      </header>

      {!track ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-muted">
          <p>Chưa có bài nào đang phát.</p>
          <Link to="/search" className="chip chip-active">
            Tìm bài hát
          </Link>
        </div>
      ) : (
        <>
          <div className="flex min-h-[55vh] flex-1 items-center justify-center py-6">
            <Artwork
              src={track.artworkUrl}
              alt={`Ảnh bìa ${track.title}`}
              className="aspect-square w-full max-w-[340px] shadow-2xl"
              rounded="rounded-lg"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{track.title}</h1>
              <p className="truncate text-base text-white/70">{track.artist}</p>
            </div>
            <LikeButton track={track} size={28} />
          </div>

          <div className="mt-3">
            <SeekBar />
          </div>
          <div className="mt-2">
            <TransportControls />
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded bg-red-500/20 px-3 py-2 text-center text-sm text-red-200" onClick={() => player.clearError()}>
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => player.playRadio(track)} className="icon-btn gap-2 px-2 text-sm text-white/80">
              Radio
            </button>
            <Link to="/lyrics" aria-label="Lời bài hát" className="icon-btn -ml-2 gap-2 px-2 text-sm text-white/80">
              <MicIcon size={20} /> Lời bài hát
            </Link>
            <button type="button" onClick={() => setQueueOpen(true)} className="icon-btn -mr-2 gap-2 px-2 text-sm text-white/80">
              <QueueIcon size={20} /> Hàng đợi
            </button>
          </div>
          <LyricsCard track={track} color={color} />
        </>
      )}
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
