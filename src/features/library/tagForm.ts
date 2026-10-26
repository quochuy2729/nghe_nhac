import { pictureToDataUrl } from '@/providers/folder';
import { cleanPatch, parseGenres, type TagPatch } from './overrideActions';

export interface TagForm {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: string;
  bpm: string;
}

export const EMPTY_FORM: TagForm = { title: '', artist: '', album: '', albumArtist: '', genre: '', year: '', bpm: '' };

/** Ảnh người dùng chọn → JPEG vuông 300px (data URL). */
export async function coverFromFile(file: File): Promise<string | undefined> {
  return pictureToDataUrl(new Uint8Array(await file.arrayBuffer()), file.type || 'image/jpeg');
}

/** Form → patch. Nhiều bài: bỏ tên bài; ô trống = giữ nguyên. */
export function formToPatch(f: TagForm, bulk: boolean): TagPatch {
  const num = (s: string) => (s.trim() ? Number(s) : undefined);
  return cleanPatch({
    ...(bulk ? {} : { title: f.title.trim() }),
    artist: f.artist.trim(),
    album: f.album.trim(),
    albumArtist: f.albumArtist.trim(),
    genre: parseGenres(f.genre),
    year: num(f.year),
    bpm: num(f.bpm),
  });
}
