import { activeLineIndex, isSyncedLrc, parseLrc } from './lrc';

// LRC giả tự viết cho test — không phải lời bài hát thật.
const SAMPLE = `\uFEFF[ti:Bài Thử]
[ar:Nghệ Sĩ Thử]
[al:Album Thử]
[by:test]
[length:02:00]

[00:01.00]Dòng một
[00:05.50]Dòng hai
[00:03.25][00:09.125]Điệp khúc giả
[00:12]Không phần lẻ
[00:15:40]Dấu hai chấm
[00:20.00]
[01:02.5]Một chữ số lẻ
`;

describe('parseLrc', () => {
  it('parse timestamp, sắp xếp tăng dần và bỏ metadata', () => {
    const { lines, meta } = parseLrc(SAMPLE);
    expect(meta).toMatchObject({ ti: 'Bài Thử', ar: 'Nghệ Sĩ Thử', al: 'Album Thử', by: 'test', length: '02:00' });
    expect(lines).toEqual([
      { timeMs: 1000, text: 'Dòng một' },
      { timeMs: 3250, text: 'Điệp khúc giả' },
      { timeMs: 5500, text: 'Dòng hai' },
      { timeMs: 9125, text: 'Điệp khúc giả' },
      { timeMs: 12000, text: 'Không phần lẻ' },
      { timeMs: 15400, text: 'Dấu hai chấm' },
      { timeMs: 20000, text: '' },
      { timeMs: 62500, text: 'Một chữ số lẻ' },
    ]);
  });

  it('áp dụng [offset:] dương (hiện sớm hơn) và âm', () => {
    expect(parseLrc('[offset:+500]\n[00:02.00]a').lines[0].timeMs).toBe(1500);
    expect(parseLrc('[offset:-250]\n[00:02.00]a').lines[0].timeMs).toBe(2250);
    expect(parseLrc('[offset:5000]\n[00:02.00]a').lines[0].timeMs).toBe(0);
    expect(parseLrc('[offset:+500]\n[00:02.00]a').offsetMs).toBe(500);
  });

  it('CRLF, phút > 99, bỏ timestamp từng chữ', () => {
    const { lines } = parseLrc('[100:00.00]<100:00.10>xa <100:00.50>lắm\r\n[00:00.00]đầu');
    expect(lines).toEqual([
      { timeMs: 0, text: 'đầu' },
      { timeMs: 6_000_000, text: 'xa lắm' },
    ]);
  });

  it('giữ thứ tự gốc khi trùng thời điểm, bỏ dòng rác', () => {
    const { lines } = parseLrc('[00:01.00]A\n[00:01.00]B\nkhông có tag\n[xx:yy]rác');
    expect(lines.map((l) => l.text)).toEqual(['A', 'B']);
  });

  it('isSyncedLrc', () => {
    expect(isSyncedLrc('lời thường\nkhông thời gian')).toBe(false);
    expect(isSyncedLrc('[00:01.00]x')).toBe(true);
  });
});

describe('activeLineIndex', () => {
  const lines = parseLrc(SAMPLE).lines;
  it('trước dòng đầu → -1', () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 999)).toBe(-1);
  });
  it('đúng biên và giữa các dòng', () => {
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 3249)).toBe(0);
    expect(activeLineIndex(lines, 3250)).toBe(1);
    expect(activeLineIndex(lines, 10_000)).toBe(3);
    expect(activeLineIndex(lines, 999_999)).toBe(lines.length - 1);
  });
  it('mảng rỗng', () => {
    expect(activeLineIndex([], 5000)).toBe(-1);
  });
});
