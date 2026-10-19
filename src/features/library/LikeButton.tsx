import { HeartFilledIcon, HeartIcon } from '@/components/Icons';
import type { Track } from '@/providers/types';
import { cx } from '@/lib/utils';
import { library, useLibrary } from './store';

export function LikeButton({ track, size = 24, className }: { track: Track; size?: number; className?: string }) {
  const liked = useLibrary((s) => s.liked.some((t) => t.id === track.id));
  return (
    <button
      type="button"
      aria-label={liked ? 'Bỏ khỏi Bài hát đã thích' : 'Thêm vào Bài hát đã thích'}
      aria-pressed={liked}
      onClick={(e) => {
        e.stopPropagation();
        void library.toggleLike(track);
      }}
      className={cx('icon-btn', liked ? 'text-accent' : 'text-white/80', className)}
    >
      {liked ? <HeartFilledIcon size={size} /> : <HeartIcon size={size} />}
    </button>
  );
}
