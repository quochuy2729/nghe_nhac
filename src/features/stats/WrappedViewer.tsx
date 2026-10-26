import { useRef, useState } from 'react';
import { CloseIcon } from '@/components/Icons';
import { toast } from '@/components/toastStore';
import { platform } from '@/platform';
import { renderCardPng } from './card';
import type { WrappedCard } from './wrapped';

/** Các thẻ toàn màn hình vuốt ngang (scroll-snap); xuất PNG rồi chia sẻ. */
export function WrappedViewer({ cards, onClose }: { cards: WrappedCard[]; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(cards.length - 1, Math.max(0, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setIndex(next);
  };

  const share = async () => {
    const card = cards[index];
    if (!card || busy) return;
    setBusy(true);
    try {
      const png = await renderCardPng(card);
      const how = await platform.shareImage(png, `nghe-nhac-wrapped-${card.id}.png`);
      if (how === 'downloaded') toast('Đã tải ảnh về máy');
    } catch (err) {
      toast(`Không chia sẻ được: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Wrapped" className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 pt-safe-t">
        <div className="flex gap-1.5 py-3" aria-hidden>
          {cards.map((c, i) => (
            <span key={c.id} className={`h-1 w-8 rounded-full ${i <= index ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
        <button type="button" aria-label="Đóng Wrapped" className="icon-btn" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {cards.map((c) => (
          <article
            key={c.id}
            className="flex w-screen shrink-0 snap-center flex-col justify-center px-8"
            style={{ background: `linear-gradient(160deg, ${c.colors[0]}, ${c.colors[1]})` }}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-white/75">{c.kicker}</p>
            <h2 className="mt-4 break-words text-5xl font-extrabold leading-tight">{c.headline}</h2>
            {c.sub && <p className="mt-3 text-lg text-white/85">{c.sub}</p>}
            {c.items && (
              <ul className="mt-6 space-y-2 text-lg font-semibold">
                {c.items.map((it) => (
                  <li key={it} className="truncate">
                    {it}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <button type="button" className="chip" disabled={index === 0} onClick={() => go(index - 1)}>
          ← Trước
        </button>
        <button type="button" className="chip chip-active" disabled={busy} onClick={() => void share()}>
          {busy ? 'Đang tạo ảnh…' : 'Chia sẻ ảnh'}
        </button>
        <button type="button" className="chip" disabled={index >= cards.length - 1} onClick={() => go(index + 1)}>
          Sau →
        </button>
      </div>
    </div>
  );
}
