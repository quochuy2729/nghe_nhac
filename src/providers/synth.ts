/**
 * Tổng hợp nhạc demo (WAV) ngay trên trình duyệt cho mock provider —
 * không cần mạng, không dùng nội dung có bản quyền.
 */
const SAMPLE_RATE = 22050;

export interface SynthSpec {
  seed: number;
  durationSec: number;
  bpm: number;
  /** MIDI note gốc của giọng (vd 57 = A3). */
  root: number;
  /** Vòng hợp âm, mỗi phần tử là bậc (semitone) so với root. */
  progression: number[];
  minor?: boolean;
}

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function synthesizeSamples(spec: SynthSpec): Float32Array {
  const total = Math.floor(spec.durationSec * SAMPLE_RATE);
  const out = new Float32Array(total);
  const beat = 60 / spec.bpm;
  const third = spec.minor ? 3 : 4;
  const step = beat / 2; // nốt móc đơn
  const pattern = [0, 2, 1, 2, 0, 2, 1, 3];

  for (let n = 0; n * step < spec.durationSec; n++) {
    const t0 = n * step;
    const bar = Math.floor(n / 8);
    const chordRoot = spec.root + spec.progression[bar % spec.progression.length];
    const chord = [chordRoot, chordRoot + third, chordRoot + 7, chordRoot + 12];
    const note = chord[pattern[(n + spec.seed) % pattern.length]];
    addNote(out, t0, step * 1.8, midiToHz(note), 0.22);
    if (n % 8 === 0) addNote(out, t0, step * 8, midiToHz(chordRoot - 12), 0.28);
  }
  // fade in/out
  const fade = Math.floor(SAMPLE_RATE * 1.5);
  for (let i = 0; i < fade && i < total; i++) {
    const g = i / fade;
    out[i] *= g;
    out[total - 1 - i] *= g;
  }
  return out;
}

function addNote(buf: Float32Array, startSec: number, lenSec: number, hz: number, amp: number) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(lenSec * SAMPLE_RATE);
  const w = (2 * Math.PI * hz) / SAMPLE_RATE;
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const env = Math.min(1, i / 200) * Math.exp((-3 * i) / len);
    buf[start + i] += amp * env * (Math.sin(w * i) + 0.3 * Math.sin(2 * w * i));
  }
}

export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function synthesizeWavBlob(spec: SynthSpec): Blob {
  return new Blob([encodeWav(synthesizeSamples(spec))], { type: 'audio/wav' });
}
