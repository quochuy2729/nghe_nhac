/** Các kệ có sẵn của Trang chủ. Kệ mới: viết component ở file riêng rồi thêm một dòng vào shelves.ts. */
import { useMemo } from 'react';
import { buildMixes, describeSession, newestTracks, recentlyPlayedTracks, recommend } from '@/features/recommend/engine';
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

export function NewestShelf({ ctx }: { ctx: HomeContext }) {
  const tracks = useMemo(() => newestTracks(ctx.tracks), [ctx]);
  return <Shelf title="Mới thêm" tracks={tracks} />;
}
