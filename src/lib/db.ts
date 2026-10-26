/**
 * IndexedDB cục bộ (qua `idb`): audio đã tải / file local, metadata, cache lyrics.
 * Không đồng bộ lên server — mỗi máy một bản.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Track } from '@/providers/types';

/** Một lần nghe. `id` là uuid tạo ở client (đẩy lại nhiều lần vẫn không trùng). */
export interface PlayEvent {
  id: string;
  trackId: string;
  /** thời điểm kết thúc (ms) */
  t: number;
  sec: number;
  /** thời lượng bài lúc nghe (0 = không rõ) */
  dur: number;
  kind: 'complete' | 'partial' | 'skip';
  device: 'poco' | 'iphone';
  ctx?: 'shuffle' | 'radio' | 'album' | 'playlist' | 'mix';
}

/** Bản ghi lưu trong IndexedDB: thêm cờ đã đồng bộ (số, vì IndexedDB không đánh chỉ mục boolean). */
export type StoredPlayEvent = PlayEvent & { synced: 0 | 1 };

export interface AudioFeatures {
  v: 1;
  bpm: number | null;
  bpmConf: number;
  energy: number;
  loudnessDb: number;
  brightness: number;
  onsetRate: number;
  dynamics: number;
  mfcc: number[];
  analyzedSec: number;
}

export interface FeaturesRecord {
  trackId: string;
  features: AudioFeatures;
  updatedAt: number;
}

/** Tag sửa tay. Hiển thị = track ⊕ patch (xem lib/overrides.ts). */
export interface OverrideRecord {
  trackId: string;
  patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'albumArtist' | 'genre' | 'year' | 'bpm'>>;
  updatedAt: number;
}

/** Thay đổi chờ đẩy lên Supabase (xem features/sync/outbox.ts). */
export interface OutboxRecord {
  seq?: number;
  table: string;
  op: 'upsert' | 'insert' | 'delete';
  row: Record<string, unknown>;
  createdAt: number;
}

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
  features: { key: string; value: FeaturesRecord };
  overrides: { key: string; value: OverrideRecord };
  events: { key: string; value: StoredPlayEvent; indexes: { byT: number; bySynced: number } };
  outbox: { key: number; value: OutboxRecord };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<NNDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NNDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NNDB>('nghe-nhac', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('audio', { keyPath: 'trackId' });
          const tracks = db.createObjectStore('tracks', { keyPath: 'track.id' });
          tracks.createIndex('byProvider', 'track.provider');
          db.createObjectStore('lyrics', { keyPath: 'trackId' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('features', { keyPath: 'trackId' });
          db.createObjectStore('overrides', { keyPath: 'trackId' });
          const events = db.createObjectStore('events', { keyPath: 'id' });
          events.createIndex('byT', 't');
          events.createIndex('bySynced', 'synced');
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
          db.createObjectStore('meta');
        }
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

/* ───────── v2: lịch sử nghe, đặc trưng âm thanh, tag sửa tay, outbox, meta ───────── */

export async function putEvents(events: StoredPlayEvent[]): Promise<void> {
  const tx = (await getDB()).transaction('events', 'readwrite');
  await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
}

/** Toàn bộ lượt nghe, cũ → mới. */
export async function getAllEvents(): Promise<StoredPlayEvent[]> {
  return (await getDB()).getAllFromIndex('events', 'byT');
}

export async function deleteEvents(ids: string[]): Promise<void> {
  const tx = (await getDB()).transaction('events', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function clearEvents(): Promise<void> {
  await (await getDB()).clear('events');
}

export async function putFeatures(rec: FeaturesRecord): Promise<void> {
  await (await getDB()).put('features', rec);
}

export async function getFeatures(trackId: string): Promise<FeaturesRecord | undefined> {
  return (await getDB()).get('features', trackId);
}

export async function putOverride(rec: OverrideRecord): Promise<void> {
  await (await getDB()).put('overrides', rec);
}

export async function getOverride(trackId: string): Promise<OverrideRecord | undefined> {
  return (await getDB()).get('overrides', trackId);
}

export async function getAllOverrides(): Promise<OverrideRecord[]> {
  return (await getDB()).getAll('overrides');
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('meta', value, key);
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
