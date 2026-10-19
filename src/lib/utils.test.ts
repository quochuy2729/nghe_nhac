import { formatTime } from './utils';

describe('formatTime', () => {
  it('định dạng mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(3600)).toBe('1:00:00');
  });
  it('xử lý giá trị không hợp lệ', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
