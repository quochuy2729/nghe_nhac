import { canDownload, downloadTrack, fetchWithProgress, initDownloads, refreshDownloads, removeDownload, useDownloads } from './manager';
import { resolvePlayableUrl } from '@/features/player/resolve';
import { getAudioBlob, putAudio, putTrack, resetDBForTests } from '@/lib/db';
import { mockTracks } from '@/providers/mock';
import { fakeTrack } from '@/test/fixtures';

function streamResponse(chunks: number[][], headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((ch) => c.enqueue(new Uint8Array(ch)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

beforeEach(async () => {
  await resetDBForTests();
  useDownloads.setState({ ids: {}, active: {}, items: [], loaded: false });
  vi.restoreAllMocks();
});

describe('canDownload', () => {
  it('chỉ bài cho phép tải hoặc file của tôi', () => {
    expect(canDownload(fakeTrack(1, { downloadable: false, provider: 'audius', id: 'audius:1' }))).toBe(false);
    expect(canDownload(fakeTrack(1, { downloadable: true, provider: 'jamendo', id: 'jamendo:1' }))).toBe(true);
    expect(canDownload(fakeTrack(1, { downloadable: false, provider: 'local', id: 'local:1' }))).toBe(true);
  });
});

describe('fetchWithProgress', () => {
  it('báo tiến độ theo Content-Length', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([[1, 2], [3, 4]], { 'content-length': '4', 'content-type': 'audio/mpeg' }));
    const seen: number[] = [];
    const blob = await fetchWithProgress('https://x/a.mp3', (p) => seen.push(p));
    expect(blob.size).toBe(4);
    expect(blob.type).toBe('audio/mpeg');
    expect(seen).toEqual([0.5, 1, 1]);
  });

  it('lỗi HTTP → thông báo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
    await expect(fetchWithProgress('https://x', () => undefined)).rejects.toThrow('403');
  });
});

describe('downloadTrack', () => {
  it('từ chối bài không cho tải', async () => {
    await expect(downloadTrack(fakeTrack(1, { downloadable: false, id: 'audius:9', provider: 'audius' }))).rejects.toThrow();
  });

  it('tải bài mock vào IndexedDB, phát từ blob, rồi xóa được', async () => {
    initDownloads();
    const track = mockTracks[0];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse([[9, 9, 9]], { 'content-length': '3' }));
    await downloadTrack(track);
    expect(useDownloads.getState().ids[track.id]).toBe(true);
    expect((await getAudioBlob(track.id))?.size).toBe(3);
    expect(useDownloads.getState().items[0].track.id).toBe(track.id);
    // pre-resolver ưu tiên blob đã tải
    expect(await resolvePlayableUrl(track)).toMatch(/^blob:/);
    await removeDownload(track);
    expect(useDownloads.getState().ids[track.id]).toBeUndefined();
    expect(await getAudioBlob(track.id)).toBeUndefined();
  });

  it('ghi lỗi vào trạng thái khi tải thất bại', async () => {
    const track = mockTracks[1];
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(downloadTrack(track)).rejects.toThrow();
    expect(useDownloads.getState().active[track.id]).toMatchObject({ state: 'error' });
  });
});

describe('refreshDownloads', () => {
  it('liệt kê file local đã thêm', async () => {
    const t = fakeTrack(1, { id: 'local:abc', provider: 'local' });
    await putTrack(t);
    await putAudio(t.id, new Blob(['12345']));
    await refreshDownloads();
    expect(useDownloads.getState().items).toMatchObject([{ track: { id: 'local:abc' }, size: 5 }]);
  });
});
