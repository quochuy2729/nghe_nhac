import { mapJamendoTrack, type JamendoTrack } from './jamendo';
import { isPlayableAudius, mapAudiusTrack, type AudiusTrack } from './audius';
import { guessFromFileName, isAudioFile, isLrcFile, localProvider, importLocalFiles } from './local';
import { resetDBForTests, putTrack, putAudio } from '@/lib/db';
import { fakeTrack } from '@/test/fixtures';

describe('jamendo', () => {
  const base: JamendoTrack = {
    id: '123',
    name: 'Bài CC',
    duration: 200,
    artist_name: 'Nghệ sĩ',
    album_name: 'Album',
    image: 'https://img/1.jpg',
    audio: 'https://audio/1.mp3',
    audiodownload: 'https://dl/1.mp3',
    audiodownload_allowed: true,
  };

  it('map sang Track và cho tải khi audiodownload_allowed', () => {
    expect(mapJamendoTrack(base)).toEqual({
      id: 'jamendo:123',
      provider: 'jamendo',
      title: 'Bài CC',
      artist: 'Nghệ sĩ',
      album: 'Album',
      durationSec: 200,
      artworkUrl: 'https://img/1.jpg',
      downloadable: true,
      streamUrl: 'https://audio/1.mp3',
    });
  });

  it('không cho tải khi audiodownload_allowed = false', () => {
    expect(mapJamendoTrack({ ...base, audiodownload_allowed: false }).downloadable).toBe(false);
  });
});

describe('audius', () => {
  const base: AudiusTrack = {
    id: 'abc',
    title: 'Track',
    duration: 180,
    user: { name: 'DJ', handle: 'dj' },
    artwork: { '480x480': 'https://a/480.jpg' },
    is_downloadable: false,
  };

  it('chỉ cho tải khi is_downloadable', () => {
    expect(mapAudiusTrack(base).downloadable).toBe(false);
    expect(mapAudiusTrack({ ...base, is_downloadable: true }).downloadable).toBe(true);
    expect(mapAudiusTrack(base).artworkUrl).toBe('https://a/480.jpg');
  });

  it('lọc bài bị khóa', () => {
    expect(isPlayableAudius(base)).toBe(true);
    expect(isPlayableAudius({ ...base, is_stream_gated: true })).toBe(false);
    expect(isPlayableAudius({ ...base, is_streamable: false })).toBe(false);
  });
});

describe('local', () => {
  beforeEach(() => resetDBForTests());

  it('đoán tên bài/nghệ sĩ từ tên file', () => {
    expect(guessFromFileName('Ca Sĩ A - Bài B.mp3')).toEqual({ artist: 'Ca Sĩ A', title: 'Bài B' });
    expect(guessFromFileName('track_01.flac')).toEqual({ title: 'track 01' });
  });

  it('nhận diện file audio và lrc', () => {
    expect(isAudioFile({ name: 'a.mp3', type: '' })).toBe(true);
    expect(isAudioFile({ name: 'a.bin', type: 'audio/mpeg' })).toBe(true);
    expect(isAudioFile({ name: 'a.txt', type: 'text/plain' })).toBe(false);
    expect(isLrcFile({ name: 'a.LRC' })).toBe(true);
  });

  it('search đọc từ IndexedDB', async () => {
    await putTrack(fakeTrack(1, { id: 'local:x', provider: 'local', title: 'Của tôi' }));
    await putTrack(fakeTrack(2));
    expect((await localProvider.search('')).map((t) => t.id)).toEqual(['local:x']);
    expect(await localProvider.search('không có')).toEqual([]);
  });

  it('getStreamUrl báo lỗi khi file không có trên máy', async () => {
    await expect(localProvider.getStreamUrl(fakeTrack(1, { id: 'local:none', provider: 'local' }))).rejects.toThrow();
    await putAudio('local:x', new Blob(['abc'], { type: 'audio/mpeg' }));
    expect(await localProvider.getStreamUrl(fakeTrack(1, { id: 'local:x', provider: 'local' }))).toMatch(/^blob:/);
  });

  it('import ghép file .lrc cùng tên và bỏ qua file lạ', async () => {
    const mp3 = new File([new Uint8Array([1, 2, 3])], 'Nghệ sĩ - Bài.mp3', { type: 'audio/mpeg' });
    const lrc = new File(['[00:01.00]Dòng giả'], 'Nghệ sĩ - Bài.lrc');
    const txt = new File(['x'], 'ghi chú.txt', { type: 'text/plain' });
    // jsdom không giải mã audio: giả lập <audio> báo lỗi để probeDuration trả 0 ngay.
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag);
      if (tag === 'audio') queueMicrotask(() => (el as HTMLAudioElement).onerror?.(new Event('error')));
      return el;
    });
    const r = await importLocalFiles([mp3, lrc, txt]);
    expect(r.skipped).toEqual(['ghi chú.txt']);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ provider: 'local', title: 'Bài', artist: 'Nghệ sĩ', downloadable: true });
    expect(await localProvider.getLyrics!(r.added[0])).toBe('[00:01.00]Dòng giả');
    vi.restoreAllMocks();
  });
});
