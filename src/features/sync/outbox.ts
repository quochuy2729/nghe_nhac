/**
 * Outbox: mọi thay đổi cần lên Supabase được ghi vào IndexedDB trước (xem docs/ARCHITECTURE.md §4);
 * `syncService` đẩy theo lô và chỉ xóa dòng khi server đã nhận → mất mạng giữa chừng không mất dữ liệu.
 */
import { getDB, type OutboxRecord } from '@/lib/db';

export async function enqueue(table: string, op: OutboxRecord['op'], row: Record<string, unknown>): Promise<void> {
  await (await getDB()).add('outbox', { table, op, row, createdAt: Date.now() });
}

/** Các dòng chờ đẩy, cũ → mới (tối đa `limit`). */
export async function pending(limit = 500): Promise<OutboxRecord[]> {
  const out: OutboxRecord[] = [];
  let cursor = await (await getDB()).transaction('outbox').store.openCursor();
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export async function pendingCount(): Promise<number> {
  return (await getDB()).count('outbox');
}

export async function pendingForTable(table: string): Promise<number> {
  const db = await getDB();
  let n = 0;
  let cursor = await db.transaction('outbox').store.openCursor();
  while (cursor) {
    if (cursor.value.table === table) n++;
    cursor = await cursor.continue();
  }
  return n;
}

/** Xóa các dòng đã đẩy thành công (theo khóa `seq`). */
export async function removeSent(seqs: number[]): Promise<void> {
  const tx = (await getDB()).transaction('outbox', 'readwrite');
  await Promise.all([...seqs.map((s) => tx.store.delete(s)), tx.done]);
}

/** Bỏ mọi dòng chờ của một bảng (vd khi người dùng xóa lịch sử nghe). */
export async function clearTable(table: string): Promise<void> {
  const tx = (await getDB()).transaction('outbox', 'readwrite');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.table === table) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
