import type { AudioFeatures, PlayEvent } from '@/lib/db';
import type { Track } from '@/providers/types';
import { fakeTrack, seededRng } from '@/test/fixtures';
import { audioSim } from './audioSim';
import { combineSim, contentSim } from './contentSim';
import { recommend, type Signals } from './engine';
import { computeIntent, currentSession, intentScore } from './intent';
import { discoverInLibrary, intentMix, longTimeNoSee, moodMixes, onRepeat, timeMix } from './mixes';
import { hourSlot, moodOf } from './mood';
import { ENERGY_STEP, smartShuffle } from './smartShuffle';

const NOW = new Date(2026, 9, 26, 10, 0, 0).getTime();
const MIN = 60_000;
const DAY = 86_400_000;

function feat(over: Partial<AudioFeatures> = {}): AudioFeatures {
  return { v: 1, bpm: 100, bpmConf: 0.8, energy: 0.5, loudnessDb: -14, brightness: 0.5, onsetRate: 0.5, dynamics: 0.3, mfcc: new Array(13).fill(0), analyzedSec: 45, ...over };
}
const CHILL = { energy: 0.25, brightness: 0.5, bpm: 85, dynamics: 0.2 };
const LOUD = { energy: 0.9, brightness: 0.7, bpm: 140, dynamics: 0.5 };

let eid = 0;
const ev = (trackId: string, minutesAgo: number, kind: PlayEvent['kind'] = 'complete'): PlayEvent => ({
  id: `e${++eid}`,
  trackId,
  t: NOW - minutesAgo * MIN,
  sec: kind === 'skip' ? 8 : 200,
  dur: 210,
  kind,
  device: 'poco',
});

describe('mood', () => {
  it('luật cố định', () => {
    expect(moodOf({ energy: 0.8, brightness: 0.6, dynamics: 0.4, bpm: 128 })).toBe('soi-dong');
    expect(moodOf({ energy: 0.3, brightness: 0.5, dynamics: 0.2, bpm: 85 })).toBe('chill');
    expect(moodOf({ energy: 0.2, brightness: 0.2, dynamics: 0.2, bpm: 70 })).toBe('sau-lang');
    expect(moodOf({ energy: 0.5, brightness: 0.5, dynamics: 0.2, bpm: 110 })).toBe('tap-trung');
    expect(moodOf({ energy: 0.5, brightness: 0.5, dynamics: 0.9, bpm: 110 })).toBe('khac');
  });
  it('6 khung giờ', () => {
    const at = (h: number) => hourSlot(new Date(2026, 0, 1, h));
    expect([0, 4, 5, 8, 9, 11, 12, 16, 17, 20, 21, 23].map(at)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe('audioSim', () => {
  it('giống hệt = 1; cùng kiểu cao hơn khác kiểu', () => {
    expect(audioSim(feat(CHILL), feat(CHILL))).toBeCloseTo(1, 5);
    const chillA = feat(CHILL);
    const chillB = feat({ ...CHILL, energy: 0.3, bpm: 90 });
    const loud = feat(LOUD);
    expect(audioSim(chillA, chillB)).toBeGreaterThan(audioSim(chillA, loud));
    expect(audioSim(chillA, loud)).toBe(audioSim(loud, chillA));
  });
});

describe('contentSim', () => {
  it('thiếu đặc trưng → chỉ tag; tag thưa → wAudio 0.6, có genre → 0.4', () => {
    expect(combineSim(0.5, undefined, true)).toBe(0.5);
    expect(combineSim(0.2, 1, true)).toBeCloseTo(0.4 * 0.2 + 0.6, 6);
    expect(combineSim(0.2, 1, false)).toBeCloseTo(0.6 * 0.2 + 0.4, 6);
    const a = fakeTrack(1);
    const b = fakeTrack(2);
    expect(contentSim(a, b, 0.3)).toBeCloseTo(0.3, 6);
    expect(contentSim(a, b, 0.3, feat(CHILL), feat(CHILL))).toBeCloseTo(0.4 * 0.3 + 0.6, 6);
  });
});

describe('intent', () => {
  const trackIds = ['folder:1', 'folder:2', 'folder:3', 'folder:4', 'folder:5'];
  const features = new Map<string, AudioFeatures>([
    ['folder:1', feat(CHILL)],
    ['folder:2', feat({ ...CHILL, energy: 0.3 })],
    ['folder:3', feat({ ...CHILL, energy: 0.28, bpm: 88 })],
    ['folder:4', feat(LOUD)],
    ['folder:5', feat({ ...LOUD, energy: 0.85 })],
  ]);

  it('phiên = lượt nghe cách nhau < 30 phút; quá 30 phút kể từ lượt cuối thì không còn phiên', () => {
    const events = [ev('folder:1', 100), ev('folder:2', 20), ev('folder:3', 5)];
    expect(currentSession(events, NOW).map((e) => e.trackId)).toEqual(['folder:3', 'folder:2']);
    expect(currentSession(events, NOW + 31 * MIN)).toEqual([]);
    expect(computeIntent(events, features, NOW + 60 * MIN)).toBeNull();
  });

  it('phiên 3 bài chill nghe trọn → mood chill, BPM ≈ 86', () => {
    const intent = computeIntent([ev('folder:1', 20), ev('folder:2', 12), ev('folder:3', 4)], features, NOW)!;
    expect(intent.mood).toBe('chill');
    expect(intent.bpm).toBeGreaterThanOrEqual(84);
    expect(intent.bpm).toBeLessThanOrEqual(90);
    expect(intent.count).toBe(3);
  });

  it('bỏ qua liên tiếp bài sôi động → điểm các bài sôi động giảm', () => {
    const base = [ev('folder:1', 20), ev('folder:2', 12)];
    const before = computeIntent(base, features, NOW)!;
    const after = computeIntent([...base, ev('folder:4', 8, 'skip'), ev('folder:5', 6, 'skip'), ev('folder:4', 4, 'skip')], features, NOW)!;
    const loud = features.get('folder:4')!;
    expect(intentScore(after, loud)).toBeLessThan(intentScore(before, loud));
  });

  it('chỉ toàn bỏ qua: vẫn ra ý định, đẩy xa bài bị bỏ qua', () => {
    const intent = computeIntent([ev('folder:4', 5, 'skip'), ev('folder:5', 2, 'skip')], features, NOW)!;
    expect(intent.vec[0]).toBeLessThan(0.5);
    expect(trackIds).toHaveLength(5);
  });

  it('engine dùng ý định: xếp bài chill lên trên sau phiên chill', () => {
    const lib: Track[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => fakeTrack(n, { artist: `Nghệ sĩ ${n}` }));
    const fm = new Map<string, AudioFeatures>(lib.map((t, i) => [t.id, feat(i < 4 ? CHILL : LOUD)]));
    const s: Signals = { library: lib, features: fm, events: [ev('folder:1', 10), ev('folder:2', 4)], liked: new Set(), now: NOW, rng: () => 0.5 };
    const top = recommend(s, { limit: 2, exclude: new Set(['folder:1', 'folder:2']) }).map((x) => x.track.id);
    expect(top.every((id) => ['folder:3', 'folder:4'].includes(id))).toBe(true);
  });
});

describe('smartShuffle', () => {
  const artists = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lib = Array.from({ length: 60 }, (_, i) => fakeTrack(i + 1, { artist: artists[i % 6] }));
  const rng0 = seededRng(7);
  const features = new Map<string, AudioFeatures>(lib.map((t) => [t.id, feat({ energy: rng0() })]));

  it('mọi bài xuất hiện đúng một lần', () => {
    const { tracks } = smartShuffle(lib, { rng: seededRng(1), features });
    expect(tracks).toHaveLength(lib.length);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(lib.length);
  });

  it('không có hai bài cùng nghệ sĩ liền nhau khi còn bài khác để chọn', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { tracks } = smartShuffle(lib, { rng: seededRng(seed), features });
      for (let i = 1; i < tracks.length; i++) expect(tracks[i].artist).not.toBe(tracks[i - 1].artist);
    }
  });

  it('≥ 80% cặp kế tiếp có |Δenergy| ≤ 0.35', () => {
    for (const seed of [1, 2, 3]) {
      const { tracks } = smartShuffle(lib, { rng: seededRng(seed), features });
      let ok = 0;
      for (let i = 1; i < tracks.length; i++) {
        if (Math.abs(features.get(tracks[i].id)!.energy - features.get(tracks[i - 1].id)!.energy) <= ENERGY_STEP) ok++;
      }
      expect(ok / (tracks.length - 1)).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('xác định theo rng; điểm cao thì có xu hướng lên sớm', () => {
    const a = smartShuffle(lib, { rng: seededRng(9) }).tracks.map((t) => t.id);
    const b = smartShuffle(lib, { rng: seededRng(9) }).tracks.map((t) => t.id);
    expect(a).toEqual(b);
    const fav = new Set(lib.slice(0, 6).map((t) => t.id));
    let sum = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const order = smartShuffle(lib, { rng: seededRng(seed), score: (t) => (fav.has(t.id) ? 5 : 0) }).tracks;
      sum += order.slice(0, 15).filter((t) => fav.has(t.id)).length;
    }
    expect(sum / 20).toBeGreaterThan(3); // kỳ vọng ngẫu nhiên thuần: 6 × 15/60 = 1.5
  });

  it('chèn gợi ý ✨ cứ 4 bài một lần, không trùng bài đã có', () => {
    const base = lib.slice(0, 12);
    const extra = lib.slice(12, 20);
    const r = smartShuffle(base, { rng: seededRng(2), inject: [...base.slice(0, 2), ...extra], injectEvery: 4 });
    expect(r.suggestedIds.size).toBe(2); // sau bài thứ 4 và 8 (không chèn sau bài cuối)
    expect(r.tracks).toHaveLength(14);
    for (const id of r.suggestedIds) expect(base.some((t) => t.id === id)).toBe(false);
    const idx = r.tracks.map((t, i) => (r.suggestedIds.has(t.id) ? i : -1)).filter((i) => i >= 0);
    expect(idx).toEqual([4, 9]);
  });

  it('chỉ còn bài cùng nghệ sĩ thì vẫn xếp hết', () => {
    const same = [1, 2, 3].map((n) => fakeTrack(n, { artist: 'Solo' }));
    expect(smartShuffle(same, { rng: seededRng(1) }).tracks).toHaveLength(3);
  });
});

describe('mixes', () => {
  const lib = Array.from({ length: 30 }, (_, i) => fakeTrack(i + 1, { artist: `Nghệ sĩ ${i % 10}` }));
  const features = new Map<string, AudioFeatures>(lib.map((t, i) => [t.id, feat(i < 12 ? CHILL : i < 22 ? LOUD : { energy: 0.5, dynamics: 0.9 })]));
  const sig = (events: PlayEvent[]): Signals => ({ library: lib, features, events, liked: new Set(), now: NOW, rng: seededRng(3) });

  it('mix theo mood: bỏ nhóm "khác" và nhóm nhỏ', () => {
    const m = moodMixes(lib, features, seededRng(1));
    expect(m.map((x) => x.title).sort()).toEqual(['Mix Chill', 'Mix Sôi động']);
    expect(m.find((x) => x.id === 'mood:chill')!.tracks).toHaveLength(12);
  });

  it('chip "Đang hợp" chỉ khi đang có phiên ≥ 2 bài', () => {
    expect(intentMix(sig([ev('folder:1', 3)]))).toBeNull();
    const m = intentMix(sig([ev('folder:1', 9), ev('folder:2', 3)]))!;
    expect(m.chip).toBe('Đang hợp: Chill · ~85 BPM');
    expect(m.tracks.length).toBeGreaterThan(0);
    expect(intentMix({ ...sig([ev('folder:1', 9), ev('folder:2', 3)]), features: undefined })).toBeNull();
  });

  it('On Repeat: ≥ 2 lượt trong 30 ngày, nhiều nhất trước', () => {
    const events = [ev('folder:5', 60), ev('folder:5', 120), ev('folder:5', 180), ev('folder:6', 60), ev('folder:6', 90), ev('folder:7', 60), ev('folder:8', 40 * 24 * 60), ev('folder:8', 41 * 24 * 60)];
    expect(onRepeat(sig(events)).map((t) => t.id)).toEqual(['folder:5', 'folder:6']);
  });

  it('Lâu rồi chưa nghe: ≥ 3 lần nghe trọn, 60 ngày chưa nghe lại', () => {
    const old = (id: string, n: number, days: number) => Array.from({ length: n }, (_, i) => ev(id, (days + i) * 24 * 60));
    const events = [...old('folder:1', 3, 70), ...old('folder:2', 2, 90), ...old('folder:3', 3, 10)];
    expect(longTimeNoSee(sig(events)).map((t) => t.id)).toEqual(['folder:1']);
  });

  it('Khám phá: không gồm bài đã nghe > 1 lượt', () => {
    const events = [ev('folder:1', 60), ev('folder:1', 70), ev('folder:2', 80)];
    const ids = discoverInLibrary(sig(events), 30).map((t) => t.id);
    expect(ids).not.toContain('folder:1');
    expect(ids).toContain('folder:2');
  });

  it('Mix theo giờ: cần ≥ 5 lượt cùng khung giờ', () => {
    const day = (n: number) => Array.from({ length: n }, (_, i) => ev(`folder:${(i % 10) + 1}`, (i + 1) * 24 * 60 + 1));
    expect(timeMix(sig(day(3)))).toBeNull();
    const m = timeMix(sig(day(10)));
    expect(m?.title).toBe('Mix buổi sáng');
    expect(DAY).toBeGreaterThan(0);
  });
});
