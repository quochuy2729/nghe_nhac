import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

interface RecommendSettings {
  /** Hết hàng đợi thì tự thêm bài tương tự (như radio của Spotify). */
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
}

export const useRecommendSettings = create<RecommendSettings>()(
  persist(
    (set) => ({ autoplay: true, setAutoplay: (autoplay) => set({ autoplay }) }),
    { name: 'nn-recommend', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ autoplay: s.autoplay }) as RecommendSettings },
  ),
);
