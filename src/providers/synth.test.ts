import { encodeWav, synthesizeSamples } from './synth';
import { buildMockLrc, mockProvider, mockTracks } from './mock';

describe('synth', () => {
  it('tạo WAV PCM 16-bit đúng header', () => {
    const samples = synthesizeSamples({ seed: 1, durationSec: 1, bpm: 120, root: 60, progression: [0] });
    const buf = encodeWav(samples, 22050);
    const v = new DataView(buf);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(22050);
    expect(buf.byteLength).toBe(44 + samples.length * 2);
  });
});

describe('mockProvider', () => {
  it('search lọc theo tên và trả tất cả khi rỗng', async () => {
    expect(await mockProvider.search('')).toHaveLength(mockTracks.length);
    const r = await mockProvider.search('mưa');
    expect(r.map((t) => t.id)).toEqual(['mock:mua-dem']);
  });

  it('LRC giả có metadata và timestamp tăng dần', () => {
    const lrc = buildMockLrc({ title: 'A', artist: 'B', durationSec: 20, lines: ['x', 'y'] });
    const lines = lrc.split('\n');
    expect(lines[0]).toBe('[ti:A]');
    expect(lines[2]).toBe('[00:02.00]x');
    expect(lines[3]).toBe('[00:06.00]y');
  });
});
