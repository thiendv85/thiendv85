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
    const [showMatrix, setShowMatrix] = useState(false);

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
            const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            air += q.air; sea += q.sea;
            value += (ctx.unitCost || 0) * (q.air + q.sea);
            if ((ctx.available || 0) <= 0 && ctx.baseForecast > 0.02) oos++;
            if ((ctx.available || 0) < (ctx.safetyStock || 0) && ctx.baseForecast > 0.02) risk++;
            if ((ctx.backorder || 0) > (ctx.available || 0)) bo++;
        });
        const avgMos = rows.length > 0
            ? rows.reduce((s, c) => s + (c.mos || 0), 0) / rows.length : 0;
        return { air, sea, value, oos, risk, bo, avgMos };
    }, [rows, localQtys]);

    const hasChanges = useMemo(() =>
        rows.some(ctx => {
            const orig = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
            const cur = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            return orig.air !== cur.air || orig.sea !== cur.sea;
        }), [rows, localQtys, snap.quantities]);

    const setQty = (code: string, field: 'air' | 'sea', val: string) => {
        const n = Math.max(0, parseInt(val) || 0);
        setLocalQtys(prev => ({ ...prev, [code]: { ...(prev[code] || { air: 0, sea: 0 }), [field]: n } }));
    };

    const handleAction = async (action: 'approved' | 'rejected' | 'returned') => {
        if (!user) return;
        if (action === 'returned' && !comment.trim()) { alert('Vui lòng nhập lý do trả lại.'); return; }
        setIsSubmitting(true);
        try {
            await processApprovalAction(request.id, user.id, action, comment || undefined, localQtys);
            onRefresh(); onClose();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    const handleUnlock = async () => {
        if (!user || !unlockReason.trim()) return;
        setIsSubmitting(true);
        try {
            await unlockRequest(request.id, user.id, unlockReason);
            onRefresh(); onClose();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    // ─── KPI card helper ──────────────────────────────────────────────────────
    const KPI = ({ label, value, sub, cls = '' }: { label: string; value: string | number; sub?: string; cls?: string }) => (
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200/80">
            <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{label}</div>
            <div className={`text-lg font-black leading-tight mt-0.5 ${cls}`}>{value}</div>
            {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col">

            {/* ═══ TOP HEADER — compact, always visible ══════════════════════ */}
            <div className="flex items-center gap-3 px-5 py-3 bg-slate-800 text-white shrink-0 border-b border-slate-700">
                <button onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-300 hover:text-white shrink-0">
                    <i className="fas fa-arrow-left text-sm" />
                </button>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                    <span className="font-black text-base truncate">{request.draft_name}</span>
                    <ApprovalStatusBadge status={request.status} />
                    {request.brand && (
                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded font-bold text-slate-300">{request.brand}</span>
                    )}
                    {hasChanges && (
                        <span className="text-xs bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2 py-0.5 rounded font-bold">
                            <i className="fas fa-pencil mr-1" />Đã điều chỉnh
                        </span>
                    )}
                </div>
                <div className="text-xs text-slate-400 shrink-0">
                    Level {request.current_level} · {new Date(request.submitted_at).toLocaleDateString('vi-VN')}
                </div>
            </div>

            {/* ═══ BODY: sidebar + table ══════════════════════════════════════ */}
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* ── LEFT SIDEBAR (fixed, always visible) ────────────────── */}
                <div className="w-[300px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50 overflow-y-auto">

                    {/* KPI Summary */}
                    <div className="p-4 space-y-3 border-b border-slate-200">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng quan đơn hàng</div>
                        <div className="grid grid-cols-2 gap-2">
                            <KPI label="SKU" value={rows.length} />
                            <KPI label="Tổng giá trị" value={`${(totals.value / 1e6).toFixed(1)}M`} cls="text-emerald-700" />
                            {totals.air > 0 && <KPI label="Air" value={totals.air} cls="text-rose-600" sub="Bù nợ" />}
                            {totals.sea > 0 && <KPI label="Sea" value={totals.sea} cls="text-blue-700" sub="Regular" />}
                        </div>

                        {/* Health badges */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {totals.oos > 0 && (
                                <span className="flex items-center gap-1 text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg">
                                    <i className="fas fa-circle-exclamation text-[10px]" /> OOS: {totals.oos}
                                </span>
                            )}
                            {totals.risk > 0 && (
                                <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-lg">
                                    <i className="fas fa-triangle-exclamation text-[10px]" /> Risk: {totals.risk}
                                </span>
                            )}
                            {totals.bo > 0 && (
                                <span className="flex items-center gap-1 text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-lg">
                                    <i className="fas fa-hourglass-half text-[10px]" /> BO: {totals.bo}
                                </span>
                            )}
                            <span className={`flex items-center gap-1 text-xs font-bold border px-2 py-1 rounded-lg ${
                                totals.avgMos < 1 ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : totals.avgMos > 6 ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}>
                                <i className="fas fa-clock text-[10px]" /> MOS: {totals.avgMos.toFixed(1)}M
                            </span>
                        </div>
                    </div>

                    {/* Ma Trận toggle */}
                    <div className="border-b border-slate-200">
                        <button
                            onClick={() => setShowMatrix(p => !p)}
                            className="w-full flex items-center justify-between px-4 py-3 text-xs font-black text-slate-600 uppercase tracking-widest hover:bg-slate-100 transition-colors"
                        >
                            <span><i className="fas fa-table-cells mr-2 text-blue-500" />Ma Trận Cung Ứng</span>
                            <i className={`fas fa-chevron-${showMatrix ? 'up' : 'down'} text-slate-400`} />
                        </button>
                        {showMatrix && (
                            <div className="px-3 pb-3">
                                <SnapshotMatrix items={rows} draftQtys={localQtys} compact />
                            </div>
                        )}
                    </div>

                    {/* Audit Trail */}
                    <div className="border-b border-slate-200 p-4 space-y-2">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            <i className="fas fa-clock-rotate-left mr-1.5" />Lịch sử ({actions.length})
                        </div>
                        {actions.length === 0 ? (
                            <p className="text-slate-400 text-xs italic">Chưa có hành động nào.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {actions.map(a => {
                                    const s = ACTION_STYLE[a.action] || ACTION_STYLE.commented;
                                    return (
                                        <div key={a.id} className="flex items-start gap-2 text-xs bg-white border border-slate-100 rounded-lg px-2.5 py-2">
                                            <i className={`fas ${s.icon} ${s.cls} mt-0.5 shrink-0`} />
                                            <div className="min-w-0">
                                                <span className="font-bold text-slate-700 capitalize">{a.action}</span>
                                                <span className="text-slate-400 ml-1">Lv{a.level}</span>
                                                {a.comment && <p className="text-slate-500 mt-0.5 break-words">{a.comment}</p>}
                                                <p className="text-slate-400 text-[10px] mt-0.5">{new Date(a.acted_at).toLocaleString('vi-VN')}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── ACTION PANEL (always visible in sidebar) ──────────── */}
                    <div className="flex-1 p-4 flex flex-col gap-3">

                        {canAct && (
                            <>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <i className="fas fa-pen-to-square mr-1.5" />Hành động — Level {request.current_level}
                                </div>

                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Ghi chú / lý do trả lại (bắt buộc khi Trả lại)..."
                                    rows={3}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-colors"
                                />

                                <button
                                    onClick={() => handleAction('approved')}
                                    disabled={isSubmitting}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-3 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-sm"
                                >
                                    <i className="fas fa-check" />
                                    {hasChanges ? 'Duyệt (Lưu điều chỉnh)' : 'Duyệt'}
                                </button>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleAction('rejected')}
                                        disabled={isSubmitting}
                                        className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                        <i className="fas fa-xmark" /> Từ chối
                                    </button>
                                    <button
                                        onClick={() => handleAction('returned')}
                                        disabled={isSubmitting}
                                        className="border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 font-black py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                        <i className="fas fa-rotate-left" /> Trả lại
                                    </button>
                                </div>
                            </>
                        )}

                        {canUnlock && (
                            <>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <i className="fas fa-lock-open mr-1.5" />Mở khóa chỉnh sửa
                                </div>
                                {!showUnlock ? (
                                    <button
                                        onClick={() => setShowUnlock(true)}
                                        className="w-full border-2 border-orange-300 text-orange-600 hover:bg-orange-50 font-black py-3 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <i className="fas fa-lock-open" /> Mở khóa
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        <input
                                            value={unlockReason}
                                            onChange={e => setUnlockReason(e.target.value)}
                                            placeholder="Lý do mở khóa..."
                                            className="w-full bg-white border border-orange-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleUnlock} disabled={isSubmitting || !unlockReason.trim()}
                                                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-2 rounded-xl text-xs transition-colors">
                                                Xác nhận
                                            </button>
                                            <button onClick={() => setShowUnlock(false)}
                                                className="px-3 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl text-xs">
                                                Huỷ
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {!canAct && !canUnlock && (
                            <div className="text-center text-xs text-slate-400 py-4 bg-white border border-slate-100 rounded-xl">
                                <i className="fas fa-eye block text-2xl mb-2 text-slate-300" />
                                Chế độ xem — không có quyền thao tác
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Order Table ───────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                    {/* Table title bar */}
                    <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Chi tiết đặt hàng</span>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{rows.length} mã</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-bold">
                            {totals.air > 0 && <span className="text-rose-600"><i className="fas fa-plane mr-1" />Air: {totals.air}</span>}
                            {totals.sea > 0 && <span className="text-blue-700"><i className="fas fa-ship mr-1" />Sea: {totals.sea}</span>}
                            <span className="text-emerald-700 font-black">{currencyVND.format(totals.value)}</span>
                        </div>
                    </div>

                    {/* Scrollable table */}
                    <div className="flex-1 overflow-auto min-h-0">
                        <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1600px]">
                            <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30">
                                <tr className="text-xs uppercase font-black tracking-wider">
                                    <th className="px-4 py-3.5 w-10 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-slate-50/95">#</th>
                                    <th className="px-4 py-3.5 min-w-[210px] sticky left-10 z-40 bg-slate-50/95 border-b border-slate-200 border-r border-slate-200">SKU Identity</th>
                                    <th className="px-4 py-3.5 text-center border-b border-slate-200 min-w-[115px]">Demand</th>
                                    <th className="px-4 py-3.5 min-w-[155px] text-right border-b border-slate-200">Stock Health</th>
                                    <th className="px-4 py-3.5 text-center border-b border-slate-200 min-w-[105px]">Supply Pipeline</th>
                                    <th className="px-4 py-3.5 text-center border-b border-slate-200 min-w-[135px]">Sales Momentum</th>
                                    <th className="px-4 py-3.5 text-center border-b border-slate-200 min-w-[75px]">MOS</th>
                                    <th className="px-4 py-3.5 text-center border-b border-slate-200 min-w-[95px]">Dealer & CST</th>
                                    <th className="px-4 py-3.5 text-center border-x border-slate-200 bg-rose-50/40 border-b border-slate-200 min-w-[105px]">
                                        <span className="text-rose-600">Air (Bù Nợ)</span>
                                    </th>
                                    <th className="px-4 py-3.5 text-center border-r border-slate-200 bg-blue-50/40 border-b border-slate-200 min-w-[105px]">
                                        <span className="text-blue-700">Sea (Regular)</span>
                                    </th>
                                    <th className="px-4 py-3.5 min-w-[130px] border-b border-slate-200">Ghi chú</th>
                                    <th className="px-4 py-3.5 text-right sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {rows.map((ctx, idx) => {
                                    const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                                    const origQ = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
                                    const changed = q.air !== origQ.air || q.sea !== origQ.sea;
                                    const draftTotal = q.air + q.sea;
                                    const note = snap.notes[ctx.itemCode] || '';
                                    const rowValue = (ctx.unitCost || 0) * draftTotal;
                                    const demandMonthly = ctx.avgQty3M || ctx.baseForecast || 0;

                                    return (
                                        <tr key={ctx.itemCode}
                                            className={`hover:bg-slate-50 transition-colors group ${changed ? 'bg-amber-50/40' : draftTotal > 0 ? 'bg-blue-50/15' : ''}`}>

                                            {/* # */}
                                            <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs font-black border-b border-slate-50 sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                                                {idx + 1}
                                            </td>

                                            {/* SKU */}
                                            <td className="px-4 py-3 sticky left-10 z-10 bg-white group-hover:bg-slate-50 border-b border-slate-50 border-r border-slate-100">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-black text-slate-800 text-sm font-mono tracking-tight">{ctx.itemCode}</span>
                                                    <span className={`px-1.5 py-0.5 rounded font-black text-[9px] shrink-0 ${
                                                        ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700'
                                                        : ctx.priorityBucket === 'P2' ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-100 text-slate-500'}`}>
                                                        {ctx.priorityBucket || 'P3'}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-500 truncate max-w-[195px] mt-0.5">{ctx.itemName}</div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {ctx.status && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{ctx.status}</span>}
                                                    {ctx.loisGroup && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase">L{ctx.loisGroup}</span>}
                                                    {ctx.typecar && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-slate-100 text-slate-500 truncate max-w-[80px]" title={ctx.typecar}>{ctx.typecar.split(' | ')[0]}</span>}
                                                </div>
                                            </td>

                                            {/* Demand */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80">
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase">M-1</span>
                                                            <span className="font-black text-slate-800 text-sm leading-none">{(ctx.m1Actual || 0).toLocaleString()}</span>
                                                        </div>
                                                        <div className="h-7 w-px bg-slate-200" />
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="text-[9px] font-black text-emerald-500 uppercase">FC</span>
                                                            <span className="font-black text-emerald-700 text-sm leading-none">
                                                                {ctx.baseForecast ? (ctx.baseForecast >= 10 ? Math.round(ctx.baseForecast).toLocaleString() : ctx.baseForecast.toFixed(1)) : '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <TrendBadge trend={ctx.trendFlag} />
                                                </div>
                                            </td>

                                            {/* Stock Health */}
                                            <td className="px-4 py-3 text-right border-b border-slate-50">
                                                <StockProgressBar
                                                    current={ctx.available} rop={ctx.rop}
                                                    max={ctx.stockMax || 1} ss={ctx.safetyStock}
                                                    onOrder={ctx.totalPO} incoming={ctx.incomingCurrentMonth}
                                                    backorder={ctx.backorder} draftAdd={draftTotal}
                                                    baseFc={ctx.baseForecast}
                                                />
                                            </td>

                                            {/* Supply Pipeline */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50">
                                                <div className="flex flex-col items-center gap-1">
                                                    {ctx.incomingCurrentMonth > 0 ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-base font-black text-blue-700">+{ctx.incomingCurrentMonth.toLocaleString()}</span>
                                                            <span className="text-[10px] font-bold text-blue-400 uppercase">Về tháng này</span>
                                                        </div>
                                                    ) : <span className="text-slate-300 font-black text-base">-</span>}
                                                    {ctx.totalPO > 0 && (
                                                        <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                                            <i className="fas fa-ship text-indigo-400 text-[9px]" />
                                                            <span className="text-[10px] font-black text-indigo-600">PO: {ctx.totalPO.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Sales Momentum */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50">
                                                <SalesMomentum
                                                    values={[ctx.avgQty24M, ctx.avgQty12M, ctx.avgQty6M, ctx.avgQty3M]}
                                                    history={ctx.salesHistory} forecast={ctx.baseForecast}
                                                />
                                            </td>

                                            {/* MOS */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50">
                                                {demandMonthly <= 0 ? (
                                                    <div className="text-slate-300 font-black">∞</div>
                                                ) : (
                                                    <div className={`text-base font-black ${ctx.mos < 1 ? 'text-rose-700' : ctx.mos > 12 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                        {(ctx.mos || 0).toFixed(1)}<span className="text-xs text-slate-400 ml-0.5">M</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Dealer & CST */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50">
                                                <div className="text-sm font-black text-slate-800">{(ctx.dealerInventory || 0).toLocaleString()}</div>
                                                <div className="mt-1 inline-block text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                    {demandMonthly <= 0 ? 'CST: ∞' : `CST: ${(ctx.cst || 0).toFixed(1)}`}
                                                </div>
                                            </td>

                                            {/* Air */}
                                            <td className="px-3 py-3 border-x border-slate-100 bg-rose-50/20 text-center border-b border-slate-50">
                                                {canAct ? (
                                                    <>
                                                        <input type="number" value={q.air || ''} onChange={e => setQty(ctx.itemCode, 'air', e.target.value)}
                                                            placeholder="0"
                                                            className="w-20 text-center font-black text-sm border border-rose-200 focus:border-rose-400 bg-white text-rose-700 rounded-xl p-2 outline-none transition-all" />
                                                        {changed && q.air !== origQ.air && <div className="text-[10px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.air}</div>}
                                                    </>
                                                ) : (
                                                    <span className={q.air > 0 ? 'font-black text-rose-700' : 'text-slate-300'}>{q.air > 0 ? q.air : '—'}</span>
                                                )}
                                            </td>

                                            {/* Sea */}
                                            <td className="px-3 py-3 border-r border-slate-100 bg-blue-50/20 text-center border-b border-slate-50">
                                                {canAct ? (
                                                    <>
                                                        <input type="number" value={q.sea || ''} onChange={e => setQty(ctx.itemCode, 'sea', e.target.value)}
                                                            placeholder="0"
                                                            className="w-20 text-center font-black text-sm border border-blue-200 focus:border-blue-400 bg-white text-blue-700 rounded-xl p-2 outline-none transition-all" />
                                                        {changed && q.sea !== origQ.sea && <div className="text-[10px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.sea}</div>}
                                                    </>
                                                ) : (
                                                    <span className={q.sea > 0 ? 'font-black text-blue-700' : 'text-slate-300'}>{q.sea > 0 ? q.sea : '—'}</span>
                                                )}
                                            </td>

                                            {/* Ghi chú */}
                                            <td className="px-4 py-3 border-b border-slate-50">
                                                {note ? <span className="text-xs text-slate-500 italic">{note}</span> : <span className="text-slate-300">—</span>}
                                                {(ctx.warnings || []).slice(0, 1).map((w, i) => (
                                                    <div key={i} className="text-[10px] text-amber-600 font-bold mt-0.5">
                                                        <i className="fas fa-triangle-exclamation mr-1" />{w}
                                                    </div>
                                                ))}
                                            </td>

                                            {/* Thành tiền */}
                                            <td className="px-4 py-3 text-right font-black text-slate-900 sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-b border-slate-50 border-l border-slate-200">
                                                {draftTotal > 0
                                                    ? <span className={changed ? 'text-amber-700' : ''}>{currencyVND.format(rowValue)}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
