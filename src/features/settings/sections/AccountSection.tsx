import { AuthPanel } from '@/features/auth/AuthPanel';

export default function AccountSection() {
  return (
    <section className="px-4">
      <h2 className="mb-2 mt-2 text-lg font-bold">Tài khoản</h2>
      <AuthPanel />
    </section>
  );
}
