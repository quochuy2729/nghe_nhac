-- Nghe Nhạc v2 — đồng bộ lịch sử nghe, đặc trưng âm thanh, tag sửa tay, playlist thông minh, cài đặt.
-- Chạy sau 20261019000000_init.sql và 20261026000000_folder_provider.sql
-- (Supabase CLI `supabase db push` hoặc dán vào SQL Editor).

-- ─────────────────────────────────────────────────────────────
-- play_events: mỗi lần nghe. Id sinh ở client (uuid) → đẩy lại nhiều lần không trùng.
-- Chỉ select/insert/delete của chính mình; KHÔNG có update (lịch sử là bằng chứng, không sửa).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.play_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 200),
  ended_at timestamptz not null,
  listened_sec int not null check (listened_sec >= 0),
  duration_sec int not null default 0 check (duration_sec >= 0),
  kind text not null check (kind in ('complete', 'partial', 'skip')),
  device text not null check (device in ('poco', 'iphone')),
  ctx text check (ctx in ('shuffle', 'radio', 'album', 'playlist', 'mix')),
  created_at timestamptz not null default now()
);
create index if not exists play_events_user_created_idx on public.play_events (user_id, created_at);
create index if not exists play_events_user_track_idx on public.play_events (user_id, track_id);

-- ─────────────────────────────────────────────────────────────
-- track_features: đặc trưng âm thanh (tính một lần ở máy nào đó, máy kia dùng lại)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.track_features (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 200),
  v smallint not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists track_features_user_updated_idx on public.track_features (user_id, updated_at);

-- ─────────────────────────────────────────────────────────────
-- track_overrides: tag sửa tay (không ghi vào file gốc)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.track_overrides (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 200),
  patch jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists track_overrides_user_updated_idx on public.track_overrides (user_id, updated_at);

-- ─────────────────────────────────────────────────────────────
-- smart_playlists: luật nằm trong data; xóa mềm để máy kia biết mà xóa theo
-- ─────────────────────────────────────────────────────────────
create table if not exists public.smart_playlists (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists smart_playlists_user_updated_idx on public.smart_playlists (user_id, updated_at);

-- ─────────────────────────────────────────────────────────────
-- user_settings: preset EQ, tùy chọn gợi ý… (một dòng / người)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security: chỉ chính chủ
-- ─────────────────────────────────────────────────────────────
alter table public.play_events enable row level security;
alter table public.track_features enable row level security;
alter table public.track_overrides enable row level security;
alter table public.smart_playlists enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "play_events_select_own" on public.play_events;
create policy "play_events_select_own" on public.play_events
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "play_events_insert_own" on public.play_events;
create policy "play_events_insert_own" on public.play_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "play_events_delete_own" on public.play_events;
create policy "play_events_delete_own" on public.play_events
  for delete to authenticated using (user_id = auth.uid());
-- Cố ý KHÔNG có policy update.

drop policy if exists "track_features_all_own" on public.track_features;
create policy "track_features_all_own" on public.track_features
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "track_overrides_all_own" on public.track_overrides;
create policy "track_overrides_all_own" on public.track_overrides
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "smart_playlists_all_own" on public.smart_playlists;
create policy "smart_playlists_all_own" on public.smart_playlists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Quyền ở mức bảng: client (role authenticated) không được UPDATE play_events dù RLS đã chặn.
revoke update on public.play_events from authenticated;
