import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../utils/authContext';
import { Typography } from '../components/Typography';
import { useLanguage } from '../utils/i18n';

export const ResetPasswordScreen = () => {
    const { clearPasswordReset, signOut } = useAuth();
    const { t } = useLanguage();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) { setError(t('reset_pw_min_chars')); return; }
        if (password !== confirm) { setError(t('reset_pw_mismatch')); return; }
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
                        <i className="fas fa-key text-blue-400 text-2xl"></i>
                    </div>
                    <Typography variant="h1" className="text-white !text-3xl tracking-tight">{t('reset_pw_title')}</Typography>
                    <Typography variant="body" className="text-slate-400 mt-1">ATP System</Typography>
                </div>

                <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
                    {success ? (
                        <div className="text-center py-4">
                            <i className="fas fa-circle-check text-emerald-400 text-4xl mb-3"></i>
                            <p className="text-emerald-300 font-bold">{t('reset_pw_success')}</p>
                            <p className="text-slate-400 text-sm mt-1">{t('reset_pw_redirecting')}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('reset_pw_new')}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t('reset_pw_placeholder')}
                                    required
                                    autoFocus
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('reset_pw_confirm')}</label>
                                <input
                                    type="password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder={t('reset_pw_confirm_placeholder')}
                                    required
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all font-medium"
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                                    <i className="fas fa-circle-exclamation text-rose-400"></i>
                                    <span className="text-rose-300 text-sm font-bold">{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading || !password || !confirm}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-black py-3 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-sm mt-2"
                            >
                                {isLoading ? (
                                    <><i className="fas fa-circle-notch fa-spin"></i> {t('reset_pw_saving')}</>
                                ) : (
                                    <><i className="fas fa-floppy-disk"></i> {t('reset_pw_save')}</>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { clearPasswordReset(); signOut(); }}
                                className="w-full text-slate-500 hover:text-slate-400 text-sm py-2"
                            >
                                {t('reset_pw_cancel')}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
