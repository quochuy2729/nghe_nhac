import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

interface RecommendSettings {
  /** Hết hàng đợi thì tự thêm bài tương tự (như radio của Spotify). */
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
  /** "Trộn thông minh": cứ 4 bài chèn thêm 1 bài gợi ý ✨ ngoài danh sách. */
  injectSuggestions: boolean;
  setInjectSuggestions: (on: boolean) => void;
}

export const useRecommendSettings = create<RecommendSettings>()(
  persist(
    (set) => ({
      autoplay: true,
      setAutoplay: (autoplay) => set({ autoplay }),
      injectSuggestions: false,
      setInjectSuggestions: (injectSuggestions) => set({ injectSuggestions }),
    }),
    { name: 'nn-recommend', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ autoplay: s.autoplay, injectSuggestions: s.injectSuggestions }) as RecommendSettings },
  ),
);
