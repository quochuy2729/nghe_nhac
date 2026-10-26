# ARCHITECTURE v2 — Nghe Nhạc

> Chỉ đọc mục mà file phase trỏ tới. Bản phân tích v1 nằm ở `docs/history/` (không cần đọc).

## §1 Hai nền tảng, một codebase

```
             React UI + features (player, recommend, library, stats, lyrics)
                                    │  chỉ gọi
                          src/platform/types.ts  (Platform)
                 ┌──────────────────┴──────────────────┐
     src/platform/web/  (iPhone PWA)          src/platform/android/  (Poco APK)
     - WebImportSource: <input> → IDB         - SafLibrarySource → plugin MusicLibrary (SAF)
     - WebAudioEngine: 1 <audio>              - NativeAudioEngine → plugin NativePlayer (Media3)
       + Media Session                          + MediaSessionService, notification, tai nghe
     - WebDecoder: decodeAudioData            - NativeDecoder: MediaCodec → PCM
```
`src/platform/index.ts` chọn implementation một lần lúc khởi động: `Capacitor.isNativePlatform()` → android, còn lại → web.

### Ma trận khả năng (`platform.caps`)
| cap | Poco APK | iPhone PWA | Ghi chú |
|---|---|---|---|
| `folderLink` (đọc thẳng thư mục, tự quét lại) | ✔ | ✘ | iOS phải chọn lại thư mục; bài đã có tự bỏ qua theo id |
| `noCopy` | ✔ | ✘ | iOS sao chép file vào IDB |
| `eq`, `normalize`, `crossfade` | ✔ | ✘ | iOS: `audio.volume` chỉ đọc, Web Audio làm mất phát nền |
| `gapless` | ✔ | ✘ | |
| `speed`, `sleepTimer` | ✔ | ✔ | Web: hẹn giờ kiểm trong `timeupdate`, không dùng `setTimeout` |
| `analyze` | ✔ nhanh | ✔ chậm, chỉ khi app mở | đặc trưng được đồng bộ → iPhone nhận kết quả do Poco tính |

## §2 Platform contract (`src/platform/types.ts`)
```ts
export interface PlatformCaps { folderLink: boolean; noCopy: boolean; eq: boolean; normalize: boolean;
  crossfade: boolean; gapless: boolean; speed: boolean; sleepTimer: boolean; analyze: boolean }

export interface LibrarySource {
  /** Web: mở <input>; Android: SAF OpenDocumentTree + persist permission. */
  addFolder(): Promise<void>;
  listFolders(): Promise<{ id: string; label: string }[]>;
  removeFolder(id: string): Promise<void>;
  /** Quét tăng dần: chỉ đọc tag file mới/đổi (theo id + mtime). Gọi khi mở app (Android). */
  rescan(onProgress?: (done: number, total: number) => void): Promise<{ added: number; removed: number }>;
  /** URL để engine phát (web: blob URL; android: content:// URI đưa thẳng cho Media3). */
  resolve(track: Track): Promise<string>;
  artwork(track: Track): Promise<string | null>;
  lyricsFile(track: Track): Promise<string | null>;  // .lrc cùng tên
}

export type EngineEvent =
  | { type: 'state'; playing: boolean; buffering: boolean }
  | { type: 'position'; sec: number; durationSec: number }   // ~4 lần/giây khi app mở
  | { type: 'trackChanged'; index: number; reason: 'auto' | 'user' | 'error' }
  | { type: 'ended' }                                        // hết hàng đợi đã đẩy xuống
  | { type: 'error'; trackId: string; message: string }
  | { type: 'remote'; action: 'next' | 'prev' | 'play' | 'pause' };

export interface AudioEngine {
  /** JS là chủ hàng đợi; đẩy xuống "cửa sổ" bài hiện tại + tối đa 20 bài kế. Native tự chuyển bài khi màn hình tắt. */
  setWindow(items: { track: Track; url: string }[], startIndex: number, startSec?: number): Promise<void>;
  play(): Promise<void>; pause(): Promise<void>; seek(sec: number): Promise<void>;
  skipTo(index: number): Promise<void>;
  getPosition(): number;              // nội suy từ event cuối + thời gian trôi qua (dùng cho lyrics)
  setSpeed?(x: number): Promise<void>;
  setEq?(bandsDb: number[]): Promise<void>;   // 5 hoặc 10 band
  setGainDb?(db: number): Promise<void>;      // chuẩn hóa âm lượng theo bài
  setCrossfade?(sec: number): Promise<void>;
  on(cb: (e: EngineEvent) => void): () => void;
}

export interface AudioDecoder {
  /** PCM mono Float32 tại `sampleRate`, đoạn [startSec, startSec+durSec). */
  decodeSegment(track: Track, startSec: number, durSec: number, sampleRate: 22050): Promise<Float32Array>;
}

export interface Platform { id: 'web' | 'android'; caps: PlatformCaps;
  library: LibrarySource; engine: AudioEngine; decoder: AudioDecoder }
```

## §3 Data model (IndexedDB `nghe-nhac`, lên version 2)
`Track` thêm các trường (đều optional, dữ liệu cũ vẫn đọc được):
```ts
folder?: string;            // đường dẫn thư mục tương đối, để duyệt theo thư mục
source?: { kind: 'idb' } | { kind: 'saf'; uri: string; mtime: number };
```
Store mới: `features` (key trackId), `overrides` (key trackId), `events` (lịch sử nghe, key `id` uuid, index `t`, `synced`), `outbox` (thay đổi chờ đẩy lên), `meta` (cursor đồng bộ).
- Lịch sử nghe chuyển từ localStorage (`nn-history`) sang store `events`: migrate một lần rồi xóa key cũ. Giữ tối đa 20 000 event trên máy.
- Track hiển thị = `track` ⊕ `overrides[track.id]` (hàm thuần `applyOverride`).

```ts
interface PlayEvent { id: string /*uuid*/; trackId: string; t: number /*ms kết thúc*/; sec: number;
  dur: number; kind: 'complete'|'partial'|'skip'; device: 'poco'|'iphone'; ctx?: 'shuffle'|'radio'|'album'|'playlist'|'mix' }

interface AudioFeatures { v: 1; bpm: number | null; bpmConf: number; energy: number; loudnessDb: number;
  brightness: number; onsetRate: number; dynamics: number; mfcc: number[] /*13*/; analyzedSec: number }
// energy/brightness/onsetRate/dynamics chuẩn hóa về [0,1] theo hằng số cố định (không theo thư viện) để hai máy cho cùng kết quả.

interface SmartPlaylist { id: string; name: string; rules: Rule[]; match: 'all'|'any';
  sort: 'random'|'added'|'plays'|'lastPlayed'|'title'; limit?: number; updatedAt: number }
type Rule = { field: 'genre'|'artist'|'album'|'year'|'bpm'|'mood'|'folder'|'liked'|'plays'|'lastPlayedDays'|'addedDays';
  op: 'is'|'isNot'|'contains'|'gt'|'lt'|'between'; value: string | number | [number, number] }
```

## §4 Đồng bộ Supabase
Migration mới `supabase/migrations/2026110x_v2_sync.sql`:
```sql
play_events(id uuid pk, user_id uuid not null default auth.uid(), track_id text, ended_at timestamptz,
  listened_sec int, duration_sec int, kind text check (kind in ('complete','partial','skip')),
  device text, ctx text, created_at timestamptz default now())   -- RLS: select/insert/delete own; không update
track_features(user_id, track_id, v smallint, data jsonb, updated_at, pk(user_id, track_id))
track_overrides(user_id, track_id, patch jsonb, updated_at, pk(user_id, track_id))
smart_playlists(id uuid pk, user_id, name text, data jsonb, updated_at, deleted bool default false)
user_settings(user_id pk, data jsonb, updated_at)               -- preset EQ, tùy chọn gợi ý
```
- **Outbox pattern**: mọi thay đổi ghi IDB trước và thêm một dòng vào `outbox`; `sync()` đẩy theo lô 500, thành công thì xóa dòng outbox. Insert event dùng uuid tạo ở client nên đẩy lại nhiều lần vẫn không bị trùng (`on conflict do nothing`).
- **Pull**: `play_events` lấy theo `created_at > cursor`. Các bảng còn lại lấy theo `updated_at > cursor`, gộp bằng last-write-wins theo `updated_at`.
- Lúc chạy sync: khi mở app, khi app quay lại foreground, khi có mạng lại, và mỗi 10 phút nếu có outbox. Không dùng Realtime.
- `syncMerge.ts` là hàm thuần, có test: trùng id, LWW, bản ghi đã xóa, đồng hồ hai máy lệch nhau ±5 phút.

## §5 Gợi ý v2 (`src/features/recommend/`)
Giữ `engine.ts` hiện có, mở rộng thêm:
- **Độ giống nội dung** `contentSim(a,b) = wTag·tagSim + wAudio·audioSim`. `audioSim` = cosine trên vector [energy, brightness, onsetRate, dynamics, bpmNorm, mfcc/σ]. Thiếu features thì `wAudio=0`; tag thưa (không có genre) thì `wAudio=0.6`, còn lại `0.4`.
- **"Đang muốn nghe gì"** (`intent.ts`): vector ý định = trung bình có trọng số của features các bài trong phiên hiện tại (phiên = các lượt nghe cách nhau < 30 phút). Trọng số: complete +1, partial +0.4, skip −0.7, giảm dần theo thứ tự gần đây (×0.8 mỗi bài cũ hơn). Kết quả gồm vector + nhãn mood + khoảng BPM, hiện lên UI là "Đang hợp: Chill · ~90 BPM".
- **Mood** (`mood.ts`, luật cố định, ghi rõ là "ước lượng"): `soi-dong` (energy cao, bpm ≥ 115), `chill` (energy thấp, bpm < 100), `sau-lang` (energy thấp, brightness thấp), `tap-trung` (energy trung bình, onsetRate ổn định), `khac`.
- **Ngữ cảnh giờ**: 6 khung (0–5, 5–9, 9–12, 12–17, 17–21, 21–24) × gu dài hạn riêng từng khung, dùng cho "Mix buổi sáng/tối".
- **Smart shuffle** (`smartShuffle.ts`, hàm thuần): thứ tự ngẫu nhiên có trọng số (Efraimidis–Spirakis, w = 0.5 + score); ràng buộc không hai bài cùng nghệ sĩ trong 2 vị trí liền nhau, |Δenergy| giữa hai bài kế tiếp ưu tiên ≤ 0.35 (greedy top-k=5 có ngẫu nhiên); tùy chọn "chèn gợi ý" cứ 4 bài thì thêm 1 bài ngoài danh sách (gắn nhãn ✨, không ghi vào playlist).
- **Mix tự động trên Trang chủ**: Đang muốn nghe · Mix theo giờ · 4 mix theo mood · On Repeat (nghe nhiều nhất 30 ngày) · Lâu rồi chưa nghe (từng complete ≥ 3 lần, 60 ngày chưa nghe lại) · Khám phá trong thư viện (≤ 1 lượt nghe, giống gu hiện tại) · mix theo nghệ sĩ/thể loại (đã có).

## §6 Phân tích âm thanh (`src/features/analyze/`)
- Hàng đợi phân tích chạy nền: mỗi lần một bài, đoạn 45 giây quanh điểm 35% thời lượng, mono 22 050 Hz.
- Poco: `NativeDecoder` (MediaExtractor + MediaCodec → PCM int16, trả base64 hoặc file tạm). iPhone: `WebDecoder` (mp3 cắt byte quanh vị trí cần, các định dạng khác decode cả file bằng `OfflineAudioContext(1, …, 22050)`).
- `extract.ts` (thuần, chạy trong Web Worker): khung 2048, hop 1024 → RMS, spectral centroid, flux, MFCC (Meyda); BPM = autocorrelation của onset envelope trong khoảng 70–180 BPM, có gộp nửa/gấp đôi; trả về `AudioFeatures`.
- Chỉ chạy khi: app đang mở + (Poco: đang sạc **hoặc** pin > 40%) + không phát nhạc nặng. Có nút "Phân tích ngay" và thanh tiến độ trong Cài đặt. Trước khi phân tích, pull `track_features` từ server để bỏ qua bài đã có.
- Test: sóng sin + click track 120 BPM tự sinh → bpm ∈ [118,122]; nhiễu trắng có brightness > sin 200 Hz.

## §7 Android chi tiết
- `vite.config.ts`: `BUILD_TARGET=android` → `base: './'`, không đăng ký service worker. Router dùng `HashRouter` khi native.
- Plugin `MusicLibrary` (Kotlin): `pickFolder()`, `listFolders()`, `removeFolder(id)`, `scan(folderId, sinceMtime)` duyệt bằng `DocumentsContract.buildChildDocumentsUriUsingTree` (không dùng DocumentFile vì chậm), trả về `{uri, relPath, name, size, mtime}` theo lô. `readTags(uris[])` dùng `MediaMetadataRetriever` (title, artist, album, albumArtist, genre, year, duration, ảnh bìa → file jpeg 300px trong cache → `convertFileSrc`). Đọc `.lrc` cùng tên. JS tính id bằng `src/lib/id.ts` như bản web.
- Plugin `NativePlayer`: `MediaSessionService` + ExoPlayer, nhận `setWindow` → `setMediaItems`. Tự chuyển bài khi app ở nền, gapless sẵn có. Notification, màn hình khóa, nút tai nghe, Bluetooth, audio focus, tự dừng khi rút tai nghe (`becoming noisy`). Event bắn về JS qua `notifyListeners`. EQ = `android.media.audiofx.Equalizer` gắn vào audioSessionId. Crossfade = 2 ExoPlayer chạy song song và tăng/giảm volume dần (phase G6).
- Đăng nhập Supabase trong APK bằng email + mật khẩu (không dùng magic link nên không cần deep link).
- CI `android.yml`: JDK 21, `npm ci && npm run build:android && cd android && ./gradlew assembleRelease`, ký bằng keystore cố định lưu trong secrets (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) để cài đè bản mới không bị lỗi chữ ký. Push tag `v*` thì đính APK vào GitHub Release.
