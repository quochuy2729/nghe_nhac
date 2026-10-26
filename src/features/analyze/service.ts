/** Nối hàng đợi phân tích với app: thư viện, decoder của nền tảng, pin, trạng thái phát, đồng bộ. */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { usePlayback } from '@/features/player/store';
import { syncNow } from '@/features/sync/start';
import { safeStorage } from '@/lib/safeStorage';
import { platform } from '@/platform';
import { useFolder } from '@/providers/folder';
import { loadFeatures, saveFeatures, useFeatures } from './featuresStore';
import { canRunNow, createAnalysisQueue, type Progress } from './queue';
import { analyzePcm } from './runner';

interface AnalyzeSettings {
  /** Tự phân tích nền khi đủ điều kiện (app mở, pin, không phát nhạc nặng). */
  auto: boolean;
  setAuto: (on: boolean) => void;
}

export const useAnalyzeSettings = create<AnalyzeSettings>()(
  persist((set) => ({ auto: true, setAuto: (auto) => set({ auto }) }), {
    name: 'nn-analyze',
    version: 1,
    storage: createJSONStorage(() => safeStorage),
    partialize: (s) => ({ auto: s.auto }) as AnalyzeSettings,
  }),
);

export const useAnalyze = create<Progress>()(() => ({ total: 0, done: 0, failed: 0, state: 'idle' }));

interface BatteryLike {
  charging: boolean;
  level: number;
}
let battery: BatteryLike | null = null;

let queue: ReturnType<typeof createAnalysisQueue> | null = null;

function getQueue() {
  queue ??= createAnalysisQueue({
    tracks: () => useFolder.getState().tracks,
    has: (id) => useFeatures.getState().map.has(id),
    decode: (t, start, dur) => platform.decoder.decodeSegment(t, start, dur, 22_050),
    analyze: (pcm) => analyzePcm(pcm),
    save: (id, f) => saveFeatures(id, f),
    // Máy kia có thể đã tính: đồng bộ rồi nạp lại trước khi tự tính.
    refreshRemote: async () => {
      await syncNow();
      await loadFeatures();
    },
    canRun: () =>
      canRunNow({
        platform: platform.id,
        appVisible: document.visibilityState === 'visible',
        isPlaying: usePlayback.getState().isPlaying,
        charging: battery?.charging ?? null,
        batteryLevel: battery?.level ?? null,
      }),
    onProgress: (p) => useAnalyze.setState(p),
  });
  return queue;
}

/** Nút "Phân tích ngay": bỏ qua điều kiện pin/phát nhạc. */
export function analyzeNow(): void {
  void getQueue().run(true);
}

export function pauseAnalysis(): void {
  getQueue().pause();
}

function kick() {
  if (!platform.caps.analyze || !useAnalyzeSettings.getState().auto) return;
  if (!useFolder.getState().tracks.length) return;
  void getQueue().run(false);
}

/** Khởi động phân tích nền. Gọi một lần lúc mở app. */
export function initAnalysis(): () => void {
  if (!platform.caps.analyze) return () => undefined;
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  void nav.getBattery?.().then((b) => (battery = b)).catch(() => undefined);

  void loadFeatures().then(() => {
    useAnalyze.setState(getQueue().progress());
    kick();
  });
  let lastCount = useFolder.getState().tracks.length;
  const unsub = useFolder.subscribe((s) => {
    if (s.tracks.length === lastCount) return;
    lastCount = s.tracks.length;
    useAnalyze.setState(getQueue().progress());
    kick();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(kick, 60_000);
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(timer);
  };
}
