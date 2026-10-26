/** Playlist thông minh (docs/ARCHITECTURE.md §3). Logic đánh giá luật ở `evaluate.ts` (G7). */
export type RuleField =
  | 'genre'
  | 'artist'
  | 'album'
  | 'year'
  | 'bpm'
  | 'mood'
  | 'folder'
  | 'liked'
  | 'plays'
  | 'lastPlayedDays'
  | 'addedDays';

export type RuleOp = 'is' | 'isNot' | 'contains' | 'gt' | 'lt' | 'between';

export interface Rule {
  field: RuleField;
  op: RuleOp;
  value: string | number | boolean | [number, number];
}

export type SmartSort = 'random' | 'added' | 'plays' | 'lastPlayed' | 'title';

export interface SmartPlaylist {
  id: string;
  name: string;
  rules: Rule[];
  match: 'all' | 'any';
  sort: SmartSort;
  limit?: number;
  updatedAt: number;
  /** xóa mềm: để máy kia biết mà xóa theo */
  deleted?: boolean;
}
