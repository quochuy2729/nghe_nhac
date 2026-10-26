import { Artwork } from '@/components/Artwork';
import { player } from '@/features/player/store';
import type { Track } from '@/providers/types';

/** Một hàng bài hát cuộn ngang trên Trang chủ. */
export function Shelf({ title, subtitle, tracks }: { title: string; subtitle?: string; tracks: Track[] }) {
  if (!tracks.length) return null;
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between gap-3 px-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        <button type="button" className="chip shrink-0" onClick={() => player.playTracks(tracks, 0, title)}>
          Phát
        </button>
      </div>
      <ul className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1">
        {tracks.map((t, i) => (
          <Card key={t.id} track={t} onPlay={() => player.playTracks(tracks, i, title)} />
        ))}
      </ul>
    </section>
  );
}

function Card({ track, onPlay }: { track: Track; onPlay: () => void }) {
  return (
    <li className="w-36 shrink-0">
      <button type="button" onClick={onPlay} className="w-full text-left active:opacity-70">
        <Artwork src={track.artworkUrl} alt="" className="aspect-square w-36 shadow-lg" rounded="rounded-md" />
        <p className="mt-2 truncate text-sm font-semibold">{track.title}</p>
        <p className="truncate text-xs text-muted">{track.artist}</p>
      </button>
    </li>
  );
}
