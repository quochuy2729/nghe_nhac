import type { AudioDecoder } from '../types';

/** Làm ở G5 (phân tích âm thanh). */
export class WebDecoder implements AudioDecoder {
  async decodeSegment(): Promise<Float32Array> {
    throw new Error('not implemented');
  }
}
