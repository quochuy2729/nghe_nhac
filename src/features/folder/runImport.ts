import { create } from 'zustand';
import { toast } from '@/components/toastStore';
import { refreshDownloads, requestPersist } from '@/features/downloads/manager';
import { importFiles, loadFolder } from '@/providers/folder';

interface ImportStatus {
  /** null = không có lần nạp nào đang chạy */
  progress: { done: number; total: number } | null;
}

export const useImportStatus = create<ImportStatus>()(() => ({ progress: null }));

/** Nạp danh sách file vào máy, báo tiến độ qua store và kết quả qua toast. */
export async function runImport(files: File[]): Promise<void> {
  if (!files.length) return;
  useImportStatus.setState({ progress: { done: 0, total: files.length } });
  try {
    const r = await importFiles(files, (done, total) => useImportStatus.setState({ progress: { done, total } }));
    await refreshDownloads();
    await loadFolder();
    void requestPersist();
    const parts = [`Đã thêm ${r.added.length} bài`];
    if (r.existing) parts.push(`${r.existing} bài đã có`);
    if (r.skipped.length) parts.push(`bỏ qua ${r.skipped.length} file không phải nhạc`);
    if (r.failed.length) parts.push(`${r.failed.length} file lỗi`);
    toast(parts.join(', '));
  } catch (err) {
    toast(`Không thêm được nhạc: ${(err as Error).message}`);
  } finally {
    useImportStatus.setState({ progress: null });
  }
}
