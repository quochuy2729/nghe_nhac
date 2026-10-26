/**
 * Bọc backend Supabase của thư viện: mất mạng thì xếp thao tác vào outbox (bảng `library`) thay vì báo lỗi và
 * hoàn tác; `syncService` phát lại theo đúng thứ tự khi có mạng. Đã có thao tác chờ thì mọi thao tác sau cũng
 * xếp hàng để không đảo thứ tự.
 */
import { enqueue, pendingForTable } from '@/features/sync/outbox';
import type { LibraryBackend } from './types';

const METHODS = ['like', 'unlike', 'createPlaylist', 'renamePlaylist', 'deletePlaylist', 'appendToPlaylist', 'setPlaylistTracks'] as const;
type Method = (typeof METHODS)[number];

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return err instanceof TypeError || /fetch|network|load failed|timeout|offline/i.test(msg);
}

export function withOfflineQueue(inner: LibraryBackend): LibraryBackend {
  const wrapped: LibraryBackend = { ...inner };
  for (const fn of METHODS) {
    const original = inner[fn] as (...a: unknown[]) => Promise<void>;
    (wrapped as unknown as Record<Method, (...a: unknown[]) => Promise<void>>)[fn] = async (...args) => {
      if ((await pendingForTable('library')) > 0) {
        await enqueue('library', 'upsert', { fn, args });
        return;
      }
      try {
        await original.apply(inner, args);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await enqueue('library', 'upsert', { fn, args });
      }
    };
  }
  return wrapped;
}

/** Phát lại một thao tác đã xếp hàng lên backend thật. */
export async function replayLibraryOp(inner: LibraryBackend, row: Record<string, unknown>): Promise<void> {
  const fn = row.fn as Method;
  if (!METHODS.includes(fn)) return; // dữ liệu lạ: bỏ qua thay vì kẹt cả outbox
  await (inner[fn] as (...a: unknown[]) => Promise<void>).apply(inner, row.args as unknown[]);
}
