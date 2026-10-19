import { DownloadIcon } from './Icons';

export function DownloadableBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-accent/15 px-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
      <DownloadIcon size={10} strokeWidth={3} />
      Tải được
    </span>
  );
}
