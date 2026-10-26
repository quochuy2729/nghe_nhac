import { cleanArtist, cleanTitle, fetchLrclib, pickBest, type LrclibRecord } from './lrclib';
import { loadLyrics } from './service';
import { getLyricsRecord, putLyricsRecord, resetDBForTests } from '@/lib/db';
import { fakeTrack } from '@/test/fixtures';

const rec = (over: Partial<LrclibRecord>): LrclibRecord => ({
  id: 1,
  trackName: 'Bài',
  artistName: 'Ca sĩ',
  duration: 200,
  instrumental: false,
  plainLyrics: 'lời thường giả',
  syncedLyrics: null,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  await resetDBForTests();
  vi.restoreAllMocks();
});

describe('lrclib helpers', () => {
  it('cleanTitle/cleanArtist', () => {
    expect(cleanTitle('Bài Hát (feat. Ai Đó) [Official Video]')).toBe('Bài Hát');
    expect(cleanTitle('Song - Remastered 2011')).toBe('Song');
    expect(cleanArtist('A, B & C')).toBe('A');
  });

  it('pickBest: lệch ≤ 2s, ưu tiên synced', () => {
    const r = pickBest(
      [rec({ id: 1, duration: 205 }), rec({ id: 2, duration: 201 }), rec({ id: 3, duration: 199, syncedLyrics: '[00:01.00]x' })],
      200,
    );
    expect(r?.id).toBe(3);
    expect(pickBest([rec({ duration: 260 })], 200)).toBeNull();
  });
});

describe('fetchLrclib', () => {
  it('dùng /api/get khi có, nếu 404 thì /api/search', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ code: 404 }, 404))
      .mockResolvedValueOnce(json([rec({ id: 7, duration: 181, syncedLyrics: '[00:01.00]giả' })]));
    const r = await fetchLrclib({ title: 'Bài', artist: 'Ca sĩ', durationSec: 180 });
    expect(r?.id).toBe(7);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/get?');
    expect(String(fetchMock.mock.calls[0][0])).toContain('duration=180');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/search?q=');
  });
});

describe('loadLyrics', () => {
  it('bài đã nạp kèm file .lrc dùng file đó, không gọi LRCLIB', async () => {
    const t = fakeTrack(7);
    await putLyricsRecord({ trackId: t.id, synced: ['[00:01.00]dòng giả một', '[00:03.00]dòng giả hai'].join('\n'), plain: null, source: 'file', fetchedAt: Date.now() });
    const f = vi.spyOn(globalThis, 'fetch');
    const l = await loadLyrics(t);
    expect(l).toMatchObject({ kind: 'synced', source: 'file' });
    expect(f).not.toHaveBeenCalled();
  });

  it('LRCLIB synced → cache IndexedDB, lần sau không gọi mạng', async () => {
    const t = fakeTrack(1);
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(rec({ syncedLyrics: '[00:01.00]một\n[00:02.00]hai', duration: 120 })));
    const a = await loadLyrics(t);
    expect(a).toMatchObject({ kind: 'synced', source: 'lrclib' });
    expect((await getLyricsRecord(t.id))?.synced).toContain('một');
    const b = await loadLyrics(t);
    expect(b.kind).toBe('synced');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('chỉ có plainLyrics → kind plain; không có → none và cache', async () => {
    const t = fakeTrack(2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(rec({ duration: 120 })));
    expect((await loadLyrics(t)).kind).toBe('plain');

    const t2 = fakeTrack(3);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json([]));
    expect((await loadLyrics(t2)).kind).toBe('none');
    expect(await getLyricsRecord(t2.id)).toMatchObject({ synced: null, plain: null });
  });
});
