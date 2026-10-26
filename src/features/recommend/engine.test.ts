import { fakeTrack, seededRng } from '@/test/fixtures';
import type { Track } from '@/providers/types';
import { artistNames, buildCoPlay, buildMixes, contentSimilarity, describeSession, newestTracks, recencyDecay, recentlyPlayedTracks, recommend, similarTo, trackAffinity, type Signals } from './engine';
import type { PlayEvent } from './history';

const NOW = Date.UTC(2026, 9, 26, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const t = (n: number, extra: Partial<Track> = {}): Track => fakeTrack(n, { artist: `Ca sĩ ${n}`, ...extra });
const ev = (id: string, ageMs: number, kind: PlayEvent['kind'] = 'complete'): PlayEvent => ({ id, t: NOW - ageMs, sec: 200, kind });

const sig = (library: Track[], events: PlayEvent[] = [], liked: string[] = []): Signals => ({
  library,
  events,
  liked: new Set(liked),
  now: NOW,
  rng: () => 0,
});

describe('contentSimilarity', () => {
  it('cùng nghệ sĩ giống hơn khác nghệ sĩ; "feat." vẫn nhận ra nghệ sĩ chính', () => {
    const a = t(1, { artist: 'Sơn Tùng M-TP' });
    const same = t(2, { artist: 'Sơn Tùng M-TP feat. Snoop Dogg' });
    const other = t(3, { artist: 'Hà Anh Tuấn' });
    expect(contentSimilarity(a, same)).toBeGreaterThan(contentSimilarity(a, other));
  });

  it('thể loại chung tăng điểm, năm gần nhau cũng vậy', () => {
    const base = t(1, { genre: ['Pop', 'Indie'], year: 2020 });
    const near = t(2, { genre: ['pop'], year: 2021 });
    const far = t(3, { genre: ['Metal'], year: 1985 });
    expect(contentSimilarity(base, near)).toBeGreaterThan(contentSimilarity(base, far));
  });

  it('thiếu tag thì chuẩn hóa theo các đặc trưng có, không bị 0 oan', () => {
    const a = t(1, { artist: 'X' });
    const b = t(2, { artist: 'X' });
    expect(contentSimilarity(a, b)).toBe(1);
  });

  it('nghệ sĩ tên "X" không bị tách; "A x B" và "A (feat. B)" thì tách', () => {
    expect([...artistNames('X')]).toEqual(['x']);
    expect([...artistNames('Hà Anh Tuấn x Phan Mạnh Quỳnh')]).toEqual(['ha anh tuan', 'phan manh quynh']);
    expect([...artistNames('Adele (feat. Ai Đó)')]).toEqual(['adele', 'ai do']);
  });

  it('BPM gấp đôi vẫn coi là hợp nhịp, nghệ sĩ "Không rõ" không tính là trùng', () => {
    const a = t(1, { artist: 'Không rõ nghệ sĩ', bpm: 90 });
    const dbl = t(2, { artist: 'Không rõ nghệ sĩ', bpm: 180 });
    const off = t(3, { artist: 'Không rõ nghệ sĩ', bpm: 135 });
    expect(contentSimilarity(a, dbl)).toBeGreaterThan(contentSimilarity(a, off));
    expect(contentSimilarity(a, dbl)).toBe(1);
  });
});

describe('trackAffinity', () => {
  it('nghe hết cộng, bỏ qua trừ, like cộng thêm, cũ thì giảm', () => {
    const m = trackAffinity([ev('a', 0), ev('b', 0, 'skip'), ev('c', 42 * DAY)], new Set(['d']), NOW);
    expect(m.get('a')).toBeCloseTo(1);
    expect(m.get('b')).toBeLessThan(0);
    expect(m.get('c')).toBeCloseTo(0.25, 2); // 2 chu kỳ bán rã
    expect(m.get('d')).toBeGreaterThan(1);
    expect(recencyDecay(0)).toBe(1);
  });
});

describe('buildCoPlay', () => {
  it('bài nghe liền nhau trong phiên được nối; phiên cách xa 30 phút thì không', () => {
    const co = buildCoPlay([ev('a', 3 * HOUR), ev('b', 3 * HOUR - 4 * 60_000), ev('c', HOUR)]);
    expect(co.get('a')?.get('b')).toBeGreaterThan(0);
    expect(co.get('b')?.get('a')).toBeGreaterThan(0);
    expect(co.get('b')?.get('c')).toBeUndefined();
  });

  it('bài bị bỏ qua không tạo liên kết', () => {
    const co = buildCoPlay([ev('a', 10_000), ev('b', 5_000, 'skip')]);
    expect(co.size).toBe(0);
  });
});

describe('recommend', () => {
  const lib = [
    t(1, { artist: 'Rock Band', genre: ['Rock'] }),
    t(2, { artist: 'Rock Band', genre: ['Rock'] }),
    t(3, { artist: 'Other Rock', genre: ['Rock'] }),
    t(4, { artist: 'DJ Beat', genre: ['EDM'] }),
    t(5, { artist: 'DJ Beat', genre: ['EDM'] }),
  ];

  it('chưa có lịch sử → ngẫu nhiên nhưng đủ số lượng', () => {
    const r = recommend({ ...sig(lib), rng: seededRng(3) }, { limit: 3 });
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.track.id)).size).toBe(3);
  });

  it('vừa nghe Rock → gợi ý Rock trước EDM', () => {
    const r = recommend(sig(lib, [ev('folder:1', 5 * 60_000)]), { limit: 4, exclude: new Set(['folder:1']) });
    expect(r.map((x) => x.track.id).slice(0, 2)).toEqual(['folder:2', 'folder:3']);
  });

  it('bài hay bị bỏ qua bị đẩy xuống; bài vừa nghe xong cũng giảm', () => {
    const events = [ev('folder:1', 10 * 60_000), ev('folder:2', HOUR, 'skip'), ev('folder:3', 2 * DAY)];
    const ids = recommend(sig(lib, events), { limit: 5 }).map((x) => x.track.id);
    expect(ids.indexOf('folder:3')).toBeLessThan(ids.indexOf('folder:2'));
  });

  it('bài thích ảnh hưởng gu dài hạn dù không có lượt nghe', () => {
    const r = recommend(sig(lib, [], ['folder:4']), { limit: 5, exclude: new Set(['folder:4']) });
    expect(r[0].track.id).toBe('folder:5');
  });

  it('exclude loại bài khỏi kết quả', () => {
    const r = recommend(sig(lib, [ev('folder:1', HOUR)]), { limit: 10, exclude: new Set(['folder:2']) });
    expect(r.some((x) => x.track.id === 'folder:2')).toBe(false);
  });
});

describe('similarTo', () => {
  it('không trả chính bài gốc; bài cùng thể loại lên đầu', () => {
    const lib = [
      t(1, { artist: 'A', genre: ['Jazz'] }),
      t(2, { artist: 'B', genre: ['Jazz'] }),
      t(3, { artist: 'C', genre: ['Metal'] }),
    ];
    const r = similarTo(lib[0], sig(lib), { limit: 5 });
    expect(r.map((x) => x.track.id)).toEqual(['folder:2', 'folder:3']);
  });

  it('đồng nghe kéo bài lên dù tag không giống', () => {
    const lib = [t(1, { artist: 'A' }), t(2, { artist: 'B' }), t(3, { artist: 'C' })];
    const events = [ev('folder:1', 2 * HOUR), ev('folder:3', 2 * HOUR - 3 * 60_000)];
    const r = similarTo(lib[0], sig(lib, events), { limit: 2 });
    expect(r[0].track.id).toBe('folder:3');
  });
});

describe('describeSession', () => {
  it('nghe liên tiếp cùng nghệ sĩ → nêu nghệ sĩ', () => {
    const lib = [t(1, { artist: 'Bích Phương' }), t(2, { artist: 'Bích Phương' }), t(3, { artist: 'Khác' })];
    expect(describeSession(sig(lib, [ev('folder:2', 60_000), ev('folder:1', 5 * 60_000)]))).toEqual({ kind: 'artist', name: 'Bích Phương' });
  });

  it('ít dữ liệu hoặc rời rạc → null', () => {
    const lib = [t(1), t(2)];
    expect(describeSession(sig(lib, [ev('folder:1', 60_000)]))).toBeNull();
    expect(describeSession(sig(lib, [ev('folder:1', 60_000), ev('folder:2', 120_000)]))).toBeNull();
  });
});

describe('buildMixes', () => {
  const lib = Array.from({ length: 14 }, (_, i) => t(i + 1, { artist: `Ca sĩ ${i}`, genre: [i < 8 ? 'Pop' : 'Rock'] }));

  it('nhóm đủ lớn theo thể loại, ưu tiên nhóm hay nghe', () => {
    const mixes = buildMixes(sig(lib, [ev('folder:10', HOUR), ev('folder:11', 2 * HOUR), ev('folder:12', 3 * HOUR)]), { max: 2 });
    expect(mixes[0].title).toBe('Mix Rock');
    expect(mixes.find((m) => m.title === 'Mix Pop')).toBeDefined();
  });

  it('bỏ nhóm quá nhỏ', () => {
    expect(buildMixes(sig([t(1, { genre: ['Lẻ'] }), t(2)]))).toEqual([]);
  });
});

describe('danh sách phụ', () => {
  it('recentlyPlayedTracks bỏ trùng + bỏ skip, mới nhất trước', () => {
    const lib = [t(1), t(2), t(3)];
    const r = recentlyPlayedTracks([ev('folder:1', 3 * HOUR), ev('folder:2', 2 * HOUR), ev('folder:3', HOUR, 'skip'), ev('folder:1', HOUR / 2)], lib);
    expect(r.map((x) => x.id)).toEqual(['folder:1', 'folder:2']);
  });

  it('newestTracks sắp theo addedAt', () => {
    const r = newestTracks([t(1, { addedAt: 10 }), t(2, { addedAt: 30 }), t(3, { addedAt: 20 })], 2);
    expect(r.map((x) => x.id)).toEqual(['folder:2', 'folder:3']);
  });
});
