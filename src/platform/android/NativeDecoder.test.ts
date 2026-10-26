import { fakeTrack } from '@/test/fixtures';
import { int16ToFloat, NativeDecoder } from './NativeDecoder';

describe('NativeDecoder', () => {
  it('đổi int16 little-endian sang Float32', () => {
    const buf = new Int16Array([0, 16384, -32768, 32767]).buffer;
    const f = int16ToFloat(buf);
    expect(Array.from(f)).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it('gọi plugin với uri SAF và trả PCM đã đọc', async () => {
    const decodeSegment = vi.fn(async () => ({ path: '/cache/pcm/pcm-1.raw', samples: 3 }));
    const readPcm = vi.fn(async () => new Int16Array([0, 8192, -8192]).buffer);
    const dec = new NativeDecoder({ plugin: { decodeSegment }, readPcm });
    const track = fakeTrack(1, { source: { kind: 'saf', uri: 'content://tree/doc1', mtime: 1 } });

    const pcm = await dec.decodeSegment(track, 12.5, 45, 22050);

    expect(decodeSegment).toHaveBeenCalledWith({ uri: 'content://tree/doc1', startSec: 12.5, durSec: 45, sampleRate: 22050 });
    expect(readPcm).toHaveBeenCalledWith('/cache/pcm/pcm-1.raw');
    expect(Array.from(pcm)).toEqual([0, 0.25, -0.25]);
  });

  it('bài không phải SAF thì báo lỗi', async () => {
    const dec = new NativeDecoder({ plugin: { decodeSegment: vi.fn() }, readPcm: vi.fn() });
    await expect(dec.decodeSegment(fakeTrack(2), 0, 45, 22050)).rejects.toThrow();
  });
});
