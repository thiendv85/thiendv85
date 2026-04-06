import React from 'react';
import { ApprovalAction } from '../types/inventory';
import { SnapshotMatrix } from './SnapshotMatrix';
import { useLanguage } from '../utils/i18n';

interface Props {
    sidebarTab: 'info' | 'history' | 'matrix';
    setSidebarTab: (tab: 'info' | 'history' | 'matrix') => void;
    actions: ApprovalAction[];
    usersMap: Record<string, string>;
    rows: any[];
    localQtys: Record<string, { air: number; sea: number }>;
    canAct: boolean;
    comment: string;
    setComment: (val: string) => void;
    commentError: string;
    setCommentError: (val: string) => void;
    hasChanges: boolean;
    isSubmitting: boolean;
    submittingAction: string | null;
    selectedItems: Set<string>;
    handleAction: (action: 'approved' | 'rejected' | 'returned') => void;
    handlePrintOrder: () => void;
    onReset: () => void;
    totals: {
        oos: number;
        risk: number;
        bo: number;
        avgMos: number;
    };
}

export const OrderActionSidebar: React.FC<Props> = ({
    sidebarTab, setSidebarTab, actions, usersMap, rows, localQtys, canAct,
    comment, setComment, commentError, setCommentError, hasChanges,
    isSubmitting, submittingAction, selectedItems, handleAction, handlePrintOrder, onReset, totals
}) => {
    const { t } = useLanguage();
    return (
        <div className="shrink-0 flex flex-col border-b border-slate-200 bg-white shadow-sm z-20">
            {/* Upper Row: Tabs & General Actions */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 backdrop-blur-md border-b border-slate-100 gap-4">
                {/* Tabs */}
                <div className="flex bg-slate-100/50 p-1 rounded-xl gap-1 shrink-0 border border-slate-200/60">
                    {[
                        { id: 'info', icon: 'fa-circle-info', label: t('common_approve_order') },
                        { id: 'history', icon: 'fa-clock-rotate-left', label: t('common_history'), count: actions.length },
                        { id: 'matrix', icon: 'fa-table-cells', label: t('common_matrix') }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setSidebarTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${sidebarTab === tab.id ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        >
                            <i className={`fas ${tab.icon}`} /> {tab.label}
                            {tab.count !== undefined && tab.count > 0 && <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded-full text-slate-500">{tab.count}</span>}
                        </button>
                    ))}
                </div>

                {/* Quick Action Stats */}
                <div className="flex items-center gap-4">
                    {canAct && (
                        <div className="flex items-center gap-3">
                            <textarea
                                value={comment}
                                onChange={e => { setComment(e.target.value); if (commentError) setCommentError(''); }}
                                placeholder={t('common_note_placeholder')}
                                rows={1}
                                className={`w-[300px] xl:w-[450px] bg-white border rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 resize-none transition-all font-bold ${
                                    commentError ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:ring-blue-100/50 shadow-inner'
                                }`}
                            />
                            {hasChanges && (
                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-200 px-3 py-1.5 rounded-xl animate-pulse">
                                    <i className="fas fa-pen-nib text-amber-600 text-xs" />
                                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{t('approval_adjustment_mode')}</span>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleAction('approved')}
                                    disabled={isSubmitting || selectedItems.size === 0}
                                    className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black px-6 py-2 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl shadow-emerald-200/50"
                                >
                                    {submittingAction === 'approved' ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check-double" />}
                                    {t('common_approve_order')}
                                </button>
                                <button
                                    onClick={() => handleAction('returned')}
                                    disabled={isSubmitting}
                                    className="border-2 border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100/50 active:scale-[0.98] disabled:opacity-50 font-black px-5 py-2 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                                >
                                    {submittingAction === 'returned' ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-rotate-left" />}
                                    {t('common_return_order')}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-1.5">
                        <button onClick={handlePrintOrder} className="text-blue-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all">
                            <i className="fas fa-print" /> {t('common_print_slip')}
                        </button>
                        {canAct && (
                            <button onClick={() => handleAction('rejected')} className="text-slate-400 hover:text-rose-500 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:bg-rose-50/50">
                                {t('common_reject_order')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Lower Row: Tab-Specific Content */}
            <div className={`overflow-hidden transition-all duration-300 ${sidebarTab === 'info' ? 'h-0 opacity-0' : 'bg-slate-50 border-t border-slate-100 opacity-100'}`}>
                {sidebarTab === 'info' && (
                    <div className="px-5 py-3 flex items-center justify-between gap-6 border-b border-slate-100 bg-slate-50/30">
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('common_inventory_health')}</span>
                            </div>
                            <div className="flex gap-2">
                                {totals.oos > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100">
                                        <span className="text-[10px] font-black text-rose-400 uppercase">OOS</span>
                                        <span className="text-sm font-black text-rose-600">{totals.oos}</span>
                                    </div>
                                )}
                                {totals.risk > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100">
                                        <span className="text-[10px] font-black text-amber-500 uppercase">Risk</span>
                                        <span className="text-sm font-black text-amber-600">{totals.risk}</span>
                                    </div>
                                )}
                                {totals.bo > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase">BO</span>
                                        <span className="text-sm font-black text-indigo-600">{totals.bo}</span>
                                    </div>
                                )}
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${totals.avgMos < 1 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                                    <span className="text-[10px] font-black uppercase opacity-60">MOS</span>
                                    <span className="text-sm font-black">{totals.avgMos.toFixed(1)}M</span>
                                </div>
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-6">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 italic">
                                <i className="fas fa-circle-check text-blue-500" />
                                {t('common_selected')} {selectedItems.size}/{rows.length} SKU
                            </div>
                            {hasChanges && (
                                <button onClick={onReset}
                                    className="text-[10px] text-amber-600 hover:text-amber-700 font-black bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/50 flex items-center gap-1.5 transition-colors">
                                    <i className="fas fa-arrow-rotate-left" /> {t('common_reset_changes')}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {(sidebarTab === 'history' || sidebarTab === 'matrix') && (
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-6">
                        {sidebarTab === 'history' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-2 h-5 bg-slate-400 rounded-full" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{t('common_approval_history')}</span>
                                </div>
                                {actions.length === 0 ? (
                                    <p className="text-center py-10 text-slate-400 text-sm font-bold">{t('common_no_actions')}</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {actions.map(a => {
                                            const s = ACTION_STYLE[a.action] || ACTION_STYLE.commented;
                                            const actorName = usersMap[a.actor_id] || 'N/A';
                                            const actionLabels: Record<string, string> = { approved: t('approval_action_approved'), returned: t('approval_action_returned'), rejected: t('approval_action_rejected'), commented: t('approval_action_commented') };
                                            return (
                                                <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative pl-10 overflow-hidden">
                                                    <div className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center ${s.cls.replace('text-', 'bg-')}/10 border-r border-slate-100`}>
                                                        <i className={`fas ${s.icon} ${s.cls} text-sm`} />
                                                    </div>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className={`text-xs font-black uppercase ${s.cls}`}>{actionLabels[a.action] || a.action}</span>
                                                        <span className="text-[10px] font-black text-slate-400">{t('common_level_abbrev')}{a.level}</span>
                                                    </div>
                                                    <div className="text-xs font-bold text-slate-700 mb-1">{actorName}</div>
                                                    {a.comment && <p className="text-xs text-slate-500 italic mb-2">"{a.comment}"</p>}
                                                    <div className="text-[10px] text-slate-400 font-bold border-t border-slate-50 pt-2">
                                                        {new Date(a.acted_at).toLocaleString('vi-VN')}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {sidebarTab === 'matrix' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-2 h-5 bg-blue-500 rounded-full" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{t('common_matrix')}</span>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4">
                                    <SnapshotMatrix items={rows} draftQtys={localQtys} compact />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
