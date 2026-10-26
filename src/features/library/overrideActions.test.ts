import { getAllOverrides, putTrack, resetDBForTests } from '@/lib/db';
import { pending } from '@/features/sync/outbox';
import { loadFolder, useFolder } from '@/providers/folder';
import { fakeTrack } from '@/test/fixtures';
import { cleanPatch, parseGenres, restoreOriginal, saveOverrides } from './overrideActions';
import { formToPatch, EMPTY_FORM } from './tagForm';

beforeEach(async () => {
  await resetDBForTests();
  useFolder.setState({ tracks: [], status: 'idle', error: null });
  for (let i = 1; i <= 3; i++) await putTrack(fakeTrack(i, { title: `Gốc ${i}`, artist: 'Nghệ sĩ gốc', genre: ['Rock'] }));
});

describe('sửa tag (override)', () => {
  it('lưu override, hiển thị chồng lên tag gốc, đưa vào outbox track_overrides', async () => {
    await saveOverrides(['folder:1'], { title: 'Tên mới', genre: ['Pop', 'Indie'], year: 2020 }, 1000);
    expect(useFolder.getState().tracks.find((t) => t.id === 'folder:1')).toMatchObject({ title: 'Tên mới', genre: ['Pop', 'Indie'], year: 2020, artist: 'Nghệ sĩ gốc' });
    expect(useFolder.getState().tracks.find((t) => t.id === 'folder:2')?.title).toBe('Gốc 2');
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'track_overrides', op: 'upsert', row: { track_id: 'folder:1', patch: { title: 'Tên mới' } } });
  });

  it('sửa hàng loạt: gán thể loại cho cả album mà không đụng tên bài', async () => {
    await saveOverrides(['folder:1', 'folder:2', 'folder:3'], { genre: ['Ballad'] }, 5);
    const tracks = useFolder.getState().tracks;
    expect(tracks.map((t) => t.genre)).toEqual([['Ballad'], ['Ballad'], ['Ballad']]);
    expect(tracks.map((t) => t.title).sort()).toEqual(['Gốc 1', 'Gốc 2', 'Gốc 3']);
    expect(await pending()).toHaveLength(3);
  });

  it('các lần sửa cộng dồn trên cùng một bài', async () => {
    await saveOverrides(['folder:1'], { title: 'A' }, 1);
    await saveOverrides(['folder:1'], { album: 'Album mới' }, 2);
    const [rec] = await getAllOverrides();
    expect(rec.patch).toEqual({ title: 'A', album: 'Album mới' });
    expect(rec.updatedAt).toBe(2);
  });

  it('"Khôi phục tag gốc" trả về tag trong file và vẫn là một phiên bản mới để đồng bộ', async () => {
    await saveOverrides(['folder:1'], { title: 'Tên mới' }, 1);
    await restoreOriginal(['folder:1'], 2);
    expect(useFolder.getState().tracks.find((t) => t.id === 'folder:1')?.title).toBe('Gốc 1');
    const rows = await pending();
    expect(rows.at(-1)?.row).toMatchObject({ patch: {}, track_id: 'folder:1' });
  });

  it('không có gì để lưu thì không ghi', async () => {
    expect(await saveOverrides(['folder:1'], { title: '', genre: [] })).toBe(0);
    expect(await saveOverrides([], { title: 'x' })).toBe(0);
    expect(await pending()).toHaveLength(0);
  });

  it('quét lại/nạp lại thư viện không làm mất override', async () => {
    await saveOverrides(['folder:2'], { artist: 'Nghệ sĩ mới' });
    await putTrack(fakeTrack(2, { title: 'Gốc 2', artist: 'Nghệ sĩ gốc' })); // như rescan ghi đè tag từ file
    await loadFolder();
    expect(useFolder.getState().tracks.find((t) => t.id === 'folder:2')?.artist).toBe('Nghệ sĩ mới');
  });
});

describe('tiện ích', () => {
  it('cleanPatch bỏ rỗng/NaN; parseGenres tách nhiều dấu', () => {
    expect(cleanPatch({ title: '', artist: 'A', year: NaN, genre: [] })).toEqual({ artist: 'A' });
    expect(parseGenres(' Pop, Rock;Indie / ,')).toEqual(['Pop', 'Rock', 'Indie']);
  });

  it('formToPatch: nhiều bài thì bỏ tên bài; ô trống giữ nguyên', () => {
    const f = { ...EMPTY_FORM, title: 'X', genre: 'Pop, Jazz', year: '2001' };
    expect(formToPatch(f, true)).toEqual({ genre: ['Pop', 'Jazz'], year: 2001 });
    expect(formToPatch(f, false)).toMatchObject({ title: 'X' });
  });
});
