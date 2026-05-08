import React from 'react';
import { ApprovalRequest } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { useLanguage } from '../utils/i18n';

import { FaIcon } from './Icon';
interface Props {
    request: ApprovalRequest;
    rowsCount: number;
    totals: {
        air: number;
        sea: number;
        value: number;
        oos: number;
        risk: number;
    };
    hasChanges: boolean;
    proposerName: string;
    onClose: () => void;
}

export const OrderSummaryHeader: React.FC<Props> = ({ 
    request, 
    rowsCount, 
    totals, 
    hasChanges, 
    proposerName, 
    onClose 
}) => {
    const { t } = useLanguage();
    return (
        <div
            className="relative flex items-center gap-4 px-5 py-0 text-white shrink-0 h-14 overflow-hidden"
            style={{ background: 'linear-gradient(to right, #0f172a 0%, #1e293b 25%, #0f2744 55%, #1e293b 80%, #0f172a 100%)' }}
        >
            {/* Subtle glow orb behind pills */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[480px] h-10 rounded-full opacity-10 blur-2xl"
                    style={{ background: 'radial-gradient(ellipse, #3b82f6 0%, #6366f1 50%, transparent 80%)' }} />
            </div>
            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(to right, transparent, #3b82f6 30%, #6366f1 60%, transparent)' }} />

            {/* Back */}
            <button onClick={onClose}
                className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-300 hover:text-white shrink-0">
                <FaIcon className="fas fa-arrow-left text-sm"  />
            </button>

            <div className="relative flex flex-col shrink-0 min-w-0 max-w-[320px]">
                <div className="flex items-center gap-2">
                    <span className="font-black text-sm truncate uppercase tracking-tight">{request.draft_name}</span>
                    <ApprovalStatusBadge status={request.status} size="sm" />
                    {hasChanges && (
                        <div className="flex items-center gap-1.5 bg-amber-500 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-amber-500/20 animate-pulse uppercase tracking-wider">
                            <FaIcon className="fas fa-pen-nib text-[8px]"  /> {t('common_adjusting')}
                        </div>
                    )}
                    {request.brand && (
                        <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded font-black text-slate-300 shrink-0 border border-white/5 uppercase tracking-wider">{request.brand}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 opacity-80">
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        <FaIcon className="fas fa-user text-[8px]"  /> {proposerName}
                    </span>
                    <div className="w-0.5 h-0.5 bg-slate-600 rounded-full opacity-30" />
                    <span className="text-[10px] text-slate-400 font-bold">
                        {new Date(request.submitted_at).toLocaleDateString('vi-VN')}
                    </span>
                </div>
            </div>

            {/* Divider */}
            <div className="relative w-px h-6 bg-white/15 shrink-0" />

            {/* ── KPI pills ── */}
            <div className="relative flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                {/* SKU */}
                <div className="flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 shrink-0">
                    <FaIcon className="fas fa-boxes-stacked text-slate-400 text-[10px]"  />
                    <span className="text-[11px] font-black text-white">{rowsCount}</span>
                    <span className="text-[10px] text-slate-400">{t('common_sku')}</span>
                </div>
                {/* Air */}
                {totals.air > 0 && (
                    <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-400/25 rounded-lg px-3 py-1.5 shrink-0">
                        <FaIcon className="fas fa-plane text-rose-400 text-[10px]"  />
                        <span className="text-[11px] font-black text-rose-300">{totals.air.toLocaleString()}</span>
                        <span className="text-[10px] text-rose-400/70">Air</span>
                    </div>
                )}
                {/* Sea */}
                {totals.sea > 0 && (
                    <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-400/25 rounded-lg px-3 py-1.5 shrink-0">
                        <FaIcon className="fas fa-ship text-blue-400 text-[10px]"  />
                        <span className="text-[11px] font-black text-blue-300">{totals.sea.toLocaleString()}</span>
                        <span className="text-[10px] text-blue-400/70">Sea</span>
                    </div>
                )}
                {/* Value */}
                <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/25 rounded-lg px-3 py-1.5 shrink-0">
                    <FaIcon className="fas fa-circle-dollar-to-slot text-emerald-400 text-[10px]"  />
                    <span className="text-[11px] font-black text-emerald-300">{(totals.value / 1e6).toFixed(1)}M</span>
                    <span className="text-[10px] text-emerald-400/70">VNĐ</span>
                </div>
                {/* OOS warning */}
                {totals.oos > 0 && (
                    <div className="flex items-center gap-1.5 bg-rose-600/20 border border-rose-500/30 rounded-lg px-3 py-1.5 shrink-0">
                        <FaIcon className="fas fa-circle-exclamation text-rose-400 text-[10px]"  />
                        <span className="text-[11px] font-black text-rose-300">OOS: {totals.oos}</span>
                    </div>
                )}
                {/* Risk warning */}
                {totals.risk > 0 && (
                    <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/25 rounded-lg px-3 py-1.5 shrink-0">
                        <FaIcon className="fas fa-triangle-exclamation text-amber-400 text-[10px]"  />
                        <span className="text-[11px] font-black text-amber-300">Risk: {totals.risk}</span>
                    </div>
                )}
                {/* Changed badge */}
                {hasChanges && (
                    <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-1.5 shrink-0">
                        <FaIcon className="fas fa-pencil text-amber-400 text-[10px]"  />
                        <span className="text-[11px] font-black text-amber-300">{t('common_adjusted')}</span>
                    </div>
                )}
            </div>

            {/* Right: level + date */}
            <div className="relative shrink-0 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 font-black text-slate-300">
                    Level {request.current_level}
                </span>
                <span>{new Date(request.submitted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        </div>
    );
};
