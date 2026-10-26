import {
  createQueue,
  currentItem,
  enqueue,
  fisherYates,
  jumpTo,
  moveItem,
  next,
  nextRepeatMode,
  playNext,
  prev,
  removeItem,
  setShuffle,
  shuffleKeepCurrent,
  upcoming,
  type QueueState,
} from './queue';
import { fakeTracks, seededRng, seqUid } from '@/test/fixtures';

const ids = (s: QueueState) => s.items.map((it) => it.track.id);

describe('fisherYates', () => {
  it('giữ nguyên tập phần tử và không đổi mảng gốc', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = fisherYates(src, seededRng(1));
    expect(out.slice().sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('phân bố gần đều (mỗi vị trí đầu ~1/n)', () => {
    const rng = seededRng(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[fisherYates([0, 1, 2, 3], rng)[0]]++;
    counts.forEach((c) => expect(c).toBeGreaterThan(850));
  });
});

describe('shuffle', () => {
  it('giữ bài đang phát ở đầu khi bật shuffle', () => {
    const q = createQueue(fakeTracks(10), 4, { uid: seqUid() });
    const s = setShuffle(q, true, seededRng(3));
    expect(s.index).toBe(0);
    expect(currentItem(s)?.track.id).toBe('folder:5');
    expect(ids(s).slice().sort()).toEqual(ids(q).slice().sort());
  });

  it('khôi phục thứ tự gốc khi tắt shuffle và giữ bài hiện tại', () => {
    const q = createQueue(fakeTracks(10), 2, { uid: seqUid() });
    let s = setShuffle(q, true, seededRng(5));
    s = next(s).state;
    s = next(s).state;
    const playing = currentItem(s)!.track.id;
    const off = setShuffle(s, false);
    expect(ids(off)).toEqual(ids(q));
    expect(currentItem(off)!.track.id).toBe(playing);
  });

  it('createQueue với shuffle bắt đầu từ bài được chọn', () => {
    const q = createQueue(fakeTracks(6), 3, { shuffle: true, rng: seededRng(9), uid: seqUid() });
    expect(currentItem(q)!.track.id).toBe('folder:4');
  });

  it('không lặp bài trước khi hết vòng (repeat all + shuffle)', () => {
    let s = createQueue(fakeTracks(8), 0, { shuffle: true, repeat: 'all', rng: seededRng(11), uid: seqUid() });
    const rng = seededRng(12);
    for (let round = 0; round < 5; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const id = currentItem(s)!.track.id;
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        const last = id;
        s = next(s, { auto: true, rng }).state;
        if (i === 7) expect(currentItem(s)!.track.id).not.toBe(last);
      }
      expect(seen.size).toBe(8);
    }
  });

  it('shuffleKeepCurrent với index ngoài phạm vi vẫn xáo toàn bộ', () => {
    const items = createQueue(fakeTracks(5), 0, { uid: seqUid() }).items;
    expect(shuffleKeepCurrent(items, -1, seededRng(2))).toHaveLength(5);
  });
});

describe('next / prev', () => {
  it('next đi theo thứ tự và dừng ở cuối khi repeat off', () => {
    let s = createQueue(fakeTracks(3), 0, { uid: seqUid() });
    let step = next(s);
    expect(step.action).toBe('play');
    s = step.state;
    s = next(s).state;
    expect(currentItem(s)!.track.id).toBe('folder:3');
    step = next(s, { auto: true });
    expect(step.action).toBe('stop');
    expect(step.state.index).toBe(0);
  });

  it('repeat all quay lại bài đầu', () => {
    const s = createQueue(fakeTracks(3), 2, { repeat: 'all', uid: seqUid() });
    const step = next(s, { auto: true });
    expect(step.action).toBe('play');
    expect(currentItem(step.state)!.track.id).toBe('folder:1');
  });

  it('repeat one: hết bài thì phát lại, bấm next thì sang bài', () => {
    const s = createQueue(fakeTracks(3), 1, { repeat: 'one', uid: seqUid() });
    expect(next(s, { auto: true }).action).toBe('restart');
    const manual = next(s);
    expect(manual.action).toBe('play');
    expect(currentItem(manual.state)!.track.id).toBe('folder:3');
  });

  it('prev: >3s thì về đầu bài, ≤3s thì lùi bài', () => {
    const s = createQueue(fakeTracks(3), 1, { uid: seqUid() });
    expect(prev(s, 10).action).toBe('restart');
    expect(prev(s, 10).state.index).toBe(1);
    const back = prev(s, 2);
    expect(back.action).toBe('play');
    expect(currentItem(back.state)!.track.id).toBe('folder:1');
  });

  it('prev ở bài đầu: repeat off → về đầu bài; repeat all → bài cuối', () => {
    const s = createQueue(fakeTracks(3), 0, { uid: seqUid() });
    expect(prev(s, 0).action).toBe('restart');
    const all = prev({ ...s, repeat: 'all' }, 0);
    expect(currentItem(all.state)!.track.id).toBe('folder:3');
  });

  it('prev/next đúng thứ tự khi đang shuffle', () => {
    let s = createQueue(fakeTracks(6), 0, { shuffle: true, rng: seededRng(4), uid: seqUid() });
    const order = ids(s);
    s = next(s).state;
    s = next(s).state;
    expect(currentItem(s)!.track.id).toBe(order[2]);
    s = prev(s, 0).state;
    expect(currentItem(s)!.track.id).toBe(order[1]);
  });

  it('hàng đợi rỗng', () => {
    const s = createQueue([], 0);
    expect(next(s).action).toBe('stop');
    expect(prev(s, 0).action).toBe('stop');
  });
});

describe('thao tác hàng đợi', () => {
  it('playNext chèn ngay sau bài hiện tại', () => {
    const uid = seqUid();
    const s = createQueue(fakeTracks(3), 0, { uid });
    const out = playNext(s, [{ ...fakeTracks(1)[0], id: 'folder:99' }], uid);
    expect(ids(out)).toEqual(['folder:1', 'folder:99', 'folder:2', 'folder:3']);
  });

  it('playNext khi shuffle chèn vào cả thứ tự phát và thứ tự gốc', () => {
    const uid = seqUid();
    const s = createQueue(fakeTracks(5), 2, { shuffle: true, rng: seededRng(8), uid });
    const out = playNext(s, [{ ...fakeTracks(1)[0], id: 'folder:99' }], uid);
    expect(out.items[1].track.id).toBe('folder:99');
    const off = setShuffle(out, false);
    expect(ids(off)).toEqual(['folder:1', 'folder:2', 'folder:3', 'folder:99', 'folder:4', 'folder:5']);
  });

  it('enqueue thêm vào cuối; hàng đợi rỗng thì thành bài hiện tại', () => {
    const empty = createQueue([], 0);
    const a = enqueue(empty, fakeTracks(2));
    expect(a.index).toBe(0);
    const b = enqueue(a, [{ ...fakeTracks(1)[0], id: 'folder:9' }]);
    expect(ids(b).at(-1)).toBe('folder:9');
  });

  it('removeItem không xóa bài đang phát và giữ index đúng', () => {
    const s = createQueue(fakeTracks(4), 2, { uid: seqUid() });
    expect(removeItem(s, s.items[2].uid)).toBe(s);
    const out = removeItem(s, s.items[0].uid);
    expect(currentItem(out)!.track.id).toBe('folder:3');
    expect(out.items).toHaveLength(3);
  });

  it('moveItem đổi chỗ và giữ bài hiện tại', () => {
    const s = createQueue(fakeTracks(4), 1, { uid: seqUid() });
    const out = moveItem(s, 3, 2);
    expect(ids(out)).toEqual(['folder:1', 'folder:2', 'folder:4', 'folder:3']);
    expect(currentItem(out)!.track.id).toBe('folder:2');
  });

  it('jumpTo và upcoming', () => {
    const s = createQueue(fakeTracks(4), 0, { uid: seqUid() });
    const j = jumpTo(s, s.items[2].uid);
    expect(j.index).toBe(2);
    expect(upcoming(j).map((i) => i.track.id)).toEqual(['folder:4']);
    expect(jumpTo(s, 'nope')).toBe(s);
  });

  it('nextRepeatMode xoay vòng off → all → one → off', () => {
    expect(nextRepeatMode('off')).toBe('all');
    expect(nextRepeatMode('all')).toBe('one');
    expect(nextRepeatMode('one')).toBe('off');
  });
});
