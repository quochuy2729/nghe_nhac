/**
 * Outbox: mọi thay đổi cần lên Supabase được ghi vào IndexedDB trước (xem docs/ARCHITECTURE.md §4).
 * G1 chỉ có `enqueue`; việc đẩy lên server làm ở G4.
 */
import { getDB, type OutboxRecord } from '@/lib/db';

export async function enqueue(table: string, op: OutboxRecord['op'], row: Record<string, unknown>): Promise<void> {
  await (await getDB()).add('outbox', { table, op, row, createdAt: Date.now() });
}

/** Các dòng chờ đẩy, cũ → mới (tối đa `limit`). Dùng cho test và G4. */
export async function pending(limit = 500): Promise<OutboxRecord[]> {
  const out: OutboxRecord[] = [];
  let cursor = await (await getDB()).transaction('outbox').store.openCursor();
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}
