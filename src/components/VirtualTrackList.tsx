import type { Track } from '@/providers/types';
import { player } from '@/features/player/store';
import { useTrackMenu } from '@/features/library/trackMenuStore';
import { cx } from '@/lib/utils';
import { MoreIcon } from './Icons';
import { TrackRow } from './TrackRow';
import { VirtualList } from './VirtualList';

export const TRACK_ROW_H = 60;

export interface Selection {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
}

/**
 * Danh sách bài ảo hóa (thư viện vài nghìn bài). Chạm để phát từ bài đó; ở chế độ chọn thì chạm để chọn/bỏ chọn.
 */
export function VirtualTrackList({ tracks, context, selection }: { tracks: readonly Track[]; context: string; selection?: Selection }) {
  const openMenu = useTrackMenu((s) => s.open);
  return (
    <VirtualList
      label={context}
      count={tracks.length}
      rowHeight={TRACK_ROW_H}
      renderRow={(i) => {
        const t = tracks[i];
        if (!t) return null;
        const checked = selection?.selected.has(t.id) ?? false;
        return (
          <div className={cx('flex items-center', checked && 'bg-white/10')} role="listitem">
            {selection && (
              <input
                type="checkbox"
                checked={checked}
                onChange={() => selection.toggle(t.id)}
                aria-label={`Chọn ${t.title}`}
                className="ml-4 h-6 w-6 shrink-0 accent-[#2dd4bf]"
              />
            )}
            <div className="min-w-0 flex-1">
              <TrackRow
                track={t}
                onPlay={() => (selection ? selection.toggle(t.id) : player.playTracks(tracks as Track[], i, context))}
                right={
                  selection ? undefined : (
                    <button type="button" aria-label={`Tùy chọn cho ${t.title}`} className="icon-btn -mr-2 text-muted" onClick={() => openMenu(t)}>
                      <MoreIcon size={20} />
                    </button>
                  )
                }
              />
            </div>
          </div>
        );
      }}
    />
  );
}
