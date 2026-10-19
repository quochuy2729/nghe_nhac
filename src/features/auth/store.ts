import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  ready: boolean;
  session: Session | null;
  user: User | null;
}

export const useAuth = create<AuthState>()(() => ({
  ready: !supabase,
  session: null,
  user: null,
}));

let started = false;

export function initAuth(): void {
  if (started || !supabase) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ ready: true, session: data.session, user: data.session?.user ?? null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ ready: true, session, user: session?.user ?? null });
  });
}

function requireClient() {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (xem README).');
  return supabase;
}

function vnAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Sai email hoặc mật khẩu.';
  if (m.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở thư xác nhận rồi đăng nhập lại.';
  if (m.includes('already registered')) return 'Email này đã có tài khoản. Hãy đăng nhập.';
  if (m.includes('password should be')) return 'Mật khẩu quá ngắn (tối thiểu 6 ký tự).';
  if (m.includes('rate limit')) return 'Thao tác quá nhanh, thử lại sau ít phút.';
  if (m.includes('fetch')) return 'Không kết nối được máy chủ.';
  return message;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error(vnAuthError(error.message));
}

/** @returns true nếu cần xác nhận email trước khi đăng nhập. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
  });
  if (error) throw new Error(vnAuthError(error.message));
  return !data.session;
}

export async function signOut(): Promise<void> {
  await requireClient().auth.signOut();
}
