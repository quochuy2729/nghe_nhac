import { getAudioBlob } from '@/lib/db';
import type { Track } from '@/providers/types';
import type { AudioDecoder } from '../types';

/** File lớn hơn mức này không giải mã cả file (tránh hết bộ nhớ trên iPhone); bài đó bị bỏ qua khi phân tích. */
const MAX_BYTES = 60 * 1024 * 1024;

/** Cắt đoạn [startSec, startSec+durSec) của các kênh và trộn thành mono. Hàm thuần. */
export function sliceMono(channels: readonly Float32Array[], sampleRate: number, startSec: number, durSec: number): Float32Array {
  const total = channels[0]?.length ?? 0;
  const from = Math.min(total, Math.max(0, Math.round(startSec * sampleRate)));
  const to = Math.min(total, from + Math.round(durSec * sampleRate));
  const out = new Float32Array(to - from);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[from + i] / channels.length;
  return out;
}

export type BlobSource = (track: Track) => Promise<Blob | null>;

const fromIndexedDb: BlobSource = async (track) => (await getAudioBlob(track.id)) ?? null;

/** Giải mã bằng Web Audio (OfflineAudioContext tự về mẫu 22 050 Hz). Android dùng tạm cho tới khi có NativeDecoder (G6). */
export class WebDecoder implements AudioDecoder {
  constructor(private readonly source: BlobSource = fromIndexedDb) {}

  async decodeSegment(track: Track, startSec: number, durSec: number, sampleRate: 22050): Promise<Float32Array> {
    const blob = await this.source(track);
    if (!blob) throw new Error('Không đọc được file nhạc.');
    if (blob.size > MAX_BYTES) throw new Error('File quá lớn để phân tích.');
    const Ctx = globalThis.OfflineAudioContext ?? (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) throw new Error('Trình duyệt không hỗ trợ giải mã âm thanh.');
    const audio = await new Ctx(1, 1, sampleRate).decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    return sliceMono(channels, audio.sampleRate, startSec, durSec);
  }
}
