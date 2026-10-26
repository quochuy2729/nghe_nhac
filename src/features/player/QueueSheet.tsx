import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Artwork } from '@/components/Artwork';
import { CloseIcon } from '@/components/Icons';
import { dragTarget, swipeToRemove } from '@/features/listening/logic';
import { cx } from '@/lib/utils';
import { player, useQueueStore } from './store';

const ROW_H = 56;

export function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queue = useQueueStore((s) => s.queue);
  const context = useQueueStore((s) => s.context);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
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
          {next.length > 0 && <p className="mb-2 text-xs text-muted">Giữ biểu tượng ≡ rồi kéo để sắp xếp · vuốt sang trái để xóa.</p>}
          <ul>
            {next.map((it, i) => {
              const absolute = queue.index + 1 + i;
              return (
                <li key={it.uid}>
                  <QueueRow
                    title={it.track.title}
                    suggested={it.suggested}
                    artist={it.track.artist}
                    art={it.track.artworkUrl}
                    onPlay={() => player.jumpTo(it.uid)}
                    onRemove={() => player.remove(it.uid)}
                    onUp={i > 0 ? () => player.move(absolute, absolute - 1) : undefined}
                    dragDy={drag?.from === i ? drag.dy : undefined}
                    onDrag={(dy) => setDrag(dy === null ? null : { from: i, dy })}
                    onDrop={(dy) => {
                      const to = dragTarget(i, dy, ROW_H, next.length);
                      setDrag(null);
                      if (to !== i) player.move(absolute, queue.index + 1 + to);
                    }}
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
  suggested?: boolean;
  active?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onUp?: () => void;
  dragDy?: number;
  onDrag?: (dy: number | null) => void;
  onDrop?: (dy: number) => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);

  // Vuốt ngang trên hàng để xóa (cuộn dọc vẫn hoạt động nhờ touch-action: pan-y).
  const swipe = props.onRemove
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          start.current = { x: e.clientX, y: e.clientY };
        },
        onPointerMove: (e: ReactPointerEvent) => {
          if (!start.current) return;
          const d = e.clientX - start.current.x;
          if (Math.abs(d) > 8 && Math.abs(d) > Math.abs(e.clientY - start.current.y)) setDx(Math.min(0, d));
        },
        onPointerUp: (e: ReactPointerEvent) => {
          const s = start.current;
          start.current = null;
          setDx(0);
          if (s && swipeToRemove(e.clientX - s.x, e.clientY - s.y)) props.onRemove?.();
        },
        onPointerCancel: () => {
          start.current = null;
          setDx(0);
        },
      }
    : {};

  // Kéo thả bằng tay cầm ≡: theo dõi pointer trên chính tay cầm (setPointerCapture) rồi báo quãng kéo.
  const grab = useRef<number | null>(null);
  const handle = props.onDrag
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          grab.current = e.clientY;
          props.onDrag?.(0);
        },
        onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
          if (grab.current !== null) props.onDrag?.(e.clientY - grab.current);
        },
        onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
          if (grab.current === null) return;
          const dy = e.clientY - grab.current;
          grab.current = null;
          props.onDrop?.(dy);
        },
        onPointerCancel: () => {
          grab.current = null;
          props.onDrag?.(null);
        },
      }
    : null;

  const dragging = props.dragDy !== undefined;
  return (
    <div
      className={cx('flex min-h-[56px] touch-pan-y items-center gap-3', dragging && 'relative z-10 bg-surface-2 shadow-lg')}
      style={{
        transform: dragging ? `translateY(${props.dragDy}px)` : dx ? `translateX(${dx}px)` : undefined,
        opacity: dx ? 1 - Math.min(0.6, Math.abs(dx) / 200) : 1,
      }}
      {...swipe}
    >
      <button type="button" onClick={props.onPlay} disabled={!props.onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Artwork src={props.art} className="h-11 w-11" />
        <span className="min-w-0">
          <span className={cx('block truncate text-sm font-medium', props.active && 'text-accent')}>
            {props.suggested && <span title="Gợi ý thêm">✨ </span>}
            {props.title}
          </span>
          <span className="block truncate text-xs text-muted">{props.artist}</span>
        </span>
      </button>
      {props.onUp && (
        <button type="button" onClick={props.onUp} aria-label={`Đưa ${props.title} lên trước`} className="icon-btn text-muted">
          <span aria-hidden="true" className="text-lg leading-none">↑</span>
        </button>
      )}
      {handle && (
        <button type="button" aria-label={`Kéo để sắp xếp ${props.title}`} className="icon-btn touch-none text-muted" {...handle}>
          <span aria-hidden="true" className="text-lg leading-none">≡</span>
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
