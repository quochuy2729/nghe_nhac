# G7 — Quản lý thư viện
Đọc thêm: ARCHITECTURE §3 (overrides, SmartPlaylist). Model gợi ý: Sonnet.

## Việc cần làm
1. Thư viện có tab: Bài hát · Album · Nghệ sĩ · Thể loại · Thư mục (cây thư mục theo `track.folder`). Mỗi tab có sắp xếp và lọc. Tìm kiếm không dấu (đã có).
2. **Sửa tag trong app**: title, artist, album, albumArtist, genre, year, ảnh bìa (chọn ảnh → resize 300px). Lưu thành override, **không ghi vào file gốc**, đồng bộ qua `track_overrides`. Có nút "Khôi phục tag gốc". Sửa hàng loạt nhiều bài cùng lúc (vd gán genre cho cả album).
3. **Playlist thông minh**: trình tạo luật theo §3, xem trước số bài khớp, tự cập nhật. Có sẵn mẫu: "Thích + chưa nghe 30 ngày", "Sôi động > 120 BPM", "Mới thêm 14 ngày".
4. Chọn nhiều bài → thêm vào playlist / hàng đợi / like.
5. Trùng bài: liệt kê các bài cùng title+artist khác id (vd hai bản chất lượng khác nhau) để người dùng tự xử lý.

## Nghiệm thu
- Test `evaluateRules` (mọi field/op), `applyOverride`, nhóm album/nghệ sĩ có tách "feat.", cây thư mục.
- Thư viện 5000 bài (fixture sinh tự động): danh sách dùng virtualization, không dựng hết 5000 dòng DOM.
