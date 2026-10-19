import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { initAuth } from '@/features/auth/store';
import { initLibrary } from '@/features/library/store';
import { PlaylistPicker } from '@/features/library/PlaylistPicker';
import { CloseOverlaysOnNavigate } from './CloseOverlaysOnNavigate';
import { PlaylistPage } from '@/pages/PlaylistPage';
import { LikedPage } from '@/pages/LikedPage';
import { initPlayer } from '@/features/player/store';
import { TrackMenu } from '@/features/library/TrackMenu';
import { Toast } from '@/components/Toast';
import { Layout } from './Layout';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { LyricsPage } from '@/pages/LyricsPage';
import { SettingsPage } from '@/pages/SettingsPage';

// HashRouter: GitHub Pages không hỗ trợ rewrite SPA, hash route chạy ổn cả khi cài PWA.
export function App() {
  useEffect(() => {
    initPlayer();
    initAuth();
    initLibrary();
  }, []);
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/liked" element={<LikedPage />} />
          <Route path="library/playlist/:id" element={<PlaylistPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="player" element={<PlayerPage />} />
        <Route path="lyrics" element={<LyricsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CloseOverlaysOnNavigate />
      <TrackMenu />
      <PlaylistPicker />
      <Toast />
    </HashRouter>
  );
}
