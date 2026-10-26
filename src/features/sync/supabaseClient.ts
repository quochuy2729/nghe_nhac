/** Adapter Supabase cho `SyncClient`. RLS đảm bảo chỉ đụng được dữ liệu của chính người dùng. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row, } from './rows';
import type { SyncClient } from './syncService';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseSyncClient(sb: SupabaseClient): SyncClient {
  return {
    async insertIgnore(table, rows) {
      // on conflict (id) do nothing → đẩy lại cả lô vẫn không trùng
      check(await sb.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    },

    async upsert(table, rows, onConflict) {
      check(await sb.from(table).upsert(rows, { onConflict }));
    },

    async selectSince(table, column, since, limit) {
      let q = sb.from(table).select('*').order(column, { ascending: true }).limit(limit);
      if (since) q = q.gte(column, since);
      return (check(await q) ?? []) as Row[];
    },

    async deleteAll(table) {
      // PostgREST bắt buộc có bộ lọc khi DELETE; RLS giới hạn trong dữ liệu của mình.
      check(await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'));
    },
  };
}
