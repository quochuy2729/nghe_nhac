/**
 * File nhạc của chính người dùng (mp3/m4a/flac…). Blob lưu trong IndexedDB nên
 * luôn nghe được offline trên máy đã thêm. Có thể upload lên Supabase Storage
 * (bucket riêng tư) để máy còn lại cũng phát được — xem features/library/cloud.ts.
 */
import {
  audioObjectUrl,
  getLyricsRecord,
  putAudio,
  putLyricsRecord,
  putTrack,
  tracksByProvider,
} from '@/lib/db';
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

async function fileId(file: Blob, name: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle chỉ có trên https/localhost
    let h = 0;
    for (const c of `${name}:${file.size}`) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return `n${(h >>> 0).toString(16)}${file.size.toString(16)}`;
  }
}

async function pictureToDataUrl(data: Uint8Array, format: string): Promise<string | undefined> {
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
    const pic = meta.common.picture?.[0];
    return {
      title: meta.common.title,
      artist: meta.common.artist,
      album: meta.common.album,
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

export interface ImportResult {
  added: Track[];
  skipped: string[];
}

export async function importLocalFiles(files: File[]): Promise<ImportResult> {
  const lrcByBase = new Map<string, File>();
  for (const f of files) if (isLrcFile(f)) lrcByBase.set(baseName(f.name).toLowerCase(), f);

  const added: Track[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isLrcFile(file)) continue;
    if (!isAudioFile(file)) {
      skipped.push(file.name);
      continue;
    }
    const id = `local:${await fileId(file, file.name)}`;
    const tags = await readTags(file);
    const guess = guessFromFileName(file.name);
    const track: Track = {
      id,
      provider: 'local',
      title: tags.title || guess.title,
      artist: tags.artist || guess.artist || 'Không rõ nghệ sĩ',
      album: tags.album,
      durationSec: Math.round(tags.durationSec || (await probeDuration(file))),
      artworkUrl: tags.artworkUrl,
      downloadable: true,
    };
    await putAudio(id, file);
    await putTrack(track);
    const lrc = lrcByBase.get(baseName(file.name).toLowerCase());
    if (lrc) {
      const text = await lrc.text();
      const synced = /\[\d{1,3}:\d{1,2}([.:]\d{1,3})?\]/.test(text);
      await putLyricsRecord({ trackId: id, synced: synced ? text : null, plain: synced ? null : text, source: 'file', fetchedAt: Date.now() });
    }
    added.push(track);
  }
  return { added, skipped };
}

type RemoteUrlResolver = (track: Track) => Promise<string | null>;
let remoteResolver: RemoteUrlResolver | null = null;

/** Cho phép lớp cloud (Supabase Storage) cung cấp URL khi file chưa có trên máy này. */
export function setLocalRemoteResolver(r: RemoteUrlResolver | null): void {
  remoteResolver = r;
}

async function urlFor(track: Track): Promise<string | null> {
  const local = await audioObjectUrl(track.id);
  if (local) return local;
  if (track.storagePath && remoteResolver) return remoteResolver(track);
  return null;
}

export const localProvider: MusicProvider = {
  id: 'local',
  label: 'Của tôi',
  async search(q) {
    const all = await tracksByProvider('local');
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((t) => `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(needle)) : all;
  },
  async featured() {
    return tracksByProvider('local');
  },
  async getStreamUrl(track) {
    const url = await urlFor(track);
    if (!url) throw new Error('File này không có trên máy. Hãy thêm lại hoặc bật đồng bộ đám mây.');
    return url;
  },
  async getDownloadUrl(track) {
    return urlFor(track);
  },
  async getLyrics(track) {
    const rec = await getLyricsRecord(track.id);
    if (!rec || rec.source !== 'file') return null;
    return rec.synced ?? rec.plain;
  },
};
