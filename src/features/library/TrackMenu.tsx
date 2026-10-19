import { Sheet, SheetItem } from '@/components/Sheet';
import { Artwork } from '@/components/Artwork';
import { PlusIcon, QueueIcon } from '@/components/Icons';
import { toast } from '@/components/toast';
import { player } from '@/features/player/store';
import { useTrackMenu } from './trackMenu';

export function TrackMenu() {
  const track = useTrackMenu((s) => s.track);
  const close = useTrackMenu((s) => s.close);
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
        </>
      )}
    </Sheet>
  );
}
