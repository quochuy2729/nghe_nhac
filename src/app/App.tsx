import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toast } from '@/components/Toast';
import { initAuth } from '@/features/auth/store';
import { initDownloads } from '@/features/downloads/manager';
import { PlaylistPicker } from '@/features/library/PlaylistPicker';
import { initLibrary } from '@/features/library/store';
import { TrackMenu } from '@/features/library/TrackMenu';
import { initPlayer } from '@/features/player/store';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { HomePage } from '@/pages/HomePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { LikedPage } from '@/pages/LikedPage';
import { LyricsPage } from '@/pages/LyricsPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { PlaylistPage } from '@/pages/PlaylistPage';
import { SearchPage } from '@/pages/SearchPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { CloseOverlaysOnNavigate } from './CloseOverlaysOnNavigate';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './Layout';

// HashRouter: GitHub Pages không hỗ trợ rewrite SPA, hash route chạy ổn cả khi cài PWA.
export function App() {
  useEffect(() => {
    initPlayer();
    initAuth();
    initLibrary();
    initDownloads();
  }, []);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="library/liked" element={<LikedPage />} />
            <Route path="library/downloads" element={<DownloadsPage />} />
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
      </ErrorBoundary>
    </HashRouter>
  );
}
