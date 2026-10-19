import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CollectionHeader } from '@/components/CollectionHeader';
import { TrackList } from '@/components/TrackList';
import { MoreIcon, TrashIcon } from '@/components/Icons';
import { Sheet, SheetItem } from '@/components/Sheet';
import { PlaylistCover } from '@/features/library/PlaylistPicker';
import { library, useLibrary } from '@/features/library/store';
import { player } from '@/features/player/store';
import { formatTime } from '@/lib/utils';

export function PlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const status = useLibrary((s) => s.status);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  if (!playlist) {
    return <p className="p-8 text-center text-muted">{status === 'loading' ? 'Đang tải…' : 'Không tìm thấy playlist.'}</p>;
  }
  const total = playlist.tracks.reduce((a, t) => a + t.durationSec, 0);

  return (
    <div>
      <CollectionHeader
        title={playlist.name}
        subtitle={`${playlist.tracks.length} bài · ${formatTime(total)}`}
        gradient="#3b3b5c"
        cover={<PlaylistCover playlist={playlist} className="h-48 w-48 text-5xl shadow-2xl" />}
        onPlay={playlist.tracks.length ? () => player.playTracks(playlist.tracks, 0, playlist.name, { shuffle: false }) : undefined}
        onShuffle={playlist.tracks.length ? () => player.playTracks(playlist.tracks, 0, playlist.name, { shuffle: true }) : undefined}
        actions={
          <button type="button" aria-label="Tùy chọn playlist" className="icon-btn text-white/80" onClick={() => setMenu(true)}>
            <MoreIcon />
          </button>
        }
      />
      {renaming && (
        <form
          className="flex gap-2 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void library.renamePlaylist(playlist.id, name);
            setRenaming(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-label="Tên mới"
            className="h-11 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" className="chip chip-active h-11">
            Lưu
          </button>
        </form>
      )}
      {playlist.tracks.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">Playlist trống. Mở menu ⋯ của một bài để thêm vào đây.</p>
      ) : (
        <TrackList tracks={playlist.tracks} context={playlist.name} playlistId={playlist.id} />
      )}
      <Sheet open={menu} onClose={() => setMenu(false)} label="Tùy chọn playlist">
        <SheetItem
          label="Đổi tên"
          icon={<span aria-hidden="true">✎</span>}
          onClick={() => {
            setName(playlist.name);
            setRenaming(true);
            setMenu(false);
          }}
        />
        <SheetItem
          label="Thêm tất cả vào hàng đợi"
          icon={<span aria-hidden="true">≡</span>}
          onClick={() => {
            player.enqueue(playlist.tracks);
            setMenu(false);
          }}
        />
        <SheetItem
          danger
          label="Xóa playlist"
          icon={<TrashIcon size={22} />}
          onClick={() => {
            setMenu(false);
            if (window.confirm(`Xóa playlist “${playlist.name}”?`)) {
              void library.deletePlaylist(playlist.id);
              navigate('/library', { replace: true });
            }
          }}
        />
      </Sheet>
    </div>
  );
}
