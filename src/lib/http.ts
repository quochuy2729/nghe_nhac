export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** fetch JSON có timeout; lỗi mạng được đổi thành thông báo tiếng Việt. */
export async function getJson<T>(url: string, { timeoutMs = 12000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new HttpError(`Máy chủ trả lỗi ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (signal?.aborted) throw err;
    if ((err as Error).name === 'AbortError') throw new Error('Hết thời gian chờ máy chủ');
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Không có kết nối mạng');
    throw new Error('Không kết nối được máy chủ');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
