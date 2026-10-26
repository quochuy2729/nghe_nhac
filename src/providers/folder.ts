/**
 * Thư viện nhạc nằm hẳn trong điện thoại: bạn chọn file/thư mục nhạc một lần, app đọc tag
 * (tên bài, nghệ sĩ, thể loại, ảnh bìa…) và lưu bản sao vào IndexedDB nên nghe được không cần mạng.
 * Mỗi điện thoại có thư viện riêng; like/playlist (Supabase) đồng bộ theo id bài.
 */
import { create } from 'zustand';
import {
  type LyricsRecord,
  audioObjectUrl,
  getLyricsRecord,
  putAudio,
  putLyricsRecord,
  putTrack,
  getAllOverrides,
  hasAudio,
  tracksByProvider,
} from '@/lib/db';
import { applyOverride } from '@/lib/overrides';
import { trackIdFor } from '@/lib/id';
import { normalizeText } from '@/lib/text';
import type { MusicProvider, Track } from './types';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|webm)$/i;

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function isAudioFile(f: { name: string; type: string }): boolean {
  return f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
}

export function isLrcFile(f: { name: string }): boolean {
  return /\.lrc$/i.test(f.name);
}

/** "Nghệ sĩ - Tên bài.mp3" → { artist, title } khi file không có tag. */
export function guessFromFileName(name: string): { title: string; artist?: string } {
  const base = baseName(name).replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base };
}

/** Tách/chuẩn hóa genre: "Pop/Rock; Indie" → ["Pop", "Rock", "Indie"] (bỏ trùng, không phân biệt hoa thường). */
export function normalizeGenres(raw: readonly string[] | undefined): string[] {
  const out = new Map<string, string>();
  for (const g of raw ?? []) {
    for (const part of String(g).split(/[;/,]/)) {
      const s = part.trim();
      if (s && !out.has(s.toLowerCase())) out.set(s.toLowerCase(), s);
    }
  }
  return [...out.values()];
}

export async function pictureToDataUrl(data: Uint8Array, format: string): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: format }));
    const size = 300;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const s = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return undefined;
  }
}

async function readTags(file: File) {
  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { duration: true, skipCovers: false });
    const c = meta.common;
    const pic = c.picture?.[0];
    return {
      title: c.title,
      artist: c.artist,
      albumArtist: c.albumartist,
      album: c.album,
      genre: normalizeGenres(c.genre),
      year: c.year,
      bpm: c.bpm,
      replayGainDb: c.replaygain_track_gain?.dB,
      durationSec: meta.format.duration,
      artworkUrl: pic ? await pictureToDataUrl(pic.data, pic.format) : undefined,
    };
  } catch {
    return {};
  }
}

/** Đo thời lượng bằng <audio> khi tag không có. */
function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => done(0), 5000);
    const done = (d: number) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = url;
  });
}

export { trackIdFor };

/** Lời lấy từ file .lrc cùng tên: có mốc thời gian [mm:ss] thì là lời đồng bộ, không thì lời thường. */
export function lyricsRecordFromFile(trackId: string, text: string): LyricsRecord {
  const synced = /\[\d{1,3}:\d{1,2}([.:]\d{1,3})?\]/.test(text);
  return { trackId, synced: synced ? text : null, plain: synced ? null : text, source: 'file', fetchedAt: Date.now() };
}

/** Thư mục chứa file, lấy từ `webkitRelativePath` ("Nhạc/Pop/a.mp3" → "Nhạc/Pop"); chọn file lẻ thì không có. */
export function folderOf(file: File): string | undefined {
  const rel = file.webkitRelativePath?.normalize('NFC');
  if (!rel || !rel.includes('/')) return undefined;
  return rel.slice(0, rel.lastIndexOf('/'));
}

export interface ImportResult {
  added: Track[];
  /** đã có sẵn trên máy (cùng tên + dung lượng) */
  existing: number;
  /** không phải file nhạc */
  skipped: string[];
  failed: string[];
}

/**
 * Nạp file/thư mục nhạc vào máy. File `.lrc` trùng tên (không tính đuôi) được ghép làm lời bài.
 * Xử lý lần lượt từng file để không giữ nhiều file lớn trong bộ nhớ cùng lúc.
 */
export async function importFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const lrcByBase = new Map<string, File>();
  for (const f of files) if (isLrcFile(f)) lrcByBase.set(baseName(f.name).normalize('NFC').toLowerCase(), f);

  const added: Track[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  let existing = 0;
  const audio = files.filter((f) => !isLrcFile(f));
  let done = 0;
  for (const file of audio) {
    onProgress?.(done++, audio.length);
    if (!isAudioFile(file)) {
      skipped.push(file.name);
      continue;
    }
    try {
      const id = trackIdFor(file);
      if (await hasAudio(id)) {
        existing++;
        continue;
      }
      const tags = await readTags(file);
      const guess = guessFromFileName(file.name.normalize('NFC'));
      const track: Track = {
        id,
        provider: 'folder',
        title: tags.title || guess.title,
        artist: tags.artist || guess.artist || 'Không rõ nghệ sĩ',
        ...(tags.album ? { album: tags.album } : {}),
        ...(tags.albumArtist ? { albumArtist: tags.albumArtist } : {}),
        ...(tags.genre?.length ? { genre: tags.genre } : {}),
        ...(tags.year ? { year: tags.year } : {}),
        ...(tags.bpm ? { bpm: Math.round(tags.bpm) } : {}),
        ...(typeof tags.replayGainDb === 'number' && Number.isFinite(tags.replayGainDb) ? { replayGainDb: tags.replayGainDb } : {}),
        durationSec: Math.round(tags.durationSec || (await probeDuration(file))),
        ...(tags.artworkUrl ? { artworkUrl: tags.artworkUrl } : {}),
        downloadable: true,
        addedAt: Date.now(),
        ...(folderOf(file) ? { folder: folderOf(file) } : {}),
        source: { kind: 'idb' },
      };
      await putAudio(id, file);
      await putTrack(track);
      const lrc = lrcByBase.get(baseName(file.name).normalize('NFC').toLowerCase());
      if (lrc) await putLyricsRecord(lyricsRecordFromFile(id, await lrc.text()));
      added.push(track);
    } catch {
      failed.push(file.name);
    }
  }
  onProgress?.(audio.length, audio.length);
  return { added, existing, skipped, failed };
}

/** Bỏ dấu tiếng Việt + hoa/thường: mọi từ khóa phải xuất hiện trong tên bài / nghệ sĩ / album / thể loại. */
export function searchTracks(tracks: readonly Track[], q: string): Track[] {
  const words = normalizeText(q).split(/\s+/).filter(Boolean);
  if (!words.length) return tracks.slice();
  return tracks.filter((t) => {
    const hay = normalizeText(`${t.title} ${t.artist} ${t.albumArtist ?? ''} ${t.album ?? ''} ${(t.genre ?? []).join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}

interface FolderState {
  tracks: Track[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

export const useFolder = create<FolderState>()(() => ({ tracks: [], status: 'idle', error: null }));

/** Nạp danh sách bài trên máy này từ IndexedDB (mới thêm lên đầu). */
export async function loadFolder(): Promise<void> {
  if (useFolder.getState().status === 'idle') useFolder.setState({ status: 'loading' });
  try {
    // Tag sửa tay (overrides) chồng lên tag gốc; không ghi vào file nhạc.
    const [stored, overrides] = await Promise.all([tracksByProvider('folder'), getAllOverrides()]);
    const byId = new Map(overrides.map((o) => [o.trackId, o]));
    useFolder.setState({ tracks: stored.map((t) => applyOverride(t, byId.get(t.id))), status: 'ready', error: null });
  } catch (err) {
    useFolder.setState({ status: 'error', error: `Không đọc được thư viện trên máy: ${(err as Error).message}` });
  }
}

async function ensureLoaded(): Promise<Track[]> {
  if (useFolder.getState().status === 'idle') await loadFolder();
  return useFolder.getState().tracks;
}

export const folderProvider: MusicProvider = {
  id: 'folder',
  label: 'Thư viện',
  async search(q) {
    return searchTracks(await ensureLoaded(), q);
  },
  async featured() {
    return ensureLoaded();
  },
  async getStreamUrl(track) {
    const url = await audioObjectUrl(track.id);
    if (!url) throw new Error('Bài này chưa có trên điện thoại này. Hãy thêm file nhạc vào máy (Cài đặt → Thêm nhạc).');
    return url;
  },
  async getDownloadUrl(track) {
    return audioObjectUrl(track.id);
  },
  async getLyrics(track) {
    const rec = await getLyricsRecord(track.id);
    if (!rec || rec.source !== 'file') return null;
    return rec.synced ?? rec.plain;
  },
};
