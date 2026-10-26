import { getMeta, putOverride, resetDBForTests, setMeta } from '@/lib/db';
import { enqueue, pending } from './outbox';

beforeEach(() => resetDBForTests());

describe('outbox', () => {
  it('enqueue ghi vào IndexedDB theo thứ tự, mỗi dòng có seq tăng dần', async () => {
    await enqueue('liked_tracks', 'upsert', { track_id: 'folder:1' });
    await enqueue('smart_playlists', 'delete', { id: 'p1' });
    const rows = await pending();
    expect(rows.map((r) => [r.table, r.op, r.row])).toEqual([
      ['liked_tracks', 'upsert', { track_id: 'folder:1' }],
      ['smart_playlists', 'delete', { id: 'p1' }],
    ]);
    expect(rows[1].seq).toBeGreaterThan(rows[0].seq!);
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });

  it('pending giới hạn số dòng', async () => {
    for (let i = 0; i < 5; i++) await enqueue('t', 'insert', { i });
    expect(await pending(2)).toHaveLength(2);
  });
});

describe('IndexedDB v2', () => {
  it('có đủ store mới và đọc/ghi được meta, overrides', async () => {
    await setMeta('cursor:play_events', '2026-10-26T00:00:00Z');
    expect(await getMeta('cursor:play_events')).toBe('2026-10-26T00:00:00Z');
    expect(await getMeta('khong-co')).toBeUndefined();
    await putOverride({ trackId: 'folder:1', patch: { title: 'X' }, updatedAt: 1 });
  });
});
