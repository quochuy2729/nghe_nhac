import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface SettingsSection {
  id: string;
  Component: LazyExoticComponent<ComponentType>;
}

/**
 * Các mục của trang Cài đặt, theo thứ tự hiển thị. Thêm mục mới = tạo file trong `sections/`
 * (export default component) rồi thêm một dòng vào đây.
 */
export const settingsSections: SettingsSection[] = [
  { id: 'account', Component: lazy(() => import('./sections/AccountSection')) },
  { id: 'music', Component: lazy(() => import('./sections/MusicSection')) },
  { id: 'recommend', Component: lazy(() => import('./sections/RecommendSection')) },
  { id: 'analyze', Component: lazy(() => import('./sections/AnalyzeSection')) },
  { id: 'sync', Component: lazy(() => import('./sections/SyncSection')) },
];
