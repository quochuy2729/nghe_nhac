/** Giải mã đoạn nhạc bằng MediaExtractor + MediaCodec (plugin MusicLibrary) → PCM mono Float32 @ 22 050 Hz. */
import { Capacitor } from '@capacitor/core';
import type { Track } from '@/providers/types';
import type { AudioDecoder } from '../types';
import { MusicLibrary, type MusicLibraryPlugin } from './musicLibrary';

export interface NativeDecoderDeps {
  plugin: Pick<MusicLibraryPlugin, 'decodeSegment'>;
  /** Đọc file PCM thô (int16 little-endian) mà plugin vừa ghi vào cache. */
  readPcm: (path: string) => Promise<ArrayBuffer>;
}

const defaults = (): NativeDecoderDeps => ({
  plugin: MusicLibrary,
  readPcm: async (path) => {
    const res = await fetch(Capacitor.convertFileSrc(`file://${path}`));
    if (!res.ok) throw new Error('Không đọc được PCM');
    return res.arrayBuffer();
  },
});

/** int16 LE → Float32 [-1, 1). */
export function int16ToFloat(buf: ArrayBuffer): Float32Array {
  const i16 = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 32768;
  return out;
}

export class NativeDecoder implements AudioDecoder {
  private readonly deps: NativeDecoderDeps;

  constructor(deps: Partial<NativeDecoderDeps> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async decodeSegment(track: Track, startSec: number, durSec: number, sampleRate: 22050): Promise<Float32Array> {
    if (track.source?.kind !== 'saf') throw new Error('Bài này không nằm trong thư mục đã liên kết.');
    const { path } = await this.deps.plugin.decodeSegment({ uri: track.source.uri, startSec, durSec, sampleRate });
    return int16ToFloat(await this.deps.readPcm(path));
  }
}
