import { CollectionHeaderBack } from '@/components/BackHeader';
import { AuthPanel } from '@/features/auth/AuthPanel';
import { hasJamendo, hasSupabase } from '@/lib/env';

export function SettingsPage() {
  return (
    <div className="pb-6">
      <CollectionHeaderBack title="Cài đặt" />
      <section className="px-4">
        <h2 className="mb-2 mt-2 text-lg font-bold">Tài khoản</h2>
        <AuthPanel />
      </section>
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Nguồn nhạc</h2>
        <ul className="divide-y divide-white/10 rounded-lg bg-surface-2 text-sm">
          <li className="flex justify-between p-4">
            <span>Jamendo (nhạc Creative Commons)</span>
            <span className={hasJamendo ? 'text-accent' : 'text-muted'}>{hasJamendo ? 'Đã bật' : 'Chưa có key · dùng Demo'}</span>
          </li>
          <li className="flex justify-between p-4">
            <span>Audius</span>
            <span className="text-accent">Không cần key</span>
          </li>
          <li className="flex justify-between p-4">
            <span>Đồng bộ (Supabase)</span>
            <span className={hasSupabase ? 'text-accent' : 'text-muted'}>{hasSupabase ? 'Đã cấu hình' : 'Chế độ khách'}</span>
          </li>
        </ul>
      </section>
      <p className="mt-6 px-4 text-xs text-muted">Nghe Nhạc v{__APP_VERSION__}. Chỉ phát nhạc từ nguồn được phép và file của bạn.</p>
    </div>
  );
}
