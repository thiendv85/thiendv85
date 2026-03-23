import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../utils/authContext';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { Typography } from '../components/Typography';
import {
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestById,
    fetchRequestActions,
    processApprovalAction,
    unlockRequest,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction, SnapshotData } from '../types/inventory';

type TabFilter = 'pending' | 'mine' | 'all';

// ─── Snapshot Viewer ─────────────────────────────────────────────────────────

const PriorityBadge = ({ p }: { p?: string }) => {
    const cls = p === 'P1' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        : p === 'P2' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
        : 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black border ${cls}`}>{p || 'P3'}</span>;
};

const fmt = (n?: number, dec = 0) => n == null ? '-' : n.toLocaleString('vi-VN', { maximumFractionDigits: dec });
const fmtM = (n?: number) => n == null ? '-' : n.toFixed(1) + 'M';

const SnapshotViewer = ({ data }: { data: SnapshotData }) => {
    const items = Object.entries(data.quantities).filter(([, q]) => q.air > 0 || q.sea > 0);
    const totalAir = items.reduce((s, [, q]) => s + q.air, 0);
    const totalSea = items.reduce((s, [, q]) => s + q.sea, 0);
    const totalValue = items.reduce((s, [code, q]) => {
        const ctx = data.inventory_context.find(c => c.itemCode === code);
        return s + (ctx?.unitCost || 0) * (q.air + q.sea);
    }, 0);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                <span><i className="fas fa-calendar-alt mr-1" />{new Date(data.submitted_at).toLocaleString('vi-VN')}</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded font-bold">{items.length} SKU</span>
                {totalAir > 0 && <span className="text-amber-300 font-bold"><i className="fas fa-plane mr-1" />Air: {totalAir}</span>}
                {totalSea > 0 && <span className="text-cyan-300 font-bold"><i className="fas fa-ship mr-1" />Sea: {totalSea}</span>}
                {totalValue > 0 && <span className="text-emerald-300 font-bold ml-auto">{(totalValue / 1e6).toFixed(1)}M VND</span>}
            </div>

            <div className="overflow-auto rounded-xl border border-slate-700/50 max-h-[480px]">
                <table className="w-full text-xs border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-slate-800 text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                            <th className="px-3 py-2.5 text-left font-black sticky left-0 bg-slate-800 z-20 border-b border-slate-700/50">SKU</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50 bg-rose-900/30 text-rose-300">Air</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50 bg-cyan-900/30 text-cyan-300">Sea</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">Tồn kho</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">SS / ROP</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">MAX</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">Pipeline</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">BO</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">Demand</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">MOS</th>
                            <th className="px-3 py-2.5 text-center font-black border-b border-slate-700/50">P</th>
                            <th className="px-3 py-2.5 text-left font-black border-b border-slate-700/50">Cảnh báo / Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(([code, qty], i) => {
                            const ctx = data.inventory_context.find(c => c.itemCode === code);
                            const note = data.notes[code] || '';
                            const hasWarning = ctx?.warnings?.length > 0;
                            const rowCls = `border-t border-slate-700/30 ${i % 2 === 0 ? 'bg-slate-900/20' : ''} hover:bg-slate-700/30 transition-colors`;
                            const stockPct = ctx && ctx.stockMax > 0 ? Math.min(100, (ctx.available / ctx.stockMax) * 100) : 0;
                            return (
                                <tr key={code} className={rowCls}>
                                    {/* SKU */}
                                    <td className="px-3 py-2 sticky left-0 bg-slate-900 border-r border-slate-700/30 min-w-[160px]">
                                        <div className="font-mono font-bold text-blue-300 text-[11px]">{code}</div>
                                        <div className="text-slate-400 truncate max-w-[140px] text-[10px]">{ctx?.itemName || ''}</div>
                                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                            {ctx?.loisGroup && <span className="text-[8px] bg-slate-700 text-slate-300 px-1 py-0.5 rounded font-bold">L{ctx.loisGroup}</span>}
                                            {ctx?.trendFlag && <span className="text-[8px] bg-blue-900/40 text-blue-300 px-1 py-0.5 rounded font-bold">{ctx.trendFlag}</span>}
                                            {ctx?.typecar && <span className="text-[8px] text-slate-500">{ctx.typecar}</span>}
                                        </div>
                                    </td>
                                    {/* Air */}
                                    <td className="px-3 py-2 text-center bg-rose-900/10">
                                        {qty.air > 0 ? <span className="font-black text-rose-300 text-sm">{qty.air}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    {/* Sea */}
                                    <td className="px-3 py-2 text-center bg-cyan-900/10">
                                        {qty.sea > 0 ? <span className="font-black text-cyan-300 text-sm">{qty.sea}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    {/* Tồn kho + mini bar */}
                                    <td className="px-3 py-2 text-center min-w-[80px]">
                                        <div className="font-bold text-slate-200">{fmt(ctx?.available)}</div>
                                        {ctx && ctx.stockMax > 0 && (
                                            <div className="w-full h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                                <div className={`h-full rounded-full ${stockPct < 30 ? 'bg-rose-500' : stockPct < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${stockPct}%` }} />
                                            </div>
                                        )}
                                    </td>
                                    {/* SS / ROP */}
                                    <td className="px-3 py-2 text-center text-slate-400">
                                        <div>{fmt(ctx?.safetyStock)}</div>
                                        <div className="text-slate-500 text-[10px]">ROP: {fmt(ctx?.rop)}</div>
                                    </td>
                                    {/* MAX */}
                                    <td className="px-3 py-2 text-center text-slate-400">{fmt(ctx?.stockMax)}</td>
                                    {/* Pipeline */}
                                    <td className="px-3 py-2 text-center">
                                        {ctx?.totalPO ? <span className="text-blue-300 font-bold">{fmt(ctx.totalPO)}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    {/* Backorder */}
                                    <td className="px-3 py-2 text-center">
                                        {ctx?.backorder ? <span className="text-rose-400 font-bold">{fmt(ctx.backorder)}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    {/* Demand/Forecast */}
                                    <td className="px-3 py-2 text-center text-slate-400">{fmt(ctx?.baseForecast, 1)}</td>
                                    {/* MOS */}
                                    <td className="px-3 py-2 text-center">
                                        <span className={`font-bold ${ctx?.mos != null && ctx.mos < 1 ? 'text-rose-400' : ctx?.mos != null && ctx.mos < 2 ? 'text-amber-400' : 'text-slate-300'}`}>
                                            {ctx?.mos != null ? ctx.mos.toFixed(1) : '-'}
                                        </span>
                                    </td>
                                    {/* Priority */}
                                    <td className="px-3 py-2 text-center"><PriorityBadge p={ctx?.priorityBucket} /></td>
                                    {/* Warnings + Note */}
                                    <td className="px-3 py-2 min-w-[160px]">
                                        {hasWarning && (
                                            <div className="text-rose-400 text-[10px] mb-0.5">
                                                <i className="fas fa-triangle-exclamation mr-1" />{ctx.warnings.join(' · ')}
                                            </div>
                                        )}
                                        {note && <div className="text-slate-400 italic text-[10px]">{note}</div>}
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-500">Không có dòng nào.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ─── Audit Trail ─────────────────────────────────────────────────────────────

const AuditTrail = ({ actions }: { actions: ApprovalAction[] }) => (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {actions.length === 0 && <p className="text-slate-500 text-xs">Chưa có hành động nào.</p>}
        {actions.map(a => (
            <div key={a.id} className={`flex gap-2 text-xs rounded-lg px-3 py-2 border ${a.action === 'approved' ? 'bg-emerald-900/20 border-emerald-700/30' : a.action === 'rejected' ? 'bg-rose-900/20 border-rose-700/30' : a.action === 'returned' ? 'bg-indigo-900/20 border-indigo-700/30' : 'bg-slate-800/40 border-slate-700/30'}`}>
                <i className={`fas mt-0.5 ${a.action === 'approved' ? 'fa-circle-check text-emerald-400' : a.action === 'rejected' ? 'fa-circle-xmark text-rose-400' : a.action === 'returned' ? 'fa-rotate-left text-indigo-400' : 'fa-comment text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-300">Level {a.level}</span>
                    <span className="text-slate-500 ml-2">{new Date(a.acted_at).toLocaleString('vi-VN')}</span>
                    {a.comment && <p className="text-slate-400 mt-0.5 truncate">{a.comment}</p>}
                </div>
            </div>
        ))}
    </div>
);

// ─── Request Detail Panel ────────────────────────────────────────────────────

interface DetailPanelProps {
    request: ApprovalRequest;
    actions: ApprovalAction[];
    onClose: () => void;
    onRefresh: () => void;
}

const DetailPanel = ({ request, actions, onClose, onRefresh }: DetailPanelProps) => {
    const { user, profile } = useAuth();
    const [comment, setComment] = useState('');
    const [unlockReason, setUnlockReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showUnlock, setShowUnlock] = useState(false);

    const canAct = profile?.role && ['admin', 'approver'].includes(profile.role)
        && ['pending', 'in_progress'].includes(request.status);
    const canUnlock = profile?.role && ['admin', 'approver'].includes(profile.role)
        && request.status === 'approved';

    const handleAction = async (action: 'approved' | 'rejected' | 'returned') => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            await processApprovalAction(request.id, user.id, action, comment || undefined);
            onRefresh();
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnlock = async () => {
        if (!user || !unlockReason.trim()) return;
        setIsSubmitting(true);
        try {
            await unlockRequest(request.id, user.id, unlockReason);
            onRefresh();
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <ApprovalStatusBadge status={request.status} />
                        <Typography variant="h3" className="text-white">{request.draft_name}</Typography>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><i className="fas fa-xmark" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Snapshot */}
                    <section>
                        <Typography variant="label" className="text-slate-400 uppercase tracking-widest mb-2 block">Chi tiết đơn hàng (Snapshot)</Typography>
                        <SnapshotViewer data={request.snapshot_data} />
                    </section>

                    {/* Audit trail */}
                    <section>
                        <Typography variant="label" className="text-slate-400 uppercase tracking-widest mb-2 block">Lịch sử phê duyệt</Typography>
                        <AuditTrail actions={actions} />
                    </section>

                    {/* Action area */}
                    {canAct && (
                        <section className="space-y-3">
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest block">Hành động (Level {request.current_level})</Typography>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Ghi chú (tuỳ chọn)..."
                                rows={2}
                                className="w-full bg-slate-800/60 border border-slate-600 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-400 resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleAction('approved')}
                                    disabled={isSubmitting}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-check" /> Duyệt
                                </button>
                                <button
                                    onClick={() => handleAction('rejected')}
                                    disabled={isSubmitting}
                                    className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-xmark" /> Từ chối
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    if (!comment.trim()) { alert('Vui lòng nhập lý do trả lại.'); return; }
                                    handleAction('returned');
                                }}
                                disabled={isSubmitting}
                                className="w-full border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50 font-black py-2 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-rotate-left" /> Trả lại để điều chỉnh
                            </button>
                        </section>
                    )}

                    {/* Unlock area */}
                    {canUnlock && (
                        <section className="space-y-3">
                            {!showUnlock ? (
                                <button onClick={() => setShowUnlock(true)} className="w-full border border-orange-500/50 text-orange-300 hover:bg-orange-500/10 font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2">
                                    <i className="fas fa-lock-open" /> Mở khóa để sửa
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        value={unlockReason}
                                        onChange={e => setUnlockReason(e.target.value)}
                                        placeholder="Lý do mở khóa..."
                                        className="w-full bg-slate-800/60 border border-slate-600 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 outline-none focus:border-orange-400"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleUnlock} disabled={!unlockReason.trim() || isSubmitting} className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black py-2 rounded-xl text-sm flex items-center justify-center gap-2">
                                            <i className="fas fa-lock-open" /> Xác nhận mở
                                        </button>
                                        <button onClick={() => setShowUnlock(false)} className="px-4 text-slate-400 hover:text-white border border-slate-600 rounded-xl text-sm">Hủy</button>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ApprovalQueue = () => {
    const { user, profile } = useAuth();
    const [tab, setTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);

    const loadRequests = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let data: ApprovalRequest[] = [];
            if (tab === 'pending') data = await fetchPendingForApprover(user.id);
            else if (tab === 'mine') data = await fetchMyRequests(user.id);
            else data = await fetchAllRequests();
            setRequests(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [user, tab]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    const openDetail = async (req: ApprovalRequest) => {
        const full = await fetchRequestById(req.id);
        const acts = await fetchRequestActions(req.id);
        if (full) setSelected({ req: full, actions: acts });
    };

    const TABS: { id: TabFilter; label: string }[] = [
        { id: 'pending', label: 'Cần duyệt' },
        { id: 'mine', label: 'Của tôi' },
        { id: 'all', label: 'Tất cả' },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Typography variant="h2" className="text-slate-800">Phê duyệt Đặt hàng</Typography>
                    <Typography variant="body" className="text-slate-500 mt-0.5">Quản lý và phê duyệt các yêu cầu đặt hàng.</Typography>
                </div>
                <button onClick={loadRequests} className="text-slate-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50">
                    <i className="fas fa-arrows-rotate text-sm" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <i className="fas fa-circle-notch fa-spin text-2xl" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                        <i className="fas fa-inbox text-3xl" />
                        <span className="text-sm font-medium">Không có yêu cầu nào.</span>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest">
                                <th className="px-4 py-3 text-left font-black">Tên Draft</th>
                                <th className="px-4 py-3 text-left font-black">Brand</th>
                                <th className="px-4 py-3 text-center font-black">Level</th>
                                <th className="px-4 py-3 text-center font-black">Trạng thái</th>
                                <th className="px-4 py-3 text-left font-black">Ngày gửi</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                                    <td className="px-4 py-3 font-bold text-slate-800">{req.draft_name}</td>
                                    <td className="px-4 py-3 text-slate-500">{req.brand || '—'}</td>
                                    <td className="px-4 py-3 text-center text-slate-500">{req.current_level}</td>
                                    <td className="px-4 py-3 text-center"><ApprovalStatusBadge status={req.status} size="sm" /></td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(req.submitted_at).toLocaleDateString('vi-VN')}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => openDetail(req)}
                                            className="text-blue-500 hover:text-blue-700 text-xs font-black uppercase tracking-widest"
                                        >
                                            Xem <i className="fas fa-chevron-right ml-1" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <DetailPanel
                    request={selected.req}
                    actions={selected.actions}
                    onClose={() => setSelected(null)}
                    onRefresh={loadRequests}
                />
            )}
        </div>
    );
};
