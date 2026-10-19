# Nghe Nhạc

App nghe nhạc cá nhân dạng **PWA** (React + TypeScript + Vite), chạy trên iPhone và Android từ cùng một trang web:

- Nghe nhạc stream từ **Jamendo** (nhạc Creative Commons) và **Audius**, hoặc **file nhạc của bạn**.
- Player đầy đủ: phát/tạm dừng, bài trước/sau, trộn bài, lặp lại (tắt/tất cả/một bài), tua, hàng đợi, mini-player và màn Đang phát, điều khiển trên màn hình khóa (Media Session).
- **Lời bài hát đồng bộ** từ LRCLIB: dòng đang hát được tô sáng và tự cuộn theo nhạc; chạm một dòng để tua tới đó.
- **Tài khoản** (Supabase): bài yêu thích và playlist đồng bộ giữa Android và iPhone.
- **Tải về nghe offline** với bài được phép tải và file của bạn.

> Chưa có key thì app vẫn chạy: nguồn Jamendo được thay bằng **Demo** (nhạc tổng hợp ngay trên máy, lời giả tự viết), thư viện lưu ở **chế độ khách** trên máy.

App không tải/rip nhạc từ YouTube, Spotify hay nguồn vi phạm bản quyền. Nhạc thương mại chỉ nghe được qua file bạn sở hữu.

---

## 1. Chạy trên máy tính

```bash
npm ci
cp .env.example .env   # điền key (không bắt buộc)
npm run dev            # http://localhost:5173
```

| Lệnh | Việc |
|------|------|
| `npm run dev` | Chạy local |
| `npm run build` | Build production vào `dist/` |
| `npm run test` | Unit test (Vitest) |
| `npm run lint` | ESLint + `tsc --noEmit` |

## 2. Tạo Supabase project (tài khoản + đồng bộ)

1. Vào <https://supabase.com> → **New project** (gói Free là đủ). Chọn region gần (vd Singapore).
2. **SQL Editor** → **New query** → dán toàn bộ file [`supabase/migrations/20261019000000_init.sql`](supabase/migrations/20261019000000_init.sql) → **Run**.
   File này tạo bảng `profiles`, `tracks`, `user_files`, `liked_tracks`, `playlists`, `playlist_tracks`, bật Row Level Security (mỗi người chỉ thấy dữ liệu của mình) và tạo bucket riêng tư `user-audio` cho file nhạc bạn upload.
   (Hoặc dùng Supabase CLI: `supabase link --project-ref <ref>` rồi `supabase db push`.)
3. **Authentication → Providers → Email**: bật Email. Dùng cá nhân thì nên **tắt “Confirm email”** để đăng ký xong đăng nhập luôn (trên iPhone, PWA đã cài và Safari không chung bộ nhớ nên link xác nhận mở ở Safari sẽ không tự đăng nhập vào app).
4. **Authentication → URL Configuration**: đặt **Site URL** = `https://<tên-github>.github.io/nghe_nhac/` và thêm cùng URL đó vào **Redirect URLs**.
5. **Project Settings → API**: chép **Project URL** → `VITE_SUPABASE_URL` và khóa **anon public** → `VITE_SUPABASE_ANON_KEY`.
   Chỉ dùng anon key — **không bao giờ** dùng `service_role` key trong app.

## 3. Lấy Jamendo client_id

1. Đăng ký tại <https://devportal.jamendo.com> → **My Applications** → **Add application** (điền tên app, website có thể là link GitHub Pages của bạn).
2. Chép **Client ID** → `VITE_JAMENDO_CLIENT_ID`.

Audius không cần key.

## 4. Điền secrets và deploy GitHub Pages

1. Repo trên GitHub → **Settings → Secrets and variables → Actions → New repository secret**, tạo 3 secret:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_JAMENDO_CLIENT_ID`

   (Thiếu secret nào thì phần đó chạy chế độ mock/khách.)
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push lên `main` (hoặc **Actions → Deploy to GitHub Pages → Run workflow**). Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) chạy lint → test → build → deploy.
4. App có tại `https://<tên-github>.github.io/nghe_nhac/`.

Các biến `VITE_*` được nhúng vào bundle lúc build (đây là thiết kế của Vite). Anon key được phép công khai vì quyền truy cập do RLS kiểm soát.

## 5. Cài lên màn hình chính

**iPhone (Safari, iOS 16.4+)**
1. Mở link app bằng **Safari** (không dùng Chrome/Zalo/Messenger in-app browser).
2. Bấm nút **Chia sẻ** (ô vuông có mũi tên lên) → **Thêm vào MH chính** → **Thêm**.
3. Mở app từ icon “Nghe Nhạc” trên màn hình chính và đăng nhập lại (bộ nhớ của app đã cài tách riêng với Safari).

**Android (Chrome) — Poco/Xiaomi**
1. Mở link app bằng **Chrome**.
2. Bấm menu **⋮** → **Cài đặt ứng dụng** (hoặc “Thêm vào màn hình chính” → **Cài đặt**).
3. Trên MIUI/HyperOS nên vào **Cài đặt → Ứng dụng → Chrome → Tiết kiệm pin → Không hạn chế** để nhạc không bị tắt khi khóa màn hình.

Đăng nhập cùng một tài khoản trên cả hai máy: thích một bài trên máy này, mở app trên máy kia là thấy (app đồng bộ lại mỗi khi quay lại foreground).

## 6. Dùng app

- **Tìm kiếm**: chọn nguồn Jamendo/Demo, Audius hoặc **Của tôi**. Bài có nhãn **Tải được** thì tải về được.
- **Của tôi**: “Thêm file nhạc” để chọn mp3/m4a/flac… (chọn kèm file `.lrc` cùng tên nếu có lời). File lưu trên máy và nghe được offline. Đã đăng nhập thì menu ⋯ của bài có **Tải lên đám mây** để máy còn lại cũng nghe được.
- **Tải về**: menu ⋯ → **Tải về**, hoặc nút ⬇ ở màn Đang phát. Quản lý ở **Thư viện → Đã tải về** (xem dung lượng, xóa từng bài, bật “Giữ dữ liệu offline”).
- **Lời bài hát**: màn Đang phát → thẻ Lời bài hát hoặc nút **Lời bài hát**. Tự cuộn tạm dừng 3 giây khi bạn tự cuộn tay.

## 7. Cấu trúc

```
src/
  app/            router, layout, error boundary
  features/
    player/       <audio> duy nhất, queue (logic thuần + test), Media Session, mini/full player
    lyrics/       LRC parser, client LRCLIB, LyricsView đồng bộ
    library/      yêu thích, playlist (chế độ khách + Supabase)
    search/       trang tìm kiếm, nhập file local
    downloads/    tải về IndexedDB, quản lý dung lượng
    auth/         đăng nhập Supabase
  providers/      jamendo, audius, local, mock (+ synth WAV demo)
  lib/            supabase, IndexedDB (idb), tiện ích
supabase/migrations/   SQL schema + RLS
```

## 8. Giới hạn đã biết

- **iOS**: phát nền/khóa màn hình hoạt động khi app đã cài lên màn hình chính, lần phát đầu phải do bạn chạm. Safari có thể dọn dữ liệu offline nếu lâu không mở app — bật “Giữ dữ liệu offline” trong mục Đã tải về.
- Một số link tải của Jamendo/Audius có thể chặn tải trực tiếp từ trình duyệt (CORS); khi đó app báo lỗi và bạn vẫn stream được bình thường.
- Chi tiết kiến trúc và các câu hỏi còn mở: xem [`analysis.md`](analysis.md).

## Tài liệu khác

- Yêu cầu & kiến trúc: [analysis.md](analysis.md)
- Quy ước cho Claude Code: [CLAUDE.md](CLAUDE.md)
- Prompt khởi động: [PROMPT.md](PROMPT.md)
