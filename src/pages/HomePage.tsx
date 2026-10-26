import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { SettingsIcon } from '@/components/Icons';
import { ImportMusic } from '@/features/folder/ImportMusic';
import { homeShelves, type HomeContext } from '@/features/home/shelves';
import { useLibrary } from '@/features/library/store';
import { player } from '@/features/player/store';
import { useFeatures } from '@/features/analyze/featuresStore';
import { useHistory } from '@/features/recommend/history';
import { loadFolder, useFolder } from '@/providers/folder';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function HomePage() {
  const { tracks, status, error } = useFolder();
  const events = useHistory((s) => s.events);
  const liked = useLibrary((s) => s.liked);
  const features = useFeatures((s) => s.map);

  const ctx = useMemo<HomeContext>(
    () => ({ tracks, signals: { library: tracks, features, events, liked: new Set(liked.map((t) => t.id)), now: Date.now() } }),
    // Chỉ tính lại khi thư viện/lịch sử/like đổi (mỗi lượt nghe thêm đúng một event).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, events.length, liked, features],
  );

  return (
    <div>
      <PageHeader
        title={greeting()}
        right={
          <Link to="/settings" aria-label="Cài đặt" className="icon-btn -mr-2">
            <SettingsIcon />
          </Link>
        }
      />

      {status === 'error' && (
        <div role="alert" className="mx-4 my-3 rounded-lg bg-surface-2 p-4 text-sm">
          <p className="mb-3 text-white/90">{error}</p>
          <button type="button" className="chip" onClick={() => void loadFolder()}>
            Thử lại
          </button>
        </div>
      )}

      {status === 'ready' && tracks.length === 0 && (
        <div className="mx-4 my-6 rounded-lg bg-surface-2 p-5 text-sm">
          <p className="mb-2 text-base font-semibold">Chưa có nhạc trên điện thoại này</p>
          <p className="mb-4 text-muted">Chọn thư mục (hoặc file) nhạc mp3, m4a, flac… trên điện thoại. App sẽ lưu vào máy để nghe không cần mạng.</p>
          <ImportMusic />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="flex gap-2 px-4 pb-1">
          <button type="button" className="chip chip-active" onClick={() => player.playTracks(tracks, 0, 'Cả thư viện', { shuffle: true })}>
            Phát ngẫu nhiên tất cả
          </button>
          <span className="self-center text-xs text-muted">{tracks.length} bài</span>
        </div>
      )}

      {tracks.length > 0 && homeShelves.map(({ id, Component }) => <Component key={id} ctx={ctx} />)}
    </div>
  );
}
