# G4 — Đồng bộ v2 (lịch sử nghe, features, tag sửa tay, playlist thông minh)
Đọc thêm: ARCHITECTURE §3, §4. Model gợi ý: Sonnet.

## Việc cần làm
1. Migration SQL theo §4, có RLS đầy đủ. Test RLS bằng PGlite giống test cũ: người A không đọc/ghi được dữ liệu của B; không update được `play_events`.
2. `src/features/sync/`: `outbox.ts`, `syncMerge.ts` (thuần), `syncService.ts` (push/pull, cursor trong store `meta`, chạy theo các trigger ở §4, lỗi mạng thì backoff).
3. Lịch sử nghe, like, playlist, `user_settings` đều đi qua outbox. Chế độ khách (chưa đăng nhập): vẫn ghi outbox, khi đăng nhập lần đầu thì đẩy hết lên.
4. Cài đặt → "Xóa lịch sử nghe": xóa cả trên máy lẫn server (có hộp thoại xác nhận).
5. Chỉ báo đồng bộ nhỏ trong Cài đặt: lần đồng bộ cuối, số thay đổi đang chờ.

## Nghiệm thu
- Test `syncMerge`: trùng id, LWW, bản ghi xóa mềm, đồng hồ lệch ±5 phút, đẩy lại cả lô (idempotent).
- Test outbox với Supabase client giả: mất mạng giữa chừng không mất dữ liệu.
- README: chạy thêm file migration mới.
