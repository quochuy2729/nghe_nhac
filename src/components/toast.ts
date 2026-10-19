import { create } from 'zustand';

interface ToastState {
  message: string | null;
  id: number;
  show: (message: string) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>()((set, get) => ({
  message: null,
  id: 0,
  show: (message) => {
    clearTimeout(timer);
    set({ message, id: get().id + 1 });
    timer = setTimeout(() => set({ message: null }), 2600);
  },
  hide: () => set({ message: null }),
}));

export const toast = (message: string) => useToast.getState().show(message);
