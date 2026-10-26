import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { toast } from '@/components/toastStore';
import { useFeatures } from '@/features/analyze/featuresStore';
import { useLibrary } from '@/features/library/store';
import { player } from '@/features/player/store';
import { useHistory } from '@/features/recommend/history';
import { MOOD_LABEL } from '@/features/recommend/mood';
import { evaluateRules, NUMBER_FIELDS, opsFor } from '@/features/smart/evaluate';
import { deleteSmart, upsertSmart, useSmart } from '@/features/smart/store';
import type { Rule, RuleField, RuleOp, SmartPlaylist } from '@/features/smart/types';
import { useFolder } from '@/providers/folder';

const FIELD_LABEL: Record<RuleField, string> = {
  genre: 'Thể loại',
  artist: 'Nghệ sĩ',
  album: 'Album',
  year: 'Năm',
  bpm: 'BPM',
  mood: 'Tâm trạng',
  folder: 'Thư mục',
  liked: 'Đã thích',
  plays: 'Số lần nghe',
  lastPlayedDays: 'Số ngày chưa nghe',
  addedDays: 'Số ngày từ lúc thêm',
};
const OP_LABEL: Record<RuleOp, string> = { is: 'là', isNot: 'không phải', contains: 'chứa', gt: 'lớn hơn', lt: 'nhỏ hơn', between: 'trong khoảng' };
const SORT_LABEL: Record<SmartPlaylist['sort'], string> = { random: 'Ngẫu nhiên', added: 'Mới thêm', plays: 'Nghe nhiều', lastPlayed: 'Nghe gần đây', title: 'Tên bài' };

const defaultRule = (): Rule => ({ field: 'genre', op: 'is', value: '' });

/** Đổi trường thì chọn lại toán tử/giá trị hợp lệ. */
function withField(field: RuleField): Rule {
  const op = opsFor(field)[0];
  if (field === 'liked') return { field, op, value: true };
  if (field === 'mood') return { field, op, value: 'chill' };
  return { field, op, value: NUMBER_FIELDS.includes(field) ? 0 : '' };
}

function withOp(rule: Rule, op: RuleOp): Rule {
  if (op === 'between') return { ...rule, op, value: Array.isArray(rule.value) ? rule.value : [Number(rule.value) || 0, (Number(rule.value) || 0) + 10] };
  return { ...rule, op, value: Array.isArray(rule.value) ? rule.value[0] : rule.value };
}

/** Trình tạo luật + xem trước số bài khớp (cập nhật ngay khi sửa). */
export function SmartEditPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const existing = useSmart((s) => s.lists.find((p) => p.id === id));
  const loaded = useSmart((s) => s.loaded);
  const tracks = useFolder((s) => s.tracks);
  const events = useHistory((s) => s.events);
  const liked = useLibrary((s) => s.liked);
  const features = useFeatures((s) => s.map);

  const [name, setName] = useState('Playlist thông minh');
  const [rules, setRules] = useState<Rule[]>([defaultRule()]);
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [sort, setSort] = useState<SmartPlaylist['sort']>('random');
  const [limit, setLimit] = useState('');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setRules(existing.rules);
    setMatch(existing.match);
    setSort(existing.sort);
    setLimit(existing.limit ? String(existing.limit) : '');
  }, [existing]);

  const draft = { rules, match, sort, ...(Number(limit) > 0 ? { limit: Number(limit) } : {}) };
  const result = useMemo(
    () => evaluateRules(tracks, draft, { now: Date.now(), liked: new Set(liked.map((t) => t.id)), events, features, rng: () => 0.5 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, rules, match, sort, limit, events, liked, features],
  );

  if (id !== 'new' && loaded && !existing) return <p className="p-8 text-center text-muted">Không tìm thấy playlist thông minh này.</p>;

  const setRule = (i: number, r: Rule) => setRules((rs) => rs.map((x, k) => (k === i ? r : x)));

  const save = async () => {
    const newId = await upsertSmart({ id: existing?.id, name: name.trim() || 'Playlist thông minh', ...draft });
    toast('Đã lưu');
    if (!existing) navigate(`/library/smart/${newId}`, { replace: true });
  };

  return (
    <div className="pb-8">
      <CollectionHeaderBack title={existing ? 'Sửa playlist thông minh' : 'Playlist thông minh mới'} />
      <div className="space-y-4 px-4">
        <label className="block text-xs text-muted">
          Tên
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="mt-1 h-11 w-full rounded-md bg-surface-2 px-3 text-base text-white outline-none focus:ring-2 focus:ring-accent" />
        </label>

        <div className="flex items-center gap-2 text-sm">
          <span>Khớp</span>
          <select aria-label="Điều kiện ghép luật" value={match} onChange={(e) => setMatch(e.target.value as 'all' | 'any')} className="h-11 rounded-md bg-surface-2 px-2">
            <option value="all">tất cả luật</option>
            <option value="any">một trong các luật</option>
          </select>
        </div>

        <ul className="space-y-3">
          {rules.map((r, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-surface-2 p-3">
              <div className="flex gap-2">
                <select aria-label="Trường" value={r.field} onChange={(e) => setRule(i, withField(e.target.value as RuleField))} className="h-11 min-w-0 flex-1 rounded-md bg-canvas px-2 text-sm">
                  {(Object.keys(FIELD_LABEL) as RuleField[]).map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </select>
                <select aria-label="Toán tử" value={r.op} onChange={(e) => setRule(i, withOp(r, e.target.value as RuleOp))} className="h-11 rounded-md bg-canvas px-2 text-sm">
                  {opsFor(r.field).map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="Xóa luật" className="icon-btn text-muted" onClick={() => setRules((rs) => rs.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
              <ValueInput rule={r} onChange={(nr) => setRule(i, nr)} />
            </li>
          ))}
        </ul>
        <button type="button" className="chip" onClick={() => setRules((rs) => [...rs, defaultRule()])}>
          + Thêm luật
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span>Sắp xếp</span>
          <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value as SmartPlaylist['sort'])} className="h-11 rounded-md bg-surface-2 px-2">
            {(Object.keys(SORT_LABEL) as Array<SmartPlaylist['sort']>).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <span>Tối đa</span>
          <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="∞" aria-label="Số bài tối đa" className="h-11 w-20 rounded-md bg-surface-2 px-3 text-base" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="chip chip-active h-11" onClick={() => void save()}>
            Lưu
          </button>
          <button type="button" className="chip h-11" disabled={!result.length} onClick={() => player.playTracks(result, 0, name)}>
            Phát ({result.length})
          </button>
          {existing && (
            <button
              type="button"
              className="chip ml-auto h-11"
              onClick={async () => {
                if (!window.confirm(`Xóa playlist thông minh “${existing.name}”?`)) return;
                await deleteSmart(existing);
                navigate('/library/smart', { replace: true });
              }}
            >
              Xóa
            </button>
          )}
        </div>
        <p role="status" className="text-sm text-muted">
          Xem trước: <span className="font-semibold text-white">{result.length}</span> bài khớp
          {rules.length === 0 && ' (thêm ít nhất một luật)'}
        </p>
      </div>
      {result.length > 0 && <VirtualTrackList tracks={result.slice(0, 200)} context={name} />}
    </div>
  );
}

function ValueInput({ rule, onChange }: { rule: Rule; onChange: (r: Rule) => void }) {
  const cls = 'h-11 w-full rounded-md bg-canvas px-3 text-base text-white outline-none focus:ring-2 focus:ring-accent';
  if (rule.field === 'liked') {
    return (
      <select aria-label="Giá trị" value={String(rule.value === true || rule.value === 'true')} onChange={(e) => onChange({ ...rule, value: e.target.value === 'true' })} className={cls}>
        <option value="true">Đã thích</option>
        <option value="false">Chưa thích</option>
      </select>
    );
  }
  if (rule.field === 'mood') {
    return (
      <select aria-label="Giá trị" value={String(rule.value)} onChange={(e) => onChange({ ...rule, value: e.target.value })} className={cls}>
        {Object.entries(MOOD_LABEL)
          .filter(([m]) => m !== 'khac')
          .map(([m, label]) => (
            <option key={m} value={m}>
              {label} (cần phân tích âm thanh)
            </option>
          ))}
      </select>
    );
  }
  if (rule.op === 'between' && Array.isArray(rule.value)) {
    const [a, b] = rule.value;
    return (
      <div className="flex items-center gap-2">
        <input inputMode="numeric" aria-label="Từ" value={a} onChange={(e) => onChange({ ...rule, value: [Number(e.target.value) || 0, b] })} className={cls} />
        <span className="text-muted">–</span>
        <input inputMode="numeric" aria-label="Đến" value={b} onChange={(e) => onChange({ ...rule, value: [a, Number(e.target.value) || 0] })} className={cls} />
      </div>
    );
  }
  const numeric = NUMBER_FIELDS.includes(rule.field);
  return (
    <input
      aria-label="Giá trị"
      inputMode={numeric ? 'numeric' : 'text'}
      value={String(rule.value)}
      onChange={(e) => onChange({ ...rule, value: numeric ? Number(e.target.value.replace(/[^\d.-]/g, '')) || 0 : e.target.value })}
      placeholder={numeric ? '0' : 'Nhập giá trị'}
      className={cls}
    />
  );
}
