import { useEffect, type ReactNode } from 'react';

/** Bottom sheet đơn giản, đóng khi chạm nền hoặc Esc. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface-2 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function SheetItem({ icon, label, onClick, danger }: { icon?: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full items-center gap-4 px-5 text-left text-[15px] active:bg-white/10 ${danger ? 'text-red-300' : ''}`}
    >
      <span className="flex w-6 justify-center text-white/80">{icon}</span>
      {label}
    </button>
  );
}
