import { useState } from 'react';
import { hasSupabase } from '@/lib/env';
import { signIn, signOut, signUp, useAuth } from './store';
import { useLibrary } from '@/features/library/store';

export function AuthPanel() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const lastSync = useLibrary((s) => s.lastSync);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!hasSupabase) {
    return (
      <div className="rounded-lg bg-surface-2 p-4 text-sm">
        <p className="font-semibold">Chưa cấu hình tài khoản</p>
        <p className="mt-1 text-muted">
          Điền <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> (xem README) để đăng nhập và đồng bộ giữa các máy.
          Hiện thư viện được lưu trên máy này.
        </p>
      </div>
    );
  }

  if (!ready) return <p className="text-sm text-muted">Đang kiểm tra phiên đăng nhập…</p>;

  if (user) {
    return (
      <div className="rounded-lg bg-surface-2 p-4">
        <p className="text-sm text-muted">Đã đăng nhập</p>
        <p className="truncate font-semibold">{user.email}</p>
        {lastSync > 0 && <p className="mt-1 text-xs text-muted">Đồng bộ lúc {new Date(lastSync).toLocaleTimeString('vi-VN')}</p>}
        <button type="button" className="chip mt-3" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <form
      className="rounded-lg bg-surface-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          if (mode === 'in') {
            await signIn(email.trim(), password);
          } else {
            const needConfirm = await signUp(email.trim(), password);
            setMsg({
              kind: 'ok',
              text: needConfirm ? 'Đã tạo tài khoản. Mở email để xác nhận rồi quay lại đăng nhập.' : 'Đã tạo tài khoản và đăng nhập.',
            });
            if (needConfirm) setMode('in');
          }
        } catch (err) {
          setMsg({ kind: 'err', text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div role="tablist" className="mb-4 flex gap-2">
        {(['in', 'up'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`chip ${mode === m ? 'chip-active' : ''}`}
          >
            {m === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        ))}
      </div>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full rounded-md bg-surface-3 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-muted">Mật khẩu</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 w-full rounded-md bg-surface-3 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      {msg && (
        <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`mb-3 text-sm ${msg.kind === 'err' ? 'text-red-300' : 'text-accent'}`}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-accent font-bold text-black disabled:opacity-60">
        {busy ? 'Đang xử lý…' : mode === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}
      </button>
      <p className="mt-3 text-xs text-muted">Đăng nhập cùng tài khoản trên Android và iPhone để đồng bộ bài yêu thích và playlist.</p>
    </form>
  );
}
