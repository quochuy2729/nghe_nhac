import { Suspense } from 'react';
import { CollectionHeaderBack } from '@/components/BackHeader';
import { settingsSections } from '@/features/settings/sections';

export function SettingsPage() {
  return (
    <div className="pb-6">
      <CollectionHeaderBack title="Cài đặt" />
      {settingsSections.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <Component />
        </Suspense>
      ))}
      <p className="mt-6 px-4 text-xs text-muted">Nghe Nhạc v{__APP_VERSION__}. Phát nhạc có sẵn trong điện thoại của bạn.</p>
    </div>
  );
}
