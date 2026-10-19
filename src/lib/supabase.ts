import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabase } from './env';

/** null khi chưa cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY → chế độ khách. */
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE dùng ?code= thay vì #access_token= nên không đụng HashRouter.
        flowType: 'pkce',
        storageKey: 'nn-auth',
      },
    })
  : null;

export const USER_AUDIO_BUCKET = 'user-audio';
