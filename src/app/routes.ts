import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
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
  Component: ComponentType | LazyExoticComponent<ComponentType>;
  /** true = nằm trong Layout (thanh điều hướng + mini-player); false = toàn màn hình. */
  layout: boolean;
}

// Trang nặng/ít dùng tải lười để bundle chính nhỏ (App.tsx bọc Suspense).
const BrowsePage = lazy(() => import('@/pages/BrowsePage').then((m) => ({ default: m.BrowsePage })));
const GroupPage = lazy(() => import('@/pages/GroupPage').then((m) => ({ default: m.GroupPage })));
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const SmartPlaylistsPage = lazy(() => import('@/pages/SmartPlaylistsPage').then((m) => ({ default: m.SmartPlaylistsPage })));
const SmartEditPage = lazy(() => import('@/pages/SmartEditPage').then((m) => ({ default: m.SmartEditPage })));

/** Thêm trang mới = thêm một dòng vào đây (App.tsx tự map). */
export const routes: AppRoute[] = [
  { index: true, Component: HomePage, layout: true },
  { path: 'search', Component: SearchPage, layout: true },
  { path: 'library', Component: LibraryPage, layout: true },
  { path: 'library/liked', Component: LikedPage, layout: true },
  { path: 'library/downloads', Component: DownloadsPage, layout: true },
  { path: 'library/browse', Component: BrowsePage, layout: true },
  { path: 'library/group/:kind/:key', Component: GroupPage, layout: true },
  { path: 'library/stats', Component: StatsPage, layout: true },
  { path: 'library/smart', Component: SmartPlaylistsPage, layout: true },
  { path: 'library/smart/:id', Component: SmartEditPage, layout: true },
  { path: 'library/playlist/:id', Component: PlaylistPage, layout: true },
  { path: 'settings', Component: SettingsPage, layout: true },
  { path: 'player', Component: PlayerPage, layout: false },
  { path: 'lyrics', Component: LyricsPage, layout: false },
];
