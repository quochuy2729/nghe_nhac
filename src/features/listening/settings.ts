/**
 * Cài đặt trải nghiệm nghe (tốc độ, EQ, chuẩn hóa, crossfade): lưu cục bộ, áp xuống engine theo `platform.caps`
 * và đồng bộ giữa các máy qua `user_settings` (docs/ARCHITECTURE.md §4).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { saveUserSettings } from '@/features/sync/localData';
import { safeStorage } from '@/lib/safeStorage';
import { platform } from '@/platform';
import type { AudioEngine, PlatformCaps } from '@/platform/types';
import { clampBands, clampSpeed, EQ_PRESETS, presetFor, type EqPresetId } from './logic';

export interface ListeningValues {
  speed: number;
  preservePitch: boolean;
  eqEnabled: boolean;
  eqBands: number[];
  normalize: boolean;
  crossfadeSec: number;
}

interface ListeningActions {
  setSpeed: (x: number) => void;
  setPreservePitch: (on: boolean) => void;
  setEqEnabled: (on: boolean) => void;
  setEqBands: (bands: number[]) => void;
  setEqPreset: (id: Exclude<EqPresetId, 'custom'>) => void;
  setNormalize: (on: boolean) => void;
  setCrossfade: (sec: number) => void;
}

export const DEFAULTS: ListeningValues = {
  speed: 1,
  preservePitch: true,
  eqEnabled: false,
  eqBands: [0, 0, 0, 0, 0],
  normalize: false,
  crossfadeSec: 0,
};

export const useListening = create<ListeningValues & ListeningActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSpeed: (x) => set({ speed: clampSpeed(x) }),
      setPreservePitch: (preservePitch) => set({ preservePitch }),
      setEqEnabled: (eqEnabled) => set({ eqEnabled }),
      setEqBands: (bands) => set({ eqBands: clampBands(bands), eqEnabled: true }),
      setEqPreset: (id) => set({ eqBands: EQ_PRESETS[id].bands.slice(), eqEnabled: id !== 'flat' }),
      setNormalize: (normalize) => set({ normalize }),
      setCrossfade: (sec) => set({ crossfadeSec: Math.min(12, Math.max(0, Math.round(sec))) }),
    }),
    {
      name: 'nn-listening',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => pick(s) as ListeningValues & ListeningActions,
    },
  ),
);

export const currentEqPreset = (bands: readonly number[]): EqPresetId => presetFor(bands);

export function pick(s: ListeningValues): ListeningValues {
  return {
    speed: s.speed,
    preservePitch: s.preservePitch,
    eqEnabled: s.eqEnabled,
    eqBands: s.eqBands,
    normalize: s.normalize,
    crossfadeSec: s.crossfadeSec,
  };
}

/** Áp giá trị xuống engine; chỉ gọi tính năng mà nền tảng hỗ trợ (`caps`). `prev` chỉ để bỏ qua phần không đổi. */
export async function applyToEngine(engine: AudioEngine, caps: PlatformCaps, v: ListeningValues, prev?: ListeningValues): Promise<void> {
  const changed = <K extends keyof ListeningValues>(k: K) => !prev || JSON.stringify(prev[k]) !== JSON.stringify(v[k]);
  if (caps.speed && (changed('speed') || changed('preservePitch'))) await engine.setSpeed?.(v.speed, v.preservePitch);
  if (caps.eq && (changed('eqBands') || changed('eqEnabled'))) await engine.setEq?.(v.eqBands, v.eqEnabled);
  if (caps.normalize && changed('normalize')) await engine.setNormalize?.(v.normalize);
  if (caps.crossfade && changed('crossfadeSec')) await engine.setCrossfade?.(v.crossfadeSec);
}

/** Dữ liệu từ máy khác (`user_settings.data.listening`) → giá trị hợp lệ, trường nào hỏng thì giữ nguyên. */
export function sanitize(raw: unknown, base: ListeningValues): ListeningValues {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ListeningValues, unknown>>;
  return {
    speed: typeof r.speed === 'number' ? clampSpeed(r.speed) : base.speed,
    preservePitch: typeof r.preservePitch === 'boolean' ? r.preservePitch : base.preservePitch,
    eqEnabled: typeof r.eqEnabled === 'boolean' ? r.eqEnabled : base.eqEnabled,
    eqBands: Array.isArray(r.eqBands) ? clampBands(r.eqBands as number[]) : base.eqBands,
    normalize: typeof r.normalize === 'boolean' ? r.normalize : base.normalize,
    crossfadeSec: typeof r.crossfadeSec === 'number' ? Math.min(12, Math.max(0, Math.round(r.crossfadeSec))) : base.crossfadeSec,
  };
}

let hydrating = false;

/** Máy kia đổi cài đặt: nhận về (không đẩy ngược lên). */
export function hydrateListening(data: Record<string, unknown>): void {
  if (!data.listening) return;
  hydrating = true;
  try {
    useListening.setState(sanitize(data.listening, pick(useListening.getState())));
  } finally {
    hydrating = false;
  }
}

/** Áp cài đặt hiện có khi mở app, rồi theo dõi thay đổi: áp xuống engine và đồng bộ (gộp 1,5 giây). */
export function initListening(): () => void {
  const { engine, caps } = platform;
  let prev: ListeningValues | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const apply = (s: ListeningValues & ListeningActions) => {
    const v = pick(s);
    void applyToEngine(engine, caps, v, prev).catch(() => undefined);
    prev = v;
  };
  apply(useListening.getState());
  const unsub = useListening.subscribe((s) => {
    apply(s);
    if (hydrating) return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveUserSettings({ listening: pick(s) }).catch(() => undefined), 1500);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
