# STATUS (mỗi phase thêm tối đa 10 dòng)

## Đã có từ v1
Player đầy đủ + Media Session, lyrics (LRC/LRCLIB), nạp nhạc vào IDB (web), gợi ý theo tag + lịch sử (F1, F2), like/playlist Supabase, deploy GitHub Pages.

## Tiến độ v2
- [x] G1 Tách lớp platform
- [x] G2 Vỏ Android + đọc thẳng thư mục
- [ ] G3 Phát nhạc native (Media3)
- [ ] G4 Đồng bộ v2
- [ ] G5 Phân tích âm thanh + gợi ý thông minh
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

## Câu hỏi mở
- G2: plugin `scan` không lọc theo `sinceMtime` (spec §7) vì JS cần danh sách đầy đủ để phát hiện bài bị xóa; so id+mtime làm ở JS. Đổi tên file → id đổi (id theo tên) → coi là bài mới, like/playlist của id cũ không tự chuyển.
- G2: ảnh bìa nằm trong cache app (OS có thể dọn) → `artwork()` tạo lại, nhưng `track.artworkUrl` đã lưu có thể hỏng cho tới lần đọc lại tag.
- G2: bài chưa đọc được thời lượng từ tag lưu `durationSec: 0` (web có probe bằng <audio>; Android chưa).
- G1 thêm 2 thành viên **tùy chọn** vào contract: `AudioEngine.unlock?()` (iOS cần mở khóa <audio> đồng bộ trong handler chạm) và `LibrarySource.addFiles?()` (nút "Thêm file" trên iPhone). Android không cần cài đặt.
- Bỏ khôi phục metadata màn hình khóa lúc mở app (chưa có phiên phát nên không hiện); metadata đặt lại khi phát.
- `platform.caps` ở web đang để `false` hết cho tới khi tính năng có thật (speed/sleepTimer ở G6, analyze ở G5).

## QA thủ công cần chủ repo làm
- [ ] G2: tạo keystore + 4 secrets (README §8), push → tải APK từ Artifacts, cài lên Poco.
- [ ] G2: chọn thư mục `Music/` ~1000 bài → quét lần đầu < 2 phút; quét lại khi không đổi < 5 giây.
- [ ] G2: thêm/xóa/đổi tên một file rồi mở lại app → danh sách cập nhật; like/lịch sử của bài bị xóa không mất.
- [ ] G2: phát một bài (kể cả tên có dấu, dấu cách); xem ảnh bìa và lời .lrc cùng tên hiện đúng.
- [ ] G2: bỏ quyền thư mục trong cài đặt hệ thống → app không xóa bài, chọn lại thư mục được.
