/** Nguồn thư viện Android: đọc thẳng thư mục đã chọn (SAF), không sao chép file. */
import { Capacitor } from '@capacitor/core';
import { toast } from '@/components/toastStore';
import { useImportStatus } from '@/features/folder/runImport';
import { deleteTrack, putLyricsRecord, putTrack, tracksByProvider } from '@/lib/db';
import { trackIdFor } from '@/lib/id';
import { folderProvider, guessFromFileName, loadFolder, lyricsRecordFromFile, normalizeGenres } from '@/providers/folder';
import type { Track } from '@/providers/types';
import type { LibrarySource } from '../types';
import { MusicLibrary, type MusicLibraryPlugin, type TagResult } from './musicLibrary';
import { createThrottledRunner, isSafTrack, planScan, type FoundFile } from './safScan';

const TAG_CHUNK = 50;
const AUTO_RESCAN_GAP_MS = 5000;

export interface SafDeps {
  plugin: MusicLibraryPlugin;
  /** đường dẫn native (content://, file://) → URL WebView đọc được */
  toUrl: (nativePath: string) => string;
  now: () => number;
}

const defaultDeps = (): SafDeps => ({
  plugin: MusicLibrary,
  toUrl: (p) => Capacitor.convertFileSrc(p),
  now: Date.now,
});

export class SafLibrarySource implements LibrarySource {
  private running: Promise<{ added: number; removed: number }> | null = null;
  private readonly deps: SafDeps;

  constructor(deps: Partial<SafDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  async addFolder(): Promise<void> {
    const { folder } = await this.deps.plugin.pickFolder();
    if (!folder) return;
    try {
      const r = await this.rescan();
      toast(r.added ? `Đã thêm ${r.added} bài từ "${folder.label}"` : `Không tìm thấy bài mới trong "${folder.label}"`);
    } catch (err) {
      toast(`Không đọc được thư mục: ${(err as Error).message}`);
    }
  }

  async listFolders(): Promise<{ id: string; label: string }[]> {
    const { folders } = await this.deps.plugin.listFolders();
    return folders.map(({ id, label }) => ({ id, label }));
  }

  async removeFolder(id: string): Promise<void> {
    await this.deps.plugin.removeFolder({ id });
    // Chỉ xóa bài khỏi thư viện; like/playlist/lịch sử nằm ở nơi khác nên được giữ.
    for (const t of await tracksByProvider('folder')) {
      if (isSafTrack(t) && t.source.folderId === id) await deleteTrack(t.id);
    }
    await loadFolder();
  }

  /** Nhiều lần gọi đồng thời dùng chung một lần quét. */
  rescan(onProgress?: (done: number, total: number) => void): Promise<{ added: number; removed: number }> {
    this.running ??= this.doRescan(onProgress).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Quét khi mở app và mỗi lần app quay lại foreground (tối đa một lần / 5 giây). */
  startAutoRescan(): () => void {
    const trigger = createThrottledRunner(() => this.rescan(), AUTO_RESCAN_GAP_MS, this.deps.now);
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    document.addEventListener('visibilitychange', onVisible);
    trigger();
    return () => document.removeEventListener('visibilitychange', onVisible);
  }

  private async doRescan(onProgress?: (done: number, total: number) => void): Promise<{ added: number; removed: number }> {
    const { plugin } = this.deps;
    const { folders } = await plugin.listFolders();
    const labelOf = new Map(folders.map((f) => [f.id, f.label]));

    // 1. Liệt kê file. Thư mục quét lỗi hoặc thiếu lô thì bỏ qua, và bài của nó không bị coi là đã xóa.
    const found: FoundFile[] = [];
    const scanned = new Set<string>();
    for (const folder of folders) {
      if (folder.accessible === false) continue;
      const items = await this.scanFolder(folder.id);
      if (!items) continue;
      scanned.add(folder.id);
      found.push(...items);
    }

    const existing = (await tracksByProvider('folder')).filter(isSafTrack);
    const plan = planScan(existing, found, scanned);
    const progress = (done: number) => {
      useImportStatus.setState({ progress: { done, total: plan.toRead.length } });
      onProgress?.(done, plan.toRead.length);
    };

    try {
      // 2. Đọc tag file mới/đổi theo lô; lỗi tag vẫn thêm bài (tên bài đoán từ tên file).
      if (plan.toRead.length) progress(0);
      for (let i = 0; i < plan.toRead.length; i += TAG_CHUNK) {
        const chunk = plan.toRead.slice(i, i + TAG_CHUNK);
        const { tags } = await plugin.readTags({ uris: chunk.map((c) => c.file.uri) });
        const byUri = new Map(tags.map((t) => [t.uri, t]));
        for (const { file, prev } of chunk) {
          await putTrack(this.buildTrack(file, byUri.get(file.uri), labelOf.get(file.folderId), prev));
        }
        progress(Math.min(i + TAG_CHUNK, plan.toRead.length));
      }
      for (const { file, prev } of plan.relocate) {
        await putTrack({ ...prev, folder: folderPath(labelOf.get(file.folderId), file.relDir), source: sourceOf(file, prev) });
      }

      // 3. Lời .lrc đi kèm.
      for (const file of plan.lyrics) {
        const { text } = await plugin.readText({ uri: file.lrcUri! });
        if (text) await putLyricsRecord(lyricsRecordFromFile(file.id, text));
      }

      // 4. Bài biến mất (xóa/đổi tên — đổi tên thì id đổi nên là một bài mới).
      for (const id of plan.remove) await deleteTrack(id);
    } finally {
      useImportStatus.setState({ progress: null });
    }

    const result = { added: plan.toRead.filter((r) => !r.prev).length, removed: plan.remove.length };
    if (plan.toRead.length || plan.relocate.length || plan.remove.length) await loadFolder();
    return result;
  }

  /** null = quét lỗi hoặc không nhận đủ lô (không được suy ra "bài đã bị xóa"). */
  private async scanFolder(folderId: string): Promise<FoundFile[] | null> {
    const { plugin } = this.deps;
    const scanId = `${folderId}#${this.deps.now()}`;
    const items: FoundFile[] = [];
    const handle = await plugin.addListener('scanBatch', (e) => {
      if (e.scanId !== scanId) return;
      for (const it of e.items) items.push({ ...it, folderId, id: trackIdFor(it) });
    });
    try {
      const { total } = await plugin.scan({ folderId, scanId });
      // Sự kiện đi cùng kênh với kết quả nên đã tới trước; nhường một nhịp cho chắc.
      await new Promise((r) => setTimeout(r, 0));
      return items.length === total ? items : null;
    } catch {
      return null;
    } finally {
      await handle.remove();
    }
  }

  private buildTrack(file: FoundFile, tag: TagResult | undefined, label: string | undefined, prev?: Track): Track {
    const guess = guessFromFileName(file.name.normalize('NFC'));
    const genre = normalizeGenres(tag?.genre ? [tag.genre] : undefined).filter((g) => !/^\(?\d+\)?$/.test(g));
    return {
      id: file.id,
      provider: 'folder',
      title: tag?.title || guess.title,
      artist: tag?.artist || guess.artist || 'Không rõ nghệ sĩ',
      ...(tag?.album ? { album: tag.album } : {}),
      ...(tag?.albumArtist ? { albumArtist: tag.albumArtist } : {}),
      ...(genre.length ? { genre } : {}),
      ...(tag?.year ? { year: tag.year } : {}),
      durationSec: Math.round(tag?.durationSec ?? 0),
      ...(tag?.artworkPath ? { artworkUrl: this.deps.toUrl(`file://${tag.artworkPath}`) } : {}),
      downloadable: true,
      addedAt: prev?.addedAt ?? this.deps.now(),
      folder: folderPath(label, file.relDir),
      source: sourceOf(file),
    };
  }

  resolve(track: Track): Promise<string> {
    if (track.source?.kind !== 'saf') return Promise.reject(new Error('Bài này không nằm trong thư mục đã liên kết.'));
    // Media3 đọc thẳng content:// (không qua WebView nên không cần convertFileSrc).
    return Promise.resolve(track.source.uri);
  }

  async artwork(track: Track): Promise<string | null> {
    if (track.artworkUrl) return track.artworkUrl;
    if (track.source?.kind !== 'saf') return null;
    const { path } = await this.deps.plugin.artwork({ uri: track.source.uri });
    return path ? this.deps.toUrl(`file://${path}`) : null;
  }

  /** Lời .lrc đã được đọc vào IndexedDB lúc quét. */
  async lyricsFile(track: Track): Promise<string | null> {
    return (await folderProvider.getLyrics?.(track)) ?? null;
  }
}

function folderPath(label: string | undefined, relDir: string): string {
  const root = label ?? '';
  return relDir ? (root ? `${root}/${relDir}` : relDir) : root;
}

function sourceOf(file: FoundFile, prev?: Track): Extract<NonNullable<Track['source']>, { kind: 'saf' }> {
  const lrc = file.lrcUri ? { uri: file.lrcUri, mtime: file.lrcMtime ?? 0 } : prev?.source?.kind === 'saf' ? prev.source.lrc : undefined;
  return { kind: 'saf', uri: file.uri, mtime: file.mtime, folderId: file.folderId, ...(lrc ? { lrc } : {}) };
}
