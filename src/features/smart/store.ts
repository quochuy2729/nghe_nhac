import { create } from 'zustand';
import { getAllSmartPlaylists, saveSmartPlaylist } from '@/features/sync/localData';
import { uuid } from '@/lib/id';
import type { SmartPlaylist } from './types';

interface SmartState {
  /** chưa bị xóa mềm */
  lists: SmartPlaylist[];
  loaded: boolean;
}

export const useSmart = create<SmartState>()(() => ({ lists: [], loaded: false }));

export async function loadSmart(): Promise<void> {
  const all = await getAllSmartPlaylists();
  useSmart.setState({ lists: all.filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, 'vi')), loaded: true });
}

export async function upsertSmart(p: Omit<SmartPlaylist, 'id' | 'updatedAt'> & { id?: string }, now = Date.now()): Promise<string> {
  const id = p.id ?? uuid();
  await saveSmartPlaylist({ ...p, id, updatedAt: now });
  await loadSmart();
  return id;
}

/** Xóa mềm để máy kia cũng xóa theo. */
export async function deleteSmart(p: SmartPlaylist, now = Date.now()): Promise<void> {
  await saveSmartPlaylist({ ...p, deleted: true, updatedAt: now });
  await loadSmart();
}
