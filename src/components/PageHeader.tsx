import type { ReactNode } from 'react';

export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-4 pb-2 pt-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {right}
    </header>
  );
}
