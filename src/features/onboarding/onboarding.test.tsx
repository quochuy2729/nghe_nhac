import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { onboardingSteps } from './steps';

describe('onboardingSteps', () => {
  it('Poco: chọn thư mục, không cần chép nhạc vào Tệp', () => {
    const s = onboardingSteps('android', false);
    expect(s.map((x) => x.id)).toEqual(['welcome', 'add-music', 'sync']);
    expect(s[1].title).toBe('Chọn thư mục nhạc');
    expect(s[1].body.join(' ')).toContain('không sao chép');
    expect(s[1].action).toBe('addFolder');
  });

  it('iPhone: hướng dẫn chép nhạc vào Tệp rồi chọn thư mục; có "Thêm file" nếu máy hỗ trợ', () => {
    const withFiles = onboardingSteps('web', true)[1];
    expect(withFiles.title).toContain('Tệp');
    expect(withFiles.body.join(' ')).toContain('Thêm file');
    expect(onboardingSteps('web', false)[1].body.join(' ')).not.toContain('Thêm file');
  });

  it('có giải thích ngắn về đồng bộ và nhấn mạnh nhạc không rời máy', () => {
    const sync = onboardingSteps('web', true)[2];
    expect(sync.body.join(' ')).toContain('file nhạc không bao giờ rời khỏi điện thoại');
    expect(sync.action).toBe('openSettings');
  });
});

describe('<Onboarding />', () => {
  async function render(seen: boolean, status: 'ready' | 'idle', tracks: number, forced = false) {
    vi.resetModules();
    const { useFolder } = await import('@/providers/folder');
    const { useOnboarding } = await import('./store');
    const { Onboarding } = await import('./Onboarding');
    useFolder.setState({ status, tracks: Array.from({ length: tracks }, (_, i) => ({ id: `folder:${i}` })) as never });
    useOnboarding.setState({ seen, forced });
    // Render phía client: zustand dùng state ban đầu khi render server nên setState ở trên sẽ không có tác dụng.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>,
      );
    });
    const html = el.innerHTML;
    act(() => root.unmount());
    return html;
  }

  it('lần đầu, chưa có nhạc → hiện hướng dẫn', async () => {
    const html = await render(false, 'ready', 0);
    expect(html).toContain('Chào mừng đến Nghe Nhạc');
    expect(html).toContain('Bước 1/3');
  });

  it('đã xem, hoặc đã có nhạc (người dùng v1), hoặc đang nạp → không hiện', async () => {
    expect(await render(true, 'ready', 0)).toBe('');
    expect(await render(false, 'ready', 5)).toBe('');
    expect(await render(false, 'idle', 0)).toBe('');
  });

  it('"Xem lại hướng dẫn" hiện lại dù đã xem', async () => {
    expect(await render(true, 'ready', 5, true)).toContain('Chào mừng');
  });
});
