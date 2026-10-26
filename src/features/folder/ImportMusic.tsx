import { useRef, useState } from 'react';
import { PlusIcon } from '@/components/Icons';
import { toast } from '@/components/toastStore';
import { refreshDownloads, requestPersist } from '@/features/downloads/manager';
import { importFiles, loadFolder } from '@/providers/folder';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.lrc';

/** Nút nạp nhạc vào điện thoại: chọn nhiều file hoặc cả thư mục (kèm .lrc cùng tên nếu có lời). */
export function ImportMusic() {
  const filesInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  const run = async (list: File[]) => {
    if (!list.length) return;
    setProgress({ done: 0, total: list.length });
    try {
      const r = await importFiles(list, (done, total) => setProgress({ done, total }));
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
      setProgress(null);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    void run(list);
  };

  return (
    <div>
      <input ref={filesInput} type="file" accept={ACCEPT} multiple hidden onChange={onPick} />
      <input
        ref={(el) => {
          dirInput.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        hidden
        onChange={onPick}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" disabled={busy} onClick={() => dirInput.current?.click()} className="chip chip-active gap-2 disabled:opacity-50">
          <PlusIcon size={18} />
          Thêm thư mục nhạc
        </button>
        <button type="button" disabled={busy} onClick={() => filesInput.current?.click()} className="chip gap-2 disabled:opacity-50">
          <PlusIcon size={18} />
          Thêm file
        </button>
      </div>
      {busy && (
        <p role="status" className="mt-3 text-center text-xs text-muted">
          Đang đọc {Math.min(progress.done + 1, progress.total)}/{progress.total}… đừng tắt app
        </p>
      )}
    </div>
  );
}
