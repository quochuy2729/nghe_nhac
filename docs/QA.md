# QA thủ công trên điện thoại thật

Điền cột **Kết quả** (✔ / ✘ + ghi chú ngắn, vd “✘ giật 2 giây khi chuyển bài”). Lỗi thì báo theo mẫu trong `PROMPT.md` (mô tả 1 câu + các bước + log ≤ 20 dòng); Claude sẽ sửa ở vòng sau.

Thiết bị: **Poco X8 Pro** (APK) · **iPhone 12 Pro** (PWA). Ngày thử: ……… Phiên bản: ………

## A. Chuẩn bị

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| A1 | Tạo keystore + 4 secrets (README §3.1–3.2), push → workflow **Build Android APK** xanh, tải APK ở Artifacts | Có file `.apk` đã ký | |
| A2 | Cài APK lên Poco (bật “nguồn không rõ”) | Mở được app, xin quyền thông báo | |
| A3 | iPhone: mở link GitHub Pages bằng Safari → Thêm vào MH chính | Mở từ icon, không có thanh Safari | |
| A4 | (Nếu dùng đồng bộ) chạy 3 file migration trong Supabase, điền key | Đăng nhập được trên cả hai máy | |

## B. Poco (APK)

### B1. Thư viện từ thư mục
| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| B1.1 | Cài đặt → Thêm thư mục nhạc → chọn `Music/` (~1000 bài) | Quét lần đầu **< 2 phút**, hiện “Đang đọc x/y” | |
| B1.2 | Mở lại app khi không có thay đổi | Quét lại **< 5 giây** | |
| B1.3 | Thêm / xóa / đổi tên một file rồi mở lại app | Danh sách cập nhật; like, playlist, lịch sử của bài bị xóa **không mất** | |
| B1.4 | Phát bài có tên dấu tiếng Việt và dấu cách; xem ảnh bìa, lời `.lrc` cùng tên | Phát được, ảnh và lời hiện đúng | |
| B1.5 | Thu hồi quyền thư mục trong cài đặt hệ thống, mở app | Không xóa bài; chọn lại thư mục được | |

### B2. Phát nhạc nền
| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| B2.1 | Khóa màn hình, nghe liên tục 30 phút qua nhiều bài | Không đứng, tự chuyển bài, notification có ảnh bìa | |
| B2.2 | Nút tai nghe Bluetooth: play/pause/next/prev | Hoạt động | |
| B2.3 | Rút tai nghe có dây | Nhạc dừng | |
| B2.4 | Có cuộc gọi đến khi đang phát | Dừng, hết cuộc gọi phát tiếp | |
| B2.5 | Mở app sau khi khóa màn hình nghe nhiều bài | Lịch sử nghe hiện đủ; bài đang phát đúng | |
| B2.6 | Nút ♥ trên notification | Đổi trạng thái thích, cập nhật trong app | |
| B2.7 | Xóa một file đang trong hàng đợi rồi nghe tới nó | Tự nhảy sang bài kế | |

### B3. Âm thanh
| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| B3.1 | Cài đặt → Trải nghiệm nghe → EQ Bass / Vocal | Nghe khác rõ; tắt thì về như cũ | |
| B3.2 | Bật chuẩn hóa âm lượng, so hai bài master to/nhỏ (đã phân tích) | Âm lượng gần nhau | |
| B3.3 | Crossfade 6 giây | Không click, không khoảng lặng; cùng album liền nhau thì không crossfade | |
| B3.4 | Tốc độ 1.5× (giữ / không giữ cao độ) | Đúng như chọn | |
| B3.5 | Hẹn giờ 5 phút, tắt màn hình | Dừng đúng giờ, giảm dần 10 giây cuối; “Hết bài này” cũng đúng | |
| B3.6 | Mở file podcast/mix > 10 phút, thoát rồi mở lại | Phát tiếp từ chỗ cũ | |

### B4. Phân tích âm thanh
| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| B4.1 | Cài đặt → Phân tích âm thanh → Phân tích ngay | Tiến độ x/y tăng đều, không nóng máy quá mức | |
| B4.2 | Kiểm vài bài có BPM đã biết | BPM xấp xỉ đúng (nhạc có nhịp rõ) | |

## C. iPhone (PWA)

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| C1 | Thêm thư mục nhạc từ Tệp (hoặc “Thêm file”) | Đọc tag, hiện tiến độ, nghe được | |
| C2 | Lần phát đầu (chạm), khóa màn hình | Phát nền; nút màn hình khóa hoạt động | |
| C3 | Nghe 30 phút khi khóa màn hình | Không tự dừng | |
| C4 | Đóng app vài ngày rồi mở lại | Nhạc còn (nếu mất: ghi lại để xem `persist()`) | |
| C5 | Tốc độ 1.25×, hẹn giờ 5 phút | Đúng; dừng đúng giờ (không giảm dần) | |
| C6 | Phân tích âm thanh khi app mở và không phát | Chạy được, nhận kết quả do Poco tính nếu đã đồng bộ | |

## D. Cả hai máy

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| D1 | Đăng nhập cùng tài khoản; thích một bài trên máy này | Máy kia thấy sau khi mở lại app / “Đồng bộ ngay” | |
| D2 | Nghe vài bài trên Poco | iPhone thấy lịch sử, Thống kê gộp hai máy (lọc theo máy được) | |
| D3 | Tắt mạng, thích vài bài, bật mạng | Thao tác tự đẩy lên; không mất | |
| D4 | Sửa tag một bài / cả album | Hiện ngay; máy kia nhận; “Khôi phục tag gốc” hoạt động | |
| D5 | Tạo playlist thông minh “Mới thêm 14 ngày” | Số bài khớp, tự cập nhật khi thêm nhạc | |
| D6 | Thư viện thật (vài nghìn bài): cuộn tab Bài hát | Mượt, không giật | |
| D7 | Trộn thông minh bật/tắt, “Chèn gợi ý ✨” | Không hai bài cùng nghệ sĩ liền nhau; bài ✨ có nhãn | |
| D8 | Trang chủ sau vài ngày nghe | “Đang muốn nghe”, mix theo giờ/tâm trạng, On Repeat hiện hợp lý | |
| D9 | Thống kê → Wrapped → Chia sẻ ảnh | Ra ảnh PNG; Android mở hộp chia sẻ, iPhone Chia sẻ/Lưu ảnh | |
| D10 | Thống kê qua nửa đêm (nghe 23:50 và 00:10) | Tính liên tiếp 2 ngày (giờ VN) | |
| D11 | Cài đặt → Xóa lịch sử nghe | Xóa cả trên server; máy kia không còn lịch sử sau khi đồng bộ | |

## E. Giao diện

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| E1 | Mọi trang ở 390px và 412px | Không tràn ngang, vùng chạm ≥ 44px | |
| E2 | Mở app lần đầu (xóa dữ liệu app) | Hướng dẫn làm quen hiện đúng theo máy | |
| E3 | Dùng TalkBack/VoiceOver thử vài nút | Nút biểu tượng có nhãn đọc được | |
| E4 | Màn hình trống/lỗi (không có nhạc, mất mạng, lỗi thư mục) | Có thông báo rõ ràng, có nút thử lại | |

## Lỗi đã báo (điền khi gặp)

| Mã | Máy | Mô tả 1 câu | Các bước | Log (≤ 20 dòng) |
|---|---|---|---|---|
| | | | | |
