import { fakeTrack } from '@/test/fixtures';
import {
  buildFolderTree,
  filterGroups,
  findDuplicates,
  findFolder,
  flattenFolder,
  groupAlbums,
  groupArtists,
  groupGenres,
  sortGroups,
  sortTracksBy,
  splitArtists,
} from './browse';

const t = (n: number, extra = {}) => fakeTrack(n, extra);

describe('splitArtists', () => {
  it('tách feat./&/dấu phẩy, giữ chữ hoa, bỏ trùng và "Không rõ nghệ sĩ"', () => {
    expect(splitArtists('Mỹ Tâm feat. Hà Anh Tuấn')).toEqual(['Mỹ Tâm', 'Hà Anh Tuấn']);
    expect(splitArtists('A & B, C ft. a')).toEqual(['A', 'B', 'C']);
    expect(splitArtists('Không rõ nghệ sĩ')).toEqual([]);
    expect(splitArtists(undefined)).toEqual([]);
    expect(splitArtists('Tool')).toEqual(['Tool']);
  });
});

describe('groupArtists', () => {
  it('bài feat. xuất hiện ở cả hai nghệ sĩ; không rõ nghệ sĩ gom vào một nhóm', () => {
    const tracks = [t(1, { artist: 'Mỹ Tâm feat. Hà Anh Tuấn' }), t(2, { artist: 'Hà Anh Tuấn' }), t(3, { artist: 'Không rõ nghệ sĩ' })];
    const g = groupArtists(tracks);
    const by = Object.fromEntries(g.map((x) => [x.name, x.tracks.map((y) => y.id)]));
    expect(by['Mỹ Tâm']).toEqual(['folder:1']);
    expect(by['Hà Anh Tuấn']).toEqual(['folder:1', 'folder:2']);
    expect(by['Không rõ nghệ sĩ']).toEqual(['folder:3']);
  });

  it('gộp "Hà Anh Tuấn" và "ha anh tuan" (không phân biệt dấu/hoa thường)', () => {
    const g = groupArtists([t(1, { artist: 'Hà Anh Tuấn' }), t(2, { artist: 'ha anh tuan' })]);
    expect(g).toHaveLength(1);
    expect(g[0].tracks).toHaveLength(2);
  });

  it('nghệ sĩ album ưu tiên, nghệ sĩ khách mời của bài vẫn được ghi nhận', () => {
    const g = groupArtists([t(1, { albumArtist: 'Sơn Tùng', artist: 'Sơn Tùng feat. Snoop Dogg' })]);
    expect(g.map((x) => x.name).sort()).toEqual(['Snoop Dogg', 'Sơn Tùng']);
  });
});

describe('groupAlbums / groupGenres', () => {
  it('album cùng tên của hai nghệ sĩ được tách và gắn tên nghệ sĩ', () => {
    const g = groupAlbums([
      t(1, { album: 'Greatest Hits', artist: 'A' }),
      t(2, { album: 'Greatest Hits', artist: 'B' }),
      t(3, { album: 'Greatest Hits', artist: 'A' }),
      t(4, { album: 'Solo', artist: 'A' }),
      t(5, {}), // không có album
    ]);
    expect(g.map((x) => x.name).sort()).toEqual(['Greatest Hits · A', 'Greatest Hits · B', 'Solo']);
    expect(g.find((x) => x.name === 'Greatest Hits · A')!.tracks).toHaveLength(2);
  });

  it('thể loại: bài nhiều thể loại nằm ở từng nhóm', () => {
    const g = groupGenres([t(1, { genre: ['Pop', 'Indie'] }), t(2, { genre: ['pop'] }), t(3, {})]);
    expect(g.find((x) => x.key === 'pop')!.tracks).toHaveLength(2);
    expect(g.find((x) => x.key === 'indie')!.tracks).toHaveLength(1);
  });
});

describe('sắp xếp / lọc', () => {
  const groups = [
    { key: 'b', name: 'Bình', tracks: [t(1), t(2), t(3)] },
    { key: 'a', name: 'Anh', tracks: [t(4)] },
    { key: 'd', name: 'Đông', tracks: [t(5), t(6)] },
  ];
  it('nhóm theo tên (tiếng Việt) hoặc số bài', () => {
    expect(sortGroups(groups, 'name').map((g) => g.name)).toEqual(['Anh', 'Bình', 'Đông']);
    expect(sortGroups(groups, 'count').map((g) => g.name)).toEqual(['Bình', 'Đông', 'Anh']);
  });
  it('lọc không dấu', () => {
    expect(filterGroups(groups, 'dong').map((g) => g.name)).toEqual(['Đông']);
    expect(filterGroups(groups, '').length).toBe(3);
  });
  it('bài theo tên / nghệ sĩ / mới thêm / thời lượng / năm', () => {
    const list = [
      t(1, { title: 'Zeta', artist: 'B', addedAt: 1, durationSec: 100, year: 2000 }),
      t(2, { title: 'Alpha', artist: 'C', addedAt: 3, durationSec: 300, year: 2020 }),
      t(3, { title: 'Mu', artist: 'A', addedAt: 2, durationSec: 200 }),
    ];
    const ids = (s: Parameters<typeof sortTracksBy>[1]) => sortTracksBy(list, s).map((x) => x.id);
    expect(ids('title')).toEqual(['folder:2', 'folder:3', 'folder:1']);
    expect(ids('artist')).toEqual(['folder:3', 'folder:1', 'folder:2']);
    expect(ids('added')).toEqual(['folder:2', 'folder:3', 'folder:1']);
    expect(ids('duration')).toEqual(['folder:2', 'folder:3', 'folder:1']);
    expect(ids('year')).toEqual(['folder:2', 'folder:1', 'folder:3']);
    expect(list.map((x) => x.id)).toEqual(['folder:1', 'folder:2', 'folder:3']); // không đổi mảng gốc
  });
});

describe('cây thư mục', () => {
  const tracks = [
    t(1, { folder: 'Nhạc/Pop' }),
    t(2, { folder: 'Nhạc/Pop' }),
    t(3, { folder: 'Nhạc/Pop/Live' }),
    t(4, { folder: 'Nhạc' }),
    t(5, { folder: 'Podcast' }),
    t(6, {}), // chọn file lẻ, không có thư mục
  ];
  const root = buildFolderTree(tracks);

  it('đếm bài trực tiếp và cả cây con, thư mục sắp theo tên', () => {
    expect(root.total).toBe(6);
    expect(root.tracks.map((x) => x.id)).toEqual(['folder:6']);
    expect(root.children.map((c) => c.name)).toEqual(['Nhạc', 'Podcast']);
    const nhac = findFolder(root, 'Nhạc')!;
    expect(nhac.total).toBe(4);
    expect(nhac.tracks.map((x) => x.id)).toEqual(['folder:4']);
    expect(findFolder(root, 'Nhạc/Pop')!.children.map((c) => c.name)).toEqual(['Live']);
  });

  it('flatten lấy cả thư mục con; đường dẫn không tồn tại → null', () => {
    expect(flattenFolder(findFolder(root, 'Nhạc/Pop')!).map((x) => x.id).sort()).toEqual(['folder:1', 'folder:2', 'folder:3']);
    expect(findFolder(root, 'Khong/Co')).toBeNull();
    expect(findFolder(root, '')).toBe(root);
  });
});

describe('findDuplicates', () => {
  it('cùng tên + nghệ sĩ (không phân biệt hoa/dấu) khác id', () => {
    const d = findDuplicates([
      t(1, { title: 'Hãy Trao Cho Anh', artist: 'Sơn Tùng M-TP' }),
      t(2, { title: 'hay trao cho anh', artist: 'Sơn Tùng M-TP feat. Snoop Dogg' }),
      t(3, { title: 'Khác', artist: 'X' }),
      t(4, { title: 'Hãy Trao Cho Anh', artist: 'Người khác' }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].tracks.map((x) => x.id)).toEqual(['folder:1', 'folder:2']);
  });
  it('cùng một id lặp lại không tính là trùng', () => {
    expect(findDuplicates([t(1), t(1)])).toEqual([]);
  });
});
