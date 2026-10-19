/**
 * Mock provider: dùng khi chưa có key (VITE_JAMENDO_CLIENT_ID…) hoặc khi offline,
 * để app vẫn chạy được đầy đủ luồng phát / tải / lyrics.
 * Nhạc được tổng hợp tại chỗ, lời bài hát là LRC giả tự viết.
 */
import type { MusicProvider, Track } from './types';
import { sourceId } from './types';
import { synthesizeWavBlob, type SynthSpec } from './synth';

interface MockDef extends SynthSpec {
  id: string;
  title: string;
  artist: string;
  album: string;
  colors: [string, string];
  lines: string[];
}

const DEFS: MockDef[] = [
  {
    id: 'binh-minh', title: 'Bình Minh Trên Phố', artist: 'Ban Nhạc Thử', album: 'Demo Một',
    seed: 1, durationSec: 64, bpm: 96, root: 60, progression: [0, 7, 9, 5], colors: ['#f59e0b', '#be123c'],
    lines: ['Nắng sớm gõ cửa ô kính', 'Phố còn ngái ngủ mơ màng', 'Ly cà phê thơm góc nhỏ', 'Ta bước đi nhẹ nhàng', 'Một ngày mới đang chờ', 'Hát lên cùng gió sớm'],
  },
  {
    id: 'mua-dem', title: 'Mưa Đêm Thành Phố', artist: 'Ca Sĩ Giả Định', album: 'Demo Một',
    seed: 2, durationSec: 58, bpm: 78, root: 57, progression: [0, 5, 3, 7], minor: true, colors: ['#1d4ed8', '#0f172a'],
    lines: ['Mưa rơi trên mái hiên', 'Đèn đường nhòe trong mắt', 'Bước chân ai vội vã', 'Đêm dài như câu hát', 'Chờ một ngày nắng lên'],
  },
  {
    id: 'song-xanh', title: 'Sóng Xanh', artist: 'Ban Nhạc Thử', album: 'Biển Mẫu',
    seed: 3, durationSec: 70, bpm: 110, root: 62, progression: [0, 5, 7, 5], colors: ['#06b6d4', '#065f46'],
    lines: ['Sóng vỗ về bờ cát', 'Gió mang vị muối mặn', 'Chân trần in dấu nhỏ', 'Hoàng hôn rơi thật chậm', 'Biển xanh hát mãi thôi'],
  },
  {
    id: 'pho-nui', title: 'Phố Núi Mù Sương', artist: 'Nhóm Âm Thanh Mẫu', album: 'Biển Mẫu',
    seed: 4, durationSec: 52, bpm: 84, root: 55, progression: [0, 3, 5, 3], minor: true, colors: ['#7c3aed', '#1e1b4b'],
    lines: ['Sương giăng kín lối mòn', 'Thông reo trên đồi vắng', 'Bếp lửa hồng ấm áp', 'Câu chuyện chưa kể xong'],
  },
  {
    id: 'chuyen-tau', title: 'Chuyến Tàu Đêm', artist: 'Ca Sĩ Giả Định', album: 'Đường Dài',
    seed: 5, durationSec: 66, bpm: 120, root: 59, progression: [0, 7, 5, 7], colors: ['#ef4444', '#431407'],
    lines: ['Tiếng còi tàu xa xăm', 'Ga nhỏ đèn vàng hiu hắt', 'Ô cửa sổ lùi dần', 'Ta mang theo nỗi nhớ', 'Về nơi có ai chờ', 'Đường ray dài vô tận'],
  },
  {
    id: 'giai-dieu', title: 'Giai Điệu Mùa Thu', artist: 'Nhóm Âm Thanh Mẫu', album: 'Đường Dài',
    seed: 6, durationSec: 60, bpm: 90, root: 64, progression: [0, 9, 5, 7], colors: ['#d97706', '#3f2a14'],
    lines: ['Lá vàng bay trong gió', 'Hồ Gươm lặng sóng yên', 'Hoa sữa thơm ngõ nhỏ', 'Thu về trên phố quen', 'Ngân nga khúc ca hiền'],
  },
];

function artworkSvg(def: MockDef): string {
  const [a, b] = def.colors;
  const initials = def.title
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><text x="24" y="270" font-family="Arial,sans-serif" font-weight="700" font-size="96" fill="rgba(255,255,255,.9)">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toTrack(def: MockDef): Track {
  return {
    id: `mock:${def.id}`,
    provider: 'mock',
    title: def.title,
    artist: def.artist,
    album: def.album,
    durationSec: def.durationSec,
    artworkUrl: artworkSvg(def),
    downloadable: true,
  };
}

/** LRC giả: rải đều các dòng trong bài, lặp lại cho tới gần cuối. */
export function buildMockLrc(def: Pick<MockDef, 'title' | 'artist' | 'durationSec' | 'lines'>): string {
  const out = [`[ti:${def.title}]`, `[ar:${def.artist}]`];
  const gap = 4;
  let t = 2;
  let i = 0;
  while (t < def.durationSec - 3) {
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = (t % 60).toFixed(2).padStart(5, '0');
    out.push(`[${mm}:${ss}]${def.lines[i % def.lines.length]}`);
    t += gap;
    i++;
  }
  return out.join('\n');
}

const urlCache = new Map<string, string>();

function findDef(track: Track): MockDef {
  const def = DEFS.find((d) => d.id === sourceId(track));
  if (!def) throw new Error(`Không tìm thấy bài mock ${track.id}`);
  return def;
}

export const mockTracks: Track[] = DEFS.map(toTrack);

export const mockProvider: MusicProvider = {
  id: 'mock',
  label: 'Demo',
  async search(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return mockTracks;
    return mockTracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle));
  },
  async featured() {
    return mockTracks;
  },
  async getStreamUrl(track) {
    const cached = urlCache.get(track.id);
    if (cached) return cached;
    const url = URL.createObjectURL(synthesizeWavBlob(findDef(track)));
    urlCache.set(track.id, url);
    return url;
  },
  async getDownloadUrl(track) {
    return this.getStreamUrl(track);
  },
  async getLyrics(track) {
    return buildMockLrc(findDef(track));
  },
};
