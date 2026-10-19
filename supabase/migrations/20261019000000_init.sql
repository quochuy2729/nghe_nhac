-- Nghe Nhạc — schema ban đầu + Row Level Security.
-- Chạy bằng Supabase CLI (`supabase db push`) hoặc dán vào SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- profiles: 1-1 với auth.users, tự tạo khi đăng ký
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- tracks: cache metadata dùng chung (id = '<provider>:<sourceId>')
-- Không có UPDATE/DELETE từ client: client chỉ insert ... on conflict do nothing,
-- nên một người dùng không thể sửa metadata bài của người khác.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tracks (
  id text primary key check (id ~ '^(jamendo|audius|local|mock):.+'),
  provider text not null check (provider in ('jamendo', 'audius', 'local', 'mock')),
  title text not null check (char_length(title) between 1 and 300),
  artist text not null default '' check (char_length(artist) <= 300),
  album text check (char_length(album) <= 300),
  duration_sec int not null default 0 check (duration_sec >= 0),
  artwork_url text check (char_length(artwork_url) <= 200000),
  downloadable boolean not null default false,
  -- Đường dẫn file trong Storage của người upload ĐẦU TIÊN (tham khảo).
  -- Đường dẫn của từng người nằm ở user_files để hai người có cùng file không đè nhau.
  storage_path text,
  created_at timestamptz not null default now(),
  constraint tracks_provider_matches_id check (split_part(id, ':', 1) = provider)
);

-- ─────────────────────────────────────────────────────────────
-- user_files: file nhạc "của tôi" đã upload lên bucket user-audio
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_files (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null references public.tracks (id) on delete cascade,
  storage_path text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id),
  constraint user_files_path_in_own_folder check (split_part(storage_path, '/', 1) = user_id::text),
  constraint user_files_local_only check (track_id like 'local:%')
);

-- ─────────────────────────────────────────────────────────────
-- liked_tracks, playlists, playlist_tracks
-- ─────────────────────────────────────────────────────────────
create table if not exists public.liked_tracks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null references public.tracks (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists liked_tracks_user_added_idx on public.liked_tracks (user_id, added_at desc);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_user_idx on public.playlists (user_id, created_at);

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id text not null references public.tracks (id) on delete cascade,
  position int not null check (position >= 0),
  added_at timestamptz not null default now(),
  primary key (playlist_id, position)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.user_files enable row level security;
alter table public.liked_tracks enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

-- profiles: chỉ chính chủ
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- tracks: bài công khai (jamendo/audius/mock) ai đăng nhập cũng đọc được;
-- bài local chỉ người có file đó (user_files) mới đọc được.
drop policy if exists "tracks_select" on public.tracks;
create policy "tracks_select" on public.tracks
  for select to authenticated using (
    provider <> 'local'
    or exists (
      select 1 from public.user_files f
      where f.track_id = tracks.id and f.user_id = auth.uid()
    )
    or exists (
      select 1 from public.liked_tracks l
      where l.track_id = tracks.id and l.user_id = auth.uid()
    )
    or exists (
      select 1 from public.playlist_tracks pt
      join public.playlists p on p.id = pt.playlist_id
      where pt.track_id = tracks.id and p.user_id = auth.uid()
    )
  );
drop policy if exists "tracks_insert" on public.tracks;
create policy "tracks_insert" on public.tracks
  for insert to authenticated with check (
    storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text
  );

-- user_files: chỉ chính chủ
drop policy if exists "user_files_all_own" on public.user_files;
create policy "user_files_all_own" on public.user_files
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- liked_tracks: chỉ chính chủ
drop policy if exists "liked_all_own" on public.liked_tracks;
create policy "liked_all_own" on public.liked_tracks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- playlists: chỉ chính chủ
drop policy if exists "playlists_all_own" on public.playlists;
create policy "playlists_all_own" on public.playlists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- playlist_tracks: theo chủ playlist
drop policy if exists "playlist_tracks_all_own" on public.playlist_tracks;
create policy "playlist_tracks_all_own" on public.playlist_tracks
  for all to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- RPC: thao tác playlist nguyên tử (SECURITY INVOKER → vẫn áp RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.append_playlist_tracks(p_playlist uuid, p_tracks text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  start_pos int;
begin
  -- khóa playlist để hai máy thêm cùng lúc không trùng position
  perform 1 from playlists where id = p_playlist for update;
  if not found then
    raise exception 'playlist not found';
  end if;
  select coalesce(max(position) + 1, 0) into start_pos from playlist_tracks where playlist_id = p_playlist;
  insert into playlist_tracks (playlist_id, track_id, position)
  select p_playlist, t.track_id, start_pos + t.ord - 1
  from unnest(p_tracks) with ordinality as t(track_id, ord);
  update playlists set updated_at = now() where id = p_playlist;
end;
$$;

create or replace function public.replace_playlist_tracks(p_playlist uuid, p_tracks text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from playlists where id = p_playlist for update;
  if not found then
    raise exception 'playlist not found';
  end if;
  delete from playlist_tracks where playlist_id = p_playlist;
  insert into playlist_tracks (playlist_id, track_id, position)
  select p_playlist, t.track_id, t.ord - 1
  from unnest(p_tracks) with ordinality as t(track_id, ord);
  update playlists set updated_at = now() where id = p_playlist;
end;
$$;

revoke all on function public.append_playlist_tracks(uuid, text[]) from public, anon;
revoke all on function public.replace_playlist_tracks(uuid, text[]) from public, anon;
grant execute on function public.append_playlist_tracks(uuid, text[]) to authenticated;
grant execute on function public.replace_playlist_tracks(uuid, text[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Storage: bucket riêng tư user-audio, mỗi người một thư mục {uid}/...
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-audio', 'user-audio', false, 104857600, array['audio/*', 'application/octet-stream'])
on conflict (id) do update set public = false;

drop policy if exists "user_audio_select_own" on storage.objects;
create policy "user_audio_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_insert_own" on storage.objects;
create policy "user_audio_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_update_own" on storage.objects;
create policy "user_audio_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_delete_own" on storage.objects;
create policy "user_audio_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);
