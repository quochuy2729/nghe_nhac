# G6 — Trải nghiệm nghe
Đọc thêm: ARCHITECTURE §1 (ma trận caps), §7. Model gợi ý: Sonnet (crossfade native nếu khó thì chuyển Opus).

## Việc cần làm
0. Chạy **sau khi G3 đã merge**. Bắt đầu bằng việc thêm `decodeSegment` vào plugin Kotlin + `NativeDecoder` (chuyển từ G5, xem ARCHITECTURE §6).
1. **Hẹn giờ tắt** (cả hai nền tảng): 5/15/30/45/60 phút, hoặc "hết bài này". Giảm âm lượng dần 10 giây cuối (Android). Web thì kiểm trong `timeupdate`.
2. **Tốc độ phát** 0.5–2× (cả hai), có tùy chọn giữ cao độ.
3. **EQ** (Android): 5 band + preset (Phẳng, Bass, Vocal, Acoustic, EDM, Tự chỉnh), đồng bộ qua `user_settings`. iPhone ẩn mục này.
4. **Chuẩn hóa âm lượng** (Android): gain = clamp(−14 dB − loudnessDb, −8, +6) lấy từ features, hoặc từ tag ReplayGain nếu file có. Bật/tắt được.
5. **Crossfade** 0–12 giây (Android, 2 ExoPlayer). Gapless bật mặc định khi crossfade = 0. Không crossfade giữa hai bài liền nhau trong cùng album.
6. **Nhớ vị trí** với bài > 10 phút (podcast/mix dài): mở lại thì phát tiếp từ chỗ cũ.
7. Hàng đợi: kéo thả để sắp xếp, "Phát tiếp theo", "Thêm vào cuối", vuốt để xóa.

## Nghiệm thu
- Test thuần: tính gain, logic hẹn giờ (hết bài này / theo phút), nhớ vị trí.
- Các nút ẩn đúng theo `caps` (test render với caps của web).
- QA thủ công: so âm lượng hai bài master to/nhỏ khi bật chuẩn hóa; crossfade không bị click hay khoảng lặng.
