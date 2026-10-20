import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlaylistPicker, useTrackMenu } from '@/features/library/trackMenuStore';

/** Đóng các bottom sheet khi đổi trang (vd bấm nút Back của Android). */
export function CloseOverlaysOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    useTrackMenu.getState().close();
    usePlaylistPicker.getState().close();
  }, [pathname]);
  return null;
}
