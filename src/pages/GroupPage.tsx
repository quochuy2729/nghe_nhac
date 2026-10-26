import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { CollectionHeader } from '@/components/CollectionHeader';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { groupAlbums, groupArtists, groupGenres, sortTracksBy } from '@/features/library/browse';
import { player } from '@/features/player/store';
import { formatTime } from '@/lib/utils';
import { useFolder } from '@/providers/folder';

const KINDS = { albums: 'Album', artists: 'Nghệ sĩ', genres: 'Thể loại' } as const;

/** Chi tiết một album / nghệ sĩ / thể loại. */
export function GroupPage() {
  const { kind = '', key = '' } = useParams();
  const tracks = useFolder((s) => s.tracks);
  const status = useFolder((s) => s.status);

  const group = useMemo(() => {
    const groups = kind === 'albums' ? groupAlbums(tracks) : kind === 'artists' ? groupArtists(tracks) : kind === 'genres' ? groupGenres(tracks) : [];
    return groups.find((g) => g.key === key);
  }, [tracks, kind, key]);

  if (!group) {
    return <p className="p-8 text-center text-muted">{status === 'loading' ? 'Đang tải…' : 'Không tìm thấy mục này (có thể đã bị xóa hoặc đổi tag).'}</p>;
  }
  const sorted = sortTracksBy(group.tracks, kind === 'albums' ? 'year' : 'title');
  const total = group.tracks.reduce((a, t) => a + t.durationSec, 0);
  const art = group.tracks.find((t) => t.artworkUrl)?.artworkUrl;

  return (
    <div>
      <CollectionHeader
        title={group.name}
        subtitle={`${KINDS[kind as keyof typeof KINDS] ?? 'Nhóm'} · ${group.tracks.length} bài · ${formatTime(total)}`}
        gradient="#2b3a55"
        cover={<Artwork src={art} className="h-48 w-48 shadow-2xl" rounded={kind === 'artists' ? 'rounded-full' : 'rounded-lg'} />}
        onPlay={() => player.playTracks(sorted, 0, group.name, { shuffle: false })}
        onShuffle={() => player.playTracks(sorted, 0, group.name, { shuffle: true })}
      />
      <VirtualTrackList tracks={sorted} context={group.name} />
    </div>
  );
}
