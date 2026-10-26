/** Chia sẻ ảnh trên web/iPhone: Web Share API (kèm file) nếu có, không thì tải về. */
export async function shareImageWeb(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Nghe Nhạc' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'shared'; // người dùng hủy hộp chia sẻ
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
