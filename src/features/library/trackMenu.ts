import { create } from 'zustand';
import type { Track } from '@/providers/types';

interface TrackMenuState {
  track: Track | null;
  /** Playlist đang xem (để hiện "Xóa khỏi playlist"). */
  playlistId: string | null;
  open: (track: Track, playlistId?: string | null) => void;
  close: () => void;
}

export const useTrackMenu = create<TrackMenuState>()((set) => ({
  track: null,
  playlistId: null,
  open: (track, playlistId = null) => set({ track, playlistId }),
  close: () => set({ track: null, playlistId: null }),
}));
