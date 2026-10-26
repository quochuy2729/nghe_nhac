import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toast } from '@/components/Toast';
import { initAuth } from '@/features/auth/store';
import { initDownloads } from '@/features/downloads/manager';
import { PlaylistPicker } from '@/features/library/PlaylistPicker';
import { initLibrary } from '@/features/library/store';
import { TrackMenu } from '@/features/library/TrackMenu';
import { initPlayer } from '@/features/player/store';
import { loadHistory } from '@/features/recommend/history';
import { platform } from '@/platform';
import { loadFolder } from '@/providers/folder';
import { CloseOverlaysOnNavigate } from './CloseOverlaysOnNavigate';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './Layout';
import { routes, type AppRoute } from './routes';

function renderRoute(r: AppRoute) {
  const C = r.Component;
  return r.index ? <Route key="index" index element={<C />} /> : <Route key={r.path} path={r.path} element={<C />} />;
}

// HashRouter: không cần cấu hình rewrite phía server, chạy ổn cả khi cài PWA.
export function App() {
  useEffect(() => {
    initPlayer();
    initAuth();
    initLibrary();
    initDownloads();
    void loadFolder();
    void loadHistory();
    return platform.library.startAutoRescan?.();
  }, []);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>{routes.filter((r) => r.layout).map(renderRoute)}</Route>
          {routes.filter((r) => !r.layout).map(renderRoute)}
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
