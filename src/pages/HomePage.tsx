import { Link } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { PageHeader } from '@/components/PageHeader';
import { SettingsIcon } from '@/components/Icons';
import { searchSources } from '@/providers';
import type { MusicProvider, Track } from '@/providers/types';
import { player } from '@/features/player/store';
import { useAsync } from '@/lib/useAsync';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

const SECTION_TITLE: Record<string, string> = {
  jamendo: 'Nổi bật tuần này · Jamendo',
  mock: 'Bài demo',
  audius: 'Đang thịnh hành · Audius',
  local: 'Nhạc của tôi',
};

export function HomePage() {
  const sources = searchSources();
  return (
    <div>
      <PageHeader
        title={greeting()}
        right={
          <Link to="/settings" aria-label="Cài đặt" className="icon-btn -mr-2">
            <SettingsIcon />
          </Link>
        }
      />
      {sources.map((s) => (
        <Shelf key={s.id} provider={s} />
      ))}
    </div>
  );
}

function Shelf({ provider }: { provider: MusicProvider }) {
  const { data, error, loading, reload } = useAsync(() => provider.featured?.() ?? Promise.resolve([]), [provider]);
  const title = SECTION_TITLE[provider.id] ?? provider.label;
  if (!loading && !error && (!data || data.length === 0)) return null;

  return (
    <section className="mt-4">
      <h2 className="px-4 pb-3 text-xl font-bold">{title}</h2>
      {error ? (
        <div className="mx-4 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3 text-sm">
          <span className="text-muted">{error}</span>
          <button type="button" className="chip" onClick={reload}>
            Thử lại
          </button>
        </div>
      ) : (
        <ul className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1">
          {loading && !data
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="w-36 shrink-0">
                  <div className="aspect-square w-36 animate-pulse rounded bg-surface-2" />
                  <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface-2" />
                </li>
              ))
            : data!.map((t, i) => <Card key={t.id} track={t} onPlay={() => player.playTracks(data!, i, title)} />)}
        </ul>
      )}
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
