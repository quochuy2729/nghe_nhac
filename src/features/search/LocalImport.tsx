import { useRef, useState } from 'react';
import { PlusIcon } from '@/components/Icons';
import { toast } from '@/components/toastStore';
import { importLocalFiles } from '@/providers/local';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.lrc';

export function LocalImport({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="px-4 pb-3">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          try {
            const r = await importLocalFiles(files);
            toast(
              `Đã thêm ${r.added.length} bài` + (r.skipped.length ? `, bỏ qua ${r.skipped.length} file không phải nhạc` : ''),
            );
            onImported();
          } catch (err) {
            toast(`Không thêm được file: ${(err as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="chip gap-2 disabled:opacity-50">
        <PlusIcon size={18} />
        {busy ? 'Đang đọc file…' : 'Thêm file nhạc (kèm .lrc nếu có)'}
      </button>
      <p className="mt-2 text-xs text-muted">File được lưu trên máy này và nghe được khi offline.</p>
    </div>
  );
}
