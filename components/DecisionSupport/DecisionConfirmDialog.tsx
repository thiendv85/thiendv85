import React, { useState } from 'react';
import { DecisionSummary } from '../../hooks/useDecisionSupport';
import { REASON_TAXONOMY } from '../../utils/decision/taxonomy';
import { FaIcon } from '../Icon';

interface Props {
    action: 'approved' | 'rejected' | 'returned';
    summary: DecisionSummary;
    onConfirm: (comment: string, structuredReason?: string) => void;
    onCancel: () => void;
}

const ACTION_CONFIG = {
    approved: {
        title: 'Approve Adjusted Order',
        color: 'bg-emerald-600',
        btnClass: 'lg-btn-primary',
        icon: 'fa-circle-check',
        btn: 'Confirm & Approve',
    },
    rejected: {
        title: 'Reject Draft Completely',
        color: 'bg-rose-600',
        btnClass: 'lg-btn-danger',
        icon: 'fa-circle-xmark',
        btn: 'Confirm Rejection',
    },
    returned: {
        title: 'Return for Revision',
        color: 'bg-indigo-600',
        btnClass: 'lg-btn-blue',
        icon: 'fa-rotate-left',
        btn: 'Confirm Return',
    },
};

export const DecisionConfirmDialog = ({ action, summary, onConfirm, onCancel }: Props) => {
    const [comment, setComment] = useState('');
    const [selectedReason, setSelectedReason] = useState('');
    const config = ACTION_CONFIG[action];
    const reasons = REASON_TAXONOMY[action] || [];

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn" onClick={onCancel} />

            <div className="relative w-full max-w-[600px] bg-white rounded-[40px] shadow-2xl overflow-hidden animate-slideUp flex flex-col">
                {/* Header */}
                <div className={`${config.color} p-8 text-white flex items-center gap-4`}>
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                        <FaIcon className={`fas ${config.icon} text-2xl`} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black tracking-tight">{config.title}</h3>
                        <div className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">
                            Final Controller Checkpoint
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-10 space-y-8 flex-1 overflow-auto max-h-[70vh]">
                    {/* Decision Snapshot Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-2">
                                Scope of Decision
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="text-sm font-black text-slate-800 flex justify-between">
                                    <span>Selected SKUs</span>
                                    <span>{summary.counts.selectedSkus}</span>
                                </div>
                                <div className="text-sm font-bold text-slate-400 flex justify-between border-t border-slate-200 mt-1 pt-1">
                                    <span>Excluded SKUs</span>
                                    <span>{summary.counts.deselectedSkus}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-right">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-2">Final Value</div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight">
                                {new Intl.NumberFormat('vi-VN', {
                                    style: 'currency',
                                    currency: 'VND',
                                    maximumFractionDigits: 0,
                                }).format(summary.metrics.value.after)}
                            </div>
                            <div
                                className={`text-[10px] font-black uppercase mt-1 ${summary.metrics.value.delta > 0 ? 'text-blue-600' : 'text-slate-400'}`}
                            >
                                Delta: {summary.metrics.value.delta > 0 ? '+' : ''}
                                {Math.round(summary.metrics.value.deltaPct * 100)}% from draft
                            </div>
                        </div>
                    </div>

                    {/* Structured Reason Selector (for Reject/Return) */}
                    {reasons.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                                Primary Business Reason
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                                {reasons.map((r, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedReason(r)}
                                        className={`w-full text-left p-3 rounded-xl text-[11px] font-bold transition-all lg-pill ${selectedReason === r ? 'lg-active' : ''}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Manager Comments */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                            Executive Comments / Notes
                        </label>
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder={
                                action === 'approved'
                                    ? 'Add any specific notes for this approval (Optional)...'
                                    : 'Briefly explain your decision logic...'
                            }
                            className="w-full h-24 p-4 rounded-3xl border border-slate-200 focus:ring-4 focus:ring-slate-100 focus:border-slate-300 transition-all outline-none text-sm font-bold resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-10 py-8 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <button
                        onClick={onCancel}
                        className="text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-all"
                    >
                        Cancel Action
                    </button>
                    <button
                        onClick={() => onConfirm(comment, selectedReason)}
                        disabled={reasons.length > 0 && !selectedReason}
                        className={`lg-btn ${config.btnClass} lg-btn-lg px-10 py-4 disabled:opacity-50`}
                    >
                        {config.btn}
                    </button>
                </div>
            </div>
        </div>
    );
};
