import { useState } from 'react';
import { MusicIcon } from './Icons';
import { cx } from '@/lib/utils';

export function Artwork({ src, alt = '', className, rounded = 'rounded' }: { src?: string; alt?: string; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cx('flex shrink-0 items-center justify-center bg-surface-3 text-muted', rounded, className)} aria-hidden={!alt}>
        <MusicIcon size={20} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cx('shrink-0 bg-surface-3 object-cover', rounded, className)}
    />
  );
}
