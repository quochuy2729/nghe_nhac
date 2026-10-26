import { create } from 'zustand';

interface TagEditorState {
  ids: string[];
  open: (ids: string[]) => void;
  close: () => void;
}

/** Danh sách bài đang được sửa tag (rỗng = đóng). */
export const useTagEditor = create<TagEditorState>()((set) => ({
  ids: [],
  open: (ids) => set({ ids }),
  close: () => set({ ids: [] }),
}));
