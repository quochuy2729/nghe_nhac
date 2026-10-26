/** Các kệ có sẵn của Trang chủ. Kệ mới: viết component ở file riêng rồi thêm một dòng vào shelves.ts. */
import { useMemo } from 'react';
import { buildMixes, describeSession, newestTracks, recentlyPlayedTracks, recommend } from '@/features/recommend/engine';
import { discoverInLibrary, intentMix, longTimeNoSee, moodMixes, onRepeat, timeMix } from '@/features/recommend/mixes';
import { Shelf } from './Shelf';
import type { HomeContext } from './shelves';

export function RecentShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => recentlyPlayedTracks(ctx.signals.events, ctx.tracks), [ctx]);
  return <Shelf title="Nghe gần đây" tracks={tracks} />;
}

export function ForYouShelf({ ctx }: { ctx: HomeContext }) {
  const { tracks, reason } = useMemo(() => {
    const r = describeSession(ctx.signals);
    return {
      tracks: recommend(ctx.signals, { limit: 20 }).map((x) => x.track),
      reason: r
        ? r.kind === 'artist'
          ? `Vì bạn đang nghe ${r.name}`
          : `Bạn đang nghe nhiều nhạc ${r.name}`
        : ctx.signals.events.length
          ? 'Hợp với gu của bạn'
          : 'Gợi ý ngẫu nhiên, nghe nhiều hơn để gợi ý sát hơn',
    };
  }, [ctx]);
  return <Shelf title="Dành cho bạn" subtitle={reason} tracks={tracks} />;
}

export function MixesShelf({ ctx }: { ctx: HomeContext }) {
  const mixes = useMemo(() => buildMixes(ctx.signals), [ctx]);
  return (
    <>
      {mixes.map((m) => (
        <Shelf key={m.id} title={m.title} tracks={m.tracks} />
      ))}
    </>
  );
}

/** "Đang muốn nghe": chỉ hiện khi đang trong một phiên nghe và đã có đặc trưng âm thanh. */
export function IntentShelf({ ctx }: { ctx: HomeContext }) {
  const mix = useMemo(() => intentMix(ctx.signals), [ctx]);
  return mix ? <Shelf title="Đang muốn nghe" subtitle={mix.chip} tracks={mix.tracks} /> : null;
}

export function TimeMixShelf({ ctx }: { ctx: HomeContext }) {
  const mix = useMemo(() => timeMix(ctx.signals), [ctx]);
  return mix ? <Shelf title={mix.title} subtitle="Theo những gì bạn hay nghe giờ này" tracks={mix.tracks} /> : null;
}

export function MoodMixesShelf({ ctx }: { ctx: HomeContext }) {
  const mixes = useMemo(() => moodMixes(ctx.tracks, ctx.signals.features ?? new Map(), Math.random), [ctx]);
  return (
    <>
      {mixes.map((m) => (
        <Shelf key={m.id} title={m.title} subtitle="Tâm trạng ước lượng từ âm thanh" tracks={m.tracks} />
      ))}
    </>
  );
}

export function OnRepeatShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => onRepeat(ctx.signals), [ctx]);
  return <Shelf title="On Repeat" subtitle="Nghe nhiều nhất 30 ngày qua" tracks={tracks} />;
}

export function LongTimeShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => longTimeNoSee(ctx.signals), [ctx]);
  return <Shelf title="Lâu rồi chưa nghe" subtitle="Bài bạn từng nghe nhiều" tracks={tracks} />;
}

export function DiscoverShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => (ctx.signals.events.length ? discoverInLibrary(ctx.signals) : []), [ctx]);
  return <Shelf title="Khám phá trong thư viện" subtitle="Ít nghe nhưng hợp gu" tracks={tracks} />;
}

export function NewestShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => newestTracks(ctx.tracks), [ctx]);
  return <Shelf title="Mới thêm" tracks={tracks} />;
}
