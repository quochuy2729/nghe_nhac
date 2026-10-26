import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/toastStore';
import { platform } from '@/platform';
import { useImportStatus } from './runImport';

/** Android: các thư mục đã liên kết (đọc thẳng, không sao chép) + nút quét lại / bỏ liên kết. */
export function LinkedFolders() {
  const [folders, setFolders] = useState<{ id: string; label: string }[]>([]);
  const busy = useImportStatus((s) => s.progress !== null);

  const refresh = useCallback(() => platform.library.listFolders().then(setFolders, () => setFolders([])), []);
  useEffect(() => {
    void refresh();
  }, [refresh, busy]);

  if (!folders.length) return null;
  return (
    <div className="mt-4">
      <ul className="divide-y divide-white/5 text-sm">
        {folders.map((f) => (
          <li key={f.id} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="truncate">{f.label}</span>
            <button
              type="button"
              disabled={busy}
              className="min-h-[44px] px-2 text-xs text-muted disabled:opacity-50"
              onClick={() => void platform.library.removeFolder(f.id).then(refresh)}
            >
              Bỏ liên kết
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        className="chip mt-2 disabled:opacity-50"
        onClick={() =>
          void platform.library.rescan().then(
            (r) => toast(r.added || r.removed ? `Thêm ${r.added}, xóa ${r.removed} bài` : 'Không có thay đổi'),
            (err: Error) => toast(`Không quét được: ${err.message}`),
          )
        }
      >
        Quét lại
      </button>
    </div>
  );
}
