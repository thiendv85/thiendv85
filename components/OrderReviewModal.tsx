import React, { useState, useMemo } from 'react';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { StockProgressBar } from './StockProgressBar';
import { SalesMomentum } from './SalesMomentum';
import { TrendBadge } from './TrendBadge';
import { SnapshotMatrix } from './SnapshotMatrix';
import { useAuth } from '../utils/authContext';
import { processApprovalAction, unlockRequest } from '../utils/supabase';

interface Props {
    request: ApprovalRequest;
    actions: ApprovalAction[];
    usersMap: Record<string, string>;
    onClose: () => void;
    onRefresh: () => void;
}

const currencyVND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

// ─── Action icon map ──────────────────────────────────────────────────────────
const ACTION_STYLE: Record<string, { icon: string; cls: string }> = {
    approved: { icon: 'fa-circle-check', cls: 'text-emerald-600' },
    rejected:  { icon: 'fa-circle-xmark', cls: 'text-rose-500' },
    returned:  { icon: 'fa-rotate-left',  cls: 'text-indigo-500' },
    commented: { icon: 'fa-comment',       cls: 'text-slate-400' },
};

export const OrderReviewModal = ({ request, actions, usersMap, onClose, onRefresh }: Props) => {
    const { user, profile } = useAuth();
    const snap = request.snapshot_data;
    const proposerName = usersMap[request.submitted_by] || 'N/A';

    const [localQtys, setLocalQtys] = useState<Record<string, { air: number; sea: number }>>(
        () => Object.fromEntries(
            Object.entries(snap.quantities).map(([k, v]) => [k, { air: v.air, sea: v.sea }])
        )
    );
    const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        snap.inventory_context.forEach(ctx => {
            const q = snap.quantities[ctx.itemCode];
            if ((q?.air || 0) > 0 || (q?.sea || 0) > 0) {
                initial.add(ctx.itemCode);
            }
        });
        return initial;
    });
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState('');
    const [unlockReason, setUnlockReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState<string | null>(null);
    const [showUnlock, setShowUnlock] = useState(false);
    const [showMatrix, setShowMatrix] = useState(false);
    const [confirmReject, setConfirmReject] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'info' | 'history' | 'matrix'>('info');
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);

    const canAct = !!(profile?.role && ['admin', 'approver'].includes(profile.role)
        && ['pending', 'in_progress'].includes(request.status));
    const canUnlock = !!(profile?.role && ['admin', 'approver'].includes(profile.role)
        && request.status === 'approved');

    const rows = useMemo(() =>
        snap.inventory_context.filter(ctx =>
            (snap.quantities[ctx.itemCode]?.air || 0) > 0 ||
            (snap.quantities[ctx.itemCode]?.sea || 0) > 0
        ), [snap]);

    const totals = useMemo(() => {
        let air = 0, sea = 0, value = 0, oos = 0, risk = 0, bo = 0;
        rows.forEach(ctx => {
            const isSelected = selectedItems.has(ctx.itemCode);
            if (isSelected) {
                const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                air += q.air; sea += q.sea;
                value += (ctx.unitCost || 0) * (q.air + q.sea);
            }
            if ((ctx.available || 0) <= 0 && ctx.baseForecast > 0.02) oos++;
            if ((ctx.available || 0) < (ctx.safetyStock || 0) && ctx.baseForecast > 0.02) risk++;
            if ((ctx.backorder || 0) > (ctx.available || 0)) bo++;
        });
        const avgMos = rows.length > 0
            ? rows.reduce((s, c) => s + (c.mos || 0), 0) / rows.length : 0;
        return { air, sea, value, oos, risk, bo, avgMos };
    }, [rows, localQtys, selectedItems]);

    const hasChanges = useMemo(() =>
        rows.some(ctx => {
            const orig = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
            const cur = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            const isSelected = selectedItems.has(ctx.itemCode);
            if (!isSelected && (orig.air > 0 || orig.sea > 0)) return true;
            if (isSelected && (orig.air !== cur.air || orig.sea !== cur.sea)) return true;
            return false;
        }), [rows, localQtys, selectedItems, snap.quantities]);

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

    const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));
    const handlePageSize = (n: number) => { setPageSize(n); setCurrentPage(1); };

    const setQty = (code: string, field: 'air' | 'sea', val: string) => {
        const n = Math.max(0, parseInt(val) || 0);
        setLocalQtys(prev => ({ ...prev, [code]: { ...(prev[code] || { air: 0, sea: 0 }), [field]: n } }));
        if (n > 0) setSelectedItems(prev => new Set(prev).add(code));
    };

    const handleToggleAll = () => {
        if (selectedItems.size === rows.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(rows.map(r => r.itemCode)));
        }
    };
    
    const toggleItem = (code: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const handleAction = async (action: 'approved' | 'rejected' | 'returned') => {
        if (!user) return;
        if (action === 'returned' && !comment.trim()) {
            setCommentError('Vui lòng nhập lý do trả lại trước khi gửi.');
            return;
        }
        setCommentError('');
        setIsSubmitting(true);
        setSubmittingAction(action);
        try {
            const finalQtys = action === 'approved'
                ? Object.fromEntries(Object.keys(localQtys).map(k => [k, selectedItems.has(k) ? localQtys[k] : {air: 0, sea: 0}]))
                : localQtys;
            await processApprovalAction(request.id, user.id, action, comment || undefined, finalQtys);
            onRefresh(); onClose();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); setSubmittingAction(null); }
    };

    const handleUnlock = async () => {
        if (!user || !unlockReason.trim()) return;
        setIsSubmitting(true);
        try {
            await unlockRequest(request.id, user.id, unlockReason);
            onRefresh(); onClose();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-atp-background flex flex-col">

            {/* ═══ TOP HEADER ══════════════════════════════════════════════════ */}
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
                    <i className="fas fa-arrow-left text-sm" />
                </button>

                <div className="relative flex flex-col shrink-0 min-w-0 max-w-[320px]">
                    <div className="flex items-center gap-2">
                        <span className="font-black text-sm truncate uppercase tracking-tight">{request.draft_name}</span>
                        <ApprovalStatusBadge status={request.status} size="sm" />
                        {request.brand && (
                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded font-black text-slate-300 shrink-0 border border-white/5 uppercase tracking-wider">{request.brand}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 opacity-80">
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <i className="fas fa-user text-[8px]" /> {proposerName}
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
                        <i className="fas fa-boxes-stacked text-slate-400 text-[10px]" />
                        <span className="text-[11px] font-black text-white">{rows.length}</span>
                        <span className="text-[10px] text-slate-400">SKU</span>
                    </div>
                    {/* Air */}
                    {totals.air > 0 && (
                        <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-400/25 rounded-lg px-3 py-1.5 shrink-0">
                            <i className="fas fa-plane text-rose-400 text-[10px]" />
                            <span className="text-[11px] font-black text-rose-300">{totals.air.toLocaleString()}</span>
                            <span className="text-[10px] text-rose-400/70">Air</span>
                        </div>
                    )}
                    {/* Sea */}
                    {totals.sea > 0 && (
                        <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-400/25 rounded-lg px-3 py-1.5 shrink-0">
                            <i className="fas fa-ship text-blue-400 text-[10px]" />
                            <span className="text-[11px] font-black text-blue-300">{totals.sea.toLocaleString()}</span>
                            <span className="text-[10px] text-blue-400/70">Sea</span>
                        </div>
                    )}
                    {/* Value */}
                    <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/25 rounded-lg px-3 py-1.5 shrink-0">
                        <i className="fas fa-circle-dollar-to-slot text-emerald-400 text-[10px]" />
                        <span className="text-[11px] font-black text-emerald-300">{(totals.value / 1e6).toFixed(1)}M</span>
                        <span className="text-[10px] text-emerald-400/70">VNĐ</span>
                    </div>
                    {/* OOS warning */}
                    {totals.oos > 0 && (
                        <div className="flex items-center gap-1.5 bg-rose-600/20 border border-rose-500/30 rounded-lg px-3 py-1.5 shrink-0">
                            <i className="fas fa-circle-exclamation text-rose-400 text-[10px]" />
                            <span className="text-[11px] font-black text-rose-300">OOS: {totals.oos}</span>
                        </div>
                    )}
                    {/* Risk warning */}
                    {totals.risk > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/25 rounded-lg px-3 py-1.5 shrink-0">
                            <i className="fas fa-triangle-exclamation text-amber-400 text-[10px]" />
                            <span className="text-[11px] font-black text-amber-300">Risk: {totals.risk}</span>
                        </div>
                    )}
                    {/* Changed badge */}
                    {hasChanges && (
                        <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-1.5 shrink-0">
                            <i className="fas fa-pencil text-amber-400 text-[10px]" />
                            <span className="text-[11px] font-black text-amber-300">Đã điều chỉnh</span>
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

            {/* ═══ BODY: sidebar + table ══════════════════════════════════════ */}
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* ── LEFT SIDEBAR (fixed, always visible) ────────────────── */}
                <div className="w-[420px] shrink-0 flex flex-col border-r border-slate-200 bg-white shadow-[8px_0_32px_-16px_rgba(0,0,0,0.1)] z-10 transition-all duration-300">
                    
                    {/* ── Sidebar Tabs ── */}
                    <div className="flex bg-slate-50 border-b border-slate-200 p-1.5 gap-1 shrink-0">
                        <button 
                            onClick={() => setSidebarTab('info')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'info' ? 'bg-white text-blue-600 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        >
                            <i className="fas fa-circle-info" /> Duyệt đơn
                        </button>
                        <button 
                            onClick={() => setSidebarTab('history')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'history' ? 'bg-white text-blue-600 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        >
                            <i className="fas fa-clock-rotate-left" /> Lịch sử
                            {actions.length > 0 && <span className="text-[8px] bg-slate-200 px-1.5 py-0.5 rounded-full text-slate-500">{actions.length}</span>}
                        </button>
                        <button 
                            onClick={() => setSidebarTab('matrix')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'matrix' ? 'bg-white text-blue-600 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        >
                            <i className="fas fa-table-cells" /> Ma trận
                        </button>
                    </div>

                    {/* Middle scrollable content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        
                        {sidebarTab === 'info' && (
                            <div className="p-6 space-y-5">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-5 bg-emerald-500 rounded-full" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Sức khoẻ tồn kho</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {totals.oos > 0 && (
                                        <div className="flex flex-col p-4 rounded-2xl bg-rose-50 border border-rose-100 shadow-sm">
                                            <span className="text-[10px] font-black text-rose-400 uppercase">Hết hàng (OOS)</span>
                                            <span className="text-xl font-black text-rose-600 leading-tight">{totals.oos}</span>
                                        </div>
                                    )}
                                    {totals.risk > 0 && (
                                        <div className="flex flex-col p-4 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm">
                                            <span className="text-[10px] font-black text-amber-500 uppercase">Rủi ro (Risk)</span>
                                            <span className="text-xl font-black text-amber-600 leading-tight">{totals.risk}</span>
                                        </div>
                                    )}
                                    {totals.bo > 0 && (
                                        <div className="flex flex-col p-4 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
                                            <span className="text-[10px] font-black text-indigo-400 uppercase">Nợ BO</span>
                                            <span className="text-xl font-black text-indigo-600 leading-tight">{totals.bo}</span>
                                        </div>
                                    )}
                                    <div className={`flex flex-col p-4 rounded-2xl border shadow-sm ${
                                        totals.avgMos < 1 ? 'bg-rose-50 border-rose-100 text-rose-600'
                                        : totals.avgMos > 6 ? 'bg-amber-50 border-amber-100 text-amber-600'
                                        : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                    }`}>
                                        <span className={`text-[10px] font-black uppercase opacity-60`}>Tồn kho (MOS)</span>
                                        <span className="text-xl font-black leading-tight">{totals.avgMos.toFixed(1)}M</span>
                                    </div>
                                </div>
                                
                                {canAct && (
                                    <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                        <p className="text-[11px] text-blue-600 font-bold leading-relaxed italic">
                                            <i className="fas fa-circle-info mr-1" />
                                            Kiểm tra kỹ các mã hàng trước khi phê duyệt. Bạn có thể thay đổi số lượng trực tiếp trên bảng.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {sidebarTab === 'history' && (
                            <div className="p-6 space-y-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-5 bg-slate-400 rounded-full" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Lịch sử phê duyệt</span>
                                </div>
                                {actions.length === 0 ? (
                                    <div className="text-center py-20 px-6">
                                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                            <i className="fas fa-clock-rotate-left text-3xl text-slate-200" />
                                        </div>
                                        <p className="text-slate-400 text-sm font-bold leading-relaxed">Chưa có hành động nào.</p>
                                    </div>
                                ) : (
                                    <div className="relative pl-4 border-l-2 border-slate-100 space-y-8">
                                        {actions.map(a => {
                                            const s = ACTION_STYLE[a.action] || ACTION_STYLE.commented;
                                            const actorName = usersMap[a.actor_id] || 'N/A';
                                            const actionLabels: Record<string, string> = {
                                                approved: 'Đã duyệt',
                                                returned: 'Trả lại',
                                                rejected: 'Từ chối',
                                                commented: 'Bình luận'
                                            };
                                            const actionLabel = actionLabels[a.action] || a.action;

                                            return (
                                                <div key={a.id} className="relative">
                                                    <div className={`absolute -left-[25px] top-1 w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center ${s.cls.replace('text-', 'bg-')}`}>
                                                        <i className={`fas ${s.icon} text-[8px] text-white`} />
                                                    </div>
                                                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-xs font-black uppercase tracking-wider ${s.cls}`}>{actionLabel}</span>
                                                            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">Lv{a.level}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-500 border border-slate-200">
                                                                <i className="fas fa-user" />
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-700">{actorName}</span>
                                                        </div>
                                                        {a.comment && <p className="text-sm text-slate-600 font-medium leading-relaxed my-3 italic">"{a.comment}"</p>}
                                                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold border-t border-slate-50 pt-3 mt-3">
                                                            <span>Cấp độ {a.level}</span>
                                                            <span>{new Date(a.acted_at).toLocaleDateString('vi-VN')} {new Date(a.acted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {sidebarTab === 'matrix' && (
                            <div className="p-6 space-y-5">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-5 bg-blue-500 rounded-full" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Ma trận cung ứng</span>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                    <SnapshotMatrix items={rows} draftQtys={localQtys} compact />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── ACTION PANEL (Pinned to bottom) ──────────── */}
                    <div className="border-t border-slate-200 p-4 flex flex-col gap-3 shrink-0 bg-slate-50/80 backdrop-blur-md z-20">

                        {canAct && (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-5 bg-blue-600 rounded-full" />
                                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                                            Hành động · Lv{request.current_level}
                                        </span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 italic">
                                        {selectedItems.size}/{rows.length} SKU đã chọn
                                    </div>
                                </div>

                                <div className="space-y-1.5 font-bold">
                                    <textarea
                                        value={comment}
                                        onChange={e => { setComment(e.target.value); if (commentError) setCommentError(''); }}
                                        placeholder="Ghi chú phản hồi cho người đề xuất..."
                                        rows={sidebarTab === 'info' ? 3 : 2}
                                        className={`w-full bg-white border rounded-2xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-4 resize-none transition-all ${
                                            commentError
                                                ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100'
                                                : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100/50 shadow-inner'
                                        }`}
                                    />
                                    {commentError && (
                                        <p className="flex items-center gap-1.5 text-xs text-rose-600 font-black px-1">
                                            <i className="fas fa-circle-exclamation" />{commentError}
                                        </p>
                                    )}
                                </div>

                                {hasChanges && (
                                    <button
                                        onClick={() => setLocalQtys(Object.fromEntries(
                                            Object.entries(snap.quantities).map(([k, v]) => [k, { air: v.air, sea: v.sea }])
                                        ))}
                                        className="flex items-center gap-2 text-[11px] text-amber-600 hover:text-amber-700 font-black transition-colors self-start bg-amber-50 px-3 py-2 rounded-xl border border-amber-200/50 shadow-sm"
                                    >
                                        <i className="fas fa-arrow-rotate-left" />
                                        Hoàn tác các thay đổi
                                    </button>
                                )}

                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => handleAction('approved')}
                                        disabled={isSubmitting || selectedItems.size === 0}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black py-3 rounded-2xl text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-200/50 border-b-4 border-emerald-800"
                                    >
                                        {submittingAction === 'approved'
                                            ? <i className="fas fa-spinner fa-spin text-lg" />
                                            : <i className="fas fa-check-double text-lg" />}
                                        Duyệt {selectedItems.size} mã đã chọn
                                    </button>

                                    <button
                                        onClick={() => handleAction('returned')}
                                        disabled={isSubmitting}
                                        className="w-full border-2 border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50 hover:border-indigo-400 active:scale-[0.98] disabled:opacity-50 font-black py-2.5 rounded-2xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all transition-colors"
                                    >
                                        {submittingAction === 'returned'
                                            ? <i className="fas fa-spinner fa-spin" />
                                            : <i className="fas fa-rotate-left" />}
                                        Trả lại{hasChanges ? ' (Kèm điều chỉnh)' : ''}
                                    </button>

                                    {!confirmReject ? (
                                        <button
                                            onClick={() => setConfirmReject(true)}
                                            disabled={isSubmitting}
                                            className="w-full text-rose-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 active:scale-[0.98] disabled:opacity-50 font-black py-2 rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all border border-transparent"
                                        >
                                            <i className="fas fa-trash-can" /> Từ chối đơn hàng
                                        </button>
                                    ) : (
                                        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-4 space-y-3">
                                            <p className="text-[11px] font-black text-rose-700 flex items-center gap-2">
                                                <i className="fas fa-triangle-exclamation text-lg" />
                                                Xác nhận từ chối đơn hàng này?
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleAction('rejected')}
                                                    disabled={isSubmitting}
                                                    className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-rose-200"
                                                >
                                                    Xác nhận từ chối
                                                </button>
                                                <button
                                                    onClick={() => setConfirmReject(false)}
                                                    className="px-4 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    Huỷ
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {canUnlock && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-5 bg-orange-400 rounded-full" />
                                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Gỡ trạng thái Duyệt</span>
                                </div>
                                {!showUnlock ? (
                                    <button
                                        onClick={() => setShowUnlock(true)}
                                        className="w-full border-2 border-orange-200 text-orange-600 bg-white hover:bg-orange-50 active:scale-95 font-black py-4 rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-100"
                                    >
                                        <i className="fas fa-lock-open mr-1" /> Mở khóa chỉnh sửa
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <input
                                            value={unlockReason}
                                            onChange={e => setUnlockReason(e.target.value)}
                                            placeholder="Lý do mở khóa..."
                                            className="w-full bg-white border border-orange-200 rounded-2xl px-4 py-3.5 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100 transition-all font-bold shadow-inner"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleUnlock} disabled={isSubmitting || !unlockReason.trim()}
                                                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
                                                {isSubmitting ? <i className="fas fa-spinner fa-spin" /> : null}
                                                Mở khóa ngay
                                            </button>
                                            <button onClick={() => setShowUnlock(false)}
                                                className="px-4 border border-slate-200 text-slate-400 hover:text-slate-600 rounded-2xl text-xs font-black transition-colors">
                                                Huỷ
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!canAct && !canUnlock && (
                            <div className="py-6 text-center space-y-4 bg-white/50 border border-slate-100 rounded-3xl">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto border border-white shadow-sm">
                                    <i className="fas fa-eye text-2xl text-slate-200" />
                                </div>
                                <div>
                                    <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Chế độ xem thông tin</p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mt-2 font-medium px-6">
                                        {request.status === 'approved' ? 'Đơn này đã được hoàn tất phê duyệt.'
                                        : request.status === 'rejected' ? 'Đơn này đã bị từ chối.'
                                        : 'Bạn chưa có quyền hạn xử lý đơn hàng này.'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>


                {/* ── RIGHT: Order Table ───────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">

                    {/* Table title bar */}
                    <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 gap-3">
                        <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Chi tiết đặt hàng</span>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{rows.length} mã</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Lines-per-page — matches Ordering.tsx select style */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="font-bold text-slate-400">Dòng/trang</span>
                                <select value={pageSize} onChange={e => handlePageSize(Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 outline-none cursor-pointer text-slate-700 font-bold text-xs hover:border-slate-300 transition-colors">
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                            <div className="w-px h-4 bg-slate-200" />
                            <div className="flex items-center gap-2 text-xs font-bold">
                                {totals.air > 0 && <span className="text-rose-600"><i className="fas fa-plane mr-1" />Air: {totals.air}</span>}
                                {totals.sea > 0 && <span className="text-blue-700"><i className="fas fa-ship mr-1" />Sea: {totals.sea}</span>}
                                <span className="text-emerald-700 font-black">{currencyVND.format(totals.value)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable table */}
                    <div className="flex-1 overflow-auto min-h-0 relative">
                        <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1150px]">
                            <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30">
                                <tr className="text-xs uppercase font-black tracking-wider">
                                    <th className="px-3 py-3 w-10 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-slate-50/95 cursor-pointer hover:bg-slate-100 transition-colors" onClick={handleToggleAll}>
                                        <div className="flex flex-col items-center gap-1">
                                            <input type="checkbox" checked={selectedItems.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 cursor-pointer accent-blue-600 rounded" />
                                            <span className="text-[8px] uppercase font-bold tracking-tighter leading-none">All</span>
                                        </div>
                                    </th>
                                    <th className="px-3 py-3 min-w-[160px] sticky left-10 z-40 bg-slate-50/95 border-b border-slate-200 border-r border-slate-200">SKU Identity</th>
                                    <th className="px-2 py-3 text-center border-b border-slate-200 min-w-[100px]">Demand</th>
                                    <th className="px-2 py-3 min-w-[115px] text-right border-b border-slate-200">Stock Health</th>
                                    <th className="px-2 py-3 text-center border-b border-slate-200 min-w-[85px]">Pipeline</th>
                                    <th className="px-2 py-3 text-center border-b border-slate-200 min-w-[105px]">Momentum</th>
                                    <th className="px-2 py-3 text-center border-b border-slate-200 min-w-[65px]">MOS</th>
                                    <th className="px-2 py-3 text-center border-b border-slate-200 min-w-[85px]">DLR/CST</th>
                                    <th className="px-2 py-3 text-center border-x border-slate-200 bg-rose-50/40 border-b border-slate-200 min-w-[85px]">
                                        <span className="text-rose-600 font-bold">Air</span>
                                    </th>
                                    <th className="px-2 py-3 text-center border-r border-slate-200 bg-blue-50/40 border-b border-slate-200 min-w-[85px]">
                                        <span className="text-blue-700 font-bold">Sea</span>
                                    </th>
                                    <th className="px-3 py-3 min-w-[100px] border-b border-slate-200">Note</th>
                                    <th className="px-3 py-3 text-right border-b border-slate-200 border-l border-slate-200 min-w-[95px]">Amount</th>
                                    <th className="px-2 py-3 sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200 min-w-[80px] text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {pagedRows.map((ctx, idx) => {
                                    const globalIdx = (safePage - 1) * pageSize + idx;
                                    const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                                    const origQ = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
                                    const changed = q.air !== origQ.air || q.sea !== origQ.sea;
                                    const draftTotal = q.air + q.sea;
                                    const note = snap.notes[ctx.itemCode] || '';
                                    const rowValue = (ctx.unitCost || 0) * draftTotal;
                                    const demandMonthly = ctx.avgQty3M || ctx.baseForecast || 0;

                                    return (
                                        <tr key={ctx.itemCode}
                                            className={`transition-colors group ${!selectedItems.has(ctx.itemCode) ? 'opacity-60 grayscale-[0.8] bg-slate-50 hover:bg-slate-100 block-events-except-checkbox' : changed ? 'hover:bg-amber-50/60 bg-amber-50/30' : draftTotal > 0 ? 'hover:bg-blue-50/30 bg-blue-50/10' : 'hover:bg-slate-50'}`}>

                                            {/* Checkbox & # */}
                                            <td className={`px-3 py-1.5 text-center border-b border-slate-50/80 sticky left-0 z-10
                                                ${!selectedItems.has(ctx.itemCode) ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'}`}>
                                                <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => toggleItem(ctx.itemCode)}>
                                                    <input type="checkbox" checked={selectedItems.has(ctx.itemCode)} onChange={() => {}} className="w-4 h-4 cursor-pointer accent-blue-600 rounded" />
                                                    <div className="text-[9px] text-slate-400 font-black leading-none">{globalIdx + 1}</div>
                                                </div>
                                            </td>

                                            {/* SKU */}
                                            <td className={`px-3 py-1 sticky left-10 z-10 border-b border-slate-50/80 border-r border-slate-100
                                                ${!selectedItems.has(ctx.itemCode) ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'}`}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-black text-slate-800 text-xs font-mono tracking-tight">{ctx.itemCode}</span>
                                                    <span className={`px-1.5 py-0.5 rounded font-black text-[9px] shrink-0 ${
                                                        ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700'
                                                        : ctx.priorityBucket === 'P2' ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-100 text-slate-500'}`}>
                                                        {ctx.priorityBucket || 'P3'}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 truncate max-w-[150px] leading-tight">{ctx.itemName}</div>
                                                <div className="mt-0.5 flex flex-wrap gap-0.5">
                                                    {ctx.status && <span className="text-[8px] font-black px-1 py-0 rounded bg-slate-100 text-slate-500 uppercase leading-4">{ctx.status}</span>}
                                                    {ctx.loisGroup && <span className="text-[8px] font-black px-1 py-0 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase leading-4">L{ctx.loisGroup}</span>}
                                                    {ctx.typecar && <span className="text-[8px] font-black px-1 py-0 rounded bg-slate-100 text-slate-500 truncate max-w-[70px] leading-4" title={ctx.typecar}>{ctx.typecar.split(' | ')[0]}</span>}
                                                </div>
                                            </td>

                                            {/* Demand — compact inline, no card wrapper */}
                                            <td className="px-3 py-1.5 text-center border-b border-slate-50">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase">M1</span>
                                                        <span className="font-black text-slate-800 text-xs">{(ctx.m1Actual || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="w-px h-3 bg-slate-200" />
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase">FC</span>
                                                        <span className="font-black text-emerald-700 text-xs">
                                                            {ctx.baseForecast ? (ctx.baseForecast >= 10 ? Math.round(ctx.baseForecast).toLocaleString() : ctx.baseForecast.toFixed(1)) : '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-0.5 flex justify-center">
                                                    <TrendBadge trend={ctx.trendFlag} />
                                                </div>
                                            </td>

                                            {/* Stock Health — compact mode */}
                                            <td className="px-3 py-1.5 text-right border-b border-slate-50">
                                                <StockProgressBar
                                                    current={ctx.available} rop={ctx.rop}
                                                    max={ctx.stockMax || 1} ss={ctx.safetyStock}
                                                    onOrder={ctx.totalPO} incoming={ctx.incomingCurrentMonth}
                                                    backorder={ctx.backorder} draftAdd={draftTotal}
                                                    baseFc={ctx.baseForecast}
                                                    compact
                                                />
                                            </td>

                                            {/* Supply Pipeline */}
                                            <td className="px-3 py-1.5 text-center border-b border-slate-50">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    {ctx.incomingCurrentMonth > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-sm font-black text-blue-700">+{ctx.incomingCurrentMonth.toLocaleString()}</span>
                                                            <span className="text-[9px] font-bold text-blue-400 uppercase">tháng này</span>
                                                        </div>
                                                    ) : <span className="text-slate-300 font-black">-</span>}
                                                    {ctx.totalPO > 0 && (
                                                        <div className="flex items-center gap-1 bg-indigo-50 px-1.5 py-0 rounded border border-indigo-100">
                                                            <i className="fas fa-ship text-indigo-400 text-[8px]" />
                                                            <span className="text-[9px] font-black text-indigo-600">PO: {ctx.totalPO.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Sales Momentum — compact mode */}
                                            <td className="px-3 py-1.5 text-center border-b border-slate-50">
                                                <SalesMomentum
                                                    values={[ctx.avgQty24M, ctx.avgQty12M, ctx.avgQty6M, ctx.avgQty3M]}
                                                    history={ctx.salesHistory} forecast={ctx.baseForecast}
                                                    compact
                                                />
                                            </td>

                                            {/* MOS */}
                                            <td className="px-3 py-1.5 text-center border-b border-slate-50">
                                                {demandMonthly <= 0 ? (
                                                    <div className="text-slate-300 font-black">∞</div>
                                                ) : (
                                                    <div className={`text-sm font-black ${ctx.mos < 1 ? 'text-rose-700' : ctx.mos > 12 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                        {(ctx.mos || 0).toFixed(1)}<span className="text-xs text-slate-400 ml-0.5">M</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Dealer & CST */}
                                            <td className="px-3 py-1.5 text-center border-b border-slate-50">
                                                <div className="text-xs font-black text-slate-800">{(ctx.dealerInventory || 0).toLocaleString()}</div>
                                                <div className="mt-0.5 inline-block text-[9px] font-black px-1.5 py-0 rounded-full bg-slate-100 text-slate-600 border border-slate-200 leading-4">
                                                    {demandMonthly <= 0 ? 'CST: ∞' : `CST: ${(ctx.cst || 0).toFixed(1)}`}
                                                </div>
                                            </td>

                                            {/* Air */}
                                            <td className="px-2 py-1.5 border-x border-slate-100 bg-rose-50/20 text-center border-b border-slate-50">
                                                {canAct ? (
                                                    <>
                                                        <input type="number" value={q.air || ''} onChange={e => setQty(ctx.itemCode, 'air', e.target.value)}
                                                            placeholder="0"
                                                            className="w-16 text-center font-black text-sm border border-rose-200 focus:border-rose-400 bg-white text-rose-700 rounded-lg px-1 py-1 outline-none transition-all" />
                                                        {changed && q.air !== origQ.air && <div className="text-[9px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.air}</div>}
                                                    </>
                                                ) : (
                                                    <span className={q.air > 0 ? 'font-black text-rose-700 text-sm' : 'text-slate-300'}>{q.air > 0 ? q.air : '—'}</span>
                                                )}
                                            </td>

                                            {/* Sea */}
                                            <td className="px-2 py-1.5 border-r border-slate-100 bg-blue-50/20 text-center border-b border-slate-50">
                                                {canAct ? (
                                                    <>
                                                        <input type="number" value={q.sea || ''} onChange={e => setQty(ctx.itemCode, 'sea', e.target.value)}
                                                            placeholder="0"
                                                            className="w-16 text-center font-black text-sm border border-blue-200 focus:border-blue-400 bg-white text-blue-700 rounded-lg px-1 py-1 outline-none transition-all" />
                                                        {changed && q.sea !== origQ.sea && <div className="text-[9px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.sea}</div>}
                                                    </>
                                                ) : (
                                                    <span className={q.sea > 0 ? 'font-black text-blue-700 text-sm' : 'text-slate-300'}>{q.sea > 0 ? q.sea : '—'}</span>
                                                )}
                                            </td>

                                            {/* Ghi chú */}
                                            <td className="px-3 py-1.5 border-b border-slate-50">
                                                {note ? <span className="text-[10px] text-slate-500 italic">{note}</span> : <span className="text-slate-300 text-xs">—</span>}
                                                {(ctx.warnings || []).slice(0, 1).map((w, i) => (
                                                    <div key={i} className="text-[9px] text-amber-600 font-bold mt-0.5 leading-tight">
                                                        <i className="fas fa-triangle-exclamation mr-0.5" />{w}
                                                    </div>
                                                ))}
                                            </td>

                                            {/* Thành tiền */}
                                            <td className="px-3 py-1.5 text-right font-black text-slate-900 border-b border-slate-50/80 border-l border-slate-200 text-xs">
                                                {draftTotal > 0
                                                    ? <span className={changed ? 'text-amber-700' : ''}>{currencyVND.format(rowValue)}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>

                                            {/* Trạng thái / Action */}
                                            <td className={`px-2 py-1.5 text-center border-b border-slate-50/80 sticky right-0 z-10 border-l border-slate-200
                                                ${!selectedItems.has(ctx.itemCode) ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'}`}>
                                                {selectedItems.has(ctx.itemCode) ? (
                                                    <button onClick={() => toggleItem(ctx.itemCode)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-600 transition-colors text-[10px] font-black w-full justify-center group/btn border border-emerald-200/50 hover:border-rose-200/50">
                                                        <i className="fas fa-check group-hover/btn:hidden" />
                                                        <i className="fas fa-xmark hidden group-hover/btn:inline" />
                                                        <span className="group-hover/btn:hidden">Duyệt</span>
                                                        <span className="hidden group-hover/btn:inline">Bỏ line</span>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => toggleItem(ctx.itemCode)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-colors text-[10px] font-black w-full justify-center border border-slate-300">
                                                        <i className="fas fa-rotate-left" />
                                                        <span>Khôi phục</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Pagination footer — dùng pagination-pill như Ordering.tsx ── */}
                    {totalPages > 1 && (
                        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-3">
                            {/* Info */}
                            <span className="text-xs text-slate-400 font-bold shrink-0">
                                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, rows.length)}
                                <span className="text-slate-300 mx-1">/</span>
                                {rows.length} mã
                            </span>

                            {/* Page pills — identical pattern to Ordering.tsx */}
                            <div className="flex items-center gap-0.5">
                                <button onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}
                                    className="pagination-pill text-slate-600">
                                    <i className="fas fa-chevron-left text-xs" />
                                </button>
                                {(() => {
                                    const pages: (number | '...')[] = [];
                                    if (totalPages <= 7) {
                                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                                    } else {
                                        pages.push(1);
                                        if (safePage > 3) pages.push('...');
                                        for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
                                        if (safePage < totalPages - 2) pages.push('...');
                                        pages.push(totalPages);
                                    }
                                    return pages.map((p, i) =>
                                        p === '...'
                                            ? <span key={`e${i}`} className="px-1 text-slate-300 text-xs">…</span>
                                            : <button key={p} onClick={() => goToPage(p as number)}
                                                className={`pagination-pill ${p === safePage ? 'active' : 'text-slate-600'}`}>{p}</button>
                                    );
                                })()}
                                <button onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}
                                    className="pagination-pill text-slate-600">
                                    <i className="fas fa-chevron-right text-xs" />
                                </button>
                            </div>

                            {/* Jump to page */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-slate-400 font-bold">Đến trang</span>
                                <input
                                    type="number" min={1} max={totalPages}
                                    defaultValue={safePage} key={safePage}
                                    onBlur={e => goToPage(parseInt(e.target.value) || 1)}
                                    onKeyDown={e => { if (e.key === 'Enter') goToPage(parseInt((e.target as HTMLInputElement).value) || 1); }}
                                    className="w-12 text-center text-xs font-black border border-slate-200 rounded-xl py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all bg-slate-50"
                                />
                                <span className="text-xs text-slate-400">/ {totalPages}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
