import type { AudioFeatures, PlayEvent } from '@/lib/db';
import { fakeTrack, seededRng } from '@/test/fixtures';
import { evaluateRules, matchesRule, opsFor, playStats, SMART_TEMPLATES, type EvalContext } from './evaluate';
import type { Rule, SmartPlaylist } from './types';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const lib = [
  fakeTrack(1, { title: 'Alpha', artist: 'Sơn Tùng M-TP', genre: ['Pop', 'V-Pop'], year: 2019, bpm: 128, album: 'Sky Tour', folder: 'Nhạc/Pop', addedAt: NOW - 3 * DAY }),
  fakeTrack(2, { title: 'Beta', artist: 'Mỹ Tâm feat. Hà Anh Tuấn', genre: ['Ballad'], year: 2015, bpm: 70, album: 'Tâm 9', folder: 'Nhạc/Ballad', addedAt: NOW - 40 * DAY }),
  fakeTrack(3, { title: 'Gamma', artist: 'Hà Anh Tuấn', genre: ['Pop'], year: 2021, album: 'Sky Tour', folder: 'Nhạc/Pop/Live', addedAt: NOW - 10 * DAY }),
  fakeTrack(4, { title: 'Delta', artist: 'Không rõ nghệ sĩ' }), // thiếu hầu hết tag
];

const ev = (trackId: string, daysAgo: number, kind: PlayEvent['kind'] = 'complete'): PlayEvent => ({
  id: `${trackId}-${daysAgo}-${kind}`,
  trackId,
  t: NOW - daysAgo * DAY,
  sec: 200,
  dur: 210,
  kind,
  device: 'poco',
});

const feat = (over: Partial<AudioFeatures>): AudioFeatures => ({ v: 1, bpm: 100, bpmConf: 1, energy: 0.5, loudnessDb: -14, brightness: 0.5, onsetRate: 0.5, dynamics: 0.3, mfcc: [], analyzedSec: 45, ...over });

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({ now: NOW, liked: new Set<string>(), events: [], rng: seededRng(1), ...over });
const run = (rules: Rule[], over: Partial<EvalContext> = {}, pl: Partial<SmartPlaylist> = {}) =>
  evaluateRules(lib, { rules, match: 'all', sort: 'title', ...pl }, ctx(over)).map((t) => t.id);

describe('evaluateRules — từng field/op', () => {
  it('genre: is / isNot / contains (không phân biệt hoa thường, bỏ dấu)', () => {
    expect(run([{ field: 'genre', op: 'is', value: 'pop' }])).toEqual(['folder:1', 'folder:3']);
    expect(run([{ field: 'genre', op: 'isNot', value: 'Pop' }])).toEqual(['folder:2', 'folder:4']);
    expect(run([{ field: 'genre', op: 'contains', value: 'v-p' }])).toEqual(['folder:1']);
  });

  it('artist: tách "feat." nên tìm theo tên từng người', () => {
    expect(run([{ field: 'artist', op: 'is', value: 'Hà Anh Tuấn' }])).toEqual(['folder:2', 'folder:3']);
    expect(run([{ field: 'artist', op: 'is', value: 'my tam' }])).toEqual(['folder:2']);
    expect(run([{ field: 'artist', op: 'contains', value: 'tung' }])).toEqual(['folder:1']);
    expect(run([{ field: 'artist', op: 'isNot', value: 'Hà Anh Tuấn' }])).toEqual(['folder:1', 'folder:4']);
  });

  it('album, folder', () => {
    expect(run([{ field: 'album', op: 'is', value: 'sky tour' }])).toEqual(['folder:1', 'folder:3']);
    expect(run([{ field: 'folder', op: 'contains', value: 'pop' }])).toEqual(['folder:1', 'folder:3']);
    expect(run([{ field: 'album', op: 'isNot', value: 'Sky Tour' }])).toEqual(['folder:2', 'folder:4']);
  });

  it('year, bpm: is / gt / lt / between; thiếu giá trị thì không khớp (trừ isNot)', () => {
    expect(run([{ field: 'year', op: 'gt', value: 2018 }])).toEqual(['folder:1', 'folder:3']);
    expect(run([{ field: 'year', op: 'lt', value: 2018 }])).toEqual(['folder:2']);
    expect(run([{ field: 'year', op: 'is', value: 2021 }])).toEqual(['folder:3']);
    expect(run([{ field: 'year', op: 'between', value: [2016, 2020] }])).toEqual(['folder:1']);
    expect(run([{ field: 'year', op: 'between', value: [2020, 2010] }])).toEqual(['folder:1', 'folder:2']); // chấp nhận cận đảo ngược
    expect(run([{ field: 'bpm', op: 'gt', value: 120 }])).toEqual(['folder:1']);
    expect(run([{ field: 'year', op: 'isNot', value: 2019 }])).toEqual(['folder:2', 'folder:4', 'folder:3']);
  });

  it('bpm lấy từ đặc trưng âm thanh nếu tag không có', () => {
    const features = new Map([['folder:3', feat({ bpm: 140 })]]);
    expect(run([{ field: 'bpm', op: 'gt', value: 130 }], { features })).toEqual(['folder:3']);
  });

  it('mood: dựa trên đặc trưng; thiếu đặc trưng thì không khớp "is"', () => {
    const features = new Map([
      ['folder:1', feat({ energy: 0.9, bpm: 130 })],
      ['folder:2', feat({ energy: 0.2, bpm: 80, brightness: 0.5 })],
    ]);
    expect(run([{ field: 'mood', op: 'is', value: 'soi-dong' }], { features })).toEqual(['folder:1']);
    expect(run([{ field: 'mood', op: 'is', value: 'chill' }], { features })).toEqual(['folder:2']);
    expect(run([{ field: 'mood', op: 'isNot', value: 'soi-dong' }], { features })).toEqual(['folder:2', 'folder:4', 'folder:3']);
  });

  it('liked', () => {
    const liked = new Set(['folder:2']);
    expect(run([{ field: 'liked', op: 'is', value: true }], { liked })).toEqual(['folder:2']);
    expect(run([{ field: 'liked', op: 'is', value: false }], { liked })).toEqual(['folder:1', 'folder:4', 'folder:3']);
  });

  it('plays (không tính lượt bỏ qua) và lastPlayedDays (chưa nghe = vô hạn)', () => {
    const events = [ev('folder:1', 2), ev('folder:1', 3), ev('folder:1', 4, 'skip'), ev('folder:2', 45)];
    expect(run([{ field: 'plays', op: 'gt', value: 1 }], { events })).toEqual(['folder:1']);
    expect(run([{ field: 'plays', op: 'is', value: 0 }], { events })).toEqual(['folder:4', 'folder:3']);
    expect(run([{ field: 'lastPlayedDays', op: 'gt', value: 30 }], { events })).toEqual(['folder:2', 'folder:4', 'folder:3']);
    expect(run([{ field: 'lastPlayedDays', op: 'lt', value: 7 }], { events })).toEqual(['folder:1']);
    expect(playStats(events).get('folder:1')).toEqual({ plays: 2, lastPlayed: NOW - 2 * DAY });
  });

  it('addedDays', () => {
    expect(run([{ field: 'addedDays', op: 'lt', value: 14 }])).toEqual(['folder:1', 'folder:3']);
    expect(run([{ field: 'addedDays', op: 'gt', value: 30 }])).toEqual(['folder:2', 'folder:4']); // thiếu addedAt = rất cũ
    expect(run([{ field: 'addedDays', op: 'between', value: [5, 20] }])).toEqual(['folder:3']);
  });
});

describe('evaluateRules — tổ hợp, sắp xếp, giới hạn', () => {
  it('match all / any', () => {
    const rules: Rule[] = [
      { field: 'genre', op: 'is', value: 'Pop' },
      { field: 'year', op: 'gt', value: 2020 },
    ];
    expect(run(rules)).toEqual(['folder:3']);
    expect(run(rules, {}, { match: 'any' })).toEqual(['folder:1', 'folder:3']);
  });

  it('không có luật = rỗng (tránh tưởng nhầm là cả thư viện)', () => {
    expect(run([])).toEqual([]);
  });

  it('sort added / plays / lastPlayed / title / random + limit', () => {
    const all: Rule[] = [{ field: 'plays', op: 'gt', value: -1 }];
    expect(run(all, {}, { sort: 'added' })).toEqual(['folder:1', 'folder:3', 'folder:2', 'folder:4']);
    const events = [ev('folder:3', 1), ev('folder:3', 2), ev('folder:2', 1)];
    expect(run(all, { events }, { sort: 'plays' }).slice(0, 2)).toEqual(['folder:3', 'folder:2']);
    expect(run(all, { events: [ev('folder:3', 1), ev('folder:2', 0.5)] }, { sort: 'lastPlayed' }).slice(0, 2)).toEqual(['folder:2', 'folder:3']);
    expect(run(all, {}, { sort: 'title' })).toEqual(['folder:1', 'folder:2', 'folder:4', 'folder:3']);
    expect(run(all, {}, { sort: 'title', limit: 2 })).toHaveLength(2);
    const a = run(all, { rng: seededRng(5) }, { sort: 'random' });
    expect(a).toEqual(run(all, { rng: seededRng(5) }, { sort: 'random' }));
    expect([...a].sort()).toEqual(['folder:1', 'folder:2', 'folder:3', 'folder:4']);
  });

  it('mẫu có sẵn chạy đúng', () => {
    const [likedStale, fast, fresh] = SMART_TEMPLATES;
    const events = [ev('folder:1', 2), ev('folder:2', 50)];
    const liked = new Set(['folder:1', 'folder:2']);
    expect(evaluateRules(lib, likedStale, ctx({ events, liked })).map((t) => t.id)).toEqual(['folder:2']);
    expect(evaluateRules(lib, fast, ctx()).map((t) => t.id)).toEqual(['folder:1']);
    expect(evaluateRules(lib, fresh, ctx()).map((t) => t.id)).toEqual(['folder:1', 'folder:3']);
  });

  it('opsFor trả toán tử hợp lệ theo loại trường và matchesRule từ chối op lạ', () => {
    expect(opsFor('genre')).toEqual(['is', 'isNot', 'contains']);
    expect(opsFor('bpm')).toContain('between');
    expect(opsFor('liked')).toEqual(['is']);
    expect(matchesRule(lib[0], { field: 'genre', op: 'gt', value: 1 }, ctx(), new Map())).toBe(false);
  });
});
