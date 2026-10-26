/** Cấu hình đọc từ biến môi trường build-time (Vite). Không có Supabase → thư viện chạy chế độ khách. */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '',
};

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseAnonKey);
