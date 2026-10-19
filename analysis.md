# analysis.md — Phân tích yêu cầu & kiến trúc

## 1. Yêu cầu (từ chủ repo)
| # | Yêu cầu | Ưu tiên |
|---|---------|---------|
| R1 | Nghe nhạc (stream) | Bắt buộc |
| R2 | Tải nhạc về nghe offline | Nên có |
| R3 | Chạy trên Xiaomi (Android) và iPhone | Bắt buộc |
| R4 | Tài khoản, lưu nhạc/playlist, đồng bộ 2 máy | Bắt buộc |
| R5 | Shuffle, next, previous (+ repeat, seek, queue) | Bắt buộc |
| R6 | Lời bài hát chạy theo nhạc (synced, tô sáng dòng đang hát) | Bắt buộc |

## 2. Quyết định nền tảng: PWA
- **Vì sao không app native**: iPhone muốn cài app ngoài App Store cần tài khoản Apple Developer (99 USD/năm) hoặc sideload 7 ngày. PWA "Thêm vào màn hình chính" chạy được cả Safari iOS và Chrome Android, một codebase.
- **Hạn chế iOS cần xử lý**:
  - Phát nền khi khóa màn hình: dùng 1 `<audio>` duy nhất, bắt đầu phát từ thao tác chạm của người dùng, set Media Session metadata + action handlers. Kiểm thử trên iOS ≥ 16.4 ở chế độ đã cài (standalone).
  - Bộ nhớ offline có thể bị Safari dọn: gọi `navigator.storage.persist()`, hiển thị dung lượng đã dùng (`navigator.storage.estimate()`), cho phép xóa từng bài.
  - Không có autoplay: chuyển bài tự động trong sự kiện `ended` là được, nhưng lần phát đầu phải do người dùng chạm.
- **Lối thoát sau này**: nếu PWA iOS phát nền không ổn, bọc bằng Capacitor (Android ra APK cài thẳng cho Poco; iOS cần Xcode). Kiến trúc giữ code UI/logic tách khỏi API trình duyệt để dễ bọc.

## 3. Nguồn nhạc (provider pattern)
```ts
interface MusicProvider {
  id: 'jamendo' | 'audius' | 'local';
  search(q: string, page?: number): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>;
  getDownloadUrl?(track: Track): Promise<string | null>; // null = không cho tải
}
interface Track {
  id: string; provider: string; title: string; artist: string; album?: string;
  durationSec: number; artworkUrl?: string; downloadable: boolean;
}
```
- **Jamendo** (api.jamendo.com/v3.0): nhạc CC, có `audiodownload` khi `audiodownload_allowed` = true → map vào `downloadable`.
- **Audius** (discoveryprovider qua `https://api.audius.co` để lấy host): stream `/v1/tracks/{id}/stream`; chỉ cho tải khi track bật `is_downloadable`.
- **Local**: người dùng chọn file (`<input type="file" accept="audio/*" multiple>`), đọc tag bằng `music-metadata-browser`; tùy chọn upload lên Supabase Storage bucket riêng tư để có trên máy còn lại.
- Ghi chú: Spotube lấy audio từ YouTube — **không** làm vậy ở đây vì vi phạm ToS YouTube và bản quyền. Nhạc thương mại chỉ nghe được qua file người dùng sở hữu (local).

## 4. Lyrics đồng bộ
- Gọi `GET https://lrclib.net/api/get?track_name=&artist_name=&album_name=&duration=`; nếu 404 thì `/api/search?q=` và chọn kết quả có `duration` lệch ≤ 2s. Ưu tiên `syncedLyrics`, fallback `plainLyrics` (hiển thị tĩnh), không có thì ghi "Chưa có lời".
- Với file local: đọc thêm file `.lrc` cùng tên nếu người dùng chọn kèm.
- Parser LRC: hỗ trợ `[mm:ss.xx]`, nhiều timestamp trên 1 dòng, tag `[offset:±ms]`, bỏ dòng metadata (`[ar:]`, `[ti:]`...). Kết quả: mảng `{ timeMs, text }` sắp xếp tăng dần.
- Đồng bộ: `requestAnimationFrame` đọc `audio.currentTime`, binary search dòng hiện tại; dòng active tô sáng + phóng nhẹ, tự `scrollIntoView({block:'center', behavior:'smooth'})`; người dùng cuộn tay thì tạm dừng auto-scroll 3s. Chạm vào một dòng → seek tới thời điểm đó.
- Màn Lyrics full-screen, nền lấy màu chủ đạo từ artwork (canvas sample).
- Cache lyrics trong IndexedDB theo trackId (chỉ trên máy, không lên server).

## 5. Dữ liệu & tài khoản (Supabase)
```sql
profiles(id uuid pk references auth.users, display_name text, created_at)
tracks(id text pk, provider text, title, artist, album, duration_sec int, artwork_url, downloadable bool, storage_path text null)
liked_tracks(user_id uuid, track_id text, added_at, pk(user_id, track_id))
playlists(id uuid pk, user_id uuid, name text, created_at)
playlist_tracks(playlist_id uuid, track_id text, position int, pk(playlist_id, position))
```
- RLS: mọi bảng user-scoped chỉ `auth.uid() = user_id`. `tracks` là cache metadata: insert/select cho user đã đăng nhập; track `local` có `storage_path` chỉ chủ sở hữu đọc được (bucket `user-audio` private, path `{uid}/...`).
- Bài đã tải offline lưu ở IndexedDB từng máy (không đồng bộ blob), danh sách "đã tải" là cục bộ.

## 6. Kế hoạch triển khai (tick khi xong)
- [x] **P0 Khung**: Vite + React + TS + Tailwind + PWA manifest/icon, router (Home, Search, Library, Player, Lyrics, Settings), GitHub Actions deploy Pages, `.env.example`.
- [x] **P1 Player core**: audio engine 1 `<audio>`, queue, next/prev (prev: >3s thì về đầu bài), shuffle Fisher–Yates giữ bài hiện tại và khôi phục thứ tự khi tắt, repeat off/all/one, seek bar, mini-player + full player, Media Session. Test unit.
- [x] **P2 Providers + Search**: Jamendo, Audius, Local; tab nguồn trong Search; hiển thị badge "Tải được".
- [ ] **P3 Auth + Library**: Supabase auth, liked, playlist CRUD, thêm vào hàng đợi; migration SQL trong `supabase/migrations`.
- [ ] **P4 Offline**: tải về IndexedDB có tiến độ, phát từ blob khi offline, quản lý dung lượng, `storage.persist()`; service worker cache app shell.
- [ ] **P5 Lyrics**: client LRCLIB, parser LRC + test, LyricsView synced, chạm-để-seek, cache.
- [ ] **P6 Hoàn thiện**: skeleton loading, empty states, xử lý lỗi mạng, a11y, kiểm tra trên viewport iPhone 12 Pro (390×844) và Android; README hướng dẫn cài lên màn hình chính.

## 7. Tiêu chí nghiệm thu
- Cài PWA lên iPhone và Android; đăng nhập trên máy A, like bài → thấy trên máy B.
- Phát nhạc, khóa màn hình vẫn nghe và điều khiển next/prev trên lock screen (Android chắc chắn; iOS ghi rõ kết quả thực tế).
- Tắt mạng vẫn nghe được bài đã tải.
- Shuffle không lặp bài trước khi hết vòng; prev/next đúng thứ tự.
- Lyrics: lệch ≤ 300ms so với audio, chạm dòng thì seek đúng.

## 8. Câu hỏi mở
- Chủ repo cần tạo Supabase project + Jamendo client_id và điền vào `.env` / GitHub Secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_JAMENDO_CLIENT_ID`).
