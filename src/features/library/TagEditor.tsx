import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/toastStore';
import { useFolder } from '@/providers/folder';
import { restoreOriginal, saveOverrides } from './overrideActions';
import { coverFromFile, EMPTY_FORM, formToPatch, type TagForm } from './tagForm';
import { useTagEditor } from './tagEditorStore';

/**
 * Sửa tag một bài hoặc nhiều bài cùng lúc (gán thể loại cho cả album…). Lưu thành override, KHÔNG ghi vào file gốc;
 * ở chế độ nhiều bài, ô để trống = giữ nguyên.
 */
export function TagEditor() {
  const ids = useTagEditor((s) => s.ids);
  const close = useTagEditor((s) => s.close);
  const tracks = useFolder((s) => s.tracks);
  const bulk = ids.length > 1;
  const first = tracks.find((t) => t.id === ids[0]);
  const [form, setForm] = useState<TagForm>(EMPTY_FORM);
  const [cover, setCover] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCover(undefined);
    setForm(
      !first || bulk
        ? EMPTY_FORM
        : {
            title: first.title,
            artist: first.artist,
            album: first.album ?? '',
            albumArtist: first.albumArtist ?? '',
            genre: (first.genre ?? []).join(', '),
            year: first.year ? String(first.year) : '',
            bpm: first.bpm ? String(first.bpm) : '',
          },
    );
  }, [ids, first, bulk]);

  if (!ids.length) return null;
  const set = (k: keyof TagForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ph = bulk ? '(giữ nguyên)' : '';

  const save = async () => {
    const patch = formToPatch(form, bulk);
    if (cover) patch.artworkUrl = cover;
    const n = await saveOverrides(ids, patch);
    toast(n ? `Đã sửa tag ${n} bài` : 'Không có gì để lưu');
    close();
  };

  const field = (k: keyof TagForm, label: string, props: { inputMode?: 'numeric'; disabled?: boolean } = {}) => (
    <label className="block text-xs text-muted">
      {label}
      <input
        value={form[k]}
        onChange={set(k)}
        placeholder={ph}
        disabled={props.disabled}
        inputMode={props.inputMode}
        className="mt-1 h-11 w-full rounded-md bg-canvas px-3 text-base text-white outline-none focus:ring-2 focus:ring-accent disabled:opacity-40"
      />
    </label>
  );

  return (
    <Sheet open onClose={close} label={bulk ? `Sửa tag ${ids.length} bài` : 'Sửa tag'}>
      <div className="space-y-3 px-5 pb-2">
        <h2 className="text-lg font-bold">{bulk ? `Sửa tag ${ids.length} bài` : 'Sửa tag'}</h2>
        <p className="text-xs text-muted">Chỉ đổi cách hiển thị trong app, không sửa file nhạc. Đồng bộ giữa các máy.</p>
        {!bulk && field('title', 'Tên bài')}
        {field('artist', 'Nghệ sĩ')}
        {field('album', 'Album')}
        {field('albumArtist', 'Nghệ sĩ album')}
        {field('genre', 'Thể loại (cách nhau bằng dấu phẩy)')}
        <div className="grid grid-cols-2 gap-3">
          {field('year', 'Năm', { inputMode: 'numeric' })}
          {field('bpm', 'BPM', { inputMode: 'numeric' })}
        </div>
        <div className="flex items-center gap-3">
          {cover && <img src={cover} alt="Ảnh bìa mới" className="h-14 w-14 rounded object-cover" />}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCover(await coverFromFile(f));
            }}
          />
          <button type="button" className="chip" onClick={() => fileRef.current?.click()}>
            {cover ? 'Đổi ảnh bìa' : 'Chọn ảnh bìa'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="chip chip-active h-11" onClick={() => void save()}>
            Lưu
          </button>
          <button type="button" className="chip h-11" onClick={close}>
            Hủy
          </button>
          <button
            type="button"
            className="chip ml-auto h-11"
            onClick={async () => {
              if (!window.confirm('Khôi phục tag gốc của file cho các bài đã chọn?')) return;
              await restoreOriginal(ids);
              toast('Đã khôi phục tag gốc');
              close();
            }}
          >
            Khôi phục tag gốc
          </button>
        </div>
      </div>
    </Sheet>
  );
}
