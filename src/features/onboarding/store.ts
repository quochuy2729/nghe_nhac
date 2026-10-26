import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

interface OnboardingState {
  seen: boolean;
  /** true khi người dùng bấm "Xem lại hướng dẫn" trong Cài đặt */
  forced: boolean;
  dismiss: () => void;
  reopen: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: false,
      forced: false,
      dismiss: () => set({ seen: true, forced: false }),
      reopen: () => set({ forced: true }),
    }),
    { name: 'nn-onboarding', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ seen: s.seen }) as OnboardingState },
  ),
);
