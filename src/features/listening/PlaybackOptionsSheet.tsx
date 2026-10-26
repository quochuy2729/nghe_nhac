import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { usePlayback, useQueueStore } from '@/features/player/store';
import { platform } from '@/platform';
import { cx } from '@/lib/utils';
import { SLEEP_MINUTES, SPEED_MAX, SPEED_MIN, sleepLabel } from './logic';
import { sleep, useSleep } from './sleep';
import { useListening } from './settings';

/** Tốc độ phát + hẹn giờ tắt (cả hai nền tảng). Mở từ màn Đang phát. */
export function PlaybackOptionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const speed = useListening((s) => s.speed);
  const preserve = useListening((s) => s.preservePitch);
  const setSpeed = useListening((s) => s.setSpeed);
  const setPreserve = useListening((s) => s.setPreservePitch);
  const sleepState = useSleep((s) => s.state);
  const trackId = useQueueStore((s) => s.queue.items[s.queue.index]?.track.id);
  const playing = usePlayback((s) => s.isPlaying);
  const [, force] = useState(0);

  // Làm tươi nhãn "Còn N phút" mỗi giây khi sheet mở.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const caps = platform.caps;
  return (
    <Sheet open={open} onClose={onClose} label="Tốc độ và hẹn giờ">
      {caps.speed && (
        <section className="px-5 pb-4">
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            Tốc độ phát <span className="text-accent">{speed.toFixed(2).replace(/0$/, '')}×</span>
          </h3>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Tốc độ phát"
            className="h-11 w-full accent-[#2dd4bf]"
          />
          <div className="mt-1 flex flex-wrap gap-2">
            {[0.75, 1, 1.25, 1.5, 2].map((x) => (
              <button key={x} type="button" onClick={() => setSpeed(x)} className={cx('chip', speed === x && 'chip-active')}>
                {x}×
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm">
            Giữ cao độ
            <input type="checkbox" className="h-6 w-6 accent-[#2dd4bf]" checked={preserve} onChange={(e) => setPreserve(e.target.checked)} aria-label="Giữ cao độ khi đổi tốc độ" />
          </label>
        </section>
      )}
      {caps.sleepTimer && (
        <section className="px-5 pb-2">
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            Hẹn giờ tắt <span className="text-accent">{sleepLabel(sleepState, Date.now())}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {SLEEP_MINUTES.map((m) => (
              <button key={m} type="button" className="chip" onClick={() => sleep.startMinutes(m)}>
                {m} phút
              </button>
            ))}
            <button type="button" className="chip" disabled={!trackId || !playing} onClick={() => trackId && sleep.startEndOfTrack(trackId)}>
              Hết bài này
            </button>
            <button type="button" className={cx('chip', sleepState.kind === 'off' && 'chip-active')} onClick={() => sleep.cancel()}>
              Tắt hẹn giờ
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {platform.id === 'android' ? 'Âm lượng giảm dần trong 10 giây cuối.' : 'Trên iPhone nhạc dừng đúng giờ nhưng không giảm dần âm lượng.'}
          </p>
        </section>
      )}
      <div className="px-5 pt-2">
        <button type="button" className="chip" onClick={onClose}>
          Xong
        </button>
      </div>
    </Sheet>
  );
}
