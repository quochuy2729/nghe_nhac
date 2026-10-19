import type { ReactNode } from 'react';
import { ChevronLeftIcon, PlayIcon, ShuffleIcon } from './Icons';
import { useGoBack } from '@/lib/useGoBack';

/** Đầu trang playlist/bộ sưu tập: nút quay lại, ảnh bìa, tên, nút phát. */
export function CollectionHeader(props: {
  title: string;
  subtitle: string;
  cover: ReactNode;
  gradient: string;
  onPlay?: () => void;
  onShuffle?: () => void;
  actions?: ReactNode;
}) {
  const goBack = useGoBack();
  return (
    <div style={{ background: `linear-gradient(180deg, ${props.gradient} 0%, #121212 100%)` }} className="pb-2">
      <div className="px-2 pt-2">
        <button type="button" aria-label="Quay lại" className="icon-btn" onClick={goBack}>
          <ChevronLeftIcon size={28} />
        </button>
      </div>
      <div className="flex flex-col items-center px-4 pt-2">
        {props.cover}
        <h1 className="mt-4 w-full text-2xl font-bold">{props.title}</h1>
        <p className="w-full text-sm text-muted">{props.subtitle}</p>
      </div>
      <div className="mt-2 flex items-center justify-between px-4">
        <div className="-ml-2 flex">{props.actions}</div>
        <div className="flex items-center gap-2">
          {props.onShuffle && (
            <button type="button" aria-label="Phát ngẫu nhiên" className="icon-btn text-white/80" onClick={props.onShuffle}>
              <ShuffleIcon size={24} />
            </button>
          )}
          {props.onPlay && (
            <button type="button" aria-label="Phát" className="icon-btn h-14 w-14 bg-accent text-black" onClick={props.onPlay}>
              <PlayIcon size={26} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
