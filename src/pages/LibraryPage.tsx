import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DownloadIcon, HeartFilledIcon, PlusIcon, UserIcon } from '@/components/Icons';
import { useDownloads } from '@/features/downloads/manager';
import { library, useLibrary } from '@/features/library/store';
import { PlaylistCover } from '@/features/library/PlaylistPicker';
import { hasSupabase } from '@/lib/env';
import { TrackListSkeleton } from '@/components/Skeleton';

export function LibraryPage() {
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const mode = useLibrary((s) => s.mode);
  const status = useLibrary((s) => s.status);
  const error = useLibrary((s) => s.error);
  const downloaded = useDownloads((s) => s.items.length);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <div>
      <PageHeader
        title="Thư viện"
        right={
          <div className="-mr-2 flex">
            <button type="button" aria-label="Tạo playlist" className="icon-btn" onClick={() => setCreating(true)}>
              <PlusIcon />
            </button>
            <Link to="/settings" aria-label="Tài khoản và cài đặt" className="icon-btn">
              <UserIcon />
            </Link>
          </div>
        }
      />

      {mode === 'guest' && (
        <Link to="/settings" className="mx-4 mb-3 block rounded-lg bg-surface-2 p-4 text-sm active:opacity-80">
          <p className="font-semibold">{hasSupabase ? 'Đăng nhập để đồng bộ' : 'Đang dùng chế độ khách'}</p>
          <p className="mt-1 text-muted">
            {hasSupabase
              ? 'Bài yêu thích và playlist sẽ có trên cả Android và iPhone.'
              : 'Thư viện chỉ lưu trên máy này (chưa cấu hình Supabase).'}
          </p>
        </Link>
      )}

      {status === 'error' && (
        <div role="alert" className="mx-4 mb-3 flex items-center justify-between rounded-lg bg-red-500/15 px-4 py-3 text-sm">
          <span>Không tải được thư viện: {error}</span>
          <button type="button" className="chip" onClick={() => void library.refresh()}>
            Thử lại
          </button>
        </div>
      )}

      {creating && (
        <form
          className="flex gap-2 px-4 pb-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await library.createPlaylist(name || 'Playlist mới').catch(() => undefined);
            setName('');
            setCreating(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Tên playlist"
            aria-label="Tên playlist mới"
            className="h-11 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" className="chip chip-active h-11">
            Tạo
          </button>
          <button type="button" className="chip h-11" onClick={() => setCreating(false)}>
            Hủy
          </button>
        </form>
      )}

      <ul>
        <li>
          <Link to="/library/liked" className="flex min-h-[72px] items-center gap-3 px-4 py-2 active:bg-white/5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-600 to-teal-300">
              <HeartFilledIcon size={24} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">Bài hát đã thích</span>
              <span className="block text-sm text-muted">Playlist · {liked.length} bài</span>
            </span>
          </Link>
        </li>
        <li>
          <Link to="/library/downloads" className="flex min-h-[72px] items-center gap-3 px-4 py-2 active:bg-white/5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gradient-to-br from-emerald-800 to-emerald-400">
              <DownloadIcon size={26} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">Đã tải về</span>
              <span className="block text-sm text-muted">Nghe khi không có mạng · {downloaded} bài</span>
            </span>
          </Link>
        </li>
        {playlists.map((p) => (
          <li key={p.id}>
            <Link to={`/library/playlist/${p.id}`} className="flex min-h-[72px] items-center gap-3 px-4 py-2 active:bg-white/5">
              <PlaylistCover playlist={p} className="h-14 w-14" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">Playlist · {p.tracks.length} bài</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {status === 'loading' && <TrackListSkeleton rows={3} />}
      {status === 'ready' && playlists.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted">Chưa có playlist nào. Bấm + để tạo.</p>
      )}
    </div>
  );
}
