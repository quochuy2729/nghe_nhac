/**
 * Duyệt thư viện (G7): nhóm theo album / nghệ sĩ / thể loại / thư mục, sắp xếp, lọc, tìm bài trùng.
 * Toàn bộ là hàm thuần trên mảng Track.
 */
import { normalizeText } from '@/lib/text';
import type { Track } from '@/providers/types';

const UNKNOWN = normalizeText('Không rõ nghệ sĩ');

export interface Group {
  key: string;
  name: string;
  tracks: Track[];
}

/** "A feat. B & C" → ["A", "B", "C"] giữ nguyên chữ hoa để hiển thị. */
export function splitArtists(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.replace(/[()[\]]/g, ' ').split(/\s*[,&;/+]\s*|\s+(?:feat\.?|ft\.?|x|và|with)\s+/i)) {
    const name = part.trim();
    if (name && normalizeText(name) !== UNKNOWN && !out.some((o) => normalizeText(o) === normalizeText(name))) out.push(name);
  }
  return out;
}

function push(map: Map<string, Group>, key: string, name: string, t: Track) {
  const g = map.get(key);
  if (g) g.tracks.push(t);
  else map.set(key, { key, name, tracks: [t] });
}

/** Mỗi bài thuộc mọi nghệ sĩ có tên trong tag (nghệ sĩ album ưu tiên hơn nghệ sĩ bài). */
export function groupArtists(tracks: readonly Track[]): Group[] {
  const m = new Map<string, Group>();
  for (const t of tracks) {
    const names = splitArtists(t.albumArtist || t.artist);
    const all = new Set(names.map(normalizeText));
    for (const extra of splitArtists(t.artist)) if (!all.has(normalizeText(extra))) names.push(extra);
    if (!names.length) push(m, '', 'Không rõ nghệ sĩ', t);
    for (const n of names) push(m, normalizeText(n), n, t);
  }
  return [...m.values()];
}

/** Album = tên album + nghệ sĩ album (đầu tiên), để hai album trùng tên của hai nghệ sĩ không bị gộp. */
export function groupAlbums(tracks: readonly Track[]): Group[] {
  const m = new Map<string, Group>();
  for (const t of tracks) {
    if (!t.album) continue;
    const by = splitArtists(t.albumArtist || t.artist)[0] ?? '';
    push(m, `${normalizeText(t.album)}|${normalizeText(by)}`, t.album, t);
  }
  const groups = [...m.values()];
  // Tên album trùng giữa các nghệ sĩ khác nhau thì kèm tên nghệ sĩ để phân biệt.
  const dup = new Map<string, number>();
  for (const g of groups) dup.set(normalizeText(g.name), (dup.get(normalizeText(g.name)) ?? 0) + 1);
  return groups.map((g) => {
    const by = splitArtists(g.tracks[0].albumArtist || g.tracks[0].artist)[0];
    return dup.get(normalizeText(g.name))! > 1 && by ? { ...g, name: `${g.name} · ${by}` } : g;
  });
}

export function groupGenres(tracks: readonly Track[]): Group[] {
  const m = new Map<string, Group>();
  for (const t of tracks) for (const g of t.genre ?? []) push(m, normalizeText(g), g, t);
  return [...m.values()];
}

export type GroupSort = 'name' | 'count';

/** Đường dẫn trang chi tiết một nhóm (kind: albums | artists | genres). */
export const groupPath = (kind: string, key: string): string => `/library/group/${kind}/${encodeURIComponent(key)}`;

export function sortGroups(groups: Group[], sort: GroupSort): Group[] {
  const out = groups.slice();
  return sort === 'count'
    ? out.sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name, 'vi'))
    : out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function filterGroups(groups: Group[], query: string): Group[] {
  const q = normalizeText(query);
  return q ? groups.filter((g) => normalizeText(g.name).includes(q)) : groups;
}

export type TrackSort = 'title' | 'artist' | 'added' | 'duration' | 'year';

export function sortTracksBy(tracks: readonly Track[], sort: TrackSort): Track[] {
  const out = tracks.slice();
  const text = (a: string, b: string) => a.localeCompare(b, 'vi');
  switch (sort) {
    case 'artist':
      return out.sort((a, b) => text(a.artist, b.artist) || text(a.title, b.title));
    case 'added':
      return out.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case 'duration':
      return out.sort((a, b) => b.durationSec - a.durationSec);
    case 'year':
      return out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || text(a.title, b.title));
    default:
      return out.sort((a, b) => text(a.title, b.title));
  }
}

/* ───────── Cây thư mục ───────── */

export interface FolderNode {
  name: string;
  /** đường dẫn đầy đủ, vd "Nhạc/Pop" ("" = gốc) */
  path: string;
  children: FolderNode[];
  /** bài nằm trực tiếp trong thư mục này */
  tracks: Track[];
  /** tổng số bài trong cả cây con */
  total: number;
}

export function buildFolderTree(tracks: readonly Track[]): FolderNode {
  const root: FolderNode = { name: '', path: '', children: [], tracks: [], total: 0 };
  for (const t of tracks) {
    let node = root;
    node.total++;
    const parts = (t.folder ?? '').split('/').filter(Boolean);
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, children: [], tracks: [], total: 0 };
        node.children.push(child);
      }
      child.total++;
      node = child;
    }
    node.tracks.push(t);
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function findFolder(root: FolderNode, path: string): FolderNode | null {
  if (!path) return root;
  let node: FolderNode | undefined = root;
  for (const part of path.split('/')) {
    node = node.children.find((c) => c.name === part);
    if (!node) return null;
  }
  return node;
}

/** Mọi bài trong thư mục và các thư mục con. */
export function flattenFolder(node: FolderNode): Track[] {
  return [...node.tracks, ...node.children.flatMap(flattenFolder)];
}

/* ───────── Bài trùng ───────── */

/** Các nhóm ≥ 2 bài cùng tên + nghệ sĩ chính nhưng khác id (vd hai bản chất lượng khác nhau). */
export function findDuplicates(tracks: readonly Track[]): Group[] {
  const m = new Map<string, Group>();
  for (const t of tracks) {
    const by = splitArtists(t.artist)[0] ?? '';
    push(m, `${normalizeText(t.title)}|${normalizeText(by)}`, `${t.title} — ${t.artist}`, t);
  }
  return [...m.values()].filter((g) => new Set(g.tracks.map((t) => t.id)).size > 1).sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name, 'vi'));
}
