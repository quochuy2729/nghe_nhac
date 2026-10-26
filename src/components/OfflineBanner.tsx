import { useOnline } from '@/lib/useOnline';
import { OfflineIcon } from './Icons';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-surface-3 px-4 py-1.5 text-xs text-white/90">
      <OfflineIcon size={14} /> Đang offline — nhạc trên máy vẫn phát bình thường
    </div>
  );
}
