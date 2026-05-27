import React from 'react';

interface Props {
    children: React.ReactNode;
    /** When this key changes, the boundary resets (useful for page-level boundaries). */
    resetKey?: string;
    /** Optional compact fallback for page sections instead of full-screen error. */
    compact?: boolean;
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
            message.includes('Failed to fetch dynamically imported module') || message.includes('Loading chunk');

        if (!isChunkError) return;

        const lastReload = sessionStorage.getItem('last_chunk_reload');
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > RELOAD_THROTTLE_MS) {
            sessionStorage.setItem('last_chunk_reload', now.toString());
            window.location.reload();
        }
    }

    componentDidUpdate(prevProps: Props) {
        if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: null });
        }
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        const err = this.state.error;
        const errStr = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err);

        if (this.props.compact) {
            return (
                <div className="p-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-rose-50 text-rose-700 px-4 py-3 rounded-2xl border border-rose-200 text-sm font-bold mb-3">
                        <span>⚠</span> Lỗi hiển thị trang
                    </div>
                    <pre className="bg-slate-100 p-3 rounded-xl text-xs text-slate-600 max-w-lg mx-auto overflow-auto mb-3">
                        {errStr.slice(0, 300)}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                    >
                        Thử lại
                    </button>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center font-mono">
                <h1 className="text-2xl font-bold mb-4 text-rose-500">RUNTIME ERROR DETECTED</h1>
                <pre className="bg-slate-800 p-4 rounded-xl border border-slate-700 max-w-full overflow-auto text-xs mb-4">
                    {errStr}
                </pre>
                <button onClick={() => window.location.reload()} className="px-6 py-2 lg-btn lg-btn-blue">
                    RELOAD APP
                </button>
                <p className="text-xs text-slate-500 mt-4">
                    If the error persists, please try clearing your browser cache (Ctrl+F5).
                </p>
            </div>
        );
    }
}
