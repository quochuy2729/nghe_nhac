import { PlusIcon } from '@/components/Icons';
import { platform } from '@/platform';
import { useImportStatus } from './runImport';

/** Nút nạp nhạc vào điện thoại: chọn cả thư mục hoặc nhiều file (kèm .lrc cùng tên nếu có lời). */
export function ImportMusic() {
  const progress = useImportStatus((s) => s.progress);
  const busy = progress !== null;

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {/* Phải gọi đồng bộ trong onClick để trình duyệt cho mở hộp chọn file. */}
        <button type="button" disabled={busy} onClick={() => void platform.library.addFolder()} className="chip chip-active gap-2 disabled:opacity-50">
          <PlusIcon size={18} />
          Thêm thư mục nhạc
        </button>
        {platform.library.addFiles && (
          <button type="button" disabled={busy} onClick={() => void platform.library.addFiles?.()} className="chip gap-2 disabled:opacity-50">
            <PlusIcon size={18} />
            Thêm file
          </button>
        )}
      </div>
      {progress && (
        <p role="status" className="mt-3 text-center text-xs text-muted">
          Đang đọc {Math.min(progress.done + 1, progress.total)}/{progress.total}… đừng tắt app
        </p>
      )}
    </div>
  );
}
