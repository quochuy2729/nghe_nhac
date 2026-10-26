# STATUS (mỗi phase thêm tối đa 10 dòng)

## Đã có từ v1
Player đầy đủ + Media Session, lyrics (LRC/LRCLIB), nạp nhạc vào IDB (web), gợi ý theo tag + lịch sử (F1, F2), like/playlist Supabase, deploy GitHub Pages.

## Tiến độ v2
- [x] G1 Tách lớp platform
- [ ] G2 Vỏ Android + đọc thẳng thư mục
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

## Câu hỏi mở
- G1 thêm 2 thành viên **tùy chọn** vào contract: `AudioEngine.unlock?()` (iOS cần mở khóa <audio> đồng bộ trong handler chạm) và `LibrarySource.addFiles?()` (nút "Thêm file" trên iPhone). Android không cần cài đặt.
- Bỏ khôi phục metadata màn hình khóa lúc mở app (chưa có phiên phát nên không hiện); metadata đặt lại khi phát.
- `platform.caps` ở web đang để `false` hết cho tới khi tính năng có thật (speed/sleepTimer ở G6, analyze ở G5).

## QA thủ công cần chủ repo làm
