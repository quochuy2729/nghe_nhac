import type { Track } from '@/providers/types';
import { player } from '@/features/player/store';
import { useTrackMenu } from '@/features/library/trackMenu';
import { DownloadableBadge } from './Badges';
import { MoreIcon } from './Icons';
import { TrackRow } from './TrackRow';

/** Danh sách bài: chạm để phát cả danh sách từ bài đó, nút ⋯ mở menu. */
export function TrackList({ tracks, context, playlistId }: { tracks: Track[]; context: string; playlistId?: string }) {
  const openMenu = useTrackMenu((s) => s.open);
  return (
    <ul>
      {tracks.map((t, i) => (
        <li key={`${t.id}-${i}`}>
          <TrackRow
            track={t}
            onPlay={() => player.playTracks(tracks, i, context)}
            badges={t.downloadable && t.provider !== 'local' ? <DownloadableBadge /> : null}
            right={
              <button type="button" aria-label={`Tùy chọn cho ${t.title}`} className="icon-btn -mr-2 text-muted" onClick={() => openMenu(t, playlistId ? { id: playlistId, index: i } : undefined)}>
                <MoreIcon size={20} />
              </button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
