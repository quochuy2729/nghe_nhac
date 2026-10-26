import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import type { Track } from '@/providers/types';
import * as Q from './queue';
import { resolvePlayableUrl } from './resolve';
import { platform } from '@/platform';
import { createListenTracker, useHistory } from '@/features/recommend/history';
import { autoplayTracks, similarForTrack } from '@/features/recommend/radio';
import { useRecommendSettings } from '@/features/recommend/settings';

/** Ghi lại mỗi lần nghe (nghe hết / bỏ qua) để gợi ý theo gu. */
const tracker = createListenTracker((id, sec, dur) => useHistory.getState().record(id, sec, dur));

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

/** Trạng thái phát (không lưu) — cập nhật liên tục từ sự kiện của engine. */
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
/** Engine đã nhận bài của `loadedUid` (đã gọi setWindow xong) — thay cho việc kiểm tra `audio.src`. */
let engineReady = false;

const engine = platform.engine;

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
  const token = ++loadToken;
  engineReady = false;
  tracker.end();
  if (item) tracker.begin(item.track.id, item.track.durationSec);
  if (!item) {
    await engine.setWindow([], -1);
    usePlayback.setState({ isPlaying: false, loadedUid: null, currentTime: 0, duration: 0 });
    return;
  }
  usePlayback.setState({
    isLoading: true,
    error: null,
    loadedUid: item.uid,
    currentTime: startAt,
    duration: item.track.durationSec,
  });
  try {
    const url = await resolvePlayableUrl(item.track);
    if (token !== loadToken) return;
    await engine.setWindow([{ track: item.track, url }], 0, startAt);
    engineReady = true;
    if (autoplay) await engine.play();
  } catch (err) {
    if (token !== loadToken) return;
    if (autoplay && skipUnavailable()) return;
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

/** Bài không có trên máy này (vd playlist đồng bộ từ máy khác): bỏ qua, sang bài kế tiếp (tối đa một vòng hàng đợi). */
function skipUnavailable(): boolean {
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
  if (err instanceof Error) return err.message;
  return 'Không phát được bài này.';
}

/**
 * Bước kế tiếp; hết hàng đợi mà bật "tự phát tương tự" thì nối thêm bài giống bài vừa nghe.
 */
function nextStep(auto: boolean): Q.Step {
  const queue = useQueueStore.getState().queue;
  const step = Q.next(queue, { auto });
  if (step.action !== 'stop' || !queue.items.length || !useRecommendSettings.getState().autoplay) return step;
  const seed = Q.currentItem(queue)?.track;
  const more = seed ? autoplayTracks(seed, queue.items.map((it) => it.track.id)) : [];
  return more.length ? Q.next(Q.enqueue(queue, more), { auto }) : step;
}

function applyStep(step: Q.Step) {
  useQueueStore.getState().setQueue(step.state);
  if (step.action === 'restart') {
    tracker.end();
    const t = current()?.track;
    if (t) tracker.begin(t.id, t.durationSec);
    void engine.seek(0);
    void engine.play().catch(() => undefined);
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
    engine.unlock?.();
    if (!tracks.length) return;
    const { queue } = useQueueStore.getState();
    const shuffle = opts.shuffle ?? queue.shuffle;
    const start = opts.shuffle ? Math.floor(Math.random() * tracks.length) : index;
    const q = Q.createQueue(tracks, start, { shuffle, repeat: queue.repeat });
    useQueueStore.getState().setQueue(q, context);
    void loadCurrent(true);
  },

  togglePlay() {
    engine.unlock?.();
    const item = current();
    if (!item) return;
    const { loadedUid, isPlaying } = usePlayback.getState();
    if (loadedUid !== item.uid || !engineReady) {
      void loadCurrent(true, savedPositionFor(item.uid));
      return;
    }
    if (isPlaying) void engine.pause();
    else void engine.play().catch((e) => usePlayback.setState({ error: messageOf(e) }));
  },

  play() {
    if (!usePlayback.getState().isPlaying) player.togglePlay();
  },

  pause() {
    void engine.pause();
  },

  next() {
    applyStep(nextStep(false));
  },

  /** Phát một bài rồi nối tiếp các bài giống nó nhất. */
  playRadio(seed: Track) {
    const similar = similarForTrack(seed);
    player.playTracks([seed, ...similar], 0, `Radio · ${seed.title}`, { shuffle: false });
  },

  previous() {
    applyStep(Q.prev(useQueueStore.getState().queue, engine.getPosition()));
  },

  seek(sec: number) {
    const dur = usePlayback.getState().duration;
    const t = Math.max(0, Math.min(sec, dur || sec));
    if (!engineReady || usePlayback.getState().loadedUid !== current()?.uid) {
      // Chưa nạp bài (vd vừa mở lại app): nạp rồi tua.
      void loadCurrent(false, t);
      return;
    }
    void engine.seek(t);
    usePlayback.setState({ currentTime: t });
  },

  seekBy(delta: number) {
    player.seek(engine.getPosition() + delta);
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
    engine.unlock?.();
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

/** Nghe sự kiện của engine (phát/dừng, vị trí, hết bài, lỗi, điều khiển từ màn hình khóa). Gọi một lần khi khởi động. */
export function initPlayer(): void {
  if (initialized) return;
  initialized = true;

  engine.on((e) => {
    switch (e.type) {
      case 'state': {
        usePlayback.setState({ isPlaying: e.playing, isLoading: e.buffering });
        if (e.playing && !e.buffering) {
          offlineSkips = 0;
          usePlayback.setState({ error: null });
        }
        if (!e.playing) savePosition();
        break;
      }
      case 'position': {
        usePlayback.setState({ currentTime: e.sec });
        if (e.durationSec > 0) usePlayback.setState({ duration: e.durationSec });
        tracker.tick(e.sec);
        if (e.durationSec > 0) tracker.setDuration(e.durationSec);
        break;
      }
      case 'ended':
        tracker.end();
        applyStep(nextStep(true));
        break;
      case 'error':
        usePlayback.setState({ isPlaying: false, isLoading: false, error: e.message });
        break;
      case 'remote':
        if (e.action === 'play') player.play();
        else if (e.action === 'pause') player.pause();
        else if (e.action === 'prev') player.previous();
        else player.next();
        break;
      case 'trackChanged':
        // Chỉ engine native mới tự chuyển bài (G3); web thì store là chủ hàng đợi.
        break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePosition();
  });

  // Khôi phục thời lượng + vị trí cho bài cuối cùng.
  const item = current();
  if (item) usePlayback.setState({ duration: item.track.durationSec, currentTime: savedPositionFor(item.uid) });
}
