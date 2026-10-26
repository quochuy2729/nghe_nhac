/** Biểu đồ SVG tự viết (không thêm thư viện chart). */
import { weekdayName, formatMinutes } from './wrapped';
import type { RankItem } from './compute';

const SHORT_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Heatmap 7 ngày × 24 giờ; độ đậm theo phút nghe. */
export function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  const cell = 12;
  const gap = 2;
  const left = 22;
  const top = 14;
  const w = left + 24 * (cell + gap);
  const h = top + 7 * (cell + gap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Biểu đồ nhiệt giờ nghe theo thứ trong tuần" className="w-full">
      {[0, 6, 12, 18].map((hr) => (
        <text key={hr} x={left + hr * (cell + gap)} y={9} fontSize={8} fill="currentColor" opacity={0.6}>
          {hr}h
        </text>
      ))}
      {data.map((row, d) => (
        <g key={d}>
          <text x={0} y={top + d * (cell + gap) + cell - 2} fontSize={8} fill="currentColor" opacity={0.6}>
            {SHORT_DAYS[d]}
          </text>
          {row.map((v, hr) => (
            <rect key={hr} x={left + hr * (cell + gap)} y={top + d * (cell + gap)} width={cell} height={cell} rx={2} fill="#2dd4bf" opacity={v === 0 ? 0.07 : 0.18 + 0.82 * (v / max)}>
              <title>{`${weekdayName(d)} ${hr}h: ${formatMinutes(v)}`}</title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Danh sách xếp hạng với thanh ngang theo phút nghe. */
export function BarList({ items, empty = 'Chưa có dữ liệu' }: { items: RankItem[]; empty?: string }) {
  if (!items.length) return <p className="py-3 text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.minutes), 1);
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-2 text-muted">{i + 1}</span>
              {it.name}
              {it.subtitle ? <span className="text-muted"> · {it.subtitle}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted">{formatMinutes(it.minutes)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (it.minutes / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Thanh tỷ lệ nhiều đoạn (phân bố mood). */
export function StackedBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="py-3 text-sm text-muted">Cần phân tích âm thanh để biết tâm trạng nhạc bạn nghe.</p>;
  return (
    <div>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="Phân bố tâm trạng" className="h-3 w-full overflow-hidden rounded-full">
        {parts.reduce<{ x: number; els: JSX.Element[] }>(
          (acc, p) => {
            const w = (p.value / total) * 100;
            acc.els.push(
              <rect key={p.label} x={acc.x} y={0} width={w} height={8} fill={p.color}>
                <title>{`${p.label}: ${Math.round((p.value / total) * 100)}%`}</title>
              </rect>,
            );
            acc.x += w;
            return acc;
          },
          { x: 0, els: [] },
        ).els}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label} {Math.round((p.value / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
