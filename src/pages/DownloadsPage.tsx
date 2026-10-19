import { useEffect, useState } from 'react';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { Artwork } from '@/components/Artwork';
import { TrashIcon } from '@/components/Icons';
import { player } from '@/features/player/store';
import { formatBytes } from '@/lib/utils';
import { removeDownload, requestPersist, storageEstimate, useDownloads, refreshDownloads } from '@/features/downloads/manager';

export function DownloadsPage() {
  const items = useDownloads((s) => s.items);
  const loaded = useDownloads((s) => s.loaded);
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);

  useEffect(() => {
    void refreshDownloads();
  }, []);
  useEffect(() => {
    void storageEstimate().then(setEst);
  }, [items.length]);

  const tracks = items.map((i) => i.track);
  const total = items.reduce((a, i) => a + i.size, 0);

  return (
    <div className="pb-6">
      <CollectionHeaderBack title="Đã tải về" />
      <section className="mx-4 rounded-lg bg-surface-2 p-4 text-sm">
        <p>
          <span className="font-semibold">{items.length} bài</span> · {formatBytes(total)}
        </p>
        {est && est.quota > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded bg-white/15" aria-hidden="true">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (est.usage / est.quota) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Ứng dụng đang dùng {formatBytes(est.usage)} / khoảng {formatBytes(est.quota)} cho phép.
            </p>
          </>
        )}
        {est && !est.persisted && (
          <button
            type="button"
            className="chip mt-3 bg-surface-3"
            onClick={async () => {
              await requestPersist();
              setEst(await storageEstimate());
            }}
          >
            Giữ dữ liệu offline (không tự xóa)
          </button>
        )}
        {est?.persisted && <p className="mt-2 text-xs text-accent">Đã bật lưu trữ bền vững.</p>}
      </section>

      {loaded && items.length === 0 && (
        <p className="px-6 py-10 text-center text-sm text-muted">
          Chưa có bài nào. Bấm biểu tượng tải về ở bài có nhãn “Tải được” hoặc thêm file nhạc của bạn ở tab Tìm kiếm → Của tôi.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-4 flex justify-end px-4">
          <button type="button" className="chip chip-active" onClick={() => player.playTracks(tracks, 0, 'Đã tải về')}>
            Phát tất cả
          </button>
        </div>
      )}
      <ul className="mt-2">
        {items.map((it, i) => (
          <li key={it.track.id} className="flex min-h-[60px] items-center gap-3 px-4">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left" onClick={() => player.playTracks(tracks, i, 'Đã tải về')}>
              <Artwork src={it.track.artworkUrl} className="h-12 w-12" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{it.track.title}</span>
                <span className="block truncate text-[13px] text-muted">
                  {it.track.provider === 'local' ? 'File của tôi' : it.track.artist} · {formatBytes(it.size)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn -mr-2 text-muted"
              aria-label={`Xóa ${it.track.title} khỏi máy`}
              onClick={() => {
                const msg = it.track.provider === 'local' ? `Xóa file “${it.track.title}” khỏi máy này?` : `Xóa bản tải “${it.track.title}”?`;
                if (window.confirm(msg)) void removeDownload(it.track);
              }}
            >
              <TrashIcon size={20} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
