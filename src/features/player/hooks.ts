import { useQueueStore } from './store';
import { currentItem } from './queue';

export function useCurrentItem() {
  return useQueueStore((s) => currentItem(s.queue));
}

export function useCurrentTrack() {
  return useCurrentItem()?.track;
}
