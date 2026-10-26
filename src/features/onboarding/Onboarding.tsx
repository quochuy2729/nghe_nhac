import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platform } from '@/platform';
import { useFolder } from '@/providers/folder';
import { onboardingSteps } from './steps';
import { useOnboarding } from './store';

/**
 * Hướng dẫn lần đầu mở app (3 bước, theo nền tảng). Người đã có nhạc trong máy (dùng bản v1) không bị hỏi lại.
 */
export function Onboarding() {
  const seen = useOnboarding((s) => s.seen);
  const forced = useOnboarding((s) => s.forced);
  const dismiss = useOnboarding((s) => s.dismiss);
  const status = useFolder((s) => s.status);
  const hasMusic = useFolder((s) => s.tracks.length > 0);
  const [i, setI] = useState(0);
  const navigate = useNavigate();

  const show = forced || (!seen && status === 'ready' && !hasMusic);
  if (!show) return null;
  const steps = onboardingSteps(platform.id, typeof platform.library.addFiles === 'function');
  const step = steps[i];
  const last = i === steps.length - 1;

  const act = () => {
    // Phải gọi đồng bộ trong onClick: trình duyệt chỉ cho mở hộp chọn file khi có thao tác chạm.
    if (step.action === 'addFolder') void platform.library.addFolder();
    else if (step.action === 'openSettings') {
      dismiss();
      navigate('/settings');
      return;
    }
    if (!last) setI(i + 1);
    else dismiss();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Hướng dẫn" className="fixed inset-0 z-[70] flex flex-col justify-center bg-canvas px-6 pb-[env(safe-area-inset-bottom)] pt-safe-t">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Bước {i + 1}/{steps.length}
      </p>
      <h1 className="text-2xl font-bold">{step.title}</h1>
      <div className="mt-4 space-y-3 text-[15px] text-white/85">
        {step.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {step.action === 'addFolder' && (
          <button type="button" className="chip chip-active h-12 px-5" onClick={act}>
            Thêm thư mục nhạc
          </button>
        )}
        {step.id === 'add-music' && platform.library.addFiles && (
          <button type="button" className="chip h-12 px-5" onClick={() => void platform.library.addFiles?.()}>
            Thêm file
          </button>
        )}
        {step.action === 'openSettings' && (
          <button type="button" className="chip chip-active h-12 px-5" onClick={act}>
            Đăng nhập trong Cài đặt
          </button>
        )}
        {step.action === undefined && (
          <button type="button" className="chip chip-active h-12 px-5" onClick={() => setI(i + 1)}>
            Tiếp tục
          </button>
        )}
        {step.action !== undefined && !last && (
          <button type="button" className="chip h-12 px-5" onClick={() => setI(i + 1)}>
            Để sau
          </button>
        )}
        {last && (
          <button type="button" className="chip h-12 px-5" onClick={dismiss}>
            Bắt đầu dùng
          </button>
        )}
      </div>
      <button type="button" className="mt-6 self-start text-sm text-muted underline" onClick={dismiss}>
        Bỏ qua hướng dẫn
      </button>
    </div>
  );
}
