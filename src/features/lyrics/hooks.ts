import { useEffect, useRef, useState } from 'react';
import type { Track } from '@/providers/types';
import { platform } from '@/platform';
import { activeLineIndex, type LrcLine } from './lrc';
import { loadLyrics, type Lyrics } from './service';

export function useLyrics(track: Track | undefined) {
  const [state, setState] = useState<{ id?: string; lyrics?: Lyrics; error?: string; loading: boolean }>({ loading: false });
  const [tick, setTick] = useState(0);
  const id = track?.id;

  useEffect(() => {
    if (!track) {
      setState({ loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState({ id: track.id, loading: true });
    loadLyrics(track, ctrl.signal)
      .then((lyrics) => !ctrl.signal.aborted && setState({ id: track.id, lyrics, loading: false }))
      .catch((e: Error) => !ctrl.signal.aborted && setState({ id: track.id, error: e.message, loading: false }));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  return {
    lyrics: state.id === id ? state.lyrics : undefined,
    error: state.id === id ? state.error : undefined,
    loading: state.loading || state.id !== id,
    reload: () => setTick((t) => t + 1),
  };
}

/** Dòng đang hát: đọc vị trí phát từ engine mỗi frame (độ trễ < 1 frame ≈ 16ms). */
export function useActiveLine(lines: readonly LrcLine[]): number {
  const [active, setActive] = useState(-1);
  const last = useRef(-1);

  useEffect(() => {
    if (!lines.length) return;
    let raf = 0;
    const tick = () => {
      const i = activeLineIndex(lines, platform.engine.getPosition() * 1000);
      if (i !== last.current) {
        last.current = i;
        setActive(i);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [lines]);

  return active;
}
