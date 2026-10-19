import { Link } from 'react-router-dom';
import type { Track } from '@/providers/types';
import { LyricsBody } from './LyricsBody';

/** Thẻ xem trước lời ở màn Đang phát; chạm "Mở rộng" để xem toàn màn hình. */
export function LyricsCard({ track, color }: { track: Track; color: string }) {
  return (
    <section className="mt-6 overflow-hidden rounded-xl" style={{ backgroundColor: color }} aria-label="Xem trước lời bài hát">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="font-bold">Lời bài hát</h2>
        <Link to="/lyrics" className="chip bg-black/30 px-4 text-xs">
          Mở rộng
        </Link>
      </div>
      <div className="px-4 pb-2">
        <LyricsBody track={track} compact className="h-64" />
      </div>
    </section>
  );
}
