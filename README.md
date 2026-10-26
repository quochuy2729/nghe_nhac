# Nghe Nhạc

App nghe nhạc cá nhân dạng **PWA** (React + TypeScript + Vite) cho **iPhone và Android**. Nhạc nằm **ngay trong điện thoại** của bạn (không cần PC, không cần mạng để nghe), chỉ phát âm thanh, có gợi ý bài tương tự kiểu Spotify.

- **Thêm nhạc một lần**: chọn thư mục (hoặc nhiều file) nhạc trên điện thoại; app đọc tag (tên bài, nghệ sĩ, album, thể loại, năm, BPM, ảnh bìa) và lưu vào máy.
- Player đầy đủ: phát/tạm dừng, bài trước/sau, **trộn bài**, lặp lại, tua, hàng đợi, mini-player và màn Đang phát, điều khiển trên màn hình khóa (Media Session).
- **Gợi ý**: “Dành cho bạn”, “Nghe gần đây”, các mix theo thể loại/nghệ sĩ, **Phát nhạc tương tự** (radio) từ menu ⋯ của bài, và **tự nối nhạc tương tự** khi hết hàng đợi.
- **Lời bài hát**: file `.lrc` cùng tên (chọn kèm khi thêm nhạc) hoặc tự tìm trên LRCLIB; dòng đang hát tô sáng và tự cuộn, chạm dòng để tua.
- **Tài khoản** (Supabase, không bắt buộc): bài yêu thích và playlist đồng bộ giữa Poco và iPhone. Nhạc **không** lên Supabase.

---

## 1. Chạy trên máy tính (để phát triển)

```bash
npm ci
cp .env.example .env   # điền key Supabase nếu muốn đồng bộ (không bắt buộc)
npm run dev            # http://localhost:5173
```

| Lệnh | Việc |
|------|------|
| `npm run dev` | Chạy local |
| `npm run build` | Build production vào `dist/` |
| `npm run test` | Unit test (Vitest) |
| `npm run lint` | ESLint + `tsc --noEmit` |

## 2. Đưa app lên điện thoại (GitHub Pages)

App là web tĩnh, host miễn phí trên GitHub Pages (có HTTPS nên cài PWA và nghe nền được).

1. Repo GitHub → **Settings → Pages → Source: GitHub Actions**.
2. (Tùy chọn, nếu dùng đồng bộ) **Settings → Secrets and variables → Actions**: tạo `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
3. Push lên `main`. Workflow [`deploy.yml`](.github/workflows/deploy.yml) chạy lint → test → build → deploy. App có tại `https://<tên-github>.github.io/nghe_nhac/`.

## 3. Cài lên màn hình chính và thêm nhạc

**iPhone 12 Pro (Safari, iOS 16.4+)**
1. Mở link app bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính**.
2. Mở app từ icon trên màn hình chính → **Thêm thư mục nhạc** (nếu máy không cho chọn thư mục thì dùng **Thêm file** và chọn nhiều bài trong ứng dụng Tệp). Nhạc cần có sẵn trong Tệp / iCloud Drive / “Trên iPhone”.

**Poco X8 Pro (Chrome)**
1. Mở link app bằng **Chrome** → menu ⋮ → **Cài đặt ứng dụng**.
2. Mở app → **Thêm thư mục nhạc** và chọn thư mục chứa nhạc. Trên MIUI/HyperOS vào **Cài đặt → Ứng dụng → Chrome → Tiết kiệm pin → Không hạn chế** để nhạc không bị tắt khi khóa màn hình.

Ghi chú:
- Chép nhạc từ PC sang điện thoại bằng cách bạn quen (cáp, Google Drive, AirDrop/iCloud…), rồi thêm vào app.
- App **sao chép** nhạc vào bộ nhớ của app, nên dung lượng bị dùng gấp đôi (bản gốc + bản trong app). Xóa bản gốc nếu muốn tiết kiệm; xem dung lượng ở **Thư viện → Nhạc trên máy**.
- Khi có bài mới, chọn lại thư mục: bài đã có (cùng tên + dung lượng) tự được bỏ qua.
- Mỗi điện thoại có kho nhạc riêng. Nếu playlist đồng bộ chứa bài chưa có trên máy kia, app báo chưa có bài đó và tự bỏ qua sang bài kế tiếp.
- Đổi tên file thì bài được coi là bài mới (like/playlist của bản cũ không nối sang).

## 4. Gợi ý nhạc hoạt động thế nào

Chạy hoàn toàn trên máy bạn, không gửi dữ liệu đi đâu:

1. **Giống nhau về nội dung**: nghệ sĩ, thể loại, album, năm, BPM từ tag. Tag nào thiếu thì bỏ qua, không bị trừ điểm.
2. **Gu dài hạn**: mỗi lần nghe được phân loại — nghe gần hết (+), nghe giữa chừng (+ ít), bỏ qua trong 30 giây đầu (−) — cộng thêm bài đã thích, giảm dần theo thời gian (bán rã 3 tuần).
3. **Đang muốn nghe gì**: vài bài vừa nghe được ưu tiên hơn gu dài hạn (hiện thành “Vì bạn đang nghe …” ở Trang chủ).
4. **Đồng nghe**: những bài hay được nghe liền nhau trong cùng một phiên.

Lịch sử nghe chỉ lưu trên điện thoại đó (Cài đặt → Gợi ý nhạc → xóa được). Nhạc thiếu tag **thể loại** thì gợi ý chủ yếu dựa vào nghệ sĩ và lịch sử nghe; nên gắn tag thể loại (vd bằng MusicBrainz Picard hoặc Mp3tag trên PC) trước khi chép sang điện thoại.

## 5. Supabase (tùy chọn — đồng bộ like và playlist)

1. <https://supabase.com> → **New project** (gói Free là đủ).
2. **SQL Editor** → chạy lần lượt `supabase/migrations/20261019000000_init.sql` rồi `supabase/migrations/20261026000000_folder_provider.sql`.
3. **Authentication → Providers → Email**: bật Email; dùng cá nhân thì nên tắt “Confirm email”.
4. **Authentication → URL Configuration**: đặt **Site URL** và **Redirect URLs** là địa chỉ GitHub Pages của app.
5. Chép **Project URL** và khóa **anon public** vào `.env` (hoặc GitHub Secrets). Không dùng `service_role` key trong app.

Không cấu hình Supabase thì like/playlist lưu ở chế độ khách trên từng máy và tự chuyển lên tài khoản khi bạn đăng nhập lần đầu.

## 6. Cấu trúc

```
src/
  app/            router, layout, error boundary
  features/
    player/       <audio> duy nhất, queue (logic thuần + test), Media Session, ghi lịch sử nghe
    recommend/    lịch sử nghe, engine gợi ý (hàm thuần + test), radio, cài đặt
    folder/       nút thêm thư mục/file nhạc
    lyrics/       LRC parser, client LRCLIB, LyricsView đồng bộ
    library/      yêu thích, playlist (chế độ khách + Supabase)
    downloads/    nhạc trên máy (IndexedDB): dung lượng, xóa, giữ bền vững
    auth/         đăng nhập Supabase
  providers/      folder.ts: nạp file, đọc tag, thư viện trên máy, tìm kiếm không dấu
  lib/            supabase, IndexedDB (idb), tiện ích
supabase/migrations/   SQL schema + RLS
```

## 7. Giới hạn đã biết

- **iOS**: phát nền/khóa màn hình hoạt động khi app đã cài lên màn hình chính, lần phát đầu phải do bạn chạm. Safari có thể dọn dữ liệu của web app nếu lâu không mở — app đã xin lưu trữ bền vững (`storage.persist()`) nhưng trình duyệt không bảo đảm; hãy giữ nhạc gốc ở nơi khác để thêm lại khi cần.
- **Chưa kiểm thử trên điện thoại thật**: chọn thư mục (`webkitdirectory`) trên Safari iOS, thư viện lớn (hàng nghìn bài, vài GB) và nghe nền trên iPhone/Poco. Nếu iPhone không chọn được thư mục thì dùng **Thêm file**.
- Mỗi lần thêm nhạc, app đọc từng file lần lượt (khá lâu với thư viện lớn); đừng tắt app khi đang đọc.
- Chưa phân tích âm thanh (tempo/năng lượng) — gợi ý dựa trên tag và hành vi nghe.
- Chi tiết kiến trúc và các quyết định: [`analysis.md`](analysis.md) và [`../ANALYSIS.md`](../ANALYSIS.md).
