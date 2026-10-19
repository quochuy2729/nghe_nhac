import { ChevronLeftIcon } from './Icons';
import { useGoBack } from '@/lib/useGoBack';

export function CollectionHeaderBack({ title }: { title: string }) {
  const goBack = useGoBack();
  return (
    <header className="flex items-center gap-1 px-2 pb-2 pt-3">
      <button type="button" aria-label="Quay lại" className="icon-btn" onClick={goBack}>
        <ChevronLeftIcon size={28} />
      </button>
      <h1 className="text-xl font-bold">{title}</h1>
    </header>
  );
}
