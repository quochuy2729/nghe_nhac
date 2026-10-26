import { initDownloads, refreshDownloads, removeDownload, useDownloads } from './manager';
import { resolvePlayableUrl } from '@/features/player/resolve';
import { getAudioBlob, getLyricsRecord, getTrack, putAudio, putLyricsRecord, putTrack, resetDBForTests } from '@/lib/db';
import { loadFolder, useFolder } from '@/providers/folder';
import { fakeTrack } from '@/test/fixtures';

beforeEach(async () => {
  await resetDBForTests();
  useDownloads.setState({ ids: {}, items: [], loaded: false });
  useFolder.setState({ tracks: [], status: 'idle', error: null });
});

describe('refreshDownloads', () => {
  it('liệt kê bài có file trên máy kèm dung lượng', async () => {
    const t = fakeTrack(1);
    await putTrack(t);
    await putAudio(t.id, new Blob(['12345']));
    await putTrack(fakeTrack(2)); // có thông tin nhưng không có file → không tính
    await refreshDownloads();
    expect(useDownloads.getState().items).toMatchObject([{ track: { id: t.id }, size: 5 }]);
    expect(useDownloads.getState().ids[t.id]).toBe(true);
    expect(useDownloads.getState().ids['folder:2']).toBeUndefined();
  });
});

describe('initDownloads + phát từ blob', () => {
  it('pre-resolver trả URL blob của file trên máy', async () => {
    const t = fakeTrack(1);
    await putTrack(t);
    await putAudio(t.id, new Blob(['abc'], { type: 'audio/mpeg' }));
    initDownloads();
    expect(await resolvePlayableUrl(t)).toMatch(/^blob:/);
  });
});

describe('removeDownload', () => {
  it('xóa file, thông tin bài, lời đã lưu và cập nhật thư viện', async () => {
    const t = fakeTrack(1);
    await putTrack(t);
    await putAudio(t.id, new Blob(['1']));
    await putLyricsRecord({ trackId: t.id, synced: '[00:01.00]x', plain: null, source: 'file', fetchedAt: 1 });
    await loadFolder();
    expect(useFolder.getState().tracks).toHaveLength(1);

    await removeDownload(t);
    expect(await getAudioBlob(t.id)).toBeUndefined();
    expect(await getTrack(t.id)).toBeUndefined();
    expect(await getLyricsRecord(t.id)).toBeUndefined();
    expect(useDownloads.getState().ids[t.id]).toBeUndefined();
    expect(useFolder.getState().tracks).toHaveLength(0);
  });
});
