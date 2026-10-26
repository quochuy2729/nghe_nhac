/**
 * Nhạc đang lưu trên điện thoại này (IndexedDB): danh sách + dung lượng, xóa từng bài,
 * và xin trình duyệt đừng tự dọn dữ liệu.
 */
import { create } from 'zustand';
import type { Track } from '@/providers/types';
import { audioObjectUrl, deleteTrack, getTrack, listAudioMeta, revokeAudioObjectUrl } from '@/lib/db';
import { addPreResolver } from '@/features/player/resolve';
import { loadFolder } from '@/providers/folder';

export interface DownloadedItem {
  track: Track;
  size: number;
  savedAt: number;
}

interface DownloadsStore {
  /** id các bài có file trên máy */
  ids: Record<string, true>;
  items: DownloadedItem[];
  loaded: boolean;
}

export const useDownloads = create<DownloadsStore>()(() => ({ ids: {}, items: [], loaded: false }));

let persistAsked = false;

/** Xin trình duyệt không tự dọn dữ liệu offline (Safari hay dọn sau 7 ngày không mở). */
export async function requestPersist(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  if (persistAsked) return false;
  persistAsked = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return { usage, quota, persisted };
}

/** Xóa bài khỏi điện thoại này (file, thông tin bài, lời đã lưu). Like/playlist không bị ảnh hưởng. */
export async function removeDownload(track: Pick<Track, 'id'>): Promise<void> {
  revokeAudioObjectUrl(track.id);
  await deleteTrack(track.id);
  await refreshDownloads();
  await loadFolder();
}

export async function refreshDownloads(): Promise<void> {
  const metas = await listAudioMeta();
  const items: DownloadedItem[] = [];
  for (const m of metas) {
    const track = await getTrack(m.trackId);
    if (track) items.push({ track, size: m.size, savedAt: m.savedAt });
  }
  items.sort((a, b) => b.savedAt - a.savedAt);
  useDownloads.setState({ ids: Object.fromEntries(metas.map((m) => [m.trackId, true as const])), items, loaded: true });
}

let started = false;

export function initDownloads(): void {
  if (started) return;
  started = true;
  addPreResolver((track) => audioObjectUrl(track.id));
  void refreshDownloads();
}
