import React, { useState, useMemo } from 'react';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { StockProgressBar } from './StockProgressBar';
import { SalesMomentum } from './SalesMomentum';
import { TrendBadge } from './TrendBadge';
import { Typography } from './Typography';
import { useAuth } from '../utils/authContext';
import { processApprovalAction, unlockRequest } from '../utils/supabase';

interface Props {
    request: ApprovalRequest;
    actions: ApprovalAction[];
    onClose: () => void;
    onRefresh: () => void;
}

const currencyVND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

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

    const rows = useMemo(() =>
        snap.inventory_context.filter(ctx =>
            (snap.quantities[ctx.itemCode]?.air || 0) > 0 ||
            (snap.quantities[ctx.itemCode]?.sea || 0) > 0
        ), [snap]);

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
        <div className="fixed inset-0 z-[200] bg-white flex flex-col">

            {/* ─── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 px-6 py-3 bg-white border-b-2 border-slate-200 shrink-0 shadow-sm">
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
                    <i className="fas fa-arrow-left text-sm" />
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 text-lg">{request.draft_name}</span>
                        <ApprovalStatusBadge status={request.status} />
                        {request.brand && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{request.brand}</span>}
                        {hasChanges && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold border border-amber-200 animate-pulse">
                                <i className="fas fa-pencil mr-1" />Đã điều chỉnh
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        Level {request.current_level} · Gửi {new Date(request.submitted_at).toLocaleString('vi-VN')}
                    </div>
                </div>

                {/* Stats pills */}
                <div className="hidden lg:flex items-center gap-2 shrink-0">
                    <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl font-black">{rows.length} SKU</span>
                    {totals.air > 0 && (
                        <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl font-black">
                            <i className="fas fa-plane mr-1" />Air: {totals.air}
                        </span>
                    )}
                    {totals.sea > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl font-black">
                            <i className="fas fa-ship mr-1" />Sea: {totals.sea}
                        </span>
                    )}
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-black">
                        {currencyVND.format(totals.value)}
                    </span>
                </div>
            </div>

            {/* ─── Table ───────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1700px]">
                    <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30">
                        <tr className="text-xs uppercase font-black tracking-wider">
                            <th className="px-4 py-4 w-12 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-slate-50/95">#</th>
                            <th className="px-4 py-4 min-w-[220px] sticky left-12 z-40 bg-slate-50/95 border-b border-slate-200 border-r border-slate-200">SKU IDENTITY</th>
                            <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[120px]">DEMAND</th>
                            <th className="px-4 py-4 min-w-[160px] text-right border-b border-slate-200">STOCK HEALTH</th>
                            <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[110px]">SUPPLY PIPELINE</th>
                            <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[140px]">SALES MOMENTUM</th>
                            <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[80px]">MOS</th>
                            <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[100px]">DEALER & CST</th>
                            <th className="px-4 py-4 text-center border-x border-slate-200 bg-rose-50/30 border-b border-slate-200 min-w-[110px]">
                                <span className="text-rose-600">AIR (BÙ NỢ)</span>
                            </th>
                            <th className="px-4 py-4 text-center border-r border-slate-200 bg-blue-50/30 border-b border-slate-200 min-w-[110px]">
                                <span className="text-blue-600">SEA (REGULAR)</span>
                            </th>
                            <th className="px-4 py-4 min-w-[140px] border-b border-slate-200">GHI CHÚ</th>
                            <th className="px-4 py-4 text-right sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200">THÀNH TIỀN</th>
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
                                <tr key={ctx.itemCode} className={`hover:bg-slate-50 transition-colors group ${draftTotal > 0 ? 'bg-blue-50/20' : ''} ${changed ? 'bg-amber-50/30' : ''}`}>
                                    {/* # */}
                                    <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs font-black border-b border-slate-50 sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                                        {idx + 1}
                                    </td>

                                    {/* SKU IDENTITY */}
                                    <td className="px-4 py-3 sticky left-12 z-10 bg-white group-hover:bg-slate-50 transition-colors border-b border-slate-50 border-r border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 text-sm uppercase font-mono tracking-tight">{ctx.itemCode}</span>
                                            <span className={`px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0 ${
                                                ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700'
                                                : ctx.priorityBucket === 'P2' ? 'bg-amber-100 text-amber-700'
                                                : 'bg-slate-100 text-slate-600'
                                            }`}>{ctx.priorityBucket || 'P3'}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 font-bold truncate max-w-[200px] mt-0.5">{ctx.itemName}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            {ctx.status && (
                                                <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                                    {ctx.status}
                                                </span>
                                            )}
                                            {ctx.loisGroup && (
                                                <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-blue-50 text-blue-700 border border-blue-100">LOIS {ctx.loisGroup}</span>
                                            )}
                                            {ctx.typecar && (
                                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[100px]" title={ctx.typecar}>
                                                    {ctx.typecar.split(' | ')[0]}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* DEMAND */}
                                    <td className="px-4 py-3 text-center border-b border-slate-50">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80 shadow-sm">
                                                <div className="flex flex-col items-start leading-tight">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">M-1</span>
                                                    <span className="font-black text-slate-800 text-sm leading-none">{(ctx.m1Actual || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="h-8 w-px bg-slate-200" />
                                                <div className="flex flex-col items-start leading-tight">
                                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">FC</span>
                                                    <span className="font-black text-emerald-700 text-sm leading-none">
                                                        {ctx.baseForecast ? (ctx.baseForecast >= 10 ? Math.round(ctx.baseForecast).toLocaleString() : ctx.baseForecast.toFixed(1)) : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                            <TrendBadge trend={ctx.trendFlag} />
                                        </div>
                                    </td>

                                    {/* STOCK HEALTH */}
                                    <td className="px-4 py-3 text-right border-b border-slate-50">
                                        <div className="flex flex-col items-end">
                                            <StockProgressBar
                                                current={ctx.available}
                                                rop={ctx.rop}
                                                max={ctx.stockMax || 1}
                                                ss={ctx.safetyStock}
                                                onOrder={ctx.totalPO}
                                                incoming={ctx.incomingCurrentMonth}
                                                backorder={ctx.backorder}
                                                draftAdd={draftTotal}
                                                baseFc={ctx.baseForecast}
                                            />
                                        </div>
                                    </td>

                                    {/* SUPPLY PIPELINE */}
                                    <td className="px-4 py-3 text-center border-b border-slate-50">
                                        <div className="flex flex-col items-center gap-1">
                                            {ctx.incomingCurrentMonth > 0 ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="text-base font-black text-blue-700">+{ctx.incomingCurrentMonth.toLocaleString()}</div>
                                                    <div className="text-[10px] font-bold text-blue-400 uppercase leading-tight">Về tháng này</div>
                                                </div>
                                            ) : (
                                                <div className="text-slate-300 font-black text-base">-</div>
                                            )}
                                            {ctx.totalPO > 0 && (
                                                <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                                    <i className="fas fa-ship text-indigo-400 text-[9px]" />
                                                    <span className="text-[10px] font-black text-indigo-600">PO: {ctx.totalPO.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    {/* SALES MOMENTUM */}
                                    <td className="px-4 py-3 text-center border-b border-slate-50">
                                        <SalesMomentum
                                            values={[ctx.avgQty24M, ctx.avgQty12M, ctx.avgQty6M, ctx.avgQty3M]}
                                            history={ctx.salesHistory}
                                            forecast={ctx.baseForecast}
                                        />
                                    </td>

                                    {/* MOS */}
                                    <td className="px-4 py-3 text-center border-b border-slate-50">
                                        {demandMonthly <= 0 ? (
                                            <div className="flex flex-col items-center">
                                                <div className="text-base font-black text-slate-300">∞</div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">No demand</div>
                                            </div>
                                        ) : (
                                            <div className={`text-base font-black ${
                                                ctx.mos < 1 ? 'text-rose-700'
                                                : ctx.mos > 12 ? 'text-amber-700'
                                                : 'text-emerald-700'
                                            }`}>
                                                {(ctx.mos || 0).toFixed(1)} <span className="text-xs text-slate-500">M</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* DEALER & CST */}
                                    <td className="px-4 py-3 text-center border-b border-slate-50">
                                        <div className="text-sm font-black text-slate-800">{(ctx.dealerInventory || 0).toLocaleString()}</div>
                                        <div className="mt-1">
                                            <div className="text-sm font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                                                {demandMonthly <= 0 ? 'CST: ∞' : `CST: ${(ctx.cst || 0).toFixed(1)}`}
                                            </div>
                                        </div>
                                    </td>

                                    {/* AIR */}
                                    <td className="px-4 py-3 border-x border-slate-100 bg-rose-50/10 text-center border-b border-slate-50">
                                        {canAct ? (
                                            <>
                                                <input
                                                    type="number"
                                                    value={q.air || ''}
                                                    onChange={e => setQty(ctx.itemCode, 'air', e.target.value)}
                                                    placeholder="0"
                                                    className="w-20 text-center font-black text-sm border border-rose-200 focus:border-rose-400 bg-white text-rose-700 rounded-xl p-2 outline-none transition-all"
                                                />
                                                {changed && q.air !== origQ.air && (
                                                    <div className="text-[10px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.air}</div>
                                                )}
                                            </>
                                        ) : (
                                            <span className={q.air > 0 ? 'font-black text-rose-700' : 'text-slate-300'}>
                                                {q.air > 0 ? q.air : '—'}
                                            </span>
                                        )}
                                    </td>

                                    {/* SEA */}
                                    <td className="px-4 py-3 border-r border-slate-100 bg-blue-50/10 text-center border-b border-slate-50">
                                        {canAct ? (
                                            <>
                                                <input
                                                    type="number"
                                                    value={q.sea || ''}
                                                    onChange={e => setQty(ctx.itemCode, 'sea', e.target.value)}
                                                    placeholder="0"
                                                    className="w-20 text-center font-black text-sm border border-blue-200 focus:border-blue-400 bg-white text-blue-700 rounded-xl p-2 outline-none transition-all"
                                                />
                                                {changed && q.sea !== origQ.sea && (
                                                    <div className="text-[10px] text-amber-600 mt-0.5 font-bold">gốc: {origQ.sea}</div>
                                                )}
                                            </>
                                        ) : (
                                            <span className={q.sea > 0 ? 'font-black text-blue-700' : 'text-slate-300'}>
                                                {q.sea > 0 ? q.sea : '—'}
                                            </span>
                                        )}
                                    </td>

                                    {/* GHI CHÚ */}
                                    <td className="px-4 py-3 border-b border-slate-50">
                                        {note ? (
                                            <span className="text-xs text-slate-500 italic">{note}</span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                        {(ctx.warnings || []).length > 0 && (
                                            <div className="mt-1">
                                                {ctx.warnings.slice(0, 1).map((w, i) => (
                                                    <span key={i} className="text-[10px] text-amber-600 font-bold block">
                                                        <i className="fas fa-triangle-exclamation mr-1" />{w}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>

                                    {/* THÀNH TIỀN */}
                                    <td className="px-4 py-3 text-right font-black text-slate-900 text-base sticky right-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-b border-slate-50 border-l border-slate-200">
                                        {draftTotal > 0 ? (
                                            <span className={changed ? 'text-amber-700' : ''}>
                                                {currencyVND.format(rowValue)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ─── Footer ──────────────────────────────────────────────────────── */}
            <div className="shrink-0 bg-white border-t-2 border-slate-200 px-6 py-4">
                {/* Summary bar */}
                <div className="flex items-center justify-between mb-3 text-xs">
                    <div className="flex items-center gap-4 font-black text-slate-600 uppercase tracking-widest">
                        <span>{rows.length} SKU</span>
                        {totals.air > 0 && <span className="text-rose-600"><i className="fas fa-plane mr-1" />{totals.air}</span>}
                        {totals.sea > 0 && <span className="text-blue-600"><i className="fas fa-ship mr-1" />{totals.sea}</span>}
                    </div>
                    <span className="font-black text-emerald-700 text-sm">{currencyVND.format(totals.value)}</span>
                </div>

                {/* Audit toggle */}
                <button
                    onClick={() => setShowAudit(p => !p)}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5 mb-2 transition-colors"
                >
                    <i className={`fas fa-chevron-${showAudit ? 'up' : 'down'} text-[10px]`} />
                    Lịch sử phê duyệt ({actions.length})
                </button>
                {showAudit && (
                    <div className="mb-3 space-y-1.5 max-h-28 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                        {actions.length === 0 ? (
                            <p className="text-slate-400 text-xs italic">Chưa có hành động nào.</p>
                        ) : actions.map(a => (
                            <div key={a.id} className={`flex items-start gap-2 text-xs rounded-lg px-2 py-1 ${
                                a.action === 'approved' ? 'bg-emerald-50 text-emerald-700'
                                : a.action === 'rejected' ? 'bg-rose-50 text-rose-700'
                                : a.action === 'returned' ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                                <i className={`fas mt-0.5 ${
                                    a.action === 'approved' ? 'fa-check'
                                    : a.action === 'rejected' ? 'fa-xmark'
                                    : a.action === 'returned' ? 'fa-rotate-left'
                                    : 'fa-comment'
                                }`} />
                                <span>
                                    <span className="font-bold">{a.action.toUpperCase()}</span> Lv{a.level}
                                    {a.comment && <span className="ml-1 opacity-80">— {a.comment}</span>}
                                    <span className="text-slate-400 ml-1">{new Date(a.acted_at).toLocaleString('vi-VN')}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                {canAct && (
                    <div className="space-y-2">
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Ghi chú / lý do (bắt buộc nếu Trả lại)..."
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-sm placeholder-slate-400 outline-none focus:border-blue-400 focus:bg-white resize-none transition-colors"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleAction('approved')}
                                disabled={isSubmitting}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-sm"
                            >
                                <i className="fas fa-check" />
                                {hasChanges ? 'Duyệt (Lưu điều chỉnh)' : 'Duyệt'}
                            </button>
                            <button
                                onClick={() => handleAction('rejected')}
                                disabled={isSubmitting}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-sm"
                            >
                                <i className="fas fa-xmark" /> Từ chối
                            </button>
                            <button
                                onClick={() => handleAction('returned')}
                                disabled={isSubmitting}
                                className="border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 font-black px-5 py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center gap-2 transition-colors"
                            >
                                <i className="fas fa-rotate-left" /> Trả lại
                            </button>
                        </div>
                    </div>
                )}

                {canUnlock && (
                    <div className="space-y-2">
                        {!showUnlock ? (
                            <button
                                onClick={() => setShowUnlock(true)}
                                className="w-full border-2 border-orange-300 text-orange-600 hover:bg-orange-50 font-black py-2.5 rounded-xl text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                            >
                                <i className="fas fa-lock-open" /> Mở khóa để sửa
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    value={unlockReason}
                                    onChange={e => setUnlockReason(e.target.value)}
                                    placeholder="Lý do mở khóa..."
                                    className="flex-1 bg-slate-50 border border-orange-200 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none focus:border-orange-400"
                                />
                                <button
                                    onClick={handleUnlock}
                                    disabled={isSubmitting || !unlockReason.trim()}
                                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black px-4 py-2 rounded-xl text-sm transition-colors"
                                >
                                    Xác nhận
                                </button>
                                <button
                                    onClick={() => setShowUnlock(false)}
                                    className="px-4 border border-slate-300 text-slate-500 hover:text-slate-700 rounded-xl text-sm transition-colors"
                                >
                                    Hủy
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {!canAct && !canUnlock && (
                    <div className="text-center text-xs text-slate-400 py-1">
                        <i className="fas fa-eye mr-1.5" />Chế độ xem — không có quyền thao tác
                    </div>
                )}
            </div>
        </div>
    );
};
