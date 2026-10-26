import { useMemo } from 'react';
import { CloseIcon, SearchIcon } from '@/components/Icons';
import { TrackList } from '@/components/TrackList';
import { TrackListSkeleton } from '@/components/Skeleton';
import { searchTracks, useFolder } from '@/providers/folder';
import { useDebounced } from '@/lib/useDebounced';
import { useSearchStore } from '@/features/search/store';

export function SearchPage() {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const q = useDebounced(query.trim(), 200);
  const { tracks, status, error } = useFolder();

  const results = useMemo(() => searchTracks(tracks, q), [tracks, q]);
  const heading = q ? `Kết quả cho “${q}”` : 'Cả thư viện';

  return (
    <div>
      <div className="sticky top-0 z-20 bg-canvas/95 px-4 pb-2 pt-4 backdrop-blur">
        <h1 className="mb-3 text-2xl font-bold">Tìm kiếm</h1>
        <label className="flex h-12 items-center gap-2 rounded-lg bg-white px-3 text-black">
          <SearchIcon size={22} className="shrink-0 text-black/70" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bài hát, nghệ sĩ, album, thể loại"
            aria-label="Tìm bài hát, nghệ sĩ"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-black/50"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Xóa từ khóa" className="icon-btn -mr-2 text-black/70">
              <CloseIcon size={20} />
            </button>
          )}
        </label>
      </div>

      <h2 className="px-4 pb-1 pt-3 text-base font-bold">{heading}</h2>
      {status === 'error' && (
        <div role="alert" className="mx-4 my-3 rounded-lg bg-surface-2 p-4 text-sm text-white/90">
          {error}
        </div>
      )}
      {status !== 'error' && (status === 'loading' || status === 'idle') && tracks.length === 0 ? (
        <TrackListSkeleton />
      ) : (
        <>
          {status === 'ready' && results.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">
              {tracks.length === 0 ? 'Chưa có nhạc trên máy. Thêm nhạc ở Trang chủ hoặc Cài đặt.' : 'Không tìm thấy bài nào.'}
            </p>
          )}
          <TrackList tracks={results} context={q ? `Tìm “${q}”` : 'Cả thư viện'} />
        </>
      )}
    </div>
  );
}
