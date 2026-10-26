import type { ComponentType } from 'react';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { HomePage } from '@/pages/HomePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { LikedPage } from '@/pages/LikedPage';
import { LyricsPage } from '@/pages/LyricsPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { PlaylistPage } from '@/pages/PlaylistPage';
import { SearchPage } from '@/pages/SearchPage';
import { SettingsPage } from '@/pages/SettingsPage';

export interface AppRoute {
  /** Đường dẫn tương đối; bỏ trống khi `index`. */
  path?: string;
  index?: boolean;
  Component: ComponentType;
  /** true = nằm trong Layout (thanh điều hướng + mini-player); false = toàn màn hình. */
  layout: boolean;
}

/** Thêm trang mới = thêm một dòng vào đây (App.tsx tự map). */
export const routes: AppRoute[] = [
  { index: true, Component: HomePage, layout: true },
  { path: 'search', Component: SearchPage, layout: true },
  { path: 'library', Component: LibraryPage, layout: true },
  { path: 'library/liked', Component: LikedPage, layout: true },
  { path: 'library/downloads', Component: DownloadsPage, layout: true },
  { path: 'library/playlist/:id', Component: PlaylistPage, layout: true },
  { path: 'settings', Component: SettingsPage, layout: true },
  { path: 'player', Component: PlayerPage, layout: false },
  { path: 'lyrics', Component: LyricsPage, layout: false },
];
