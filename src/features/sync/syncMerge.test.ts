import { backoffMs, chunk, CLOCK_SKEW_MS, mergeEvents, mergeVersioned, pickWinner, pullSince, type Versioned } from './syncMerge';

interface Rec extends Versioned {
  id: string;
  name: string;
}
const rec = (id: string, name: string, updatedAt: number, deleted?: boolean): Rec => ({ id, name, updatedAt, ...(deleted ? { deleted } : {}) });
const key = (r: Rec) => r.id;
const T = 1_700_000_000_000;

describe('pickWinner (LWW)', () => {
  it('bản mới hơn thắng, không phụ thuộc thứ tự tham số', () => {
    const a = rec('x', 'cũ', T);
    const b = rec('x', 'mới', T + 1);
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it('hòa thời gian: bản đã xóa thắng; còn lại chọn xác định (giao hoán)', () => {
    const live = rec('x', 'a', T);
    const dead = rec('x', 'a', T, true);
    expect(pickWinner(live, dead)).toBe(dead);
    expect(pickWinner(dead, live)).toBe(dead);
    const p = rec('x', 'p', T);
    const q = rec('x', 'q', T);
    expect(pickWinner(p, q)).toBe(pickWinner(q, p));
  });

  it('bản ghi xóa mềm mới hơn thắng bản sửa cũ, và ngược lại', () => {
    expect(pickWinner(rec('x', 'a', T), rec('x', 'a', T + 10, true)).deleted).toBe(true);
    expect(pickWinner(rec('x', 'a', T + 10), rec('x', 'a', T, true)).deleted).toBeUndefined();
  });
});

describe('mergeVersioned', () => {
  it('trùng id: lấy bản thắng, báo đúng bên cần cập nhật', () => {
    const local = [rec('1', 'local-mới', T + 5), rec('2', 'local-cũ', T)];
    const remote = [rec('1', 'remote-cũ', T), rec('2', 'remote-mới', T + 5), rec('3', 'chỉ-remote', T)];
    const r = mergeVersioned(local, remote, key);
    expect(r.merged.map((x) => `${x.id}:${x.name}`).sort()).toEqual(['1:local-mới', '2:remote-mới', '3:chỉ-remote']);
    expect(r.applyLocal.map((x) => x.id).sort()).toEqual(['2', '3']);
    expect(r.pushRemote.map((x) => x.id)).toEqual(['1']);
  });

  it('bản ghi chỉ có ở local thì đẩy lên', () => {
    const r = mergeVersioned([rec('a', 'x', T)], [], key);
    expect(r.pushRemote).toHaveLength(1);
    expect(r.applyLocal).toHaveLength(0);
  });

  it('lũy đẳng: gộp lại kết quả đã gộp không sinh thay đổi', () => {
    const local = [rec('1', 'a', T + 1), rec('2', 'b', T)];
    const remote = [rec('1', 'c', T), rec('3', 'd', T)];
    const once = mergeVersioned(local, remote, key);
    const twice = mergeVersioned(once.merged, once.merged, key);
    expect(twice.applyLocal).toEqual([]);
    expect(twice.pushRemote).toEqual([]);
  });

  it('hội tụ khi đồng hồ hai máy lệch ±5 phút, bất kể gộp ở máy nào', () => {
    // Cùng một lần sửa nhưng máy B chạy nhanh 5 phút, máy A chạy chậm 5 phút.
    const onA = rec('p', 'sửa trên A', T - CLOCK_SKEW_MS);
    const onB = rec('p', 'sửa trên B', T + CLOCK_SKEW_MS);
    const atA = mergeVersioned([onA], [onB], key).merged[0];
    const atB = mergeVersioned([onB], [onA], key).merged[0];
    expect(atA).toEqual(atB);
  });

  it('bản ghi đã xóa lan sang máy kia thay vì sống lại', () => {
    const r = mergeVersioned([rec('p', 'tên', T)], [rec('p', 'tên', T + 1, true)], key);
    expect(r.merged[0].deleted).toBe(true);
    expect(r.applyLocal).toHaveLength(1);
  });
});

describe('mergeEvents', () => {
  const ev = (id: string, t: number) => ({ id, t });
  it('hợp theo id, sắp cũ → mới, đẩy lại cả lô không nhân đôi', () => {
    const local = [ev('a', 3), ev('b', 1)];
    const remote = [ev('b', 1), ev('c', 2)];
    const merged = mergeEvents(local, remote);
    expect(merged.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(mergeEvents(merged, merged)).toEqual(merged);
    expect(mergeEvents(merged, remote)).toEqual(merged);
  });
});

describe('pullSince / chunk / backoffMs', () => {
  it('pull lùi 5 phút để không bỏ sót bản ghi từ máy có đồng hồ chậm', () => {
    expect(pullSince(null)).toBeNull();
    expect(pullSince(T)).toBe(T - CLOCK_SKEW_MS);
    expect(pullSince(1000)).toBe(0);
  });
  it('chia lô', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
  it('backoff tăng gấp đôi, tối đa 5 phút', () => {
    const zero = () => 0;
    expect(backoffMs(0, zero)).toBe(5_000);
    expect(backoffMs(1, zero)).toBe(10_000);
    expect(backoffMs(20, zero)).toBe(300_000);
    expect(backoffMs(0, () => 1)).toBe(6_000);
  });
});
