import { Artwork } from '@/components/Artwork';
import { CloseIcon } from '@/components/Icons';
import { cx } from '@/lib/utils';
import { player, useQueueStore } from './store';

export function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queue = useQueueStore((s) => s.queue);
  const context = useQueueStore((s) => s.context);
  if (!open) return null;
  const cur = queue.items[queue.index];
  const next = queue.items.slice(queue.index + 1);

  return (
    <div role="dialog" aria-modal="true" aria-label="Hàng đợi" className="fixed inset-0 z-50 flex flex-col bg-canvas pt-safe-t">
      <header className="flex items-center justify-between px-4 py-2">
        <h2 className="text-lg font-bold">Hàng đợi</h2>
        <button type="button" onClick={onClose} aria-label="Đóng hàng đợi" className="icon-btn">
          <CloseIcon />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
        {cur && (
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-muted">Đang phát</h3>
            <QueueRow title={cur.track.title} artist={cur.track.artist} art={cur.track.artworkUrl} active />
          </section>
        )}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">
            Tiếp theo{context ? ` · ${context}` : ''}
          </h3>
          {next.length === 0 && <p className="py-6 text-center text-sm text-muted">Không còn bài nào trong hàng đợi.</p>}
          <ul>
            {next.map((it, i) => {
              const absolute = queue.index + 1 + i;
              return (
                <li key={it.uid}>
                  <QueueRow
                    title={it.track.title}
                    artist={it.track.artist}
                    art={it.track.artworkUrl}
                    onPlay={() => player.jumpTo(it.uid)}
                    onRemove={() => player.remove(it.uid)}
                    onUp={i > 0 ? () => player.move(absolute, absolute - 1) : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function QueueRow(props: {
  title: string;
  artist: string;
  art?: string;
  active?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onUp?: () => void;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-3">
      <button type="button" onClick={props.onPlay} disabled={!props.onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Artwork src={props.art} className="h-11 w-11" />
        <span className="min-w-0">
          <span className={cx('block truncate text-sm font-medium', props.active && 'text-accent')}>{props.title}</span>
          <span className="block truncate text-xs text-muted">{props.artist}</span>
        </span>
      </button>
      {props.onUp && (
        <button type="button" onClick={props.onUp} aria-label={`Đưa ${props.title} lên trước`} className="icon-btn text-muted">
          <span aria-hidden="true" className="text-lg leading-none">↑</span>
        </button>
      )}
      {props.onRemove && (
        <button type="button" onClick={props.onRemove} aria-label={`Xóa ${props.title} khỏi hàng đợi`} className="icon-btn text-muted">
          <CloseIcon size={20} />
        </button>
      )}
    </div>
  );
}
