# G1 — Tách lớp platform (không đổi hành vi)
Đọc thêm: ARCHITECTURE §1, §2, §3. Model gợi ý: Sonnet.

## Việc cần làm
0. `git mv analysis.md docs/history/analysis-v1.md`; sửa các link tới file này trong README. Tạo `.claude/settings.json` với `permissions.deny` = `Read(./dist/**)`, `Read(./package-lock.json)`, `Read(./docs/history/**)`, `Read(./android/app/build/**)`, `Read(./android/.gradle/**)`.
1. Tạo `src/platform/types.ts` (chép đúng contract ở §2), `src/platform/index.ts`, `src/platform/web/`.
2. `WebAudioEngine`: bọc `features/player/audio.ts` + `mediaSession.ts` sau interface `AudioEngine`. JS vẫn là chủ hàng đợi; trên web thì `setWindow` chỉ phát `items[startIndex]`, khi `ended` thì báo `trackChanged`/`ended` để store chuyển bài như hiện nay.
3. `WebImportSource`: bọc `providers/folder.ts` (import, resolve blob URL, artwork, lrc) sau `LibrarySource`. Lưu `track.folder` lấy từ `webkitRelativePath`.
4. `WebDecoder`: stub, ném lỗi `not implemented` (sẽ làm ở G5).
5. `features/player/store.ts` chỉ gọi `platform.engine`, không gọi `getAudio()` trực tiếp. Lyrics đọc thời gian qua `engine.getPosition()`.
6. IDB lên v2: thêm store `features`, `overrides`, `events`, `outbox`, `meta`. Migrate `nn-history` từ localStorage sang `events` (sinh uuid, `device` lấy theo platform).
7. `usePlatform()` hook + `platform.caps` cho UI.
8. **Chuẩn bị chạy song song** (để các luồng sau ít conflict):
   - `src/features/sync/outbox.ts`: chỉ có `enqueue(table, op, row)` ghi vào store `outbox` (chưa push). G4/G5/G7 gọi hàm này.
   - `src/app/routes.ts`: mảng route; `App.tsx` map từ mảng. Luồng nào cần trang mới chỉ thêm 1 dòng.
   - `src/features/settings/sections.ts`: mảng section của trang Cài đặt (lazy component). Luồng nào cần mục cài đặt mới chỉ thêm 1 dòng.
   - `src/features/home/shelves.ts`: mảng "kệ" của Trang chủ, tương tự.
   - Tạo sẵn thư mục rỗng có `index.ts`: `src/features/{sync,analyze,stats}/`, `src/platform/android/`.

## Không làm
Capacitor, tính năng mới, đổi giao diện.

## Nghiệm thu
- Tất cả test cũ pass. Thêm test: migrate lịch sử (localStorage → IDB, không mất event, chạy lần hai không bị nhân đôi), `applyOverride`.
- Grep cho thấy chỉ còn `src/platform/web/` gọi tới `getAudio(` và `navigator.mediaSession`.
