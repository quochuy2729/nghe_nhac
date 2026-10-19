import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { initPlayer } from '@/features/player/store';
import { Layout } from './Layout';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { LyricsPage } from '@/pages/LyricsPage';
import { SettingsPage } from '@/pages/SettingsPage';

// HashRouter: GitHub Pages không hỗ trợ rewrite SPA, hash route chạy ổn cả khi cài PWA.
export function App() {
  useEffect(() => initPlayer(), []);
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="player" element={<PlayerPage />} />
        <Route path="lyrics" element={<LyricsPage />} />
      </Routes>
    </HashRouter>
  );
}
