import { Sheet, SheetItem } from '@/components/Sheet';
import { Artwork } from '@/components/Artwork';
import { HeartFilledIcon, HeartIcon, LibraryIcon, DownloadIcon, CheckCircleIcon, PlusIcon, QueueIcon, TrashIcon, UploadIcon } from '@/components/Icons';
import { toast } from '@/components/toast';
import { player } from '@/features/player/store';
import { usePlaylistPicker, useTrackMenu } from './trackMenu';
import { canDownload, downloadTrack, removeDownload, useDownloads } from '@/features/downloads/manager';
import { library, useLibrary } from './store';

export function TrackMenu() {
  const track = useTrackMenu((s) => s.track);
  const playlistId = useTrackMenu((s) => s.playlistId);
  const playlistIndex = useTrackMenu((s) => s.playlistIndex);
  const close = useTrackMenu((s) => s.close);
  const liked = useLibrary((s) => !!track && s.liked.some((t) => t.id === track.id));
  const mode = useLibrary((s) => s.mode);
  const openPicker = usePlaylistPicker((s) => s.open);
  const downloaded = useDownloads((s) => !!track && !!s.ids[track.id]);
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <Sheet open={!!track} onClose={close} label="Tùy chọn bài hát">
      {track && (
        <>
          <div className="flex items-center gap-3 border-b border-white/10 px-5 pb-3">
            <Artwork src={track.artworkUrl} className="h-12 w-12" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{track.title}</p>
              <p className="truncate text-sm text-muted">{track.artist}</p>
            </div>
          </div>
          <SheetItem
            icon={liked ? <HeartFilledIcon size={22} className="text-accent" /> : <HeartIcon size={22} />}
            label={liked ? 'Bỏ khỏi Bài hát đã thích' : 'Thêm vào Bài hát đã thích'}
            onClick={run(() => void library.toggleLike(track))}
          />
          <SheetItem icon={<LibraryIcon size={22} />} label="Thêm vào playlist" onClick={run(() => openPicker([track]))} />
          {playlistId && playlistIndex != null && (
            <SheetItem
              icon={<TrashIcon size={22} />}
              label="Xóa khỏi playlist này"
              onClick={run(() => void library.removeFromPlaylist(playlistId, playlistIndex))}
            />
          )}
          <SheetItem
            icon={<PlusIcon size={22} />}
            label="Phát tiếp theo"
            onClick={run(() => {
              player.playNext([track]);
              toast('Sẽ phát tiếp theo');
            })}
          />
          <SheetItem
            icon={<QueueIcon size={22} />}
            label="Thêm vào hàng đợi"
            onClick={run(() => {
              player.enqueue([track]);
              toast('Đã thêm vào hàng đợi');
            })}
          />
          {canDownload(track) && !downloaded && (
            <SheetItem
              icon={<DownloadIcon size={22} />}
              label="Tải về (nghe offline)"
              onClick={run(() => {
                toast('Đang tải về…');
                downloadTrack(track)
                  .then(() => toast(`Đã tải “${track.title}”`))
                  .catch((e: Error) => e.name !== 'AbortError' && toast(`Không tải được: ${e.message}`));
              })}
            />
          )}
          {downloaded && track.provider !== 'local' && (
            <SheetItem
              icon={<CheckCircleIcon size={22} className="text-accent" />}
              label="Xóa bản tải"
              onClick={run(() => void removeDownload(track))}
            />
          )}
          {track.provider === 'local' && mode === 'cloud' && !track.storagePath && (
            <SheetItem
              icon={<UploadIcon size={22} />}
              label="Tải lên đám mây (nghe trên máy khác)"
              onClick={run(() => {
                toast('Đang tải lên…');
                library
                  .uploadLocal(track)
                  .then(() => toast('Đã đồng bộ file lên đám mây'))
                  .catch((e: Error) => toast(`Upload lỗi: ${e.message}`));
              })}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
