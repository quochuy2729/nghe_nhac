import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { VirtualList } from '@/components/VirtualList';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { toast } from '@/components/toastStore';
import {
  buildFolderTree,
  filterGroups,
  findDuplicates,
  findFolder,
  flattenFolder,
  groupPath,
  groupAlbums,
  groupArtists,
  groupGenres,
  sortGroups,
  sortTracksBy,
  type Group,
  type GroupSort,
  type TrackSort,
} from '@/features/library/browse';
import { usePlaylistPicker } from '@/features/library/trackMenuStore';
import { library } from '@/features/library/store';
import { useTagEditor } from '@/features/library/tagEditorStore';
import { player } from '@/features/player/store';
import { cx, formatTime } from '@/lib/utils';
import { useDebounced } from '@/lib/useDebounced';
import { searchTracks, useFolder } from '@/providers/folder';
import type { Track } from '@/providers/types';

const TABS = [
  ['songs', 'Bài hát'],
  ['albums', 'Album'],
  ['artists', 'Nghệ sĩ'],
  ['genres', 'Thể loại'],
  ['folders', 'Thư mục'],
  ['dups', 'Trùng bài'],
] as const;
type Tab = (typeof TABS)[number][0];

const TRACK_SORTS: Array<[TrackSort, string]> = [
  ['title', 'Tên bài'],
  ['artist', 'Nghệ sĩ'],
  ['added', 'Mới thêm'],
  ['duration', 'Thời lượng'],
  ['year', 'Năm'],
];

/** Thư viện nhạc trên máy: bài hát · album · nghệ sĩ · thể loại · thư mục · bài trùng; sắp xếp, lọc, chọn nhiều bài. */
export function BrowsePage() {
  const tracks = useFolder((s) => s.tracks);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'songs') as Tab;
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 200);
  const [trackSort, setTrackSort] = useState<TrackSort>('title');
  const [groupSort, setGroupSort] = useState<GroupSort>('name');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [folderPath, setFolderPath] = useState('');

  const filtered = useMemo(() => sortTracksBy(searchTracks(tracks, q), trackSort), [tracks, q, trackSort]);
  const groups = useMemo<Group[]>(() => {
    const base = tab === 'albums' ? groupAlbums(tracks) : tab === 'artists' ? groupArtists(tracks) : tab === 'genres' ? groupGenres(tracks) : [];
    return sortGroups(filterGroups(base, q), groupSort);
  }, [tracks, tab, q, groupSort]);
  const tree = useMemo(() => buildFolderTree(tracks), [tracks]);
  const dups = useMemo(() => (tab === 'dups' ? findDuplicates(tracks) : []), [tracks, tab]);

  const setTab = (t: Tab) => {
    setParams({ tab: t }, { replace: true });
    setQuery('');
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const chosen = tracks.filter((t) => selected.has(t.id));
  const selection = selecting ? { selected, toggle } : undefined;

  return (
    <div>
      <CollectionHeaderBack title="Thư viện nhạc" />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('chip shrink-0', tab === id && 'chip-active')}>
            {label}
          </button>
        ))}
      </div>

      {tab !== 'folders' && tab !== 'dups' && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'songs' ? 'Lọc bài hát…' : 'Lọc…'}
            aria-label="Lọc"
            className="h-11 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
          />
          {tab === 'songs' ? (
            <select aria-label="Sắp xếp" value={trackSort} onChange={(e) => setTrackSort(e.target.value as TrackSort)} className="h-11 rounded-md bg-surface-2 px-2 text-sm">
              {TRACK_SORTS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <select aria-label="Sắp xếp" value={groupSort} onChange={(e) => setGroupSort(e.target.value as GroupSort)} className="h-11 rounded-md bg-surface-2 px-2 text-sm">
              <option value="name">Theo tên</option>
              <option value="count">Nhiều bài nhất</option>
            </select>
          )}
        </div>
      )}

      {tab === 'songs' && (
        <>
          <div className="flex items-center justify-between px-4 pb-2 text-xs text-muted">
            <span>{filtered.length} bài</span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setSelecting((v) => !v);
                setSelected(new Set());
              }}
            >
              {selecting ? 'Xong' : 'Chọn nhiều'}
            </button>
          </div>
          {selecting && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-canvas/95 px-4 py-2 backdrop-blur">
              <span className="text-sm font-semibold">{selected.size} đã chọn</span>
              <button type="button" className="chip" onClick={() => setSelected(new Set(filtered.map((t) => t.id)))}>
                Chọn tất cả
              </button>
              <button type="button" className="chip" disabled={!chosen.length} onClick={() => usePlaylistPicker.getState().open(chosen)}>
                + Playlist
              </button>
              <button
                type="button"
                className="chip"
                disabled={!chosen.length}
                onClick={() => {
                  player.playNext(chosen);
                  toast('Sẽ phát tiếp theo');
                }}
              >
                Phát tiếp
              </button>
              <button
                type="button"
                className="chip"
                disabled={!chosen.length}
                onClick={() => {
                  player.enqueue(chosen);
                  toast('Đã thêm vào hàng đợi');
                }}
              >
                Vào hàng đợi
              </button>
              <button
                type="button"
                className="chip"
                disabled={!chosen.length}
                onClick={async () => {
                  const todo = chosen.filter((t) => !library.isLiked(t.id));
                  for (const t of todo) await library.toggleLike(t);
                  toast(`Đã thích ${todo.length} bài`);
                }}
              >
                ♥ Thích
              </button>
              <button type="button" className="chip" disabled={!chosen.length} onClick={() => useTagEditor.getState().open(chosen.map((t) => t.id))}>
                Sửa tag
              </button>
            </div>
          )}
          {filtered.length === 0 ? <Empty text={tracks.length ? 'Không có bài nào khớp.' : 'Chưa có nhạc trên máy này.'} /> : <VirtualTrackList tracks={filtered} context="Thư viện" selection={selection} />}
        </>
      )}

      {(tab === 'albums' || tab === 'artists' || tab === 'genres') &&
        (groups.length === 0 ? (
          <Empty text={tab === 'albums' ? 'Chưa có bài nào có tag album.' : 'Không có mục nào khớp.'} />
        ) : (
          <VirtualList
            label={tab}
            count={groups.length}
            rowHeight={68}
            renderRow={(i) => {
              const g = groups[i];
              const art = g.tracks.find((t) => t.artworkUrl)?.artworkUrl;
              return (
                <Link to={groupPath(tab, g.key)} role="listitem" className="flex h-[68px] items-center gap-3 px-4 active:bg-white/5">
                  <Artwork src={art} className="h-14 w-14" rounded={tab === 'artists' ? 'rounded-full' : 'rounded'} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-sm text-muted">{g.tracks.length} bài</span>
                  </span>
                </Link>
              );
            }}
          />
        ))}

      {tab === 'folders' && (
        <FolderTab
          tree={tree}
          path={folderPath}
          onOpen={setFolderPath}
        />
      )}

      {tab === 'dups' && <Dups groups={dups} />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{text}</p>;
}

function FolderTab({ tree, path, onOpen }: { tree: ReturnType<typeof buildFolderTree>; path: string; onOpen: (p: string) => void }) {
  const node = findFolder(tree, path) ?? tree;
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const all = useMemo(() => flattenFolder(node), [node]);
  const sorted = useMemo(() => sortTracksBy(node.tracks, 'title'), [node]);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pb-2">
        <p className="min-w-0 truncate text-sm text-muted">{path || 'Tất cả thư mục'}</p>
        <div className="flex shrink-0 gap-2">
          {path && (
            <button type="button" className="chip" onClick={() => onOpen(parent)}>
              ← Lên
            </button>
          )}
          {all.length > 0 && (
            <button type="button" className="chip chip-active" onClick={() => player.playTracks(all, 0, path || 'Thư viện')}>
              Phát cả thư mục
            </button>
          )}
        </div>
      </div>
      <ul>
        {node.children.map((c) => (
          <li key={c.path}>
            <button type="button" onClick={() => onOpen(c.path)} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-white/5">
              <span aria-hidden className="text-xl">📁</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block text-xs text-muted">{c.total} bài</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sorted.length > 0 && <VirtualTrackList tracks={sorted} context={path || 'Thư viện'} />}
      {!node.children.length && !sorted.length && <Empty text="Thư mục trống." />}
    </div>
  );
}

function Dups({ groups }: { groups: Group[] }) {
  const [shown, setShown] = useState(30);
  if (!groups.length) return <Empty text="Không có bài nào bị trùng 🎉" />;
  return (
    <div className="px-4">
      <p className="pb-3 text-sm text-muted">{groups.length} nhóm bài cùng tên + nghệ sĩ nhưng là file khác nhau (vd hai bản chất lượng khác nhau). Tự chọn bản muốn giữ.</p>
      {groups.slice(0, shown).map((g) => (
        <section key={g.key} className="mb-4 rounded-lg bg-surface-2 p-3">
          <h3 className="mb-1 truncate font-semibold">{g.name}</h3>
          <ul>
            {g.tracks.map((t: Track) => (
              <li key={t.id} className="flex items-center gap-2 py-1">
                <button type="button" className="min-w-0 flex-1 text-left active:opacity-70" onClick={() => player.playTracks([t], 0, g.name)}>
                  <span className="block truncate text-sm">{t.folder || 'Không rõ thư mục'}</span>
                  <span className="block text-xs text-muted">
                    {formatTime(t.durationSec)}
                    {t.album ? ` · ${t.album}` : ''}
                  </span>
                </button>
                <button type="button" className="chip" onClick={() => player.playTracks([t], 0, g.name)}>
                  Nghe
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {shown < groups.length && (
        <button type="button" className="chip mb-6" onClick={() => setShown((n) => n + 30)}>
          Hiện thêm
        </button>
      )}
    </div>
  );
}
