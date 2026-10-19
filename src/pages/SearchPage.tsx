import { useEffect, useMemo, useState } from 'react';
import { CloseIcon, SearchIcon } from '@/components/Icons';
import { TrackList } from '@/components/TrackList';
import { TrackListSkeleton } from '@/components/Skeleton';
import { searchSources } from '@/providers';
import type { Track } from '@/providers/types';
import { useDebounced } from '@/lib/useDebounced';
import { useSearchStore } from '@/features/search/store';
import { LocalImport } from '@/features/search/LocalImport';
import { cx } from '@/lib/utils';

export function SearchPage() {
  const sources = useMemo(() => searchSources(), []);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const sourceId = useSearchStore((s) => s.source) ?? sources[0].id;
  const setSource = useSearchStore((s) => s.setSource);
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const q = useDebounced(query.trim(), 350);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPage(0);
    setTracks([]);
    const req = q ? source.search(q, 0) : (source.featured?.() ?? Promise.resolve([]));
    req
      .then((r) => {
        if (!alive) return;
        setTracks(r);
        setHasMore(!!q && r.length >= 20 && source.id !== 'local' && source.id !== 'mock');
      })
      .catch((e: Error) => alive && (setError(e.message), setTracks([])))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, source, reload]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const r = await source.search(q, page + 1);
      setTracks((t) => [...t, ...r]);
      setPage(page + 1);
      setHasMore(r.length >= 20);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const heading = q ? `Kết quả cho “${q}”` : source.id === 'local' ? 'Nhạc của tôi' : 'Gợi ý';

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
            placeholder="Bạn muốn nghe gì?"
            aria-label="Tìm bài hát, nghệ sĩ"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-black/50"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Xóa từ khóa" className="icon-btn -mr-2 text-black/70">
              <CloseIcon size={20} />
            </button>
          )}
        </label>
        <div role="tablist" aria-label="Nguồn nhạc" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {sources.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={s.id === source.id}
              onClick={() => setSource(s.id)}
              className={cx('chip shrink-0', s.id === source.id && 'chip-active')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {source.id === 'local' && <LocalImport onImported={() => setReload((n) => n + 1)} />}
      {source.id === 'mock' && !q && (
        <p className="px-4 pb-2 text-xs text-muted">Chế độ demo: chưa cấu hình Jamendo, đang dùng nhạc tổng hợp sẵn.</p>
      )}

      <h2 className="px-4 pb-1 pt-2 text-base font-bold">{heading}</h2>
      {error && (
        <div role="alert" className="mx-4 my-3 rounded-lg bg-surface-2 p-4 text-sm">
          <p className="mb-3 text-white/90">{error}</p>
          <button type="button" className="chip" onClick={() => setReload((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      )}
      {!error && !loading && tracks.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {source.id === 'local' ? 'Chưa có file nhạc nào. Bấm “Thêm file nhạc” ở trên.' : 'Không tìm thấy bài nào.'}
        </p>
      )}
      {loading && tracks.length === 0 ? (
        <TrackListSkeleton />
      ) : (
        <TrackList tracks={tracks} context={q ? `Tìm “${q}”` : `${source.label}`} />
      )}
      {loading && tracks.length > 0 && <p className="py-4 text-center text-sm text-muted">Đang tải…</p>}
      {hasMore && !loading && (
        <div className="flex justify-center py-4">
          <button type="button" className="chip" onClick={loadMore}>
            Tải thêm
          </button>
        </div>
      )}
    </div>
  );
}
