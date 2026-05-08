import React from 'react';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: unknown;
}

const RELOAD_THROTTLE_MS = 10_000;

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isChunkError =
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk');

    if (!isChunkError) return;

    const lastReload = sessionStorage.getItem('last_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > RELOAD_THROTTLE_MS) {
      sessionStorage.setItem('last_chunk_reload', now.toString());
      window.location.reload();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const err = this.state.error;
    const errStr = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err);
    return (
      <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center font-mono">
        <h1 className="text-2xl font-bold mb-4 text-rose-500">RUNTIME ERROR DETECTED</h1>
        <pre className="bg-slate-800 p-4 rounded-xl border border-slate-700 max-w-full overflow-auto text-xs mb-4">
          {errStr}
        </pre>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 rounded-lg font-bold">
          RELOAD APP
        </button>
        <p className="text-xs text-slate-500 mt-4">
          If the error persists, please try clearing your browser cache (Ctrl+F5).
        </p>
      </div>
    );
  }
}
