import { EQ_BANDS_HZ, EQ_LIMIT_DB, EQ_PRESET_LABELS, EQ_PRESETS, presetFor } from '@/features/listening/logic';
import { useListening } from '@/features/listening/settings';
import { platform } from '@/platform';
import { cx } from '@/lib/utils';

const hzLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));

/**
 * Trải nghiệm nghe: EQ, chuẩn hóa âm lượng, crossfade. Mục nào nền tảng không hỗ trợ thì ẩn (iPhone ẩn cả khối).
 */
export default function ListeningSection() {
  const caps = platform.caps;
  const s = useListening();
  if (!caps.eq && !caps.normalize && !caps.crossfade) return null;
  const preset = presetFor(s.eqBands);

  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 text-lg font-bold">Trải nghiệm nghe</h2>
      <div className="divide-y divide-white/10 rounded-lg bg-surface-2 text-sm">
        {caps.eq && (
          <div className="p-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                Equalizer
                <span className="block text-xs text-muted">5 băng tần · đồng bộ giữa các máy</span>
              </span>
              <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#2dd4bf]" checked={s.eqEnabled} onChange={(e) => s.setEqEnabled(e.target.checked)} aria-label="Bật equalizer" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(EQ_PRESETS) as Array<keyof typeof EQ_PRESETS>).map((id) => (
                <button key={id} type="button" onClick={() => s.setEqPreset(id)} className={cx('chip', s.eqEnabled && preset === id && 'chip-active')}>
                  {EQ_PRESET_LABELS[id]}
                </button>
              ))}
              <span className={cx('chip pointer-events-none', s.eqEnabled && preset === 'custom' && 'chip-active')}>{EQ_PRESET_LABELS.custom}</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {EQ_BANDS_HZ.map((hz, i) => (
                <label key={hz} className="flex flex-col items-center gap-1 text-xs text-muted">
                  <input
                    type="range"
                    min={-EQ_LIMIT_DB}
                    max={EQ_LIMIT_DB}
                    step={1}
                    value={s.eqBands[i] ?? 0}
                    onChange={(e) => {
                      const next = s.eqBands.slice();
                      next[i] = Number(e.target.value);
                      s.setEqBands(next);
                    }}
                    aria-label={`Băng ${hzLabel(hz)} Hz`}
                    className="h-28 w-8 accent-[#2dd4bf] [writing-mode:vertical-lr] [direction:rtl]"
                  />
                  <span>{hzLabel(hz)}</span>
                  <span className="text-white/70">{(s.eqBands[i] ?? 0) > 0 ? '+' : ''}{s.eqBands[i] ?? 0} dB</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {caps.normalize && (
          <label className="flex items-center justify-between gap-3 p-4">
            <span>
              Chuẩn hóa âm lượng
              <span className="block text-xs text-muted">Các bài to nhỏ khác nhau về gần cùng mức (cần bài đã được phân tích).</span>
            </span>
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#2dd4bf]" checked={s.normalize} onChange={(e) => s.setNormalize(e.target.checked)} aria-label="Chuẩn hóa âm lượng" />
          </label>
        )}
        {caps.crossfade && (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span>
                Crossfade
                <span className="block text-xs text-muted">Chuyển bài mượt; bỏ qua với hai bài liền nhau trong cùng album.</span>
              </span>
              <span className="text-accent">{s.crossfadeSec === 0 ? 'Tắt' : `${s.crossfadeSec} giây`}</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={s.crossfadeSec}
              onChange={(e) => s.setCrossfade(Number(e.target.value))}
              aria-label="Thời lượng crossfade"
              className="mt-2 h-11 w-full accent-[#2dd4bf]"
            />
          </div>
        )}
      </div>
    </section>
  );
}
