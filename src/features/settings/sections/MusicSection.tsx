import { Link } from 'react-router-dom';
import { useDownloads } from '@/features/downloads/manager';
import { ImportMusic } from '@/features/folder/ImportMusic';
import { LinkedFolders } from '@/features/folder/LinkedFolders';
import { platform } from '@/platform';
import { useFolder } from '@/providers/folder';
import { formatBytes } from '@/lib/utils';

export default function MusicSection() {
  const items = useDownloads((s) => s.items);
  const trackCount = useFolder((s) => s.tracks.length);
  const linked = platform.caps.folderLink;
  const total = items.reduce((a, i) => a + i.size, 0);
  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 text-lg font-bold">Nhạc trên điện thoại này</h2>
      <div className="rounded-lg bg-surface-2 p-4 text-sm">
        {linked ? (
          <>
            <p className="font-semibold">{trackCount} bài</p>
            <p className="mb-4 mt-1 text-xs text-muted">
              App đọc thẳng từ thư mục bạn chọn, không sao chép file. Bài mới tự xuất hiện khi mở lại app.
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="font-semibold">{items.length} bài</span> · {formatBytes(total)}{' '}
              <Link to="/library/downloads" className="ml-1 text-accent">
                Quản lý
              </Link>
            </p>
            <p className="mb-4 mt-1 text-xs text-muted">
              Mỗi điện thoại có kho nhạc riêng: thêm nhạc trên máy nào thì nghe được trên máy đó. Chọn lại thư mục khi có bài mới; bài đã có sẽ được bỏ qua.
            </p>
          </>
        )}
        <ImportMusic />
        {linked && <LinkedFolders />}
      </div>
    </section>
  );
}
