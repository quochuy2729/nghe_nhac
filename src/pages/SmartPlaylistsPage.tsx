import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { useFeatures } from '@/features/analyze/featuresStore';
import { useLibrary } from '@/features/library/store';
import { useHistory } from '@/features/recommend/history';
import { evaluateRules, SMART_TEMPLATES } from '@/features/smart/evaluate';
import { upsertSmart, useSmart } from '@/features/smart/store';
import { useFolder } from '@/providers/folder';

/** Danh sách playlist thông minh + mẫu tạo nhanh. */
export function SmartPlaylistsPage() {
  const lists = useSmart((s) => s.lists);
  const tracks = useFolder((s) => s.tracks);
  const events = useHistory((s) => s.events);
  const liked = useLibrary((s) => s.liked);
  const features = useFeatures((s) => s.map);
  const navigate = useNavigate();

  const counts = useMemo(() => {
    const ctx = { now: Date.now(), liked: new Set(liked.map((t) => t.id)), events, features };
    return new Map(lists.map((p) => [p.id, evaluateRules(tracks, p, ctx).length]));
  }, [lists, tracks, events, liked, features]);

  return (
    <div>
      <CollectionHeaderBack title="Playlist thông minh" />
      <p className="px-4 pb-3 text-sm text-muted">Tự cập nhật theo luật bạn đặt (thể loại, BPM, số lần nghe, ngày thêm…).</p>
      <div className="px-4 pb-3">
        <Link to="/library/smart/new" className="chip chip-active">
          + Tạo playlist thông minh
        </Link>
      </div>

      {lists.length > 0 && (
        <ul>
          {lists.map((p) => (
            <li key={p.id}>
              <Link to={`/library/smart/${p.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-2 active:bg-white/5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gradient-to-br from-fuchsia-700 to-indigo-400 text-xl">✨</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-sm text-muted">
                    {counts.get(p.id) ?? 0} bài · {p.rules.length} luật
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="px-4 pb-2 pt-5 text-sm font-semibold text-muted">Mẫu có sẵn</h2>
      <ul>
        {SMART_TEMPLATES.map((t) => (
          <li key={t.name}>
            <button
              type="button"
              className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left active:bg-white/5"
              onClick={async () => navigate(`/library/smart/${await upsertSmart({ ...t })}`)}
            >
              <span>{t.name}</span>
              <span className="chip">Thêm</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
