# Nghe Nhạc

App nghe nhạc cá nhân, **chỉ phát file nhạc có sẵn trong điện thoại** (không tìm nhạc online, không upload nhạc lên server). Một codebase React + TypeScript cho hai bản:

- **Poco X8 Pro** → **APK Android** (Capacitor): đọc thẳng thư mục nhạc, phát bằng Media3 nên chạy nền ổn khi tắt màn hình, có EQ, crossfade, chuẩn hóa âm lượng.
- **iPhone 12 Pro** → **PWA** (GitHub Pages): nạp nhạc bằng `<input webkitdirectory>` và sao chép vào IndexedDB.

## Poco và iPhone khác nhau thế nào

| Tính năng | Poco (APK) | iPhone (PWA) | Ghi chú |
|---|---|---|---|
| Đọc thẳng thư mục, tự quét lại khi mở app | ✔ | ✘ | iPhone phải chọn lại thư mục; bài đã có tự bỏ qua theo id |
| Không sao chép nhạc (không tốn thêm dung lượng) | ✔ | ✘ | iPhone sao chép file vào IndexedDB |
| Phát nền khi khóa màn hình, nút tai nghe/Bluetooth | ✔ (Media3) | ✔ (Media Session, có giới hạn của iOS) | |
| Equalizer, chuẩn hóa âm lượng, crossfade | ✔ | ✘ | iOS: `audio.volume` chỉ đọc, Web Audio làm mất phát nền |
| Phát liền mạch (gapless) | ✔ | ✘ | |
| Tốc độ phát 0.5–2×, hẹn giờ tắt | ✔ | ✔ | iPhone: hẹn giờ dừng đúng giờ nhưng không giảm dần âm lượng |
| Phân tích âm thanh (tempo, năng lượng…) | ✔ nhanh (MediaCodec) | ✔ chậm, chỉ khi app mở | Kết quả được đồng bộ nên iPhone nhận phần Poco đã tính |
| Gợi ý, trộn thông minh, mix tự động, thống kê/Wrapped, playlist thông minh, sửa tag | ✔ | ✔ | |
| Đồng bộ like/playlist/lịch sử/tag/cài đặt qua Supabase | ✔ | ✔ | Không bắt buộc; nhạc **không** lên Supabase |

## Tính năng

- **Thư viện**: duyệt theo Bài hát · Album · Nghệ sĩ · Thể loại · Thư mục, lọc không dấu, chọn nhiều bài, tìm bài trùng; danh sách ảo hóa nên vài nghìn bài vẫn mượt.
- **Sửa tag trong app** (không ghi vào file gốc, khôi phục được, sửa hàng loạt, đổi ảnh bìa) và **playlist thông minh** theo luật (thể loại, BPM, số lần nghe, ngày thêm, tâm trạng…).
- **Gợi ý kiểu Spotify** chạy trên máy: “Đang muốn nghe” (hợp với phiên đang nghe), mix theo giờ/tâm trạng, On Repeat, Lâu rồi chưa nghe, Khám phá trong thư viện, Radio từ một bài, **trộn thông minh** (tránh trùng nghệ sĩ liền nhau, năng lượng chuyển mượt, chèn gợi ý ✨).
- **Thống kê & Wrapped** theo Tuần/Tháng/Năm: tổng phút, top bài/nghệ sĩ/thể loại/album, giờ nghe nhiều nhất, chuỗi ngày, nghệ sĩ mới; xuất thẻ ảnh để chia sẻ và tạo playlist “Top 50 năm …”.
- **Lời bài hát**: file `.lrc` cùng tên hoặc tự tìm trên LRCLIB; tô sáng dòng đang hát, chạm dòng để tua.
- **Hàng đợi**: kéo thả sắp xếp, vuốt để xóa, “Phát tiếp theo”, “Thêm vào cuối”. **Nhớ vị trí** với bài dài hơn 10 phút.

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
| `npm run build` | Build bản web vào `dist/` |
| `npm run build:android` | Build web cho APK + `cap sync android` |
| `npm run test` | Unit test (Vitest) |
| `npm run lint` | ESLint + `tsc --noEmit` |

Kiến trúc chi tiết: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Tiến độ và câu hỏi mở: [`docs/STATUS.md`](docs/STATUS.md). Checklist thử trên điện thoại thật: [`docs/QA.md`](docs/QA.md).

## 2. Bản iPhone: PWA trên GitHub Pages

App web tĩnh, host miễn phí trên GitHub Pages (có HTTPS nên cài PWA và nghe nền được).

1. Repo GitHub → **Settings → Pages → Source: GitHub Actions**.
2. (Tùy chọn, nếu dùng đồng bộ) **Settings → Secrets and variables → Actions**: tạo `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
3. Push lên `main`. Workflow [`deploy.yml`](.github/workflows/deploy.yml) chạy lint → test → build → deploy. App có tại `https://<tên-github>.github.io/nghe_nhac/`.

**Cài lên iPhone 12 Pro (Safari, iOS 16.4+)**
1. Chép nhạc vào ứng dụng **Tệp** (iCloud Drive hoặc “Trên iPhone”) bằng cách bạn quen: cáp, AirDrop, iCloud…
2. Mở link app bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính**.
3. Mở app từ icon → **Thêm thư mục nhạc** (máy không cho chọn thư mục thì dùng **Thêm file** và chọn nhiều bài). Lần phát đầu tiên phải do bạn chạm.

Lưu ý iPhone:
- App **sao chép** nhạc vào bộ nhớ của app nên dùng gấp đôi dung lượng; xóa bản gốc nếu muốn tiết kiệm (xem dung lượng ở **Thư viện → Nhạc trên máy**).
- Safari có thể dọn dữ liệu web app nếu lâu không mở. App đã xin lưu trữ bền vững nhưng không được bảo đảm — giữ nhạc gốc để thêm lại khi cần.
- Có bài mới thì chọn lại thư mục: bài đã có (cùng tên + dung lượng) tự được bỏ qua.

## 3. Bản Poco: APK Android

APK đọc **thẳng** thư mục nhạc bạn chọn (không sao chép file) và tự quét lại khi mở app.

### 3.1 Tạo keystore (làm một lần, giữ file này cẩn thận)
Mọi bản APK phải ký bằng **cùng một** keystore thì mới cài đè bản mới lên bản cũ được. Mất file này = phải gỡ app và cài lại từ đầu.

```bash
keytool -genkeypair -v -keystore nghenhac.keystore -alias nghenhac \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 nghenhac.keystore > nghenhac.keystore.b64      # macOS: base64 -i nghenhac.keystore -o nghenhac.keystore.b64
```
Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("nghenhac.keystore")) | Set-Content nghenhac.keystore.b64`.
Đừng commit keystore (`.gitignore` đã chặn `*.keystore`, `*.jks`).

### 3.2 Điền 4 GitHub Secrets
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Giá trị |
|---|---|
| `ANDROID_KEYSTORE_B64` | nội dung file `nghenhac.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | mật khẩu keystore đã nhập ở `keytool` |
| `ANDROID_KEY_ALIAS` | `nghenhac` |
| `ANDROID_KEY_PASSWORD` | mật khẩu key (trùng mật khẩu keystore nếu bạn không đặt riêng) |

Thiếu `ANDROID_KEYSTORE_B64` thì workflow vẫn chạy nhưng APK **chưa ký**, không cài được.

### 3.3 Lấy APK
- Mỗi lần push, workflow **Build Android APK** chạy; tải file ở mục **Artifacts** (`nghe-nhac-apk`) của lần chạy đó.
- Muốn có bản phát hành: `git tag v0.1.0 && git push origin v0.1.0` → APK được đính vào **Releases**.

### 3.4 Cài lên Poco
1. Chép APK sang điện thoại (hoặc mở link Release bằng trình duyệt trên điện thoại).
2. Mở file, khi được hỏi thì bật **Cài đặt ứng dụng không rõ nguồn gốc** cho trình duyệt/trình quản lý file đang dùng.
3. Mở Nghe Nhạc → cho phép thông báo → **Thêm thư mục nhạc** → chọn thư mục (vd `Music`) → **Sử dụng thư mục này** → **Cho phép**. App nhớ quyền này; nếu bạn thu hồi quyền trong cài đặt hệ thống thì chọn lại thư mục (bài đã có không bị xóa).
4. Lần quét đầu đọc tag toàn bộ thư mục (hiện “Đang đọc x/y”); các lần sau chỉ đọc file mới/đổi.
5. Trên HyperOS: **Cài đặt → Ứng dụng → Nghe Nhạc → Tiết kiệm pin → Không hạn chế** để nhạc không bị tắt khi khóa màn hình.

### 3.5 Chạy cục bộ (cần Android Studio / JDK 21)
```bash
npm run build:android   # vite build (BUILD_TARGET=android) + cap sync
cd android && ./gradlew assembleDebug
```

## 4. Gợi ý nhạc hoạt động thế nào

Chạy hoàn toàn trên máy bạn, không gửi dữ liệu đi đâu:

1. **Giống nhau về nội dung**: nghệ sĩ, thể loại, album, năm, BPM từ tag. Tag nào thiếu thì bỏ qua, không bị trừ điểm.
2. **Giống nhau về âm thanh** (sau khi phân tích): năng lượng, độ sáng, nhịp, tempo, MFCC trên đoạn 45 giây mỗi bài. Nhạc ít tag thì phần này chiếm trọng số lớn hơn.
3. **Gu dài hạn**: mỗi lần nghe được phân loại — nghe gần hết (+), giữa chừng (+ ít), bỏ qua sớm (−) — cộng bài đã thích, giảm dần theo thời gian (bán rã 3 tuần).
4. **Đang muốn nghe gì**: phiên nghe hiện tại (các lượt cách nhau < 30 phút) cho ra “Đang hợp: Chill · ~90 BPM”. Tâm trạng là **ước lượng** theo luật cố định, không phải học máy.
5. **Đồng nghe** và **khung giờ trong ngày** (mix buổi sáng/tối).

Lịch sử nghe lưu trên máy và đồng bộ giữa hai máy khi đăng nhập (xóa được ở Cài đặt → Gợi ý nhạc, xóa cả trên server).

## 5. Supabase (tùy chọn — đồng bộ)

Đồng bộ: bài thích, playlist, lịch sử nghe, đặc trưng âm thanh, tag sửa tay, playlist thông minh, cài đặt (EQ…). **Không bao giờ lưu file nhạc.**

1. <https://supabase.com> → **New project** (gói Free là đủ).
2. **SQL Editor** → chạy lần lượt `supabase/migrations/20261019000000_init.sql`, `20261026000000_folder_provider.sql`, rồi **`20261102000000_v2_sync.sql`** (v2: có RLS; đã là người dùng v1 thì chỉ cần chạy file mới).
3. **Authentication → Providers → Email**: bật Email (đăng nhập email + mật khẩu); dùng cá nhân thì nên tắt “Confirm email”.
4. **Authentication → URL Configuration**: đặt **Site URL** và **Redirect URLs** là địa chỉ GitHub Pages của app.
5. Chép **Project URL** và khóa **anon public** vào `.env` (hoặc GitHub Secrets — workflow Android cũng dùng hai secret này). Không dùng `service_role` key trong app.

Không cấu hình Supabase thì mọi thứ lưu ở chế độ khách trên từng máy; khi đăng nhập lần đầu, những gì đã ghi (like, lịch sử…) tự được đẩy lên. Mất mạng thì thao tác được xếp hàng và gửi lại sau.

## 6. Cấu trúc

```
src/
  app/            router, layout, error boundary
  platform/       web/ (iPhone) và android/ (Poco): thư viện, engine phát, decoder, chia sẻ — khác biệt nền tảng nằm hết ở đây
  features/
    player/       hàng đợi (thuần + test), store, màn Đang phát, cửa sổ đẩy xuống engine native
    listening/    tốc độ, hẹn giờ, EQ, chuẩn hóa, nhớ vị trí
    recommend/    lịch sử, engine gợi ý, intent/mood, smartShuffle, mix Trang chủ
    analyze/      trích đặc trưng âm thanh (Worker), hàng đợi phân tích nền
    library/      yêu thích, playlist, duyệt thư viện, sửa tag
    smart/        playlist thông minh (luật + đánh giá)
    stats/        thống kê, Wrapped
    sync/         outbox, gộp LWW, đồng bộ Supabase
    lyrics/ folder/ downloads/ auth/ settings/ onboarding/ home/
  providers/      nạp file, đọc tag, thư viện trên máy
android/          dự án Capacitor + plugin Kotlin (MusicLibrary, NativePlayer, PlaybackService)
supabase/         migration SQL + test RLS
docs/             ARCHITECTURE, STATUS, QA, phases/
```

## 7. Giới hạn đã biết

- **iOS**: phát nền/khóa màn hình hoạt động khi app đã cài lên màn hình chính; Safari có thể dọn dữ liệu web app nếu lâu không mở; không có EQ/crossfade/chuẩn hóa.
- **Chưa kiểm thử trên điện thoại thật** — xem [`docs/QA.md`](docs/QA.md), điền kết quả để sửa lỗi ở vòng sau.
- Đổi tên file thì id bài đổi (id = tên + dung lượng, để hai máy khớp nhau): bài được coi là bài mới, like/playlist của bản cũ không tự nối sang.
- Tâm trạng, BPM, năng lượng chỉ là ước lượng; nhạc không có nhịp rõ có thể cho BPM sai.
- Trang “Trùng bài” chỉ liệt kê; app không xóa file trong thư mục nhạc của bạn.
