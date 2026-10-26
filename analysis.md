# analysis.md — Phân tích yêu cầu & kiến trúc

> **Cập nhật 2026-10-26**: nguồn nhạc đã đổi sang *một thư mục trên PC* (xem §9). Các mục §3 (Jamendo/Audius/local), §5 (upload Storage `user_files`) và phần Demo/GitHub Pages ở §6, §8 chỉ còn là lịch sử. Phần player, lyrics, offline, auth/library vẫn đúng.

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
- **Đã triển khai**: tự cuộn bằng `container.scrollTo` căn giữa (tương đương `scrollIntoView({block:'center'})` nhưng không kéo cả trang khi lời nằm trong thẻ xem trước ở màn Đang phát). "Không tìm thấy" được cache 3 ngày rồi thử lại. Bài demo dùng LRC giả tự viết, không gọi LRCLIB.

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
- **Đã triển khai** (`supabase/migrations/20261019000000_init.sql`): thêm bảng `user_files(user_id, track_id, storage_path, size_bytes)` để mỗi người có đường dẫn file riêng — id track local là hash nội dung file, hai người có cùng file vẫn không đè nhau. `tracks` chỉ cho `insert … on conflict do nothing` (không update/delete) nên không ai sửa được metadata của người khác. Thêm RPC `append_playlist_tracks` / `replace_playlist_tracks` (security invoker) để ghi thứ tự playlist nguyên tử. RLS đã được kiểm thử bằng PGlite.
- Chưa đăng nhập / chưa cấu hình Supabase → **chế độ khách**: thư viện lưu localStorage; lần đầu đăng nhập sẽ tự chuyển lên tài khoản.
- Đồng bộ 2 máy: tải lại thư viện khi app quay lại foreground, khi có mạng lại (không dùng Realtime để đỡ tốn pin).

## 6. Kế hoạch triển khai (tick khi xong)
- [x] **P0 Khung**: Vite + React + TS + Tailwind + PWA manifest/icon, router (Home, Search, Library, Player, Lyrics, Settings), GitHub Actions deploy Pages, `.env.example`.
- [x] **P1 Player core**: audio engine 1 `<audio>`, queue, next/prev (prev: >3s thì về đầu bài), shuffle Fisher–Yates giữ bài hiện tại và khôi phục thứ tự khi tắt, repeat off/all/one, seek bar, mini-player + full player, Media Session. Test unit.
- [x] **P2 Providers + Search**: Jamendo, Audius, Local; tab nguồn trong Search; hiển thị badge "Tải được".
- [x] **P3 Auth + Library**: Supabase auth, liked, playlist CRUD, thêm vào hàng đợi; migration SQL trong `supabase/migrations`.
- [x] **P4 Offline**: tải về IndexedDB có tiến độ, phát từ blob khi offline, quản lý dung lượng, `storage.persist()`; service worker cache app shell.
- [x] **P5 Lyrics**: client LRCLIB, parser LRC + test, LyricsView synced, chạm-để-seek, cache.
- [x] **P6 Hoàn thiện**: skeleton loading, empty states, xử lý lỗi mạng, a11y, kiểm tra trên viewport iPhone 12 Pro (390×844) và Android; README hướng dẫn cài lên màn hình chính.

## 7. Tiêu chí nghiệm thu
- Cài PWA lên iPhone và Android; đăng nhập trên máy A, like bài → thấy trên máy B.
- Phát nhạc, khóa màn hình vẫn nghe và điều khiển next/prev trên lock screen (Android chắc chắn; iOS ghi rõ kết quả thực tế).
- Tắt mạng vẫn nghe được bài đã tải.
- Shuffle không lặp bài trước khi hết vòng; prev/next đúng thứ tự.
- Lyrics: lệch ≤ 300ms so với audio, chạm dòng thì seek đúng.

## 8. Câu hỏi mở
- Chủ repo cần tạo Supabase project + Jamendo client_id và điền vào `.env` / GitHub Secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_JAMENDO_CLIENT_ID`). Hướng dẫn từng bước ở README.
- **Chưa có key → mock provider**: không có `VITE_JAMENDO_CLIENT_ID` thì tab Jamendo được thay bằng **Demo** (6 bài nhạc tổng hợp bằng WAV ngay trên trình duyệt, lời LRC giả tự viết, cho phép tải để thử offline). Không có Supabase thì thư viện chạy **chế độ khách** (localStorage), lần đầu đăng nhập sẽ tự chuyển lên tài khoản. Khi đã có Jamendo key, có nên giữ tab Demo không? (hiện: ẩn Demo).
- **Chưa kiểm thử với API thật**: sandbox phát triển chặn mạng ra ngoài nên Jamendo/Audius/LRCLIB/Supabase mới được kiểm tra bằng test với dữ liệu giả (mapping, chọn bản lyric, RLS chạy trên PGlite). Cần chạy thử thật sau khi điền key.
- **CORS khi tải về**: link `audiodownload` của Jamendo và `/download` của Audius có thể không trả header CORS → trình duyệt không lưu blob được. App báo lỗi rõ ràng; nếu thường xuyên lỗi, phương án: Supabase Edge Function làm proxy tải (chỉ cho track `downloadable`).
- **Schema**: thêm bảng `user_files` (đường dẫn Storage theo từng người) thay cho chỉ dùng `tracks.storage_path` — xem §5. Cột `tracks.storage_path` giữ lại để khớp phân tích nhưng app không ghi.
- **`music-metadata-browser`** đã ngừng phát triển; dùng `music-metadata` (cùng tác giả, bản kế nhiệm, có `parseBlob` cho trình duyệt), lazy-load nên không làm nặng bundle chính.
- **Đồng bộ**: tải lại khi app vào foreground/có mạng, không dùng Supabase Realtime. Muốn cập nhật tức thì khi cả hai máy cùng mở thì có thể bật Realtime cho `liked_tracks`/`playlist_tracks`.
- **iOS lock screen**: không đăng ký `seekbackward/seekforward` để iOS hiện nút bài trước/sau. Cần ghi lại kết quả thực tế trên iPhone 12 Pro (iOS ≥ 16.4, chế độ standalone) — chưa có thiết bị thật trong sandbox.
- **Poco X8 Pro**: kiểm tra layout ở viewport 412×915 (giả định, chưa có thông số chính xác) và 390×844 (iPhone 12 Pro): không tràn ngang, vùng chạm ≥ 44px. MIUI/HyperOS có thể diệt Chrome nền — README hướng dẫn tắt tiết kiệm pin cho Chrome.

## 9. Đổi hướng: nhạc nằm trong điện thoại + gợi ý (2026-10-26)
### Yêu cầu hiện hành
Chỉ nghe nhạc (không video) có sẵn **trong điện thoại** (Poco X8 Pro, iPhone 12 Pro), không nghe trên PC/laptop; có shuffle và gợi ý bài tương tự dựa trên thói quen nghe, như Spotify/Spotube.

### Lịch sử quyết định (cùng ngày)
1. Bỏ Jamendo/Audius/Demo, chỉ giữ "folder". Lúc đầu hiểu là folder trên PC → đã viết server Node (quét tag, HTTP Range, cover, lrc, phục vụ `dist/`) và test chạy thật.
2. Chủ repo làm rõ: *nhạc nằm hẳn trong điện thoại, không nghe trên PC* → **bỏ toàn bộ server**; thư viện = file đã nạp vào IndexedDB của từng điện thoại.

### Quyết định kiến trúc hiện tại
- **Nạp nhạc bằng `<input type=file>`** (thư mục qua `webkitdirectory`, hoặc nhiều file). Lý do: PWA không đọc được folder tùy ý; iOS không có `showDirectoryPicker`; Android Chrome cũng chưa chắc có. Đánh đổi: nhạc bị **sao chép** vào IndexedDB (tốn gấp đôi dung lượng), và phải chọn lại khi có bài mới (bài đã có tự bỏ qua).
- **Id = hash53(tên file NFC + dung lượng)**: không đọc nội dung nên nhanh; cùng file trên 2 máy → cùng id → like/playlist đồng bộ đúng bài. Chuẩn hóa NFC vì iOS hay trả tên NFD. Đổi tên file = bài mới. Hash thuần JS để không phụ thuộc `crypto.subtle` (chỉ có trên https).
- **Mỗi máy một kho nhạc**. Playlist đồng bộ có thể chứa bài chưa có trên máy kia → `getStreamUrl` báo lỗi dễ hiểu và player tự bỏ qua sang bài kế (tối đa một vòng).
- **GitHub Pages dùng lại được** (không còn server http gây mixed content) → `deploy.yml` còn hiệu lực (đã bỏ secret Jamendo).
- **Bỏ chức năng "Tải về"** (không còn nguồn từ xa). Module `downloads` còn lại làm "Nhạc trên máy": danh sách, dung lượng, xóa, `persist()`. Xóa bài = xóa file + thông tin + lời; like/playlist giữ nguyên.
- **Supabase** chỉ còn liked/playlist. Migration `20261026000000_folder_provider.sql` cho phép provider `folder` và coi metadata `folder` là riêng tư (như `local`). Bảng `user_files`/bucket `user-audio` không còn dùng (để nguyên).
- **Ảnh bìa** nhúng trong tag được thu nhỏ 300px → data URL lưu trong thông tin bài; hàng đợi lưu localStorage tự bỏ ảnh lớn (`slimItem`).

### Mô hình gợi ý (features/recommend)
- Điểm = 0.5·phiên + 0.3·gu dài hạn + 0.2·đồng nghe (chuẩn hóa theo thành phần có dữ liệu); trừ điểm bài vừa nghe < 6 giờ và bài hay bị bỏ qua; thêm nhiễu nhỏ cho đa dạng.
- Độ giống nội dung chỉ tính trên đặc trưng **cả hai bài đều có** (nghệ sĩ .35, thể loại .30, BPM .15, album .10, năm .10) → nhạc thiếu tag không bị điểm 0 oan.
- Phân loại lượt nghe: complete ≥ 80% (hoặc còn < 8s), skip < min(30s, 30% độ dài), còn lại partial; < 5s bỏ qua. Thời gian nghe tính từ `timeupdate` (bỏ đoạn tua).
- Bán rã gu dài hạn 21 ngày; lịch sử tối đa 3000 lượt, localStorage (chỉ trên máy).
- **Lỗi đã gặp khi viết test**: tách nghệ sĩ bằng regex `\bx\b` làm nghệ sĩ tên "X" biến mất → chỉ coi `x/feat/và` là dấu nối khi đứng giữa hai khoảng trắng.
- **Shuffle** vẫn là Fisher–Yates giữ bài hiện tại (P1); chưa có "smart shuffle" theo gu.

### Checklist
- [x] **F1 Nhạc trong điện thoại**: `importFiles` (tag, ảnh bìa, .lrc, bỏ trùng, tiến độ), `ImportMusic`, thư viện từ IndexedDB, tìm kiếm không dấu; bỏ Jamendo/Audius/Demo/tải về/server.
- [x] **F2 Gợi ý**: lịch sử nghe, engine, Trang chủ (Nghe gần đây / Dành cho bạn / Mix / Mới thêm), "Phát nhạc tương tự", tự nối khi hết hàng đợi, cài đặt bật/tắt + xóa lịch sử.
- [ ] **F3 (tùy chọn)**: phân tích âm thanh (tempo/năng lượng) trong trình duyệt để gợi ý khi thiếu tag; smart shuffle; nút "Radio" trong màn Đang phát; Android: lưu `FileSystemDirectoryHandle` để quét lại không cần chọn lại thư mục (không sao chép file).

### Rủi ro / chưa kiểm chứng
- **Chưa thử trên điện thoại thật**: `webkitdirectory` trên Safari iOS, ghi file lớn vào IndexedDB trên iOS, thư viện hàng nghìn bài/vài GB, nghe nền iPhone. Chưa mở giao diện bằng trình duyệt thật (chỉ có unit test jsdom + build).
- iOS Safari có thể dọn dữ liệu web app khi lâu không mở dù đã `persist()`; người dùng cần giữ bản nhạc gốc.
- Nạp thư viện lớn đọc tuần tự từng file nên lâu; chưa có chạy nền hay tiếp tục khi tắt app giữa chừng (bài đã xong vẫn còn, chọn lại thư mục sẽ bỏ qua bài đã có).
- Thư viện không có tag thể loại → gợi ý chủ yếu theo nghệ sĩ + lịch sử.
