import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Track } from '@/providers/types';
import * as Q from './queue';
import { getAudio, unlockAudio } from './audio';
import { resolvePlayableUrl } from './resolve';
import {
  registerMediaHandlers,
  setMediaMetadata,
  setMediaPlaybackState,
  setMediaPosition,
} from './mediaSession';

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // hết dung lượng: bỏ qua, hàng đợi chỉ không được khôi phục lần sau
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

const MAX_INLINE_ART = 4096;

function slimItem(it: Q.QueueItem): Q.QueueItem {
  const art = it.track.artworkUrl;
  if (!art || !art.startsWith('data:') || art.length <= MAX_INLINE_ART) return it;
  return { ...it, track: { ...it.track, artworkUrl: undefined } };
}

function slimQueue(q: Q.QueueState): Q.QueueState {
  const map = new Map(q.original.map((it) => [it.uid, slimItem(it)]));
  return { ...q, original: q.original.map((it) => map.get(it.uid)!), items: q.items.map((it) => map.get(it.uid) ?? slimItem(it)) };
}

/** Trạng thái hàng đợi — được lưu localStorage để mở lại app vẫn còn. */
interface QueueStore {
  queue: Q.QueueState;
  /** Ngữ cảnh phát, vd "Kết quả tìm kiếm", tên playlist. */
  context: string;
  setQueue: (queue: Q.QueueState, context?: string) => void;
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set) => ({
      queue: Q.emptyQueue,
      context: '',
      setQueue: (queue, context) => set((s) => ({ queue, context: context ?? s.context })),
    }),
    {
      name: 'nn-queue',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Ảnh bìa dạng data: lớn (file local) có thể làm đầy localStorage → bỏ khi lưu.
      partialize: (s) => ({ queue: slimQueue(s.queue), context: s.context }) as QueueStore,
    },
  ),
);

/** Trạng thái phát (không lưu) — cập nhật liên tục từ <audio>. */
interface PlaybackStore {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  loadedUid: string | null;
}

export const usePlayback = create<PlaybackStore>()(() => ({
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  error: null,
  loadedUid: null,
}));

const POS_KEY = 'nn-position';
let loadToken = 0;

function savePosition() {
  const { loadedUid, currentTime } = usePlayback.getState();
  try {
    if (loadedUid) localStorage.setItem(POS_KEY, JSON.stringify({ uid: loadedUid, t: currentTime }));
  } catch {
    // localStorage đầy/không khả dụng
  }
}

function savedPositionFor(uid: string): number {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return 0;
    const p = JSON.parse(raw) as { uid: string; t: number };
    return p.uid === uid ? p.t : 0;
  } catch {
    return 0;
  }
}

function current(): Q.QueueItem | undefined {
  return Q.currentItem(useQueueStore.getState().queue);
}

async function loadCurrent(autoplay: boolean, startAt = 0): Promise<void> {
  const item = current();
  const audio = getAudio();
  const token = ++loadToken;
  if (!item) {
    audio.pause();
    audio.removeAttribute('src');
    usePlayback.setState({ isPlaying: false, loadedUid: null, currentTime: 0, duration: 0 });
    setMediaMetadata(undefined);
    setMediaPlaybackState('none');
    return;
  }
  usePlayback.setState({
    isLoading: true,
    error: null,
    loadedUid: item.uid,
    currentTime: startAt,
    duration: item.track.durationSec,
  });
  setMediaMetadata(item.track);
  try {
    const url = await resolvePlayableUrl(item.track);
    if (token !== loadToken) return;
    audio.src = url;
    if (startAt > 0) audio.currentTime = startAt;
    if (autoplay) await audio.play();
  } catch (err) {
    if (token !== loadToken) return;
    if (autoplay && skipUnavailableWhenOffline()) return;
    const name = (err as DOMException)?.name;
    // NotAllowedError: trình duyệt chặn autoplay — chờ người dùng bấm play.
    // AbortError: một lần load mới đã thay thế lần này.
    if (name !== 'NotAllowedError' && name !== 'AbortError') {
      usePlayback.setState({ error: messageOf(err) });
    }
    usePlayback.setState({ isPlaying: false, isLoading: false });
  }
}

let offlineSkips = 0;

/** Mất mạng: bỏ qua bài chưa tải, chuyển sang bài kế tiếp (tối đa một vòng hàng đợi). */
function skipUnavailableWhenOffline(): boolean {
  if (typeof navigator === 'undefined' || navigator.onLine) return false;
  const { queue } = useQueueStore.getState();
  if (offlineSkips >= queue.items.length - 1) {
    offlineSkips = 0;
    return false;
  }
  offlineSkips += 1;
  const step = Q.next({ ...queue, repeat: queue.repeat === 'one' ? 'all' : queue.repeat });
  if (step.action !== 'play') return false;
  useQueueStore.getState().setQueue(step.state);
  void loadCurrent(true);
  return true;
}

function messageOf(err: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Mất kết nối mạng. Hãy phát bài đã tải về.';
  if (err instanceof Error) return err.message;
  return 'Không phát được bài này.';
}

function applyStep(step: Q.Step) {
  useQueueStore.getState().setQueue(step.state);
  const audio = getAudio();
  if (step.action === 'restart') {
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    return;
  }
  if (step.action === 'play') {
    void loadCurrent(true);
    return;
  }
  // stop
  void loadCurrent(false);
}

export const player = {
  /** Phát danh sách từ vị trí `index` (gọi trực tiếp trong handler chạm). */
  playTracks(tracks: Track[], index = 0, context = '', opts: { shuffle?: boolean } = {}) {
    unlockAudio();
    if (!tracks.length) return;
    const { queue } = useQueueStore.getState();
    const shuffle = opts.shuffle ?? queue.shuffle;
    const start = opts.shuffle ? Math.floor(Math.random() * tracks.length) : index;
    const q = Q.createQueue(tracks, start, { shuffle, repeat: queue.repeat });
    useQueueStore.getState().setQueue(q, context);
    void loadCurrent(true);
  },

  togglePlay() {
    unlockAudio();
    const item = current();
    if (!item) return;
    const audio = getAudio();
    const { loadedUid } = usePlayback.getState();
    if (loadedUid !== item.uid || !audio.src) {
      void loadCurrent(true, savedPositionFor(item.uid));
      return;
    }
    if (audio.paused) void audio.play().catch((e) => usePlayback.setState({ error: messageOf(e) }));
    else audio.pause();
  },

  play() {
    if (getAudio().paused) player.togglePlay();
  },

  pause() {
    getAudio().pause();
  },

  next() {
    applyStep(Q.next(useQueueStore.getState().queue));
  },

  previous() {
    applyStep(Q.prev(useQueueStore.getState().queue, getAudio().currentTime || 0));
  },

  seek(sec: number) {
    const audio = getAudio();
    const dur = usePlayback.getState().duration || audio.duration || 0;
    const t = Math.max(0, Math.min(sec, dur || sec));
    if (!audio.src || usePlayback.getState().loadedUid !== current()?.uid) {
      // Chưa nạp bài (vd vừa mở lại app): nạp rồi tua.
      void loadCurrent(false, t);
      return;
    }
    audio.currentTime = t;
    usePlayback.setState({ currentTime: t });
    setMediaPosition(dur, t, audio.playbackRate);
  },

  seekBy(delta: number) {
    player.seek((getAudio().currentTime || 0) + delta);
  },

  toggleShuffle() {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.setShuffle(queue, !queue.shuffle));
  },

  cycleRepeat() {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue({ ...queue, repeat: Q.nextRepeatMode(queue.repeat) });
  },

  jumpTo(uid: string) {
    unlockAudio();
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.jumpTo(queue, uid));
    void loadCurrent(true);
  },

  playNext(tracks: Track[]) {
    const { queue, setQueue } = useQueueStore.getState();
    const wasEmpty = queue.items.length === 0;
    setQueue(Q.playNext(queue, tracks));
    if (wasEmpty) void loadCurrent(false);
  },

  enqueue(tracks: Track[]) {
    const { queue, setQueue } = useQueueStore.getState();
    const wasEmpty = queue.items.length === 0;
    setQueue(Q.enqueue(queue, tracks));
    if (wasEmpty) void loadCurrent(false);
  },

  remove(uid: string) {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.removeItem(queue, uid));
  },

  move(from: number, to: number) {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.moveItem(queue, from, to));
  },

  clearError() {
    usePlayback.setState({ error: null });
  },
};

let initialized = false;

/** Gắn listener cho <audio> + Media Session. Gọi một lần khi app khởi động. */
export function initPlayer(): void {
  if (initialized) return;
  initialized = true;
  const audio = getAudio();

  audio.addEventListener('play', () => {
    usePlayback.setState({ isPlaying: true });
    setMediaPlaybackState('playing');
  });
  audio.addEventListener('pause', () => {
    usePlayback.setState({ isPlaying: false });
    setMediaPlaybackState('paused');
    savePosition();
  });
  audio.addEventListener('playing', () => {
    offlineSkips = 0;
    usePlayback.setState({ isLoading: false, error: null });
  });
  audio.addEventListener('waiting', () => usePlayback.setState({ isLoading: true }));
  audio.addEventListener('canplay', () => usePlayback.setState({ isLoading: false }));
  audio.addEventListener('timeupdate', () => {
    usePlayback.setState({ currentTime: audio.currentTime });
  });
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      usePlayback.setState({ duration: audio.duration });
      setMediaPosition(audio.duration, audio.currentTime, audio.playbackRate);
    }
  });
  audio.addEventListener('seeked', () => {
    setMediaPosition(audio.duration, audio.currentTime, audio.playbackRate);
  });
  audio.addEventListener('ended', () => {
    applyStep(Q.next(useQueueStore.getState().queue, { auto: true }));
  });
  audio.addEventListener('error', () => {
    // Bỏ qua lỗi khi src rỗng (vd lúc reset).
    if (!audio.currentSrc || audio.currentSrc.startsWith('data:')) return;
    usePlayback.setState({ isPlaying: false, isLoading: false, error: messageOf(audio.error) });
  });

  registerMediaHandlers({
    play: () => player.play(),
    pause: () => player.pause(),
    previous: () => player.previous(),
    next: () => player.next(),
    seekTo: (t) => player.seek(t),
    seekBy: (d) => player.seekBy(d),
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePosition();
  });
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  // Khôi phục metadata lock screen + thời lượng cho bài cuối cùng.
  const item = current();
  if (item) {
    usePlayback.setState({ duration: item.track.durationSec, currentTime: savedPositionFor(item.uid) });
    setMediaMetadata(item.track);
  }
}
