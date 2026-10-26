import { create } from 'zustand';

interface SearchState {
  query: string;
  setQuery: (q: string) => void;
}

/** Giữ từ khóa khi chuyển tab để quay lại vẫn còn kết quả. */
export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}));
