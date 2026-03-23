import React, { useState, useMemo } from 'react';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { Typography } from './Typography';
import { useAuth } from '../utils/authContext';
import { processApprovalAction, unlockRequest } from '../utils/supabase';

interface Props {
    request: ApprovalRequest;
    actions: ApprovalAction[];
    onClose: () => void;
    onRefresh: () => void;
}

const fmt = (n?: number, dec = 0) =>
    n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: dec });

const PBadge = ({ p }: { p?: string }) => {
    const cls = p === 'P1'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        : p === 'P2'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
        : 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black border ${cls}`}>{p || 'P3'}</span>;
};

const mosCls = (mos: number) => {
    if (mos <= 0) return 'text-rose-400 font-black';
    if (mos < 1.5) return 'text-orange-400 font-bold';
    if (mos < 3) return 'text-amber-300';
    return 'text-emerald-400';
};

export const OrderReviewModal = ({ request, actions, onClose, onRefresh }: Props) => {
    const { user, profile } = useAuth();
    const snap = request.snapshot_data;

    const [localQtys, setLocalQtys] = useState<Record<string, { air: number; sea: number }>>(
        () => Object.fromEntries(
            Object.entries(snap.quantities).map(([k, v]) => [k, { air: v.air, sea: v.sea }])
        )
    );

    const [comment, setComment] = useState('');
    const [unlockReason, setUnlockReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showUnlock, setShowUnlock] = useState(false);
    const [showAudit, setShowAudit] = useState(false);

    const canAct = !!(profile?.role && ['admin', 'approver'].includes(profile.role)
        && ['pending', 'in_progress'].includes(request.status));
    const canUnlock = !!(profile?.role && ['admin', 'approver'].includes(profile.role)
        && request.status === 'approved');

    // Items from snapshot that originally had quantities
    const rows = useMemo(() => {
        return snap.inventory_context.filter(ctx =>
            (snap.quantities[ctx.itemCode]?.air || 0) > 0 ||
            (snap.quantities[ctx.itemCode]?.sea || 0) > 0
        );
    }, [snap]);

    const totals = useMemo(() => {
        let air = 0, sea = 0, value = 0;
        rows.forEach(ctx => {
            const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            air += q.air;
            sea += q.sea;
            value += (ctx.unitCost || 0) * (q.air + q.sea);
        });
        return { air, sea, value };
    }, [rows, localQtys]);

    const hasChanges = useMemo(() => {
        return rows.some(ctx => {
            const orig = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
            const cur = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            return orig.air !== cur.air || orig.sea !== cur.sea;
        });
    }, [rows, localQtys, snap.quantities]);

    const setQty = (code: string, field: 'air' | 'sea', val: string) => {
        const n = Math.max(0, parseInt(val) || 0);
        setLocalQtys(prev => ({ ...prev, [code]: { ...(prev[code] || { air: 0, sea: 0 }), [field]: n } }));
    };

    const handleAction = async (action: 'approved' | 'rejected' | 'returned') => {
        if (!user) return;
        if (action === 'returned' && !comment.trim()) {
            alert('Vui lòng nhập lý do trả lại.');
            return;
        }
        setIsSubmitting(true);
        try {
            const modifiedQtys = action === 'approved' ? localQtys : undefined;
            await processApprovalAction(request.id, user.id, action, comment || undefined, modifiedQtys);
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
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col">
            {/* ─── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0">
                        <i className="fas fa-arrow-left text-sm" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Typography variant="h3" className="text-white truncate">{request.draft_name}</Typography>
                            <ApprovalStatusBadge status={request.status} />
                            {request.brand && (
                                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{request.brand}</span>
                            )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                            Level {request.current_level} · Gửi {new Date(request.submitted_at).toLocaleString('vi-VN')}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="hidden md:flex items-center gap-4 text-xs shrink-0 ml-4">
                    <span className="bg-slate-800 px-3 py-1.5 rounded-lg font-bold text-slate-300">{rows.length} SKU</span>
                    {totals.air > 0 && (
                        <span className="bg-rose-500/15 text-rose-300 px-3 py-1.5 rounded-lg font-bold border border-rose-500/25">
                            <i className="fas fa-plane mr-1.5" />Air: {totals.air}
                        </span>
                    )}
                    {totals.sea > 0 && (
                        <span className="bg-cyan-500/15 text-cyan-300 px-3 py-1.5 rounded-lg font-bold border border-cyan-500/25">
                            <i className="fas fa-ship mr-1.5" />Sea: {totals.sea}
                        </span>
                    )}
                    <span className="bg-emerald-500/15 text-emerald-300 px-3 py-1.5 rounded-lg font-bold border border-emerald-500/25">
                        {(totals.value / 1e6).toFixed(1)}M VND
                    </span>
                    {hasChanges && (
                        <span className="bg-amber-500/15 text-amber-300 px-3 py-1.5 rounded-lg font-bold border border-amber-500/25 animate-pulse">
                            <i className="fas fa-edit mr-1.5" />Đã điều chỉnh
                        </span>
                    )}
                </div>
            </div>

            {/* ─── Table ───────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-xs border-separate border-spacing-0">
                    <thead className="sticky top-0 z-30">
                        <tr className="bg-slate-900/95 backdrop-blur-sm text-slate-400 text-[10px] uppercase tracking-widest">
                            <th className="px-3 py-3 text-center w-10 sticky left-0 z-40 bg-slate-900/95 border-b border-slate-700/50">#</th>
                            <th className="px-3 py-3 text-left min-w-[220px] sticky left-10 z-40 bg-slate-900/95 border-b border-slate-700/50 border-r border-slate-700/30">SKU / Tên</th>
                            <th className="px-3 py-3 text-right min-w-[90px] border-b border-slate-700/50">Tồn kho</th>
                            <th className="px-3 py-3 text-right min-w-[80px] border-b border-slate-700/50">SS / ROP</th>
                            <th className="px-3 py-3 text-right min-w-[70px] border-b border-slate-700/50">MAX</th>
                            <th className="px-3 py-3 text-right min-w-[70px] border-b border-slate-700/50">Pipeline</th>
                            <th className="px-3 py-3 text-right min-w-[60px] border-b border-slate-700/50">BO</th>
                            <th className="px-3 py-3 text-right min-w-[70px] border-b border-slate-700/50">Demand</th>
                            <th className="px-3 py-3 text-center min-w-[55px] border-b border-slate-700/50">MOS</th>
                            <th className="px-3 py-3 text-center min-w-[40px] border-b border-slate-700/50">P</th>
                            <th className="px-3 py-3 text-center min-w-[80px] border-b border-slate-700/50 bg-rose-500/5 text-rose-400">
                                <i className="fas fa-plane mr-1" />Air
                            </th>
                            <th className="px-3 py-3 text-center min-w-[80px] border-b border-slate-700/50 bg-cyan-500/5 text-cyan-400">
                                <i className="fas fa-ship mr-1" />Sea
                            </th>
                            <th className="px-3 py-3 text-right min-w-[100px] border-b border-slate-700/50">Ghi chú</th>
                            <th className="px-3 py-3 text-right min-w-[90px] sticky right-0 z-40 bg-slate-900/95 border-b border-slate-700/50 border-l border-slate-700/30">Giá trị</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((ctx, idx) => {
                            const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                            const origQ = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
                            const changed = q.air !== origQ.air || q.sea !== origQ.sea;
                            const note = snap.notes[ctx.itemCode] || '';
                            const rowValue = (ctx.unitCost || 0) * (q.air + q.sea);

                            // Stock bar
                            const avail = ctx.available || 0;
                            const ss = ctx.safetyStock || 0;
                            const stockMax = ctx.stockMax || 1;
                            const barPct = Math.min(100, Math.round((avail / stockMax) * 100));
                            const barCls = avail < ss ? 'bg-rose-500' : avail < (ctx.rop || 0) ? 'bg-amber-500' : 'bg-emerald-500';

                            return (
                                <tr
                                    key={ctx.itemCode}
                                    className={`border-b border-slate-800/50 transition-colors ${changed ? 'bg-amber-500/5' : 'hover:bg-slate-900/40'}`}
                                >
                                    <td className="px-3 py-2.5 text-center text-slate-500 font-mono font-black sticky left-0 bg-slate-950 border-r border-slate-800/40">
                                        {idx + 1}
                                    </td>

                                    {/* SKU */}
                                    <td className="px-3 py-2.5 sticky left-10 bg-slate-950 border-r border-slate-700/30">
                                        <div className="font-mono text-[11px] text-slate-200 font-bold">{ctx.itemCode}</div>
                                        <div className="text-slate-400 text-[10px] leading-tight mt-0.5 max-w-[200px] truncate" title={ctx.itemName}>
                                            {ctx.itemName}
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                            {ctx.loisGroup && (
                                                <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                                    L{ctx.loisGroup}
                                                </span>
                                            )}
                                            {ctx.trendFlag && ctx.trendFlag !== 'stable' && (
                                                <span className={`px-1 py-0.5 rounded text-[9px] font-bold border ${
                                                    ctx.trendFlag === 'up' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                                                    : ctx.trendFlag === 'down' ? 'bg-rose-500/15 text-rose-300 border-rose-500/25'
                                                    : 'bg-slate-700/40 text-slate-400 border-slate-600/40'
                                                }`}>
                                                    {ctx.trendFlag === 'up' ? '▲' : ctx.trendFlag === 'down' ? '▼' : '~'}
                                                </span>
                                            )}
                                            {ctx.typecar && (
                                                <span className="px-1 py-0.5 rounded text-[9px] text-slate-500 bg-slate-800 border border-slate-700/40 truncate max-w-[80px]" title={ctx.typecar}>
                                                    {ctx.typecar.split(' | ')[0]}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Tồn kho */}
                                    <td className="px-3 py-2.5 text-right">
                                        <div className="font-bold text-slate-200">{fmt(avail)}</div>
                                        <div className="w-full bg-slate-700/50 rounded-full h-1 mt-1">
                                            <div className={`h-1 rounded-full ${barCls}`} style={{ width: `${barPct}%` }} />
                                        </div>
                                        <div className="text-slate-500 text-[9px] mt-0.5">{barPct}%</div>
                                    </td>

                                    {/* SS / ROP */}
                                    <td className="px-3 py-2.5 text-right">
                                        <div className="text-slate-400">{fmt(ss)}</div>
                                        <div className="text-slate-500 text-[9px]">ROP {fmt(ctx.rop)}</div>
                                    </td>

                                    {/* MAX */}
                                    <td className="px-3 py-2.5 text-right text-slate-400">{fmt(ctx.stockMax)}</td>

                                    {/* Pipeline */}
                                    <td className="px-3 py-2.5 text-right">
                                        <span className={ctx.totalPO ? 'text-cyan-400 font-bold' : 'text-slate-500'}>
                                            {fmt(ctx.totalPO)}
                                        </span>
                                    </td>

                                    {/* BO */}
                                    <td className="px-3 py-2.5 text-right">
                                        <span className={ctx.backorder ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                                            {fmt(ctx.backorder)}
                                        </span>
                                    </td>

                                    {/* Demand */}
                                    <td className="px-3 py-2.5 text-right text-slate-300">{fmt(ctx.baseForecast, 1)}</td>

                                    {/* MOS */}
                                    <td className="px-3 py-2.5 text-center">
                                        <span className={`font-bold ${mosCls(ctx.mos || 0)}`}>
                                            {(ctx.mos || 0).toFixed(1)}
                                        </span>
                                    </td>

                                    {/* Priority */}
                                    <td className="px-3 py-2.5 text-center">
                                        <PBadge p={ctx.priorityBucket} />
                                    </td>

                                    {/* Air input */}
                                    <td className="px-2 py-2 text-center bg-rose-500/5">
                                        {canAct ? (
                                            <input
                                                type="number"
                                                min="0"
                                                value={q.air || ''}
                                                onChange={e => setQty(ctx.itemCode, 'air', e.target.value)}
                                                placeholder="0"
                                                className={`w-16 text-center rounded-lg px-1.5 py-1 text-sm font-bold outline-none border transition-colors
                                                    ${changed && q.air !== origQ.air
                                                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                                        : q.air > 0
                                                        ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                                                        : 'bg-slate-800/60 border-slate-600/40 text-slate-400'
                                                    } focus:border-rose-400`}
                                            />
                                        ) : (
                                            <span className={q.air > 0 ? 'text-rose-300 font-bold' : 'text-slate-500'}>{q.air || '—'}</span>
                                        )}
                                        {changed && q.air !== origQ.air && (
                                            <div className="text-[9px] text-amber-400 mt-0.5">gốc: {origQ.air}</div>
                                        )}
                                    </td>

                                    {/* Sea input */}
                                    <td className="px-2 py-2 text-center bg-cyan-500/5">
                                        {canAct ? (
                                            <input
                                                type="number"
                                                min="0"
                                                value={q.sea || ''}
                                                onChange={e => setQty(ctx.itemCode, 'sea', e.target.value)}
                                                placeholder="0"
                                                className={`w-16 text-center rounded-lg px-1.5 py-1 text-sm font-bold outline-none border transition-colors
                                                    ${changed && q.sea !== origQ.sea
                                                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                                        : q.sea > 0
                                                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                                                        : 'bg-slate-800/60 border-slate-600/40 text-slate-400'
                                                    } focus:border-cyan-400`}
                                            />
                                        ) : (
                                            <span className={q.sea > 0 ? 'text-cyan-300 font-bold' : 'text-slate-500'}>{q.sea || '—'}</span>
                                        )}
                                        {changed && q.sea !== origQ.sea && (
                                            <div className="text-[9px] text-amber-400 mt-0.5">gốc: {origQ.sea}</div>
                                        )}
                                    </td>

                                    {/* Note */}
                                    <td className="px-3 py-2.5 text-right max-w-[120px]">
                                        {note ? (
                                            <span className="text-slate-400 text-[10px] italic truncate block" title={note}>{note}</span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                        {(ctx.warnings || []).length > 0 && (
                                            <span className="text-amber-400 text-[9px] block mt-0.5">
                                                <i className="fas fa-triangle-exclamation mr-0.5" />
                                                {ctx.warnings[0]}
                                            </span>
                                        )}
                                    </td>

                                    {/* Amount */}
                                    <td className="px-3 py-2.5 text-right sticky right-0 bg-slate-950 border-l border-slate-800/40">
                                        <span className={rowValue > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                                            {rowValue > 0 ? `${(rowValue / 1e6).toFixed(2)}M` : '—'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Total row */}
                        <tr className="bg-slate-900/80 border-t-2 border-slate-600/50 sticky bottom-0">
                            <td colSpan={10} className="px-3 py-3 text-right text-slate-400 font-black text-xs uppercase tracking-widest sticky left-0 bg-slate-900/80">
                                Tổng ({rows.length} SKU)
                            </td>
                            <td className="px-2 py-3 text-center bg-rose-500/10">
                                <span className="text-rose-300 font-black text-sm">{totals.air || '—'}</span>
                            </td>
                            <td className="px-2 py-3 text-center bg-cyan-500/10">
                                <span className="text-cyan-300 font-black text-sm">{totals.sea || '—'}</span>
                            </td>
                            <td className="px-3 py-3" />
                            <td className="px-3 py-3 text-right sticky right-0 bg-slate-900/80 border-l border-slate-700/40">
                                <span className="text-emerald-300 font-black">{(totals.value / 1e6).toFixed(1)}M VND</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ─── Footer: Actions ─────────────────────────────────────────────── */}
            <div className="shrink-0 bg-slate-900 border-t border-slate-700/60 px-6 py-4 space-y-3">

                {/* Audit trail toggle */}
                <div>
                    <button
                        onClick={() => setShowAudit(p => !p)}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors"
                    >
                        <i className={`fas fa-chevron-${showAudit ? 'up' : 'down'} text-[10px]`} />
                        Lịch sử phê duyệt ({actions.length} hành động)
                    </button>
                    {showAudit && (
                        <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {actions.length === 0 ? (
                                <p className="text-slate-500 text-xs italic">Chưa có hành động nào.</p>
                            ) : actions.map(a => (
                                <div key={a.id} className={`flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 ${
                                    a.action === 'approved' ? 'bg-emerald-500/10 text-emerald-300'
                                    : a.action === 'rejected' ? 'bg-rose-500/10 text-rose-300'
                                    : a.action === 'returned' ? 'bg-indigo-500/10 text-indigo-300'
                                    : 'bg-slate-800/60 text-slate-400'
                                }`}>
                                    <i className={`fas ${
                                        a.action === 'approved' ? 'fa-check'
                                        : a.action === 'rejected' ? 'fa-xmark'
                                        : a.action === 'returned' ? 'fa-rotate-left'
                                        : 'fa-comment'
                                    } mt-0.5 shrink-0`} />
                                    <span>
                                        <span className="font-bold">{a.action.toUpperCase()}</span> Lv{a.level}
                                        {a.comment && <span className="opacity-80 ml-1">— {a.comment}</span>}
                                        <span className="text-slate-500 ml-1">{new Date(a.acted_at).toLocaleString('vi-VN')}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action area */}
                {canAct && (
                    <div className="space-y-2">
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Ghi chú / lý do (bắt buộc nếu Trả lại)..."
                            rows={2}
                            className="w-full bg-slate-800/60 border border-slate-600 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-400 resize-none"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleAction('approved')}
                                disabled={isSubmitting}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                            >
                                <i className="fas fa-check" />
                                {hasChanges ? 'Duyệt (Đã điều chỉnh)' : 'Duyệt'}
                            </button>
                            <button
                                onClick={() => handleAction('rejected')}
                                disabled={isSubmitting}
                                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                            >
                                <i className="fas fa-xmark" /> Từ chối
                            </button>
                            <button
                                onClick={() => handleAction('returned')}
                                disabled={isSubmitting}
                                className="border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50 font-black px-4 py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                            >
                                <i className="fas fa-rotate-left" /> Trả lại
                            </button>
                        </div>
                    </div>
                )}

                {/* Unlock area */}
                {canUnlock && (
                    <div className="space-y-2">
                        {!showUnlock ? (
                            <button
                                onClick={() => setShowUnlock(true)}
                                className="w-full border border-orange-500/50 text-orange-300 hover:bg-orange-500/10 font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                            >
                                <i className="fas fa-lock-open" /> Mở khóa để sửa
                            </button>
                        ) : (
                            <>
                                <input
                                    value={unlockReason}
                                    onChange={e => setUnlockReason(e.target.value)}
                                    placeholder="Lý do mở khóa..."
                                    className="w-full bg-slate-800/60 border border-orange-500/40 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 outline-none focus:border-orange-400"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleUnlock}
                                        disabled={isSubmitting || !unlockReason.trim()}
                                        className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest transition-colors"
                                    >
                                        Xác nhận mở khóa
                                    </button>
                                    <button
                                        onClick={() => setShowUnlock(false)}
                                        className="px-4 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm font-black transition-colors"
                                    >
                                        Huỷ
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Read-only notice */}
                {!canAct && !canUnlock && (
                    <div className="text-center text-xs text-slate-500 py-1">
                        <i className="fas fa-eye mr-1.5" />Chế độ xem — không có quyền thao tác
                    </div>
                )}
            </div>
        </div>
    );
};
