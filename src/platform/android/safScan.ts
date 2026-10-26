/**
 * Quét tăng dần thư mục SAF — logic thuần, không đụng plugin hay IndexedDB.
 * So kết quả quét với các bài đã lưu theo `id` (tên + dung lượng) và `mtime`.
 */
import type { Track } from '@/providers/types';
import type { ScanItem } from './musicLibrary';

export interface FoundFile extends ScanItem {
  id: string;
  folderId: string;
}

type SafTrack = Track & { source: { kind: 'saf'; uri: string; mtime: number; folderId?: string; lrc?: { uri: string; mtime: number } } };

export function isSafTrack(t: Track): t is SafTrack {
  return t.source?.kind === 'saf';
}

export interface ScanPlan {
  /** bài mới hoặc file đã đổi (mtime khác): cần đọc lại tag */
  toRead: { file: FoundFile; prev?: Track }[];
  /** cùng nội dung nhưng đổi chỗ (thư mục/URI): chỉ cập nhật `source` + `folder`, không đọc tag */
  relocate: { file: FoundFile; prev: Track }[];
  /** file `.lrc` mới hoặc đã đổi: đọc lại lời */
  lyrics: FoundFile[];
  /** id bài không còn trong các thư mục đã quét */
  remove: string[];
  /** số bài giữ nguyên */
  unchanged: number;
}

/**
 * @param existing bài đã lưu (mọi bài `saf`)
 * @param found    file tìm thấy ở các thư mục quét THÀNH CÔNG, theo thứ tự thư mục rồi thứ tự quét
 * @param scannedFolderIds thư mục quét thành công — bài thuộc thư mục quét lỗi/mất quyền không bị xóa
 */
export function planScan(existing: readonly Track[], found: readonly FoundFile[], scannedFolderIds: ReadonlySet<string>): ScanPlan {
  const prevById = new Map<string, SafTrack>();
  for (const t of existing) if (isSafTrack(t)) prevById.set(t.id, t);

  // Cùng tên + dung lượng ở hai thư mục → cùng id → một bài. Giữ bản đang dùng nếu còn, không thì bản gặp đầu tiên.
  const chosen = new Map<string, FoundFile>();
  for (const f of found) {
    const cur = chosen.get(f.id);
    if (!cur) chosen.set(f.id, f);
    else if (prevById.get(f.id)?.source.uri === f.uri) chosen.set(f.id, f);
  }

  const plan: ScanPlan = { toRead: [], relocate: [], lyrics: [], remove: [], unchanged: 0 };
  for (const [id, file] of chosen) {
    const prev = prevById.get(id);
    if (!prev) {
      plan.toRead.push({ file });
      if (file.lrcUri) plan.lyrics.push(file);
      continue;
    }
    const lrcChanged = file.lrcUri !== undefined && (prev.source.lrc?.uri !== file.lrcUri || prev.source.lrc.mtime !== file.lrcMtime);
    if (lrcChanged) plan.lyrics.push(file);
    if (prev.source.mtime !== file.mtime) plan.toRead.push({ file, prev });
    else if (prev.source.uri !== file.uri || prev.source.folderId !== file.folderId || lrcChanged) plan.relocate.push({ file, prev });
    else plan.unchanged++;
  }

  for (const [id, t] of prevById) {
    if (chosen.has(id)) continue;
    if (t.source.folderId && scannedFolderIds.has(t.source.folderId)) plan.remove.push(id);
  }
  return plan;
}

/** Gọi tối đa một lần mỗi `gapMs` (tính từ lần chạy trước); lần gọi trong lúc đang chạy hoặc quá sớm bị bỏ. */
export function createThrottledRunner(run: () => Promise<unknown>, gapMs: number, now: () => number = Date.now): () => boolean {
  let last = -Infinity;
  let running = false;
  return () => {
    const t = now();
    if (running || t - last < gapMs) return false;
    last = t;
    running = true;
    void run()
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
    return true;
  };
}
