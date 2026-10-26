import { useMemo, useState } from 'react';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { toast } from '@/components/toastStore';
import { useFeatures } from '@/features/analyze/featuresStore';
import { library } from '@/features/library/store';
import { useHistory } from '@/features/recommend/history';
import { MOOD_LABEL } from '@/features/recommend/mood';
import { BarList, Heatmap, StackedBar } from '@/features/stats/charts';
import { computeStats, localParts, periodFor, previousPeriod, type DeviceFilter, type RangeKind } from '@/features/stats/compute';
import { buildWrappedCards, formatMinutes, top50Name, tracksForTop, weekdayName } from '@/features/stats/wrapped';
import { WrappedViewer } from '@/features/stats/WrappedViewer';
import { cx } from '@/lib/utils';
import { useFolder } from '@/providers/folder';

const RANGES: Array<[RangeKind, string]> = [
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['year', 'Năm'],
  ['custom', 'Tùy chọn'],
];
const DEVICES: Array<[DeviceFilter, string]> = [
  ['all', 'Cả hai máy'],
  ['poco', 'Poco'],
  ['iphone', 'iPhone'],
];
const MOOD_COLOR: Record<string, string> = { 'soi-dong': '#f97316', chill: '#38bdf8', 'sau-lang': '#a78bfa', 'tap-trung': '#34d399', khac: '#94a3b8' };

const isoDay = (t: number) => {
  const p = localParts(t);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
const parseDay = (s: string, endOfDay = false) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d + (endOfDay ? 1 : 0)) - 7 * 3_600_000;
};

/** Thống kê nghe nhạc kiểu Wrapped, tính cục bộ từ lịch sử nghe (đã đồng bộ giữa các máy). */
export function StatsPage() {
  const events = useHistory((s) => s.events);
  const tracks = useFolder((s) => s.tracks);
  const features = useFeatures((s) => s.map);
  const [kind, setKind] = useState<RangeKind>('month');
  const [device, setDevice] = useState<DeviceFilter>('all');
  const now = useMemo(() => Date.now(), []);
  const [from, setFrom] = useState(() => isoDay(now - 30 * 86_400_000));
  const [to, setTo] = useState(() => isoDay(now));
  const [wrapped, setWrapped] = useState(false);

  const period = useMemo(() => periodFor(kind, now, kind === 'custom' ? { start: parseDay(from), end: parseDay(to, true) } : undefined), [kind, now, from, to]);
  const stats = useMemo(
    () => computeStats({ events, tracks, features, period, previous: previousPeriod(kind, period), device, now, top: 10 }),
    [events, tracks, features, period, kind, device, now],
  );

  const label =
    kind === 'week' ? 'Tuần này' : kind === 'month' ? `Tháng ${localParts(period.start).m + 1}/${localParts(period.start).y}` : kind === 'year' ? `Năm ${localParts(period.start).y}` : `${from} → ${to}`;
  const cards = useMemo(() => buildWrappedCards(stats, label), [stats, label]);
  const delta = stats.delta.minutes;

  const makeTop50 = async () => {
    const year = localParts(period.start).y;
    const big = computeStats({ events, tracks, features, period: periodFor('year', period.start), previous: previousPeriod('year', periodFor('year', period.start)), device: 'all', now, top: 50 });
    const list = tracksForTop(big, tracks, 50);
    if (!list.length) return toast('Chưa có bài nào trong top để tạo playlist');
    await library.createPlaylist(top50Name(year), list).then(() => toast(`Đã tạo “${top50Name(year)}” (${list.length} bài)`), () => undefined);
  };

  return (
    <div className="pb-10">
      <CollectionHeaderBack title="Thống kê" />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2" role="tablist" aria-label="Khoảng thời gian">
        {RANGES.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id} className={cx('chip shrink-0', kind === id && 'chip-active')} onClick={() => setKind(id)}>
            {name}
          </button>
        ))}
      </div>
      {kind === 'custom' && (
        <div className="flex items-center gap-2 px-4 pb-2 text-sm">
          <input type="date" aria-label="Từ ngày" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-md bg-surface-2 px-2" />
          <span>→</span>
          <input type="date" aria-label="Đến ngày" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-md bg-surface-2 px-2" />
        </div>
      )}
      <div className="flex gap-2 px-4 pb-3">
        {DEVICES.map(([id, name]) => (
          <button key={id} type="button" aria-pressed={device === id} className={cx('chip', device === id && 'chip-active')} onClick={() => setDevice(id)}>
            {name}
          </button>
        ))}
      </div>

      {stats.plays === 0 && stats.minutes === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">Chưa có lượt nghe nào trong khoảng này. Nghe thêm nhạc rồi quay lại nhé.</p>
      ) : (
        <div className="space-y-4 px-4">
          <section className="rounded-lg bg-surface-2 p-4" aria-label="Tổng quan">
            <p className="text-3xl font-bold">{formatMinutes(stats.minutes)}</p>
            <p className="text-sm text-muted">
              {stats.plays} lượt nghe · {stats.distinctTracks} bài khác nhau · bỏ qua {Math.round(stats.skipRate * 100)}%
            </p>
            {delta !== null && (
              <p className={cx('mt-1 text-sm', delta >= 0 ? 'text-accent' : 'text-red-300')}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% so với kỳ trước ({formatMinutes(stats.previous.minutes)})
              </p>
            )}
            <p className="mt-1 text-sm text-muted">
              Chuỗi ngày nghe liên tiếp: {stats.longestStreak} ngày (dài nhất) · đang {stats.currentStreak} ngày
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="chip chip-active" disabled={cards.length === 0} onClick={() => setWrapped(true)}>
                ✨ Xem Wrapped
              </button>
              <button type="button" className="chip" onClick={() => void makeTop50()}>
                Tạo playlist “Top 50 năm {localParts(period.start).y}”
              </button>
            </div>
          </section>

          <Block title="Top bài hát">
            <BarList items={stats.topTracks} />
          </Block>
          <Block title="Top nghệ sĩ">
            <BarList items={stats.topArtists} />
          </Block>
          <Block title="Top thể loại">
            <BarList items={stats.topGenres} empty="Nhạc chưa có tag thể loại" />
          </Block>
          <Block title="Top album">
            <BarList items={stats.topAlbums} empty="Nhạc chưa có tag album" />
          </Block>
          <Block title="Giờ nghe nhiều nhất">
            <Heatmap data={stats.heatmap} />
            {stats.busiest && (
              <p className="mt-2 text-sm text-muted">
                Nhiều nhất: {weekdayName(stats.busiest.weekday)} lúc {stats.busiest.hour}h
              </p>
            )}
          </Block>
          <Block title="Tâm trạng nhạc (ước lượng)">
            <StackedBar parts={stats.moods.map((m) => ({ label: MOOD_LABEL[m.mood], value: m.minutes, color: MOOD_COLOR[m.mood] }))} />
          </Block>
          <Block title="Nghệ sĩ mới phát hiện">
            <BarList items={stats.newArtists} empty="Chưa có nghệ sĩ mới trong kỳ này" />
          </Block>
        </div>
      )}
      {wrapped && <WrappedViewer cards={cards} onClose={() => setWrapped(false)} />}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface-2 p-4">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}
