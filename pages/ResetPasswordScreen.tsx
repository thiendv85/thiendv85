import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../utils/authContext';
import { Typography } from '../components/Typography';

import { FaIcon } from '../components/Icon';
export const ResetPasswordScreen = () => {
    const { clearPasswordReset, signOut } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            setError('Mật khẩu phải có ít nhất 6 ký tự.');
            return;
        }
        if (password !== confirm) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        setIsLoading(true);
        setError(null);
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) {
            setError(err.message);
            setIsLoading(false);
        } else {
            setSuccess(true);
            setTimeout(() => {
                clearPasswordReset();
            }, 2000);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>

            <div className="relative w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 mb-4 backdrop-blur-sm">
                        <FaIcon className="fas fa-key text-blue-400 text-2xl" />
                    </div>
                    <Typography variant="h1" className="text-white !text-3xl tracking-tight">
                        Đặt mật khẩu mới
                    </Typography>
                    <Typography variant="body" className="text-slate-400 mt-1">
                        ATP System
                    </Typography>
                </div>

                <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
                    {success ? (
                        <div className="text-center py-4">
                            <FaIcon className="fas fa-circle-check text-emerald-400 text-4xl mb-3" />
                            <p className="text-emerald-300 font-bold">Mật khẩu đã được cập nhật!</p>
                            <p className="text-slate-400 text-sm mt-1">Đang chuyển hướng...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Mật khẩu mới
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Tối thiểu 6 ký tự"
                                    required
                                    autoFocus
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Xác nhận mật khẩu
                                </label>
                                <input
                                    type="password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder="Nhập lại mật khẩu"
                                    required
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all font-medium"
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                                    <FaIcon className="fas fa-circle-exclamation text-rose-400" />
                                    <span className="text-rose-300 text-sm font-bold">{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading || !password || !confirm}
                                className="w-full py-3 flex items-center justify-center gap-2 text-sm mt-2 disabled:opacity-50 lg-btn lg-btn-blue lg-btn-lg lg-btn-full"
                            >
                                {isLoading ? (
                                    <>
                                        <FaIcon className="fas fa-circle-notch fa-spin" /> Đang lưu...
                                    </>
                                ) : (
                                    <>
                                        <FaIcon className="fas fa-floppy-disk" /> Lưu mật khẩu
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    clearPasswordReset();
                                    signOut();
                                }}
                                className="w-full text-slate-500 hover:text-slate-400 text-sm py-2"
                            >
                                Hủy, đăng xuất
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
