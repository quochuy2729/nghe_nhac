import { useToast } from './toast';

export function Toast() {
  const message = useToast((s) => s.message);
  const id = useToast((s) => s.id);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(12px+env(safe-area-inset-top))] z-[60] flex justify-center px-4">
      {message && (
        <div key={id} className="pointer-events-auto rounded-lg bg-white px-4 py-3 text-sm font-medium text-black shadow-xl">
          {message}
        </div>
      )}
    </div>
  );
}
