/** Nguồn thư viện web: người dùng chọn thư mục/file qua <input>, nhạc được sao chép vào IndexedDB. */
import { runImport } from '@/features/folder/runImport';
import { removeDownload } from '@/features/downloads/manager';
import { tracksByProvider } from '@/lib/db';
import { folderProvider } from '@/providers/folder';
import type { Track } from '@/providers/types';
import type { LibrarySource } from '../types';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.lrc';

function rootOf(t: Track): string | undefined {
  return t.folder?.split('/')[0] || undefined;
}

export class WebImportSource implements LibrarySource {
  addFolder(): Promise<void> {
    return this.pick(true);
  }

  addFiles(): Promise<void> {
    return this.pick(false);
  }

  /** Gọi ĐỒNG BỘ từ handler chạm (trình duyệt chỉ cho mở hộp chọn file khi có thao tác người dùng). */
  private pick(directory: boolean): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.hidden = true;
      if (directory) input.setAttribute('webkitdirectory', '');
      else input.accept = ACCEPT;
      const finish = () => {
        input.remove();
        resolve();
      };
      input.addEventListener('change', () => {
        const files = Array.from(input.files ?? []);
        void runImport(files).finally(finish);
      });
      input.addEventListener('cancel', finish);
      // iOS Safari chỉ phát sự kiện change ổn định khi <input> nằm trong DOM.
      document.body.appendChild(input);
      input.click();
    });
  }

  async listFolders(): Promise<{ id: string; label: string }[]> {
    const roots = new Set<string>();
    for (const t of await tracksByProvider('folder')) {
      const r = rootOf(t);
      if (r) roots.add(r);
    }
    return [...roots].sort().map((r) => ({ id: r, label: r }));
  }

  async removeFolder(id: string): Promise<void> {
    for (const t of await tracksByProvider('folder')) if (rootOf(t) === id) await removeDownload(t);
  }

  /** Web không có thư mục "liên kết" để quét lại: muốn thêm bài mới thì chọn lại thư mục (bài đã có tự bỏ qua). */
  async rescan(): Promise<{ added: number; removed: number }> {
    return { added: 0, removed: 0 };
  }

  resolve(track: Track): Promise<string> {
    return folderProvider.getStreamUrl(track);
  }

  async artwork(track: Track): Promise<string | null> {
    return track.artworkUrl ?? null;
  }

  async lyricsFile(track: Track): Promise<string | null> {
    return (await folderProvider.getLyrics?.(track)) ?? null;
  }
}
