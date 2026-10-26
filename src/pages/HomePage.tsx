import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { PageHeader } from '@/components/PageHeader';
import { SettingsIcon } from '@/components/Icons';
import { ImportMusic } from '@/features/folder/ImportMusic';
import { loadFolder, useFolder } from '@/providers/folder';
import type { Track } from '@/providers/types';
import { player } from '@/features/player/store';
import { useLibrary } from '@/features/library/store';
import { buildMixes, describeSession, newestTracks, recentlyPlayedTracks, recommend, type Mix, type Signals } from '@/features/recommend/engine';
import { useHistory } from '@/features/recommend/history';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function HomePage() {
  const { tracks, status, error } = useFolder();
  const events = useHistory((s) => s.events);
  const liked = useLibrary((s) => s.liked);

  const sections = useMemo(() => {
    const signals: Signals = { library: tracks, events, liked: new Set(liked.map((t) => t.id)), now: Date.now() };
    const reason = describeSession(signals);
    return {
      recent: recentlyPlayedTracks(events, tracks),
      forYou: recommend(signals, { limit: 20 }).map((x) => x.track),
      reason: reason
        ? reason.kind === 'artist'
          ? `Vì bạn đang nghe ${reason.name}`
          : `Bạn đang nghe nhiều nhạc ${reason.name}`
        : events.length
          ? 'Hợp với gu của bạn'
          : 'Gợi ý ngẫu nhiên, nghe nhiều hơn để gợi ý sát hơn',
      mixes: buildMixes(signals),
      newest: newestTracks(tracks),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tính lại khi thư viện/lịch sử/like đổi
  }, [tracks, events.length, liked]);

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

      {status === 'error' && (
        <div role="alert" className="mx-4 my-3 rounded-lg bg-surface-2 p-4 text-sm">
          <p className="mb-3 text-white/90">{error}</p>
          <button type="button" className="chip" onClick={() => void loadFolder()}>
            Thử lại
          </button>
        </div>
      )}

      {status === 'ready' && tracks.length === 0 && (
        <div className="mx-4 my-6 rounded-lg bg-surface-2 p-5 text-sm">
          <p className="mb-2 text-base font-semibold">Chưa có nhạc trên điện thoại này</p>
          <p className="mb-4 text-muted">Chọn thư mục (hoặc file) nhạc mp3, m4a, flac… trên điện thoại. App sẽ lưu vào máy để nghe không cần mạng.</p>
          <ImportMusic />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="flex gap-2 px-4 pb-1">
          <button type="button" className="chip chip-active" onClick={() => player.playTracks(tracks, 0, 'Cả thư viện', { shuffle: true })}>
            Phát ngẫu nhiên tất cả
          </button>
          <span className="self-center text-xs text-muted">{tracks.length} bài</span>
        </div>
      )}

      {sections.recent.length > 0 && <Shelf title="Nghe gần đây" tracks={sections.recent} />}
      {tracks.length > 0 && <Shelf title="Dành cho bạn" subtitle={sections.reason} tracks={sections.forYou} />}
      {sections.mixes.map((m) => (
        <MixShelf key={m.id} mix={m} />
      ))}
      {sections.newest.length > 0 && <Shelf title="Mới thêm" tracks={sections.newest} />}
    </div>
  );
}

function MixShelf({ mix }: { mix: Mix }) {
  return <Shelf title={mix.title} tracks={mix.tracks} />;
}

function Shelf({ title, subtitle, tracks }: { title: string; subtitle?: string; tracks: Track[] }) {
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
