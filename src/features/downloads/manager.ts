/**
 * Tải bài về IndexedDB để nghe offline. Chỉ cho phép khi provider cho tải
 * (`track.downloadable`) hoặc là file của chính người dùng.
 */
import { create } from 'zustand';
import type { Track } from '@/providers/types';
import { providerOf } from '@/providers';
import {
  audioObjectUrl,
  deleteAudio,
  deleteTrack,
  getTrack,
  hasAudio,
  listAudioMeta,
  putAudio,
  putTrack,
  revokeAudioObjectUrl,
} from '@/lib/db';
import { addPreResolver } from '@/features/player/resolve';

export type DownloadState =
  | { state: 'downloading'; progress: number }
  | { state: 'error'; error: string };

export interface DownloadedItem {
  track: Track;
  size: number;
  savedAt: number;
}

interface DownloadsStore {
  /** id các bài đã có blob trên máy */
  ids: Record<string, true>;
  active: Record<string, DownloadState>;
  items: DownloadedItem[];
  loaded: boolean;
}

export const useDownloads = create<DownloadsStore>()(() => ({ ids: {}, active: {}, items: [], loaded: false }));

export function canDownload(track: Track): boolean {
  return track.downloadable === true || track.provider === 'local';
}

function setActive(id: string, s: DownloadState | null) {
  useDownloads.setState((st) => {
    const active = { ...st.active };
    if (s) active[id] = s;
    else delete active[id];
    return { active };
  });
}

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

/** Đọc body có báo tiến độ (Content-Length); không có header thì progress = -1. */
export async function fetchWithProgress(url: string, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { signal, mode: url.startsWith('blob:') ? undefined : 'cors' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error(navigator.onLine ? 'Nguồn không cho phép tải trực tiếp trên trình duyệt' : 'Không có kết nối mạng');
  }
  if (!res.ok) throw new Error(`Máy chủ trả lỗi ${res.status}`);
  const type = res.headers.get('content-type') || 'audio/mpeg';
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const blob = await res.blob();
    onProgress(1);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(total ? Math.min(1, received / total) : -1);
  }
  onProgress(1);
  return new Blob(chunks as BlobPart[], { type: type.split(';')[0] });
}

const controllers = new Map<string, AbortController>();

export async function downloadTrack(track: Track): Promise<void> {
  if (!canDownload(track)) throw new Error('Bài này không cho phép tải về');
  if (useDownloads.getState().ids[track.id] || controllers.has(track.id)) return;
  if (await hasAudio(track.id)) {
    await refreshDownloads();
    return;
  }
  void requestPersist();
  const ctrl = new AbortController();
  controllers.set(track.id, ctrl);
  setActive(track.id, { state: 'downloading', progress: 0 });
  try {
    const url = await providerOf(track).getDownloadUrl?.(track);
    if (!url) throw new Error('Nguồn không cung cấp link tải');
    const blob = await fetchWithProgress(url, (p) => setActive(track.id, { state: 'downloading', progress: p }), ctrl.signal);
    if (blob.size === 0) throw new Error('File tải về rỗng');
    await putAudio(track.id, blob);
    const { streamUrl: _s, ...meta } = track;
    await putTrack(meta);
    setActive(track.id, null);
    await refreshDownloads();
  } catch (err) {
    if ((err as Error).name === 'AbortError') setActive(track.id, null);
    else setActive(track.id, { state: 'error', error: (err as Error).message });
    throw err;
  } finally {
    controllers.delete(track.id);
  }
}

export function cancelDownload(trackId: string): void {
  controllers.get(trackId)?.abort();
}

/** Xóa bản tải. File local (của người dùng) bị xóa hẳn khỏi máy. */
export async function removeDownload(track: Pick<Track, 'id' | 'provider'>): Promise<void> {
  revokeAudioObjectUrl(track.id);
  if (track.provider === 'local') await deleteTrack(track.id);
  else {
    await deleteAudio(track.id);
    await deleteTrack(track.id);
  }
  setActive(track.id, null);
  await refreshDownloads();
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
  // Ưu tiên phát từ bản đã tải → chạy được khi mất mạng.
  addPreResolver((track) => audioObjectUrl(track.id));
  void refreshDownloads();
}
