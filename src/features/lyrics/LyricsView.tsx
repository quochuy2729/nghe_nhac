import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/utils';
import { player, usePlayback } from '@/features/player/store';
import type { LrcLine } from './lrc';
import { useActiveLine } from './hooks';

const MANUAL_SCROLL_PAUSE_MS = 3000;

/**
 * Lời đồng bộ: dòng đang hát tô sáng + phóng nhẹ, tự cuộn vào giữa.
 * Người dùng tự cuộn → tạm dừng auto-scroll 3s. Chạm một dòng → tua tới đó.
 */
export function LyricsView({
  lines,
  compact = false,
  className,
  footer,
}: {
  lines: LrcLine[];
  compact?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const active = useActiveLine(lines);
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const pausedUntil = useRef(0);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const scrollTo = (i: number, smooth = true) => {
    const el = refs.current[Math.max(0, i)];
    const c = box.current;
    if (!el || !c) return;
    // Tương đương scrollIntoView({ block: 'center' }) nhưng chỉ cuộn khung lời, không kéo cả trang.
    c.scrollTo({ top: el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (Date.now() < pausedUntil.current) return;
    scrollTo(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    refs.current = refs.current.slice(0, lines.length);
    scrollTo(active, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const pause = () => {
    pausedUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS;
  };

  return (
    <div
      ref={box}
      onTouchMove={pause}
      onWheel={pause}
      className={cx('no-scrollbar relative overflow-y-auto overscroll-contain', className)}
      aria-label="Lời bài hát"
    >
      <div className={compact ? 'py-16' : 'pb-[30vh] pt-[35vh]'}>
        {lines.map((l, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-current={i === active ? 'true' : undefined}
            onClick={() => {
              pausedUntil.current = 0;
              player.seek(l.timeMs / 1000);
              if (!usePlayback.getState().isPlaying) player.play();
            }}
            className={cx(
              'block w-full origin-left text-left font-bold leading-snug transition-all duration-300',
              compact ? 'py-1.5 text-xl' : 'py-2.5 text-[26px]',
              i === active ? 'scale-[1.04] text-white' : i < active ? 'text-white/60' : 'text-white/35',
            )}
          >
            {l.text || '♪'}
          </button>
        ))}
        {footer}
      </div>
    </div>
  );
}
