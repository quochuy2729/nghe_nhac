/**
 * IndexedDB cục bộ (qua `idb`): audio đã tải / file local, metadata, cache lyrics.
 * Không đồng bộ lên server — mỗi máy một bản.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Track } from '@/providers/types';

export interface AudioRecord {
  trackId: string;
  blob: Blob;
  size: number;
  mime: string;
  savedAt: number;
}

export interface TrackRecord {
  track: Track;
  savedAt: number;
}

export interface LyricsRecord {
  trackId: string;
  synced: string | null;
  plain: string | null;
  /** lrclib | file | provider */
  source: string;
  fetchedAt: number;
}

interface NNDB extends DBSchema {
  audio: { key: string; value: AudioRecord };
  tracks: { key: string; value: TrackRecord; indexes: { byProvider: string } };
  lyrics: { key: string; value: LyricsRecord };
}

let dbPromise: Promise<IDBPDatabase<NNDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NNDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NNDB>('nghe-nhac', 1, {
      upgrade(db) {
        db.createObjectStore('audio', { keyPath: 'trackId' });
        const tracks = db.createObjectStore('tracks', { keyPath: 'track.id' });
        tracks.createIndex('byProvider', 'track.provider');
        db.createObjectStore('lyrics', { keyPath: 'trackId' });
      },
    });
  }
  return dbPromise;
}

/** Chỉ dùng trong test. */
export async function resetDBForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('nghe-nhac');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

export async function putTrack(track: Track): Promise<void> {
  await (await getDB()).put('tracks', { track, savedAt: Date.now() });
}

export async function getTrack(id: string): Promise<Track | undefined> {
  return (await (await getDB()).get('tracks', id))?.track;
}

export async function tracksByProvider(provider: string): Promise<Track[]> {
  const rows = await (await getDB()).getAllFromIndex('tracks', 'byProvider', provider);
  return rows.sort((a, b) => b.savedAt - a.savedAt).map((r) => r.track);
}

export async function putAudio(trackId: string, blob: Blob): Promise<void> {
  await (await getDB()).put('audio', { trackId, blob, size: blob.size, mime: blob.type, savedAt: Date.now() });
}

export async function getAudioBlob(trackId: string): Promise<Blob | undefined> {
  return (await (await getDB()).get('audio', trackId))?.blob;
}

export async function hasAudio(trackId: string): Promise<boolean> {
  return (await (await getDB()).getKey('audio', trackId)) !== undefined;
}

export async function deleteAudio(trackId: string): Promise<void> {
  await (await getDB()).delete('audio', trackId);
}

export async function listAudioMeta(): Promise<Array<Omit<AudioRecord, 'blob'>>> {
  const db = await getDB();
  const out: Array<Omit<AudioRecord, 'blob'>> = [];
  let cursor = await db.transaction('audio').store.openCursor();
  while (cursor) {
    const { trackId, size, mime, savedAt } = cursor.value;
    out.push({ trackId, size, mime, savedAt });
    cursor = await cursor.continue();
  }
  return out;
}

export async function deleteTrack(trackId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['tracks', 'audio', 'lyrics'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').delete(trackId),
    tx.objectStore('audio').delete(trackId),
    tx.objectStore('lyrics').delete(trackId),
    tx.done,
  ]);
}

export async function getLyricsRecord(trackId: string): Promise<LyricsRecord | undefined> {
  return (await getDB()).get('lyrics', trackId);
}

export async function putLyricsRecord(rec: LyricsRecord): Promise<void> {
  await (await getDB()).put('lyrics', rec);
}

/** object URL cho blob audio, cache theo trackId để không tạo lại liên tục. */
const objectUrls = new Map<string, string>();

export async function audioObjectUrl(trackId: string): Promise<string | null> {
  const hit = objectUrls.get(trackId);
  if (hit) return hit;
  const blob = await getAudioBlob(trackId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(trackId, url);
  return url;
}

export function revokeAudioObjectUrl(trackId: string): void {
  const url = objectUrls.get(trackId);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(trackId);
}
