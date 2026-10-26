# G8 — Thống kê kiểu Wrapped
Đọc thêm: ARCHITECTURE §3 (PlayEvent). Model gợi ý: Sonnet.

## Việc cần làm
1. `features/stats/compute.ts` (thuần): theo khoảng Tuần / Tháng / Năm / Tùy chọn → tổng phút nghe, số bài khác nhau, top 10 bài / nghệ sĩ / thể loại / album, tỷ lệ skip, heatmap giờ × thứ, chuỗi ngày nghe liên tiếp, phân bố mood, "nghệ sĩ mới phát hiện" (lần đầu nghe trong kỳ), so sánh với kỳ trước. Lọc theo máy (Poco / iPhone / cả hai).
2. Trang Thống kê (tab mới hoặc vào từ Thư viện). Biểu đồ vẽ bằng SVG tự viết, không thêm thư viện chart nặng.
3. "Wrapped" năm/tháng: chuỗi 5–6 thẻ toàn màn hình vuốt qua lại; xuất ảnh PNG (canvas) → `navigator.share` hoặc `@capacitor/share`.
4. Tự tạo playlist "Top 50 năm <YYYY>" từ thẻ Wrapped.

## Nghiệm thu
- Test compute với event tự sinh: tổng phút, top, streak qua mốc nửa đêm theo giờ VN (Asia/Ho_Chi_Minh), heatmap.
- Tính trên 20 000 event < 200ms (test hiệu năng đơn giản).
