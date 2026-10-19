export function TrackListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Đang tải danh sách">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-1.5">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}
