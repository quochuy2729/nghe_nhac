import { create } from 'zustand';
import type { ProviderId } from '@/providers/types';

interface SearchState {
  query: string;
  source: ProviderId | null;
  setQuery: (q: string) => void;
  setSource: (s: ProviderId) => void;
}

/** Giữ từ khóa + nguồn khi chuyển tab để quay lại vẫn còn kết quả. */
export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  source: null,
  setQuery: (query) => set({ query }),
  setSource: (source) => set({ source }),
}));
