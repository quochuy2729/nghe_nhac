# G2 — Vỏ Android + đọc thẳng thư mục
Đọc thêm: ARCHITECTURE §1, §2, §7. Model gợi ý: Opus (có Kotlin).

## Việc cần làm
1. Cài Capacitor 7 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`). appId `io.github.<owner>.nghenhac`, tên app "Nghe Nhạc". Thêm script `build:android`.
2. Sửa `vite.config.ts` và router theo §7 (base `./`, `HashRouter`, tắt SW khi native).
3. Plugin Kotlin `MusicLibrary` đúng §7: pickFolder (persist permission), scan theo lô 200, readTags, ảnh bìa vào cache, đọc `.lrc`.
4. `src/platform/android/SafLibrarySource.ts`: quét tăng dần (so `id` + `mtime`), bài biến mất khỏi thư mục thì xóa khỏi thư viện nhưng giữ like/playlist/lịch sử. Tự `rescan()` khi app mở hoặc quay lại foreground (debounce 5 giây).
5. Tạm thời phát bằng `<audio>` với `Capacitor.convertFileSrc` nếu được; không được thì để player báo "cần G3" (G3 sẽ thay bằng Media3).
6. Workflow `.github/workflows/android.yml` theo §7 (build APK release đã ký, artifact, Release khi push tag `v*`).
7. README: tạo keystore một lần (lệnh `keytool`), base64, điền 4 secrets; cài APK lên Poco (bật "cài ứng dụng không rõ nguồn gốc"); cấp quyền thư mục.

## Không làm
Phát nền native, EQ, iOS.

## Nghiệm thu
- Workflow xanh, có file APK.
- Unit test JS cho logic quét tăng dần (mock plugin): thêm, xóa, đổi tên, cùng file ở hai thư mục.
- Checklist QA cho chủ repo trong STATUS: chọn thư mục `Music/` có ~1000 bài → quét lần đầu < 2 phút; quét lại khi không có thay đổi < 5 giây.
