import { CollectionHeader } from '@/components/CollectionHeader';
import { TrackList } from '@/components/TrackList';
import { HeartFilledIcon } from '@/components/Icons';
import { useLibrary } from '@/features/library/store';
import { player } from '@/features/player/store';

export function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  const status = useLibrary((s) => s.status);
  const ctx = 'Bài hát đã thích';
  return (
    <div>
      <CollectionHeader
        title={ctx}
        subtitle={`${liked.length} bài`}
        gradient="#4338ca"
        cover={
          <span className="flex h-48 w-48 items-center justify-center rounded bg-gradient-to-br from-indigo-600 to-teal-300 shadow-2xl">
            <HeartFilledIcon size={72} />
          </span>
        }
        onPlay={liked.length ? () => player.playTracks(liked, 0, ctx, { shuffle: false }) : undefined}
        onShuffle={liked.length ? () => player.playTracks(liked, 0, ctx, { shuffle: true }) : undefined}
      />
      {liked.length === 0 && status !== 'loading' ? (
        <p className="px-4 py-10 text-center text-sm text-muted">Chạm ♡ ở một bài để lưu vào đây.</p>
      ) : (
        <TrackList tracks={liked} context={ctx} />
      )}
    </div>
  );
}
