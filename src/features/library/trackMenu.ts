import { create } from 'zustand';
import type { Track } from '@/providers/types';

interface TrackMenuState {
  track: Track | null;
  /** Playlist đang xem + vị trí bài trong đó (để hiện "Xóa khỏi playlist"). */
  playlistId: string | null;
  playlistIndex: number | null;
  open: (track: Track, playlist?: { id: string; index: number }) => void;
  close: () => void;
}

export const useTrackMenu = create<TrackMenuState>()((set) => ({
  track: null,
  playlistId: null,
  playlistIndex: null,
  open: (track, playlist) => set({ track, playlistId: playlist?.id ?? null, playlistIndex: playlist?.index ?? null }),
  close: () => set({ track: null, playlistId: null, playlistIndex: null }),
}));

interface PickerState {
  tracks: Track[] | null;
  open: (tracks: Track[]) => void;
  close: () => void;
}

export const usePlaylistPicker = create<PickerState>()((set) => ({
  tracks: null,
  open: (tracks) => set({ tracks }),
  close: () => set({ tracks: null }),
}));
