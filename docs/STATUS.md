# STATUS (mỗi phase thêm tối đa 10 dòng)

## Đã có từ v1
Player đầy đủ + Media Session, lyrics (LRC/LRCLIB), nạp nhạc vào IDB (web), gợi ý theo tag + lịch sử (F1, F2), like/playlist Supabase, deploy GitHub Pages.

## Tiến độ v2
- [x] G1 Tách lớp platform
- [x] G2 Vỏ Android + đọc thẳng thư mục
- [x] G3 Phát nhạc native (Media3)
- [x] G4 Đồng bộ v2
- [x] G5 Phân tích âm thanh + gợi ý thông minh
- [ ] G6 Trải nghiệm nghe
- [ ] G7 Quản lý thư viện
- [ ] G8 Thống kê / Wrapped
- [ ] G9 Hoàn thiện + QA

## G1 (đã xong)
- `src/platform/` (types, web: WebAudioEngine/WebImportSource/WebDecoder stub), `usePlatform()`; store và lyrics chỉ gọi `platform.engine`.
- IDB v2 + migrate `nn-history` → `events` (id xác định nên chạy lại không trùng). `lib/id.ts` giờ chứa `hash53`/`trackIdFor`.
- Mảng mở rộng: `app/routes.ts`, `features/settings/sections.ts`, `features/home/shelves.ts`; `features/sync/outbox.ts` (`enqueue`).
- `.claude/settings.json`; `analysis.md` → `docs/history/analysis-v1.md`.

## G2 (đã xong, chờ workflow xanh)
- Capacitor 7 (`android/`, appId `io.github.quochuy2729.nghenhac`), `npm run build:android` = vite (`BUILD_TARGET=android`: base `./`, không SW) + `cap sync`.
- Plugin Kotlin `MusicLibrary` (SAF: pickFolder/listFolders/removeFolder/scan lô 200/readTags/artwork/readText) + `platform/android/SafLibrarySource` (quét tăng dần theo id+mtime, `safScan.ts` thuần), tự quét khi mở app/foreground (5 giây).
- Phát tạm bằng `<audio>` + `convertFileSrc(content://…)` (G3 thay bằng Media3). Workflow `android.yml`, README §8 (keystore, 4 secrets, cài APK).

## G3 (đã xong, chờ workflow xanh)
- `PlaybackService` (Media3 ExoPlayer + MediaSession, focus, becoming-noisy, nút ♥) + plugin `NativePlayer`; `NativeAudioEngine` (contract thêm `managesQueue`, `appendWindow`, `setUpcoming`, `setLiked`, event `history`).
- Store phản chiếu "cửa sổ" native (bài hiện tại + 20 bài kế), nạp thêm khi còn ≤ 5, đồng bộ lại khi sửa hàng đợi; lượt nghe do native đo và ghi vào SharedPreferences, JS `drainEvents()` khi mở/quay lại/đổi bài.

## G4 (đã xong)
- Migration `20261102000000_v2_sync.sql` (play_events không có update, track_features/overrides, smart_playlists xóa mềm, user_settings) + `supabase/rls.test.ts` (PGlite).
- `features/sync/`: `syncMerge` (LWW giao hoán, pull lùi 5 phút, backoff), `syncService` (push lô 500 → pull con trỏ), `start` (mở app/foreground/online/10 phút/đăng nhập), `localData` (settings, smart playlists trong `meta`).
- Lịch sử nghe + like/playlist (hàng đợi offline `library`) đi qua outbox; Cài đặt có mục Đồng bộ và "Xóa lịch sử" xóa cả server.

## G5 (đã xong)
- `features/analyze/`: `extract` (Meyda + BPM tự viết, thuần, trong Worker lazy), `queue` (45 giây quanh 35%, điều kiện pin/phát nhạc), `featuresStore`, `service`; `WebDecoder` thật (Android tạm đọc file qua WebView).
- `recommend/`: `audioSim`, `contentSim`, `intent`, `mood`, `smartShuffle`, `mixes`; engine nhận `Signals.features` (giữ nguyên chữ ký hàm public).
- UI: nút trộn 3 trạng thái (✨ trong hàng đợi), kệ Trang chủ mới (Đang muốn nghe + chip, Mix theo giờ/mood, On Repeat, Lâu rồi chưa nghe, Khám phá), nút Radio, Cài đặt › Phân tích âm thanh.

## Câu hỏi mở
- G5: tâm trạng/`energy`/`brightness` là ước lượng bằng luật + hằng số cố định (không học máy). BPM chỉ tin cậy với nhạc có nhịp rõ; `bpmConf` thấp thì bỏ qua.
- G5: Android chưa có `NativeDecoder` (G6): phân tích đọc cả file qua WebView, file > 60 MB bị bỏ qua. Trộn thông minh không giữ được khi hết vòng lặp ở `repeat: all` (vòng mới xáo thường).
- G5: `fetchRemoteFeatures` thay bằng `syncNow()` + nạp lại IndexedDB (G4 đã có).
- G4: like/playlist vẫn ghi thẳng Supabase khi có mạng, chỉ rơi vào outbox khi mất mạng (giữ nguyên hành vi v1 cho người online). `user_settings`/`smart_playlists` đã có hàm ghi + sync nhưng UI dùng chúng nằm ở G6/G7.
- G4: xóa lịch sử trên server không xóa được outbox/bản local của MÁY KHÁC; máy đó sẽ đẩy lại lượt nghe của nó khi sync.
- G3: cửa sổ không vòng lại đầu và không có bài trước bài hiện tại → nút "bài trước" trên notification chỉ tua về đầu bài; nút trong app vẫn đi theo hàng đợi JS. Khi WebView chết thì không nạp thêm được (tối đa 20 bài).
- G3: `reason: 'error'` do service gắn khi tự nhảy qua bài lỗi; JS chưa hiện toast riêng cho từng bài bị bỏ qua.
- G2: plugin `scan` không lọc theo `sinceMtime` (spec §7) vì JS cần danh sách đầy đủ để phát hiện bài bị xóa; so id+mtime làm ở JS. Đổi tên file → id đổi (id theo tên) → coi là bài mới, like/playlist của id cũ không tự chuyển.
- G2: ảnh bìa nằm trong cache app (OS có thể dọn) → `artwork()` tạo lại, nhưng `track.artworkUrl` đã lưu có thể hỏng cho tới lần đọc lại tag.
- G2: bài chưa đọc được thời lượng từ tag lưu `durationSec: 0` (web có probe bằng <audio>; Android chưa).
- G1 thêm 2 thành viên **tùy chọn** vào contract: `AudioEngine.unlock?()` (iOS cần mở khóa <audio> đồng bộ trong handler chạm) và `LibrarySource.addFiles?()` (nút "Thêm file" trên iPhone). Android không cần cài đặt.
- Bỏ khôi phục metadata màn hình khóa lúc mở app (chưa có phiên phát nên không hiện); metadata đặt lại khi phát.
- `platform.caps` ở web đang để `false` hết cho tới khi tính năng có thật (speed/sleepTimer ở G6, analyze ở G5).

## QA thủ công cần chủ repo làm
- [ ] G3: khóa màn hình nghe 30 phút liên tục qua nhiều bài (chuyển bài khi tắt màn hình, notification có ảnh bìa).
- [ ] G3: nút tai nghe Bluetooth (play/pause/next/prev); rút tai nghe thì dừng; có cuộc gọi đến thì dừng rồi phát tiếp.
- [ ] G3: lịch sử nghe lúc khóa màn hình hiện đủ khi mở app; nút ♥ trên notification đổi trạng thái thích.
- [ ] G3: xóa một file đang trong hàng đợi rồi nghe tới nó → tự nhảy sang bài kế.
- [ ] G2: tạo keystore + 4 secrets (README §8), push → tải APK từ Artifacts, cài lên Poco.
- [ ] G2: chọn thư mục `Music/` ~1000 bài → quét lần đầu < 2 phút; quét lại khi không đổi < 5 giây.
- [ ] G2: thêm/xóa/đổi tên một file rồi mở lại app → danh sách cập nhật; like/lịch sử của bài bị xóa không mất.
- [ ] G2: phát một bài (kể cả tên có dấu, dấu cách); xem ảnh bìa và lời .lrc cùng tên hiện đúng.
- [ ] G2: bỏ quyền thư mục trong cài đặt hệ thống → app không xóa bài, chọn lại thư mục được.
