# G3 — Phát nhạc native trên Android (Media3)
Đọc thêm: ARCHITECTURE §2 (AudioEngine), §7. Model gợi ý: Opus.

## Việc cần làm
1. Plugin `NativePlayer` + `PlaybackService : MediaSessionService` (ExoPlayer, `C.USAGE_MEDIA`, `handleAudioFocus=true`, `setHandleAudioBecomingNoisy(true)`).
2. API: `setWindow(items[{id,uri,title,artist,album,artworkUri,durationMs}], startIndex, startMs)`, play, pause, seek, skipTo, `getState()`. Event: state, position (250ms, chỉ khi WebView đang hiện), trackChanged (gồm cả reason), ended, error, remote.
3. `NativeAudioEngine.ts` hiện thực `AudioEngine`. Store: khi `trackChanged` với reason `auto` thì cập nhật index, ghi lịch sử nghe cho bài trước (thời gian nghe lấy từ native: plugin cộng dồn ms thực sự phát, không tính đoạn tua). Hàng đợi còn ≤ 5 bài thì đẩy thêm (gồm cả tự nối bài tương tự).
4. Ghi lịch sử khi app ở nền: native lưu event vào hàng chờ (SharedPreferences/JSON), JS lấy ra khi resume (`drainEvents()`). Mục đích là không mất lượt nghe nào.
5. Notification có ảnh bìa, nút like (custom command `toggleLike` → emit về JS).
6. Lỗi file (bài bị xóa hoặc mất quyền) → bỏ qua sang bài kế, emit `error`.

## Không làm
EQ, crossfade (để G6).

## Nghiệm thu
- Test JS: `NativeAudioEngine` với mock plugin (đổi bài, nạp thêm vào window, drain lịch sử).
- QA thủ công cho chủ repo: khóa màn hình nghe 30 phút liên tục qua nhiều bài; dùng nút tai nghe Bluetooth; rút tai nghe thì dừng; có cuộc gọi đến thì dừng rồi phát tiếp; lịch sử nghe lúc khóa màn hình hiện đủ khi mở app.
