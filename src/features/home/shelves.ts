import type { ComponentType } from 'react';
import type { Signals } from '@/features/recommend/engine';
import type { Track } from '@/providers/types';
import { ForYouShelf, MixesShelf, NewestShelf, RecentShelf } from './builtin';

/** Dữ liệu dùng chung cho mọi kệ; được tạo lại khi thư viện, lịch sử hoặc danh sách thích đổi. */
export interface HomeContext {
  tracks: Track[];
  signals: Signals;
}

export interface HomeShelf {
  id: string;
  /** Tự trả về null khi không có gì để hiện. */
  Component: ComponentType<{ ctx: HomeContext }>;
}

/** Thứ tự hiển thị trên Trang chủ. Thêm kệ mới = thêm một dòng. */
export const homeShelves: HomeShelf[] = [
  { id: 'recent', Component: RecentShelf },
  { id: 'for-you', Component: ForYouShelf },
  { id: 'mixes', Component: MixesShelf },
  { id: 'newest', Component: NewestShelf },
];
