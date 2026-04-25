import React, { useState } from 'react';
import { useAuth } from '../utils/authContext';

export const LoginScreen = () => {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        setIsLoading(true);
        setError(null);
        try {
            const { error: err } = await signIn(email.trim(), password);
            if (err) {
                console.error("LoginScreen: Sign in failed:", err);
                setError('Email hoặc mật khẩu không đúng.');
            } else {
                console.log("LoginScreen: Sign in success, triggering animation and unmount...");
                setLoginSuccess(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-900 font-sans">

            {/* ─── Background ───────────────────────────────────────────────────── */}
            <div className="absolute inset-0 z-0">
                <img
                    src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=80&w=2832&auto=format&fit=crop"
                    alt=""
                    className="w-full h-full object-cover opacity-60 mix-blend-overlay"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900/70" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
            </div>

            {/* ─── Success Transition Overlay ───────────────────────────────────── */}
            {loginSuccess && (
                <div className="absolute inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop darkens AFTER icon shown (delay 0.4s) */}
                    <div className="absolute inset-0 bg-slate-900" style={{ animation: 'lgFadeBlack 0.6s ease-out 0.4s both' }} />
                    {/* Success content */}
                    <div className="relative z-10 flex flex-col items-center gap-5" style={{ animation: 'lgScaleIn 0.4s ease-out both' }}>
                        <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.3)]">
                            <i className="fas fa-check text-emerald-400 text-4xl" />
                        </div>
                        <div className="text-center">
                            <p className="text-white font-black text-xl tracking-widest uppercase">Xác thực thành công</p>
                            <p className="text-slate-400 text-sm mt-1">Đang chuyển đến trang nhập dữ liệu...</p>
                        </div>
                        <div className="flex gap-2">
                            {[0, 150, 300].map(d => (
                                <span key={d} className="w-2 h-2 rounded-full bg-blue-400" style={{ animation: `lgBounce 1s ${d}ms infinite` }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Main Layout ──────────────────────────────────────────────────── */}
            <div
                className="relative z-10 w-full max-w-6xl px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
                style={{ animation: loginSuccess ? 'lgFadeOut 0.35s ease-out both' : 'lgFadeIn 0.7s ease-out both' }}
            >

                {/* ── Left: Branding ──────────────────────────────────────────── */}
                <div className="lg:col-span-7 text-white space-y-8">
                    {/* Status badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_#60a5fa]" />
                        Hệ thống Sẵn sàng
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] drop-shadow-xl">
                        Auto Parts <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 animate-gradient-x">
                            Governance
                        </span>
                    </h1>

                    <div className="flex items-center gap-3 pl-1">
                        <div className="w-12 h-[3px] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" />
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                            Procurement & Inventory <br />
                            <span className="text-slate-500">Premium Cars Spare Parts</span>
                        </p>
                    </div>

                    <p className="text-slate-300 text-lg font-medium max-w-lg leading-relaxed border-l-4 border-slate-700/50 pl-6">
                        Hệ thống phân tích tồn kho chuyên sâu. Tối ưu hóa mức tồn kho, phát hiện rủi ro và tự động hóa quy trình đặt hàng với độ chính xác cao.
                    </p>

                    {/* Feature pills */}
                    <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-white/5">
                        {[
                            { icon: 'fa-chart-pie', color: 'bg-gradient-blue shadow-blue-500/20', label: 'Real-time', sub: 'Analytics' },
                            { icon: 'fa-robot', color: 'bg-gradient-emerald shadow-emerald-500/20', label: 'AI Driven', sub: 'Forecast' },
                            { icon: 'fa-shield-halved', color: 'bg-gradient-rose shadow-rose-500/20', label: 'Risk Control', sub: 'Governance' },
                        ].map(f => (
                            <div key={f.label} className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                                <div className={`w-8 h-8 rounded-lg ${f.color} flex items-center justify-center text-white shadow-lg`}>
                                    <i className={`fas ${f.icon}`} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white">{f.label}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{f.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Right: Login Card ──────────────────────────────────────────── */}
                <div className="lg:col-span-5" style={{ animation: loginSuccess ? '' : 'lgFadeIn 0.7s ease-out 0.15s both' }}>
                    <div className={`bg-white/10 backdrop-blur-xl border rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group transition-all duration-500 ${
                        loginSuccess
                            ? 'border-emerald-400/50 shadow-[0_0_60px_rgba(52,211,153,0.25)]'
                            : 'border-white/20'
                    }`}>
                        {/* Decorative glow orbs */}
                        <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] group-hover:bg-blue-500/30 transition-all duration-1000 pointer-events-none" />
                        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/20 rounded-full blur-[80px] group-hover:bg-purple-500/30 transition-all duration-1000 pointer-events-none" />

                        <div className="relative z-10 space-y-6">
                            {/* Card title */}
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className={`w-1.5 h-6 rounded-full bg-gradient-to-b transition-colors duration-500 ${loginSuccess ? 'from-emerald-400 to-emerald-600' : 'from-blue-400 to-purple-400'}`} />
                                    {loginSuccess ? 'Xác thực thành công' : 'Đăng nhập hệ thống'}
                                </h3>
                                <p className="text-slate-400 text-xs font-medium mt-1 pl-3.5">
                                    {loginSuccess ? 'Đang chuyển đến trang nhập dữ liệu...' : 'Nhập tài khoản để truy cập hệ thống'}
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Email */}
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        <i className="fas fa-envelope mr-1.5 opacity-60" />Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        required
                                        autoFocus
                                        disabled={isLoading || loginSuccess}
                                        className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none transition-all font-medium disabled:opacity-40"
                                    />
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        <i className="fas fa-lock mr-1.5 opacity-60" />Mật khẩu
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        disabled={isLoading || loginSuccess}
                                        className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none transition-all font-medium disabled:opacity-40"
                                    />
                                </div>

                                {/* Error message */}
                                {error && (
                                    <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                                        <i className="fas fa-circle-exclamation text-rose-400 shrink-0" />
                                        <span className="text-rose-300 text-sm font-bold">{error}</span>
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isLoading || loginSuccess || !email || !password}
                                    className={`w-full font-black py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-sm border shadow-lg ${
                                        loginSuccess
                                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 cursor-default'
                                            : isLoading
                                            ? 'bg-blue-600/40 border-blue-400/20 text-white/60 cursor-wait'
                                            : email && password
                                            ? 'bg-blue-600 hover:bg-blue-500 border-blue-400/40 text-white hover:shadow-[0_0_30px_rgba(59,130,246,0.35)]'
                                            : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                                    }`}
                                >
                                    {loginSuccess ? (
                                        <><i className="fas fa-check" /> Đăng nhập thành công</>
                                    ) : isLoading ? (
                                        <><i className="fas fa-circle-notch fa-spin" /> Đang xác thực...</>
                                    ) : (
                                        <><i className="fas fa-arrow-right-to-bracket" /> Bắt đầu phân tích →</>
                                    )}
                                </button>
                            </form>

                            {/* Footer */}
                            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                <i className="fas fa-circle-info text-slate-600 text-xs shrink-0" />
                                <p className="text-slate-600 text-xs">Liên hệ Admin để được cấp tài khoản.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Keyframes ────────────────────────────────────────────────────── */}
            <style>{`
                @keyframes lgFadeIn  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
                @keyframes lgFadeOut { from { opacity:1; transform:scale(1); }        to { opacity:0; transform:scale(0.96); } }
                @keyframes lgFadeBlack { from { opacity:0; } to { opacity:1; } }
                @keyframes lgScaleIn { from { opacity:0; transform:scale(0.75); } to { opacity:1; transform:scale(1); } }
                @keyframes lgBounce  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-7px); } }
            `}</style>
        </div>
    );
};
