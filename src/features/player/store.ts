import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import type { Track } from '@/providers/types';
import * as Q from './queue';
import { resolvePlayableUrl } from './resolve';
import { platform } from '@/platform';
import { createListenTracker, useHistory } from '@/features/recommend/history';
import { autoplayTracks, currentSignals, similarForTrack } from '@/features/recommend/radio';
import { recommend } from '@/features/recommend/engine';
import { smartShuffle } from '@/features/recommend/smartShuffle';
import { useRecommendSettings } from '@/features/recommend/settings';
import { library, useLibrary } from '@/features/library/store';
import { itemsAfter, needsTopUp, upcomingItems, WINDOW_AHEAD } from './window';
import { useFeatures } from '@/features/analyze/featuresStore';
import { trackGainDb, shouldRemember } from '@/features/listening/logic';
import { forgetPosition, getResumeSec, loadResume, rememberPosition } from '@/features/listening/resume';
import { sleep, sleepShouldStop } from '@/features/listening/sleep';

const engine = platform.engine;
/** Engine native tự chuyển bài trong "cửa sổ" và tự ghi lượt nghe → JS không đo thời gian nghe nữa. */
const managed = engine.managesQueue === true;

/** Ghi lại mỗi lần nghe (nghe hết / bỏ qua) để gợi ý theo gu. */
const tracker = managed
  ? { begin: () => undefined, tick: () => undefined, setDuration: () => undefined, end: () => undefined }
  : createListenTracker((id, sec, dur) => useHistory.getState().record(id, sec, dur));

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

/** uid các bài engine native đang giữ (phản chiếu playlist native) + vị trí bài đang phát trong đó. */
let windowUids: string[] = [];
let windowIdx = -1;

interface Resolved {
  uid: string;
  track: Track;
  url: string;
  /** chuẩn hóa âm lượng (dB); native chỉ áp khi người dùng bật */
  gainDb?: number;
}

function gainFor(track: Track): number | undefined {
  if (!platform.caps.normalize) return undefined;
  return trackGainDb({ replayGainDb: track.replayGainDb, loudnessDb: useFeatures.getState().map.get(track.id)?.loudnessDb });
}

/** Bài không có trên máy (mất quyền, đã xóa) thì bỏ khỏi cửa sổ thay vì làm hỏng cả lô. */
async function resolveItems(items: Q.QueueItem[]): Promise<Resolved[]> {
  const out: Resolved[] = [];
  for (const it of items) {
    try {
      out.push({ uid: it.uid, track: it.track, url: await resolvePlayableUrl(it.track), gainDb: gainFor(it.track) });
    } catch {
      // bỏ qua
    }
  }
  return out;
}

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
  // Bài dài (podcast/mix): mở lại thì phát tiếp từ chỗ cũ.
  if (item && startAt === 0) startAt = getResumeSec(item.track.id, item.track.durationSec);
  // Bài đã nằm sẵn trong cửa sổ native → nhảy thẳng, không dựng lại playlist (không bị ngắt tiếng).
  const jumpIdx = item && managed && engineReady ? windowUids.indexOf(item.uid) : -1;
  engineReady = false;
  tracker.end();
  if (item) tracker.begin(item.track.id, item.track.durationSec);
  if (!item) {
    windowUids = [];
    windowIdx = -1;
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
    if (jumpIdx >= 0) {
      windowIdx = jumpIdx;
      await engine.skipTo(jumpIdx);
      if (startAt > 0) await engine.seek(startAt);
    } else {
      const first = await resolvePlayableUrl(item.track);
      const firstGain = gainFor(item.track);
      const rest = managed ? await resolveItems(upcomingItems(useQueueStore.getState().queue)) : [];
      if (token !== loadToken) return;
      // Cập nhật bản đồ TRƯỚC khi gọi native: sự kiện trackChanged có thể tới ngay sau setWindow.
      windowUids = [item.uid, ...rest.map((r) => r.uid)];
      windowIdx = 0;
      await engine.setWindow([{ track: item.track, url: first, gainDb: firstGain }, ...rest], 0, startAt);
    }
    if (token !== loadToken) return;
    engineReady = true;
    syncLiked();
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

/** Báo native trạng thái thích của bài đang phát (nút ♥ trên notification). */
function syncLiked() {
  const t = current()?.track;
  if (t) void engine.setLiked?.(library.isLiked(t.id)).catch(() => undefined);
}

/** Hàng đợi vừa đổi (phát tiếp theo, xóa, sắp xếp, xáo, lặp): cập nhật các bài sau bài đang phát ở native. */
async function resyncUpcoming(): Promise<void> {
  if (!managed || !engineReady) return;
  const cur = current();
  const idx = windowIdx;
  if (!cur || windowUids[idx] !== cur.uid) return;
  const up = await resolveItems(upcomingItems(useQueueStore.getState().queue));
  if (windowIdx !== idx || windowUids[idx] !== cur.uid) return; // trong lúc chờ đã đổi bài
  windowUids = [...windowUids.slice(0, idx + 1), ...up.map((u) => u.uid)];
  await engine.setUpcoming?.(up);
}

/** Sắp lại các bài sau bài đang phát theo "trộn thông minh" (đặc trưng âm thanh + gu nghe), có thể chèn ✨. */
function smartOrder(queue: Q.QueueState): Q.QueueState {
  const cur = Q.currentItem(queue);
  const upcoming = queue.items.filter((it) => it.uid !== cur?.uid && !it.suggested);
  const sig = currentSignals();
  const affinity = new Map(recommend(sig, { limit: sig.library.length }).map((x) => [x.track.id, x.score]));
  const inject = useRecommendSettings.getState().injectSuggestions
    ? recommend(sig, { limit: 24, exclude: new Set(queue.items.map((it) => it.track.id)) }).map((x) => x.track)
    : undefined;
  const { tracks, suggestedIds } = smartShuffle(
    upcoming.map((it) => it.track),
    { features: sig.features, score: (t) => Math.max(0, affinity.get(t.id) ?? 0), inject },
  );
  const byTrack = new Map(upcoming.map((it) => [it.track.id, it]));
  const items = tracks.map((t) =>
    suggestedIds.has(t.id) ? { uid: Q.makeUid(), track: t, suggested: true } : (byTrack.get(t.id) as Q.QueueItem),
  );
  return Q.applySmartOrder(queue, items);
}

let toppingUp = false;

/** Còn ≤ 5 bài trong cửa sổ thì đẩy thêm (hết hàng đợi thì nối bài tương tự nếu bật "tự phát"). */
async function topUpWindow(): Promise<void> {
  if (!managed || toppingUp) return;
  let queue = useQueueStore.getState().queue;
  if (!needsTopUp(windowUids.length, windowIdx, queue.repeat)) return;
  toppingUp = true;
  try {
    const need = WINDOW_AHEAD - (windowUids.length - 1 - windowIdx);
    const lastUid = windowUids[windowUids.length - 1];
    let more = itemsAfter(queue, lastUid, need);
    if (!more.length && useRecommendSettings.getState().autoplay) {
      const seed = Q.currentItem(queue)?.track;
      const extra = seed ? autoplayTracks(seed, queue.items.map((it) => it.track.id)) : [];
      if (extra.length) {
        queue = Q.enqueue(queue, extra);
        useQueueStore.getState().setQueue(queue);
        more = itemsAfter(queue, lastUid, need);
      }
    }
    if (!more.length) return;
    const resolved = await resolveItems(more);
    if (windowUids[windowUids.length - 1] !== lastUid) return; // cửa sổ đã bị dựng lại
    windowUids = [...windowUids, ...resolved.map((r) => r.uid)];
    await engine.appendWindow?.(resolved);
  } finally {
    toppingUp = false;
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
    void resyncUpcoming();
  },

  /** Xoay vòng: Tắt → Trộn → Trộn thông minh → Tắt. */
  cycleShuffle() {
    const { queue, setQueue } = useQueueStore.getState();
    if (!queue.shuffle) {
      setQueue(Q.setShuffle(queue, true));
    } else if (!queue.smart) {
      setQueue(smartOrder(queue));
    } else {
      setQueue(Q.setShuffle(queue, false));
    }
    void resyncUpcoming();
  },

  cycleRepeat() {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue({ ...queue, repeat: Q.nextRepeatMode(queue.repeat) });
    void resyncUpcoming();
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
    else void resyncUpcoming();
  },

  enqueue(tracks: Track[]) {
    const { queue, setQueue } = useQueueStore.getState();
    const wasEmpty = queue.items.length === 0;
    setQueue(Q.enqueue(queue, tracks));
    if (wasEmpty) void loadCurrent(false);
    else void resyncUpcoming();
  },

  remove(uid: string) {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.removeItem(queue, uid));
    void resyncUpcoming();
  },

  move(from: number, to: number) {
    const { queue, setQueue } = useQueueStore.getState();
    setQueue(Q.moveItem(queue, from, to));
    void resyncUpcoming();
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
  void loadResume();

  engine.on((e) => {
    switch (e.type) {
      case 'state': {
        usePlayback.setState({ isPlaying: e.playing, isLoading: e.buffering });
        if (e.playing && !e.buffering) {
          offlineSkips = 0;
          usePlayback.setState({ error: null });
        }
        if (!e.playing) {
          savePosition();
          const cur = current();
          if (cur) rememberPosition(cur.track.id, usePlayback.getState().currentTime, usePlayback.getState().duration || cur.track.durationSec, Date.now(), 0);
        }
        break;
      }
      case 'position': {
        usePlayback.setState({ currentTime: e.sec });
        if (e.durationSec > 0) usePlayback.setState({ duration: e.durationSec });
        tracker.tick(e.sec);
        {
          const cur = current();
          if (cur) {
            const dur = e.durationSec || cur.track.durationSec;
            if (shouldRemember(dur)) rememberPosition(cur.track.id, e.sec, dur);
            if (sleepShouldStop({ trackId: cur.track.id })) player.pause();
          }
        }
        if (e.durationSec > 0) tracker.setDuration(e.durationSec);
        break;
      }
      case 'ended': {
        tracker.end();
        const cur = current();
        if (cur) forgetPosition(cur.track.id);
        // Hẹn giờ "hết bài này" (web): dừng ở đây, không sang bài kế.
        if (sleepShouldStop({ trackId: cur?.track.id ?? null, ended: true })) {
          usePlayback.setState({ isPlaying: false });
          break;
        }
        applyStep(nextStep(true));
        break;
      }
      case 'sleep':
        if (!e.active) sleep.nativeFinished();
        break;
      case 'error':
        usePlayback.setState({ isPlaying: false, isLoading: false, error: e.message });
        break;
      case 'remote':
        if (e.action === 'play') player.play();
        else if (e.action === 'pause') player.pause();
        else if (e.action === 'prev') player.previous();
        else if (e.action === 'toggleLike') {
          const t = current()?.track;
          if (t) void library.toggleLike(t);
        } else player.next();
        break;
      case 'trackChanged': {
        // Chỉ engine native tự chuyển bài (khi tắt màn hình, nút tai nghe, notification); web thì store là chủ hàng đợi.
        if (!managed) break;
        const uid = windowUids[e.index];
        if (!uid) break;
        windowIdx = e.index;
        const { queue, setQueue } = useQueueStore.getState();
        if (Q.currentItem(queue)?.uid !== uid && queue.items.some((it) => it.uid === uid)) setQueue(Q.jumpTo(queue, uid));
        const it = current();
        if (it) usePlayback.setState({ loadedUid: it.uid, duration: it.track.durationSec, currentTime: 0, error: null });
        syncLiked();
        void topUpWindow();
        break;
      }
      case 'history':
        // Lượt nghe do native đo (kể cả lúc app ở nền): ghi với đúng thời điểm kết thúc.
        for (const h of e.events) useHistory.getState().record(h.trackId, h.playedSec, h.durationSec, h.endedAt);
        break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePosition();
  });
  if (managed) useLibrary.subscribe(syncLiked);

  // Khôi phục thời lượng + vị trí cho bài cuối cùng.
  const item = current();
  if (item) usePlayback.setState({ duration: item.track.durationSec, currentTime: savedPositionFor(item.uid) });
}
