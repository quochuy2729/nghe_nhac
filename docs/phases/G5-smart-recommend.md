# G5 — Phân tích âm thanh, "đang muốn nghe gì", smart shuffle, mix
Đọc thêm: ARCHITECTURE §5, §6. Đọc `features/recommend/engine.ts` trước khi sửa. Model gợi ý: Opus.

## Việc cần làm
1. `features/analyze/extract.ts` (thuần, chạy trong Worker) + `queue.ts` (điều kiện chạy ở §6) + `WebDecoder`. **Không** viết `NativeDecoder` ở phase này (nằm ở G6, sau khi có plugin Android). Trên Android tạm dùng `WebDecoder` hoặc tắt `caps.analyze`.
2. Lưu features vào IDB + `enqueue('track_features', …)`. Bước pull để bỏ qua bài đã có trên server: gọi qua interface `fetchRemoteFeatures()`; G4 chưa merge thì trả về rỗng.
3. `recommend/`: `audioSim`, `contentSim` mới, `intent.ts`, `mood.ts`, khung giờ, `smartShuffle.ts`. Nối vào engine hiện có, giữ nguyên chữ ký các hàm public.
4. Player: nút shuffle bấm xoay vòng 3 trạng thái: Tắt → Trộn → Trộn thông minh. Bật/tắt "chèn gợi ý ✨" trong Cài đặt.
5. Trang chủ: các mix ở §5, kèm chip "Đang hợp: …". Màn Đang phát có nút "Radio" (phát nhạc tương tự bài này).
6. Cài đặt → Phân tích âm thanh: tiến độ (x/y bài), nút chạy ngay hoặc tạm dừng.

## Nghiệm thu
- Test extract: click track 120 BPM tự sinh → bpm 118–122; nhiễu trắng có brightness lớn hơn sin 200 Hz; cùng input thì cùng output (deterministic).
- Test smartShuffle với rng cố định: không có 2 bài cùng nghệ sĩ liền nhau khi còn bài khác để chọn; mọi bài xuất hiện đúng một lần; ràng buộc energy được thỏa ≥ 80% số cặp.
- Test intent: phiên 3 bài chill đều complete → mood `chill`; skip liên tiếp bài sôi động → điểm các bài sôi động giảm.
- Bundle chính không tăng quá 30 KB (Meyda và worker load lazy).
