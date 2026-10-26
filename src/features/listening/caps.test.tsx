import { renderToString } from 'react-dom/server';
import type { PlatformCaps } from '@/platform/types';

const WEB: PlatformCaps = { folderLink: false, noCopy: false, eq: false, normalize: false, crossfade: false, gapless: false, speed: true, sleepTimer: true, analyze: true };
const ANDROID: PlatformCaps = { folderLink: true, noCopy: true, eq: true, normalize: true, crossfade: true, gapless: true, speed: true, sleepTimer: true, analyze: true };

/** Nạp lại các component với `platform.caps` giả để kiểm việc ẩn/hiện theo nền tảng. */
async function load(caps: PlatformCaps) {
  vi.resetModules();
  vi.doMock('@/platform', () => ({
    platform: { id: caps.eq ? 'android' : 'web', caps, engine: { on: () => () => undefined, getPosition: () => 0 }, library: {}, decoder: {} },
  }));
  const [{ default: ListeningSection }, { PlaybackOptionsSheet }] = await Promise.all([
    import('@/features/settings/sections/ListeningSection'),
    import('./PlaybackOptionsSheet'),
  ]);
  return { ListeningSection, PlaybackOptionsSheet };
}

afterEach(() => {
  vi.doUnmock('@/platform');
});

describe('ẩn/hiện theo platform.caps', () => {
  it('iPhone/web: không có EQ, chuẩn hóa, crossfade → cả mục Trải nghiệm nghe bị ẩn', async () => {
    const { ListeningSection } = await load(WEB);
    expect(renderToString(<ListeningSection />)).toBe('');
  });

  it('iPhone/web: vẫn có tốc độ và hẹn giờ', async () => {
    const { PlaybackOptionsSheet } = await load(WEB);
    const html = renderToString(<PlaybackOptionsSheet open onClose={() => undefined} />);
    expect(html).toContain('Tốc độ phát');
    expect(html).toContain('Hẹn giờ tắt');
    expect(html).toContain('không giảm dần âm lượng');
  });

  it('Android: hiện EQ, chuẩn hóa, crossfade', async () => {
    const { ListeningSection } = await load(ANDROID);
    const html = renderToString(<ListeningSection />);
    expect(html).toContain('Equalizer');
    expect(html).toContain('Chuẩn hóa âm lượng');
    expect(html).toContain('Crossfade');
    expect(html).toContain('Bass');
  });

  it('nền tảng không hỗ trợ tốc độ/hẹn giờ thì sheet không hiện mục đó', async () => {
    const { PlaybackOptionsSheet } = await load({ ...WEB, speed: false, sleepTimer: false });
    const html = renderToString(<PlaybackOptionsSheet open onClose={() => undefined} />);
    expect(html).not.toContain('Tốc độ phát');
    expect(html).not.toContain('Hẹn giờ tắt');
  });
});
