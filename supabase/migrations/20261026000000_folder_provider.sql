-- Nguồn nhạc duy nhất giờ là file nhạc nạp vào điện thoại (provider 'folder', id 'folder:<hash tên file + dung lượng>').
-- Giữ các giá trị cũ trong check để dữ liệu đã có (nếu có) vẫn hợp lệ.
alter table public.tracks drop constraint if exists tracks_id_check;
alter table public.tracks drop constraint if exists tracks_provider_check;
alter table public.tracks
  add constraint tracks_id_check check (id ~ '^(jamendo|audius|local|mock|folder):.+'),
  add constraint tracks_provider_check check (provider in ('jamendo', 'audius', 'local', 'mock', 'folder'));

-- Metadata bài 'folder' là riêng tư của từng người: chỉ đọc được khi chính mình đã like / đưa vào playlist,
-- để tên file của người này không lộ cho người khác (giống bài 'local').
drop policy if exists "tracks_select" on public.tracks;
create policy "tracks_select" on public.tracks
  for select to authenticated using (
    provider not in ('local', 'folder')
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
