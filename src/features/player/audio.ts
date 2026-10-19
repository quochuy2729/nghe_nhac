/**
 * Phần tử <audio> DUY NHẤT của app. iOS chỉ cho phát nền/khóa màn hình ổn định
 * khi dùng một phần tử được "mở khóa" bởi thao tác chạm đầu tiên.
 */
let el: HTMLAudioElement | null = null;
let unlocked = false;

// WAV im lặng rất ngắn dùng để mở khóa audio trên iOS.
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

export function getAudio(): HTMLAudioElement {
  if (!el) {
    el = document.createElement('audio');
    el.id = 'nn-audio';
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    document.body.appendChild(el);
  }
  return el;
}

/** Gọi trong handler của thao tác người dùng (pointerdown) — chỉ chạy một lần. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const a = getAudio();
  if (a.src) return;
  a.src = SILENCE;
  a.play()
    .then(() => {
      // Chỉ dừng nếu vẫn đang là đoạn im lặng (chưa bị bài thật thay thế).
      if (a.src === SILENCE) a.pause();
    })
    .catch(() => {
      unlocked = false;
    });
}

export function isUnlocked(): boolean {
  return unlocked;
}
