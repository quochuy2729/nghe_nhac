/** Chia sẻ ảnh trên Android: ghi vào cache rồi mở hộp chia sẻ hệ thống (@capacitor/share). */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shareImageAndroid(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const written = await Filesystem.writeFile({ path: `wrapped/${filename}`, data: await toBase64(blob), directory: Directory.Cache, recursive: true });
  await Share.share({ title: 'Nghe Nhạc', files: [written.uri], dialogTitle: 'Chia sẻ Wrapped' });
  return 'shared';
}
