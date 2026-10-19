import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Bắt lỗi render để app không trắng màn hình. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[Nghe Nhạc] render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-bold">Có lỗi xảy ra</p>
        <p className="text-sm text-muted">{this.state.error.message}</p>
        <button type="button" className="chip chip-active" onClick={() => window.location.reload()}>
          Tải lại ứng dụng
        </button>
      </div>
    );
  }
}
