# Prompt dán vào Claude Code (cloud) sau khi gắn repo

Đọc kỹ CLAUDE.md và analysis.md trong repo này. Xây dựng app nghe nhạc PWA "Nghe Nhạc" theo đúng stack, ràng buộc và kế hoạch P0 → P6 trong analysis.md.

Yêu cầu:
1. Làm tuần tự từng phase. Hết mỗi phase: `npm run lint`, `npm run test`, `npm run build` phải pass, commit riêng, tick checklist trong analysis.md.
2. Player phải có: play/pause, next, previous, shuffle, repeat, seek, hàng đợi, mini-player và full player, điều khiển trên lock screen (Media Session).
3. Lời bài hát đồng bộ từ LRCLIB: dòng đang hát tô sáng, tự cuộn theo nhạc, chạm dòng để tua.
4. Tài khoản Supabase: lưu bài yêu thích và playlist, đồng bộ giữa Android và iPhone. Viết migration SQL + RLS trong supabase/migrations.
5. Tải về offline cho bài được phép tải (Jamendo/Audius) và file nhạc của tôi (local), phát được khi mất mạng.
6. Giao diện tối, mobile-first cho iPhone 12 Pro và Poco X8 Pro, cảm giác giống Spotify nhưng không dùng logo/tên/thương hiệu Spotify.
7. Thiết lập GitHub Actions deploy lên GitHub Pages; viết README hướng dẫn: tạo Supabase project, lấy Jamendo client_id, điền secrets, cài PWA lên màn hình chính trên iPhone (Safari → Chia sẻ → Thêm vào MH chính) và Android (Chrome → Cài đặt ứng dụng).
8. Chưa có key thì dùng mock provider để app vẫn chạy được, ghi vào "Câu hỏi mở".

Khi xong, tạo Pull Request tóm tắt những gì đã làm và những gì cần tôi cấu hình.
