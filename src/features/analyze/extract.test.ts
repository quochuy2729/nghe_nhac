import { extractFeatures, SAMPLE_RATE } from './extract';

const SR = SAMPLE_RATE;

function sine(hz: number, sec: number, amp = 0.5): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

/** Nhiễu trắng xác định (LCG) — không dùng Math.random để test lặp lại được. */
function noise(sec: number, amp = 0.5): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  let s = 12345;
  for (let i = 0; i < x.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    x[i] = amp * ((s / 0xffffffff) * 2 - 1);
  }
  return x;
}

/** Chuỗi click (tiếng "tích" 1 kHz ngắn, tắt nhanh) đúng nhịp `bpm`. */
function clickTrack(bpm: number, sec: number): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  const period = (60 / bpm) * SR;
  const len = Math.round(0.03 * SR);
  for (let beat = 0; beat * period < x.length; beat++) {
    const start = Math.round(beat * period);
    for (let i = 0; i < len && start + i < x.length; i++) {
      x[start + i] += 0.8 * Math.sin((2 * Math.PI * 1000 * i) / SR) * Math.exp(-i / (0.006 * SR));
    }
  }
  return x;
}

describe('extractFeatures', () => {
  it.each([90, 120, 150])('click track %i BPM → bpm trong ±2', (bpm) => {
    const f = extractFeatures(clickTrack(bpm, 30));
    expect(f.bpm).not.toBeNull();
    expect(Math.abs(f.bpm! - bpm)).toBeLessThanOrEqual(2);
    expect(f.bpmConf).toBeGreaterThan(0.2);
  });

  it('click 120 BPM nằm trong 118–122 (nghiệm thu)', () => {
    const f = extractFeatures(clickTrack(120, 45));
    expect(f.bpm).toBeGreaterThanOrEqual(118);
    expect(f.bpm).toBeLessThanOrEqual(122);
  });

  it('nhiễu trắng sáng hơn sin 200 Hz', () => {
    const s = extractFeatures(sine(200, 10));
    const n = extractFeatures(noise(10));
    expect(n.brightness).toBeGreaterThan(s.brightness + 0.5);
    expect(s.brightness).toBeLessThan(0.1);
  });

  it('xác định: cùng input → cùng output', () => {
    const x = noise(6);
    expect(extractFeatures(x)).toEqual(extractFeatures(x));
  });

  it('mọi chỉ số chuẩn hóa nằm trong [0,1] và có 13 hệ số MFCC', () => {
    const f = extractFeatures(clickTrack(100, 12));
    for (const k of ['energy', 'brightness', 'onsetRate', 'dynamics'] as const) {
      expect(f[k]).toBeGreaterThanOrEqual(0);
      expect(f[k]).toBeLessThanOrEqual(1);
    }
    expect(f.mfcc).toHaveLength(13);
    expect(f.v).toBe(1);
    expect(f.analyzedSec).toBe(12);
  });

  it('to hơn thì energy và loudness cao hơn', () => {
    const quiet = extractFeatures(sine(440, 8, 0.02));
    const loud = extractFeatures(sine(440, 8, 0.6));
    expect(loud.loudnessDb).toBeGreaterThan(quiet.loudnessDb + 20);
    expect(loud.energy).toBeGreaterThan(quiet.energy);
  });

  it('im lặng / quá ngắn không ném lỗi, bpm null', () => {
    const silent = extractFeatures(new Float32Array(SR * 5));
    expect(silent.bpm).toBeNull();
    expect(silent.energy).toBe(0);
    expect(() => extractFeatures(new Float32Array(100))).not.toThrow();
  });
});
