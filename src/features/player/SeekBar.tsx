import { useState } from 'react';
import { formatTime } from '@/lib/utils';
import { player, usePlayback } from './store';

export function SeekBar() {
  const currentTime = usePlayback((s) => s.currentTime);
  const duration = usePlayback((s) => s.duration);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? currentTime;
  const max = duration > 0 ? duration : 1;
  const pct = Math.min(100, (value / max) * 100);

  const commit = () => {
    if (drag != null) player.seek(drag);
    setDrag(null);
  };

  return (
    <div className="w-full">
      <input
        type="range"
        aria-label="Tua bài hát"
        aria-valuetext={`${formatTime(value)} / ${formatTime(duration)}`}
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={() => drag != null && commit()}
        className="seek h-11 w-full cursor-pointer appearance-none bg-transparent"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
      <div className="-mt-2 flex justify-between text-xs tabular-nums text-muted">
        <span>{formatTime(value)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
