// @vitest-environment node
// Kiểm RLS của migration v2 bằng Postgres thật (PGlite, chạy trong Node): người A không đọc/ghi được dữ liệu của B.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const sql = (name: string) => readFileSync(fileURLToPath(new URL(`./migrations/${name}`, import.meta.url)), 'utf8');

let db: PGlite;

/** Chạy `fn` với tư cách người dùng đã đăng nhập `uid` (role authenticated + claim sub, như PostgREST). */
async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

const ev = (id: string, uid?: string) =>
  db.query(
    `insert into public.play_events (id, ${uid ? 'user_id,' : ''} track_id, ended_at, listened_sec, duration_sec, kind, device)
     values ($1, ${uid ? `'${uid}',` : ''} 'folder:abc', now(), 200, 210, 'complete', 'poco')`,
    [id],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    alter default privileges in schema public grant all on tables to authenticated;
    insert into auth.users values ('${A}', 'a@x.vn'), ('${B}', 'b@x.vn');
  `);
  await db.exec(sql('20261102000000_v2_sync.sql'));
});

afterAll(async () => {
  await db.close();
});

describe('play_events', () => {
  it('user_id mặc định là người đang đăng nhập; mỗi người chỉ thấy lượt nghe của mình', async () => {
    await as(A, () => ev('11111111-1111-4111-8111-111111111111'));
    await as(B, () => ev('22222222-2222-4222-8222-222222222222'));

    const a = await as(A, () => db.query<{ id: string; user_id: string }>('select id, user_id from public.play_events'));
    expect(a.rows).toEqual([{ id: '11111111-1111-4111-8111-111111111111', user_id: A }]);
    const b = await as(B, () => db.query<{ id: string }>('select id from public.play_events'));
    expect(b.rows.map((r) => r.id)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('không ghi giả danh người khác', async () => {
    await expect(as(A, () => ev('33333333-3333-4333-8333-333333333333', B))).rejects.toThrow(/row-level security/);
  });

  it('không update được (kể cả lượt nghe của chính mình)', async () => {
    await expect(
      as(A, () => db.query(`update public.play_events set listened_sec = 1 where id = '11111111-1111-4111-8111-111111111111'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('đẩy lại cùng id nhiều lần (on conflict do nothing) không trùng', async () => {
    const q = `insert into public.play_events (id, track_id, ended_at, listened_sec, kind, device)
               values ('44444444-4444-4444-8444-444444444444', 'folder:x', now(), 60, 'partial', 'iphone')
               on conflict (id) do nothing`;
    await as(A, () => db.query(q));
    await as(A, () => db.query(q));
    const r = await as(A, () => db.query<{ n: number }>(`select count(*)::int as n from public.play_events where id = '44444444-4444-4444-8444-444444444444'`));
    expect(r.rows[0].n).toBe(1);
  });

  it('xóa: chỉ xóa được của mình', async () => {
    const other = await as(B, () => db.query(`delete from public.play_events where id = '11111111-1111-4111-8111-111111111111'`));
    expect(other.affectedRows).toBe(0);
    const own = await as(A, () => db.query(`delete from public.play_events where id = '11111111-1111-4111-8111-111111111111'`));
    expect(own.affectedRows).toBe(1);
  });

  it('check constraint chặn dữ liệu bậy', async () => {
    await expect(
      as(A, () =>
        db.query(`insert into public.play_events (id, track_id, ended_at, listened_sec, kind, device)
                  values ('55555555-5555-4555-8555-555555555555', 'folder:x', now(), 60, 'hack', 'poco')`),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe.each([
  ['track_features', `(track_id, v, data) values ('folder:t1', 1, '{"bpm":120}')`, `set data = '{"bpm":1}'`, `track_id = 'folder:t1'`],
  ['track_overrides', `(track_id, patch) values ('folder:t1', '{"title":"x"}')`, `set patch = '{"title":"hack"}'`, `track_id = 'folder:t1'`],
  ['smart_playlists', `(id, name, data) values ('66666666-6666-4666-8666-666666666666', 'Mix', '{}')`, `set name = 'hack'`, `id = '66666666-6666-4666-8666-666666666666'`],
  ['user_settings', `(data) values ('{"eq":"bass"}')`, `set data = '{"eq":"hack"}'`, `true`],
])('%s', (table, insertCols, updateSet, where) => {
  it('A ghi được, B không đọc/sửa/xóa được dữ liệu của A', async () => {
    await as(A, () => db.query(`insert into public.${table} ${insertCols}`));

    const mine = await as(A, () => db.query(`select * from public.${table}`));
    expect(mine.rows).toHaveLength(1);
    expect((mine.rows[0] as { user_id: string }).user_id).toBe(A);

    const theirs = await as(B, () => db.query(`select * from public.${table}`));
    expect(theirs.rows).toHaveLength(0);
    const upd = await as(B, () => db.query(`update public.${table} ${updateSet} where ${where}`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(B, () => db.query(`delete from public.${table} where ${where}`));
    expect(del.affectedRows).toBe(0);
  });

  it('B không ghi giả danh A', async () => {
    await expect(as(B, () => db.query(`insert into public.${table} (user_id, ${insertCols.slice(1)}`.replace(') values (', `) values ('${A}', `)))).rejects.toThrow(
      /row-level security|duplicate key/,
    );
  });
});
