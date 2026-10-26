import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { visibleRange } from '@/lib/virtual';

/** Phần tử cuộn gần nhất (hoặc null = cuộn cả cửa sổ). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
}

/**
 * Danh sách ảo hóa dòng cao cố định: chỉ dựng các dòng đang nhìn thấy (+ vài dòng đệm), nên thư viện vài nghìn bài
 * không tạo vài nghìn nút DOM. Tự tìm vùng cuộn cha (hoặc cửa sổ).
 */
export function VirtualList({
  count,
  rowHeight,
  renderRow,
  overscan = 6,
  label,
}: {
  count: number;
  rowHeight: number;
  renderRow: (index: number) => ReactNode;
  overscan?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: typeof window === 'undefined' ? 800 : window.innerHeight, offset: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = scrollParentOf(el);
    const measure = () => {
      const listTop = el.getBoundingClientRect().top;
      if (parent) {
        const pr = parent.getBoundingClientRect();
        setView({ top: parent.scrollTop, height: parent.clientHeight, offset: listTop - pr.top + parent.scrollTop });
      } else {
        setView({ top: window.scrollY, height: window.innerHeight, offset: listTop + window.scrollY });
      }
    };
    measure();
    const target: HTMLElement | Window = parent ?? window;
    target.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      target.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [count]);

  const r = visibleRange(count, rowHeight, view.top, view.height, view.offset, overscan);
  const rows: ReactNode[] = [];
  for (let i = r.start; i < r.end; i++) rows.push(<div key={i} style={{ height: rowHeight }}>{renderRow(i)}</div>);
  return (
    <div ref={ref} role="list" aria-label={label} style={{ paddingTop: r.padTop, paddingBottom: r.padBottom }}>
      {rows}
    </div>
  );
}
