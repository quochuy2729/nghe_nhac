# Cách giao việc cho Claude Code (v2)

## Chuẩn bị (một lần)
1. Commit + push các file: `CLAUDE.md`, `PROMPT.md`, `docs/` (`.claude/settings.json` sẽ được tạo ở G1).
2. Trên GitHub: Settings → Secrets → thêm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (đã có), và 4 secret keystore (README sẽ hướng dẫn sau khi xong G2).

## Thứ tự
G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9.
G6, G7, G8 không phụ thuộc nhau, đổi thứ tự được. Merge PR của phase trước rồi mới mở phiên mới.

## Prompt cho mỗi phase (thay `G1` và tên file)
```
Phase G1. Đọc CLAUDE.md, rồi docs/phases/G1-platform-layer.md. Làm đúng phạm vi file đó, không làm thêm.
Nhánh phase/g1. Xong thì lint + test + build pass, tick STATUS, mở PR tóm tắt ≤ 10 dòng.
Không hỏi lại; vướng thì chọn phương án an toàn và ghi vào Câu hỏi mở.
```

## Prompt sửa lỗi (sau khi thử trên điện thoại)
```
Bug (Poco|iPhone): <1 câu mô tả>. Các bước tái hiện: <1-2-3>. Mong đợi: <...>. Log: <tối đa 20 dòng>.
Chỉ đọc file liên quan, sửa và thêm test tái hiện lỗi. Nhánh fix/<tên-ngắn>.
```

## Mẹo tiết kiệm token
- **Mỗi phase một phiên mới** (hoặc `/clear`). Đừng làm nhiều phase trong một phiên vì ngữ cảnh cũ cứ bị gửi lại mỗi lượt.
- CLAUDE.md được nạp vào **mọi lượt** nên đã giữ thật ngắn. Chi tiết nằm trong `docs/phases/`; Claude chỉ đọc file của phase đang làm.
- Contract (interface, schema) đã viết sẵn trong ARCHITECTURE.md, nên Claude không phải tự dò rồi tự thiết kế lại.
- `.claude/settings.json` chặn đọc `dist/`, `package-lock.json`, tài liệu cũ.
- Chọn model: **Sonnet** cho G1, G4, G6, G7, G8, G9; **Opus** cho G2, G3, G5 (Kotlin/Media3 và thuật toán).
- Báo lỗi bằng prompt mẫu ở trên: mô tả ngắn + log ngắn, đừng dán cả file.
- Không yêu cầu Claude "kiểm tra giao diện" bằng trình duyệt. Bạn tự thử trên máy rồi điền `docs/QA.md`.
