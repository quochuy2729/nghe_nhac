# CLAUDE.md — Nghe Nhạc (v2)

App nghe nhạc cá nhân, **chỉ phát file nhạc có sẵn trong điện thoại**. Không tìm nhạc online, không upload nhạc lên server.
- **Poco X8 Pro**: APK Android (Capacitor), đọc thẳng thư mục đã chọn, phát bằng Media3 native.
- **iPhone 12 Pro**: PWA (GitHub Pages), nạp nhạc bằng `<input webkitdirectory>` và sao chép vào IndexedDB.
- Hai bản dùng chung một codebase React. Khác biệt giữa hai nền tảng nằm hết trong `src/platform/`.

## Đọc gì (để tiết kiệm token)
1. Đọc file này.
2. Đọc **đúng một** file `docs/phases/<PHASE>.md` mà prompt yêu cầu.
3. Chỉ mở `docs/ARCHITECTURE.md` ở mục được file phase trỏ tới (vd "§3 Data model"), không đọc cả file.
4. KHÔNG đọc: `dist/`, `node_modules/`, `package-lock.json`, `docs/history/`. Chỉ đọc code liên quan tới phase; tìm bằng grep trước rồi mới mở file.
5. Không viết lại hay tóm tắt docs. Hết phase chỉ cập nhật `docs/STATUS.md`, tối đa 10 dòng.

## Stack (không đổi nếu chưa hỏi)
- React 18 + TS + Vite + Tailwind + Zustand + `idb` + `vite-plugin-pwa`. Dark theme, mobile-first.
- Android: Capacitor 7 + plugin Kotlin tự viết trong `android/app/src/main/java/.../plugins/` (MusicLibrary, NativePlayer), dùng AndroidX Media3 (ExoPlayer + MediaSessionService).
- Phân tích âm thanh: Meyda (MIT) + BPM tự viết. Không dùng Essentia.js (giấy phép AGPL, file WASM nặng).
- Supabase (Auth email+password, Postgres, RLS): đồng bộ like, playlist, lịch sử nghe, đặc trưng âm thanh, tag sửa tay, playlist thông minh. **Không bao giờ lưu file nhạc.**
- Id bài = `folder:<hash53(NFC(tên file) | dung lượng)>` (`src/lib/id.ts`), giống nhau trên cả hai máy. KHÔNG đổi công thức.

## Ràng buộc bắt buộc
- Không tích hợp tải hay rip từ YouTube/Spotify. Không tìm nhạc online. LRCLIB chỉ dùng để lấy lời bài hát.
- Không hardcode secret. Mọi key đi qua `.env` / GitHub Secrets. Trong app chỉ dùng anon key.
- Fixture test không chứa lời bài hát thật hay file nhạc thật (tự sinh sóng sin hoặc nhiễu bằng code).
- Web: chỉ có **một** `<audio>` toàn cục. iOS: không đưa `<audio>` qua Web Audio graph (sẽ mất phát nền).
- Logic thuần (queue, shuffle, engine gợi ý, trích đặc trưng, rule playlist, thống kê, sync merge) tách khỏi UI, nhận `rng`/`now` làm tham số và có unit test.
- UI và feature chỉ gọi interface trong `src/platform/types.ts`, không import Capacitor trực tiếp.
- Tính năng nền tảng không hỗ trợ thì **ẩn đi** (dựa vào `platform.caps`), không hiện nút bấm không có tác dụng.
- Vùng chạm ≥ 44px, tôn trọng `safe-area-inset`, không tràn ngang ở 390px và 412px.

## Lệnh
- `npm run lint` · `npm run test` · `npm run build` (bản web) — cả ba phải pass trước khi commit.
- `npm run build:android` → `npx cap sync android`. Sandbox không build được Gradle thì push lên nhánh và đọc kết quả workflow `android.yml` bằng `gh run view --log-failed`.

## Cách làm việc
- Một phase = một nhánh `phase/<id>` = một PR. Commit tiếng Anh dạng `feat(player): ...`.
- Gặp quyết định kiến trúc chưa có trong spec: chọn phương án an toàn, ghi một dòng vào `docs/STATUS.md › Câu hỏi mở`, rồi làm tiếp. Không dừng lại để hỏi.
- Không chạy dev server hay chụp màn hình để tự kiểm. Kiểm bằng test + build; phần kiểm trên điện thoại thật ghi vào checklist QA cho chủ repo.
- Trả lời chủ repo ngắn gọn, bằng tiếng Việt.
