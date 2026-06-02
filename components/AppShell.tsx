import React from 'react';
import { Typography } from './Typography';
import { useLanguage } from '../utils/i18n';
import { NotificationBell } from './NotificationBell';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import type { View } from '../types/inventory';

import { FaIcon } from './Icon';

type NavId = 'dashboard' | 'ordering' | 'backorder' | 'transfer' | 'kitting' | 'approval-queue' | 'report' | 'execution';
interface NavItem {
    id: NavId;
    label: string;
    icon: string;
    mobile: string;
}

const NAV_ITEMS = (t: (k: string) => string, role: string | undefined, inAnyWorkflow: boolean): NavItem[] => {
    const base: NavItem[] = [
        { id: 'dashboard', label: t('nav_dashboard') || 'Dashboard', icon: 'fa-chart-simple', mobile: 'Dashboard' },
        { id: 'ordering', label: t('nav_ordering') || 'Đặt hàng', icon: 'fa-cart-shopping', mobile: 'Đặt hàng' },
        { id: 'backorder', label: 'Nợ hàng', icon: 'fa-clock-rotate-left', mobile: 'Nợ hàng' },
        { id: 'transfer', label: t('nav_transfer') || 'Phân bổ', icon: 'fa-right-left', mobile: 'Phân bổ' },
        { id: 'kitting', label: t('nav_kitting') || 'Kitting', icon: 'fa-boxes-stacked', mobile: 'Kitting' },
        { id: 'report', label: 'Báo cáo', icon: 'fa-file-chart-line', mobile: 'Báo cáo' },
        { id: 'execution', label: 'Hàng về', icon: 'fa-truck-ramp-box', mobile: 'Hàng về' },
    ];
    // FIX 2026-05-21: cũng show nav nếu user xuất hiện trong bất kỳ workflow nào
    // (kể cả role viewer) — workflow membership = source of truth.
    const hasApprovalAccess = (role && ['admin', 'approver', 'planner'].includes(role)) || inAnyWorkflow;
    if (hasApprovalAccess) {
        base.push({ id: 'approval-queue', label: 'Phê duyệt', icon: 'fa-clipboard-check', mobile: 'Duyệt' });
    }
    return base;
};

export interface AppShellProps {
    view: View;
    isPending: boolean;
    isMobile: boolean;
    isMonthlyLoading: boolean;
    monthlyDataDate: string | null;
    profile: { role?: string; full_name?: string } | null;
    language: 'vi' | 'en';
    setLanguage: (l: 'vi' | 'en') => void;
    onSelectView: (v: View) => void;
    onOpenDataModal: () => void;
    onSignOut: () => void;
    children: React.ReactNode;
}

export const AppShell = ({
    view,
    isPending,
    isMobile,
    isMonthlyLoading,
    monthlyDataDate,
    profile,
    language,
    setLanguage,
    onSelectView,
    onOpenDataModal,
    onSignOut,
    children,
}: AppShellProps) => {
    const { t } = useLanguage();
    const { inAnyWorkflow } = useApprovalAuth();
    const navItems = NAV_ITEMS(t, profile?.role, inAnyWorkflow);

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] relative font-sans text-slate-800 overflow-x-clip">
            <header className="bg-gradient-professional border-b border-white/10 px-3 md:px-5 py-2 fixed top-0 left-0 right-0 z-50 shadow-glass print:hidden h-[56px] md:h-[64px] flex items-center">
                <div className="max-w-[1920px] mx-auto flex justify-between items-center gap-2 w-full">
                    <div
                        className="flex items-center space-x-2 md:space-x-3 cursor-pointer group shrink-0"
                        onClick={() => onSelectView('dashboard')}
                    >
                        <div className="bg-white/10 backdrop-blur-md text-white w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center border border-white/20 shadow-lg group-hover:scale-105 transition-transform">
                            <FaIcon className="fas fa-cubes text-sm md:text-lg text-blue-400" />
                        </div>
                        <div className="hidden lg:block">
                            <Typography
                                variant="label"
                                className="text-white !leading-none group-hover:text-blue-400 transition-colors font-bold uppercase tracking-widest"
                            >
                                {t('app_title')}
                            </Typography>
                            <Typography
                                variant="label"
                                className="text-[#F5F5F5] mt-0.5 !text-[9px] block opacity-80 font-medium supply-chain-data"
                            >
                                {t('app_subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-2">
                        {isMonthlyLoading ? (
                            <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 text-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse">
                                <FaIcon className="fas fa-sync fa-spin text-blue-400 text-xs" />
                                <span className="hidden xl:inline">Đang đồng bộ tháng...</span>
                                <span className="xl:hidden">...</span>
                            </div>
                        ) : (
                            <button
                                onClick={onOpenDataModal}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${
                                    monthlyDataDate
                                        ? 'bg-emerald-600/20 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-600/30'
                                        : 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
                                }`}
                                title={
                                    monthlyDataDate
                                        ? `Dữ liệu tháng: ${monthlyDataDate} — Click để chọn bản khác`
                                        : 'Chưa có dữ liệu tháng — Click để chọn'
                                }
                            >
                                <FaIcon
                                    className={
                                        monthlyDataDate
                                            ? 'fas fa-database'
                                            : 'fas fa-triangle-exclamation text-amber-300'
                                    }
                                />
                                <span className="hidden xl:inline">
                                    {monthlyDataDate
                                        ? `Dữ liệu Tháng: ${monthlyDataDate.split('-').reverse().join('/')}`
                                        : 'Chưa có d/l tháng'}
                                </span>
                                <span className="xl:hidden">
                                    {monthlyDataDate ? monthlyDataDate.split('-').reverse().join('/') : '!'}
                                </span>
                                <FaIcon className="fas fa-chevron-down text-[8px] opacity-50 ml-0.5" />
                            </button>
                        )}
                    </div>

                    <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar backdrop-blur-md shadow-inner">
                        {navItems.map(nav => {
                            const isActive = view === nav.id;
                            return (
                                <button
                                    key={nav.id}
                                    onClick={() => onSelectView(nav.id)}
                                    className={`px-2.5 md:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                                        isActive
                                            ? 'bg-white text-blue-700 shadow-[0_4px_12px_rgba(59,130,246,0.15)] ring-1 ring-blue-50/50 font-bold scale-[1.02]'
                                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                                    } ${isPending && nav.id !== view ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    <FaIcon className={`fas ${nav.icon} text-xs ${isActive ? 'text-blue-600' : ''}`} />
                                    <Typography
                                        variant="label"
                                        className={`hidden md:inline text-[10px] xl:text-xs ${isActive ? 'text-blue-700' : 'text-white/60'}`}
                                    >
                                        {nav.label}
                                    </Typography>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-1.5 md:gap-4 shrink-0">
                        <div className="lg-segmented rounded-lg p-1 hidden sm:flex items-center">
                            <button
                                onClick={() => setLanguage('vi')}
                                className={`w-8 h-7 rounded-md transition-all flex items-center justify-center ${language === 'vi' ? 'lg-active' : ''}`}
                            >
                                <Typography
                                    variant="label"
                                    className={language === 'vi' ? 'text-rose-600' : 'text-slate-400'}
                                >
                                    VI
                                </Typography>
                            </button>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`w-8 h-7 rounded-md transition-all flex items-center justify-center ${language === 'en' ? 'lg-active' : ''}`}
                            >
                                <Typography
                                    variant="label"
                                    className={language === 'en' ? 'text-blue-600' : 'text-slate-400'}
                                >
                                    EN
                                </Typography>
                            </button>
                        </div>

                        {((profile?.role && ['admin', 'approver', 'planner'].includes(profile.role)) ||
                            inAnyWorkflow) && <NotificationBell onNavigate={() => onSelectView('approval-queue')} />}
                        <button
                            onClick={() => onSelectView('settings')}
                            title="Cấu hình hệ thống"
                            className={`p-2 rounded-lg transition-all ${
                                view === 'settings'
                                    ? 'bg-purple-100/20 text-purple-400'
                                    : 'text-slate-400 hover:text-purple-400 hover:bg-purple-500/20'
                            }`}
                        >
                            <FaIcon className="fas fa-sliders text-base md:text-lg" />
                        </button>
                        <button
                            onClick={onSignOut}
                            title={`${profile?.full_name || 'User'} — Đăng xuất`}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg"
                        >
                            <FaIcon className="fas fa-power-off text-base md:text-lg" />
                        </button>
                    </div>
                </div>
            </header>

            <main
                className={`flex-1 max-w-[1920px] w-full mx-auto p-3 md:p-5 page-content-hd mt-[56px] md:mt-[64px] ${isMobile ? 'has-bottom-nav' : ''}`}
            >
                {children}
            </main>

            {isMobile && (
                <nav
                    className="bottom-nav-bar fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] flex items-stretch"
                    style={{ height: 56 }}
                >
                    {navItems.map(nav => {
                        const isActive = view === nav.id;
                        return (
                            <button
                                key={nav.id}
                                onClick={() => onSelectView(nav.id)}
                                className={`flex flex-col items-center justify-center w-16 h-full transition-colors relative ${
                                    isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                                } ${isPending && nav.id !== view ? 'opacity-50' : ''}`}
                            >
                                <FaIcon className={`fas ${nav.icon} text-base ${isActive ? 'text-blue-600' : ''}`} />
                                <span
                                    className={`text-[9px] font-black uppercase tracking-tight leading-none ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                                >
                                    {nav.mobile}
                                </span>
                                {isActive && (
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-t-full" />
                                )}
                            </button>
                        );
                    })}
                </nav>
            )}

            <footer
                className={`max-w-[1920px] w-full mx-auto px-5 py-4 mt-auto border-t border-slate-200/50 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-xs ${isMobile ? 'mb-20' : ''}`}
            >
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">
                            System Online
                        </span>
                    </div>
                    <span className="opacity-30">|</span>
                    <span className="font-medium">ATP Supply Chain v16 — Executive Intelligence</span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex gap-4">
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Documentation</span>
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Support</span>
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Privacy</span>
                    </div>
                    <span className="opacity-30 hidden md:inline">|</span>
                    <span className="text-slate-500 font-bold">© 2026 Auto Parts Governance</span>
                </div>
            </footer>
        </div>
    );
};
