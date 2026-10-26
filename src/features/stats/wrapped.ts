/** Thẻ Wrapped (5–6 thẻ toàn màn hình) dựng từ số liệu thống kê — hàm thuần, vẽ PNG ở `card.ts`. */
import type { Track } from '@/providers/types';
import { MOOD_LABEL } from '@/features/recommend/mood';
import type { Stats } from './compute';

export interface WrappedCard {
  id: string;
  /** dòng nhỏ phía trên */
  kicker: string;
  /** chữ lớn */
  headline: string;
  sub?: string;
  items?: string[];
  /** gradient [từ, đến] */
  colors: [string, string];
}

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export const weekdayName = (i: number): string => WEEKDAYS[i] ?? '';

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} phút`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

const num = (n: number) => n.toLocaleString('vi-VN');

export function buildWrappedCards(s: Stats, label: string): WrappedCard[] {
  const cards: WrappedCard[] = [];
  const diff = s.delta.minutes;
  cards.push({
    id: 'total',
    kicker: label,
    headline: `${num(Math.round(s.minutes))} phút`,
    sub: `${num(s.plays)} lượt nghe · ${num(s.distinctTracks)} bài khác nhau` + (diff === null ? '' : ` · ${diff >= 0 ? '+' : ''}${diff}% so với kỳ trước`),
    colors: ['#0f766e', '#134e4a'],
  });
  const t = s.topTracks[0];
  if (t) {
    cards.push({
      id: 'top-track',
      kicker: 'Bài nghe nhiều nhất',
      headline: t.name,
      sub: [t.subtitle, `${t.plays} lượt · ${formatMinutes(t.minutes)}`].filter(Boolean).join(' · '),
      items: s.topTracks.slice(1, 5).map((x, i) => `${i + 2}. ${x.name}`),
      colors: ['#7c3aed', '#312e81'],
    });
  }
  const a = s.topArtists[0];
  if (a) {
    cards.push({
      id: 'top-artist',
      kicker: 'Nghệ sĩ của bạn',
      headline: a.name,
      sub: formatMinutes(a.minutes),
      items: s.topArtists.slice(1, 5).map((x, i) => `${i + 2}. ${x.name}`),
      colors: ['#be185d', '#4c0519'],
    });
  }
  if (s.topGenres.length) {
    const mood = s.moods[0];
    cards.push({
      id: 'genres',
      kicker: 'Gu âm nhạc',
      headline: s.topGenres[0].name,
      sub: mood ? `Tâm trạng nổi bật (ước lượng): ${MOOD_LABEL[mood.mood]}` : undefined,
      items: s.topGenres.slice(0, 5).map((g, i) => `${i + 1}. ${g.name} · ${formatMinutes(g.minutes)}`),
      colors: ['#b45309', '#451a03'],
    });
  }
  if (s.busiest) {
    cards.push({
      id: 'habits',
      kicker: 'Thói quen nghe',
      headline: `${weekdayName(s.busiest.weekday)}, ${s.busiest.hour}h`,
      sub: 'là lúc bạn nghe nhiều nhất',
      items: [`Chuỗi ngày nghe liên tiếp dài nhất: ${s.longestStreak} ngày`, `Tỷ lệ bỏ qua bài: ${Math.round(s.skipRate * 100)}%`],
      colors: ['#1d4ed8', '#172554'],
    });
  }
  if (s.newArtists.length) {
    cards.push({
      id: 'discover',
      kicker: 'Mới phát hiện',
      headline: `${s.newArtists.length} nghệ sĩ mới`,
      sub: 'lần đầu bạn nghe trong kỳ này',
      items: s.newArtists.slice(0, 5).map((x, i) => `${i + 1}. ${x.name}`),
      colors: ['#047857', '#022c22'],
    });
  }
  return cards;
}

/** Top `limit` bài của kỳ (theo thời gian nghe) còn có trong thư viện — dùng tạo playlist "Top 50 năm YYYY". */
export function tracksForTop(s: Pick<Stats, 'topTracks'>, library: readonly Track[], limit = 50): Track[] {
  const byId = new Map(library.map((t) => [t.id, t]));
  return s.topTracks.flatMap((r) => (r.trackId && byId.has(r.trackId) ? [byId.get(r.trackId)!] : [])).slice(0, limit);
}

export const top50Name = (year: number): string => `Top 50 năm ${year}`;

/** Ngắt dòng theo độ rộng đo được (dùng khi vẽ canvas). */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
