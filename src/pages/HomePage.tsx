import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { SettingsIcon } from '@/components/Icons';
import { TrackRow } from '@/components/TrackRow';
import { mockProvider } from '@/providers/mock';
import type { Track } from '@/providers/types';
import { player } from '@/features/player/store';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function HomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => {
    void mockProvider.featured!().then(setTracks);
  }, []);

  return (
    <div>
      <PageHeader
        title={greeting()}
        right={
          <Link to="/settings" aria-label="Cài đặt" className="icon-btn">
            <SettingsIcon />
          </Link>
        }
      />
      <section className="mt-2">
        <h2 className="px-4 pb-2 text-lg font-bold">Bài demo</h2>
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} onPlay={() => player.playTracks(tracks, i, 'Bài demo')} />
        ))}
      </section>
    </div>
  );
}
