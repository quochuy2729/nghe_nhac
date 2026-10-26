import { fakeTrack } from '@/test/fixtures';
import { applyOverride } from './overrides';

describe('applyOverride', () => {
  const t = fakeTrack(1, { genre: ['Pop'], year: 2020 });

  it('không có override → trả đúng track gốc', () => {
    expect(applyOverride(t)).toBe(t);
    expect(applyOverride(t, null)).toBe(t);
  });

  it('ghi đè trường có giá trị, giữ nguyên trường còn lại, không đổi object gốc', () => {
    const out = applyOverride(t, { patch: { title: 'Tên mới', genre: ['Rock', 'Indie'], year: 1999 } });
    expect(out).toMatchObject({ id: t.id, title: 'Tên mới', artist: t.artist, genre: ['Rock', 'Indie'], year: 1999 });
    expect(t.title).toBe('Bài thử 1');
    expect(t.genre).toEqual(['Pop']);
  });

  it('bỏ qua undefined, null và chuỗi rỗng (không xóa nhầm tên bài)', () => {
    const out = applyOverride(t, { patch: { title: '', artist: undefined, album: null as unknown as string, bpm: 0 } });
    expect(out.title).toBe(t.title);
    expect(out.artist).toBe(t.artist);
    expect(out.album).toBeUndefined();
    expect(out.bpm).toBe(0); // số 0 là giá trị hợp lệ
  });
});
