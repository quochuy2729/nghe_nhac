import { NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon } from '@/components/Icons';
import { cx } from '@/lib/utils';
import { player, usePlayback, useQueueStore } from './store';

export function PlayPauseButton({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  const isLoading = usePlayback((s) => s.isLoading);
  const hasTrack = useQueueStore((s) => s.queue.items.length > 0);
  const Icon = isPlaying ? PauseIcon : PlayIcon;
  const big = size === 'lg';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        player.togglePlay();
      }}
      disabled={!hasTrack}
      aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
      className={cx(
        'icon-btn relative',
        big ? 'h-16 w-16 bg-white text-black' : 'h-11 w-11 text-white',
      )}
    >
      <Icon size={big ? 28 : 24} />
      {isLoading && isPlaying && (
        <span className={cx('absolute inset-0 animate-spin rounded-full border-2 border-transparent', big ? 'border-t-accent' : 'border-t-white/70')} />
      )}
    </button>
  );
}

export function TransportControls() {
  const shuffle = useQueueStore((s) => s.queue.shuffle);
  const repeat = useQueueStore((s) => s.queue.repeat);
  const hasTrack = useQueueStore((s) => s.queue.items.length > 0);
  const repeatLabel = repeat === 'off' ? 'Lặp lại: tắt' : repeat === 'all' ? 'Lặp lại: tất cả' : 'Lặp lại: một bài';

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => player.toggleShuffle()}
        aria-label={shuffle ? 'Tắt trộn bài' : 'Bật trộn bài'}
        aria-pressed={shuffle}
        className={cx('icon-btn relative', shuffle ? 'text-accent' : 'text-white/80')}
      >
        <ShuffleIcon size={22} />
        {shuffle && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
      </button>
      <button type="button" onClick={() => player.previous()} disabled={!hasTrack} aria-label="Bài trước" className="icon-btn h-14 w-14">
        <PrevIcon size={30} />
      </button>
      <PlayPauseButton />
      <button type="button" onClick={() => player.next()} disabled={!hasTrack} aria-label="Bài tiếp theo" className="icon-btn h-14 w-14">
        <NextIcon size={30} />
      </button>
      <button
        type="button"
        onClick={() => player.cycleRepeat()}
        aria-label={repeatLabel}
        className={cx('icon-btn relative', repeat !== 'off' ? 'text-accent' : 'text-white/80')}
      >
        <RepeatIcon size={22} />
        {repeat === 'one' && (
          <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-black">1</span>
        )}
        {repeat !== 'off' && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
      </button>
    </div>
  );
}
