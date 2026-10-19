# CLAUDE.md — Nghe Nhạc

App nghe nhạc cá nhân kiểu Spotify/Spotube, chạy trên **Poco X8 Pro (Android)** và **iPhone 12 Pro**.
Đọc `analysis.md` trước khi code — đó là bản phân tích yêu cầu và kiến trúc. File này là luật làm việc.

## Mục tiêu
- Nghe nhạc stream, tải về nghe offline.
- Tài khoản: thư viện bài đã lưu + playlist đồng bộ giữa 2 điện thoại.
- Player: play/pause, next, previous, shuffle, repeat, seek, hàng đợi.
- Lời bài hát đồng bộ (synced lyrics): dòng đang hát được tô sáng và tự cuộn theo nhạc.

## Stack (không đổi nếu chưa hỏi)
- **PWA**: React 18 + TypeScript + Vite, `vite-plugin-pwa` (Workbox).
- **State**: Zustand. **Style**: Tailwind CSS. Dark theme mặc định.
- **Backend**: Supabase (Auth email/password, Postgres + RLS, Storage cho file nhạc người dùng tự upload).
- **Offline**: IndexedDB (qua `idb`) lưu blob audio + metadata; gọi `navigator.storage.persist()`.
- **Nguồn nhạc** (provider pattern, xem analysis.md §3):
  - `jamendo` — Jamendo API (nhạc Creative Commons, cho phép tải). Cần `VITE_JAMENDO_CLIENT_ID`.
  - `audius` — Audius public API (không cần key).
  - `local` — file mp3/m4a/flac người dùng tự chọn từ máy hoặc upload lên Supabase Storage.
- **Lyrics**: LRCLIB (`https://lrclib.net/api/get` và `/api/search`), parse định dạng LRC. Lấy lúc runtime, **không** commit lời bài hát vào repo, không cache lời lên Supabase.
- **Lock screen / tai nghe**: Media Session API.
- **Deploy**: GitHub Pages qua GitHub Actions (base path = tên repo).

## Ràng buộc bắt buộc
- KHÔNG tích hợp tải/rip từ YouTube, Spotify hay nguồn vi phạm ToS/bản quyền. Chỉ dùng provider ở trên.
- Nút "Tải về" chỉ hiện với track mà provider cho phép tải (`track.downloadable === true`) hoặc file của chính người dùng.
- Không hardcode secret. Mọi key đi qua `.env` (có `.env.example`), Supabase chỉ dùng anon key + RLS.
- Dữ liệu test/fixture không chứa lời bài hát thật — dùng LRC giả tự viết.
- Mobile-first: thiết kế cho màn ~390px, vùng chạm ≥ 44px, tôn trọng `safe-area-inset` của iPhone.
- Chỉ dùng **một** phần tử `<audio>` toàn cục (iOS chặn autoplay/background nếu tạo nhiều).

## Cấu trúc thư mục
```
src/
  app/            # router, layout, providers
  features/
    player/       # audio engine, queue, shuffle, Media Session
    lyrics/       # LRCLIB client, LRC parser, LyricsView
    library/      # thư viện, playlist, liked
    search/
    downloads/    # IndexedDB, quản lý offline
    auth/
  providers/      # jamendo.ts, audius.ts, local.ts + types.ts (interface MusicProvider)
  lib/            # supabase.ts, db.ts (idb), utils
supabase/migrations/   # SQL schema + RLS
```

## Lệnh
- `npm run dev` — chạy local
- `npm run build` — build production (phải pass trước khi commit)
- `npm run test` — Vitest
- `npm run lint` — ESLint + `tsc --noEmit`

## Cách làm việc
- Làm theo các phase trong `analysis.md` §6. Xong mỗi phase: build + test pass, commit, tick checklist trong analysis.md.
- Viết test cho phần logic thuần: LRC parser, shuffle (Fisher–Yates giữ bài hiện tại), queue next/prev, chọn dòng lyric theo thời gian.
- Commit message tiếng Anh, ngắn, dạng `feat(player): ...`.
- Nếu gặp quyết định ảnh hưởng kiến trúc hoặc cần key/tài khoản, ghi vào mục "Câu hỏi mở" cuối analysis.md và chọn phương án an toàn để tiếp tục.
- Trả lời người dùng ngắn gọn, bằng tiếng Việt.
