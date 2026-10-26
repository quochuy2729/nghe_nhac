/** Cửa sổ ảo hóa danh sách dòng cao cố định — hàm thuần (xem components/VirtualList.tsx). */
export interface VisibleRange {
  start: number;
  end: number; // loại trừ
  /** px phía trên cửa sổ (chiều cao các dòng bị bỏ) */
  padTop: number;
  /** px phía dưới cửa sổ */
  padBottom: number;
}

/**
 * @param scrollTop     vị trí cuộn của vùng cuộn
 * @param viewportH     chiều cao vùng nhìn thấy
 * @param listOffsetTop vị trí đầu danh sách so với đầu vùng cuộn
 */
export function visibleRange(count: number, rowH: number, scrollTop: number, viewportH: number, listOffsetTop = 0, overscan = 6): VisibleRange {
  if (count <= 0 || rowH <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const first = Math.floor((scrollTop - listOffsetTop) / rowH);
  const last = Math.ceil((scrollTop + viewportH - listOffsetTop) / rowH);
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, Math.max(start, last + overscan));
  return { start, end, padTop: start * rowH, padBottom: (count - end) * rowH };
}
