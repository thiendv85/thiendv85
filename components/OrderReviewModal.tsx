import React, { useState, useMemo } from 'react';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { StockProgressBar } from './StockProgressBar';
import { SalesMomentum } from './SalesMomentum';
import { TrendBadge } from './TrendBadge';
import { SnapshotMatrix } from './SnapshotMatrix';
import { BackorderPopup } from './BackorderPopup';
import { DealerStockPopup } from './DealerStockPopup';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { processApprovalAction, unlockRequest } from '../utils/supabase';
import { validateReason, getAvailableActions } from '../utils/approval-validation';
import { validatePreApproval } from '../utils/approval-rules';

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
    const { canApproveLevel, allowedLevels, canUnlock: canUnlockRole } = useApprovalAuth();
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
    const [rejectionReason, setRejectionReason] = useState(''); // Phase 3
    const [returnReason, setReturnReason] = useState('');       // Phase 3
    const [unlockReason, setUnlockReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState<string | null>(null);
    const [showUnlock, setShowUnlock] = useState(false);
    const [showMatrix, setShowMatrix] = useState(false);
    const [confirmReject, setConfirmReject] = useState(false);
    const [showValidationWarnings, setShowValidationWarnings] = useState(true); // Phase 7
    const [sidebarTab, setSidebarTab] = useState<'info' | 'history' | 'matrix'>('info');
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);
    const [inspectingItem, setInspectingItem] = useState<any>(null);

    // Phase 1: Level-aware authorization
    const canAct = !!(profile?.role && ['admin', 'approver'].includes(profile.role)
        && ['pending', 'in_progress'].includes(request.status)
        && canApproveLevel(request.current_level));
    const canUnlock = canUnlockRole && request.status === 'approved';

    // Phase 2: Available actions based on state + role
    const availableActions = useMemo(() =>
        getAvailableActions(request.status, profile?.role || 'viewer', allowedLevels, request.current_level),
        [request.status, profile?.role, allowedLevels, request.current_level]
    );

    // Phase 7: Pre-approval validation
    const preApprovalResult = useMemo(() => validatePreApproval(request), [request]);

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

        // Phase 3: Validate reason for reject/return
        if (action === 'rejected') {
            const rv = validateReason('rejected', rejectionReason);
            if (!rv.valid) { setCommentError(rv.error || ''); return; }
        }
        if (action === 'returned') {
            const rv = validateReason('returned', returnReason);
            if (!rv.valid) { setCommentError(rv.error || ''); return; }
        }

        setCommentError('');
        setIsSubmitting(true);
        setSubmittingAction(action);
        try {
            const finalQtys = action === 'approved'
                ? Object.fromEntries(Object.keys(localQtys).map(k => [k, selectedItems.has(k) ? localQtys[k] : {air: 0, sea: 0}]))
                : localQtys;
            // Phase 3: pass dedicated reason; Phase 5: pass version for optimistic locking
            const reason = action === 'rejected' ? rejectionReason : action === 'returned' ? returnReason : undefined;
            const result = await processApprovalAction(
                request.id, user.id, action, comment || undefined, finalQtys,
                reason, request.version
            );
            if (!result.success && result.error) {
                setCommentError(result.error);
                return;
            }
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

    // ─── Print Order Form (popup) ─────────────────────────────────────────────
    const handlePrintOrder = () => {
        const sd = new Date(request.submitted_at || Date.now());
        const month = sd.getMonth() + 1;
        const year = sd.getFullYear();
        const weekOfMonth = Math.ceil(sd.getDate() / 7);
        const pad = (n: number) => n.toString().padStart(2, '0');

        // Previous month for reference data header
        const prevDate = new Date(sd);
        prevDate.setMonth(prevDate.getMonth() - 1);
        const prevMonth = prevDate.getMonth() + 1;
        const prevYear = prevDate.getFullYear();
        const prevWeek = Math.max(1, weekOfMonth - 1) || 4;

        const fmt = (v: number, dec = 0) => v ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '-';
        const fmtMoney = (v: number) => v ? (v / 1_000_000).toFixed(1) : '-';

        // Build data rows
        let totalQty = 0, totalBB = 0, totalNB = 0, totalValue = 0;
        let bodyRows = '';
        rows.forEach((ctx, idx) => {
            const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
            const isSelected = selectedItems.has(ctx.itemCode);
            const qtyBB = isSelected ? q.sea : 0; // sea = BB = Miền Bắc
            const qtyNB = isSelected ? q.air : 0; // air = NB = Miền Nam
            const qty = qtyBB + qtyNB;
            const value = (ctx.unitCost || 0) * qty;
            const totalStock = (ctx.available || 0) + (ctx.dealerInventory || 0);
            const fc = ctx.baseForecast || 0;
            const ltMonths = (ctx as any).effectiveLT ? ((ctx as any).effectiveLT / 30).toFixed(1) : '-';
            const mosSauDat = fc > 0 ? ((totalStock + (ctx.totalPO || 0) + qty) / fc).toFixed(1) : '-';

            totalQty += qty; totalBB += qtyBB; totalNB += qtyNB; totalValue += value;

            bodyRows += `<tr>
                <td class="c">${idx + 1}</td>
                <td>${ctx.itemCode}</td>
                <td class="name">${ctx.itemName}</td>
                <td class="c">${ctx.loisGroup || '-'}</td>
                <td>${ctx.typecar || '-'}</td>
                <td class="c">${ctx.loisGroup || '-'}</td>
                <td class="c">${ltMonths}</td>
                <td class="r">${fmt(ctx.available)}</td>
                <td class="r">${fmt(ctx.dealerInventory)}</td>
                <td class="r">${fmt(totalStock)}</td>
                <td class="r">${fmt(fc, 1)}</td>
                <td class="r">${ctx.mos ? ctx.mos.toFixed(1) : '-'}</td>
                <td class="r">${fmt(ctx.totalPO)}</td>
                <td class="r">${fmt(ctx.backorder)}</td>
                <td class="r">${fmt(ctx.stockMax)}</td>
                <td class="r b">${fmt(qty)}</td>
                <td class="r">${fmt(qtyBB)}</td>
                <td class="r">${fmt(qtyNB)}</td>
                <td class="r">${fmtMoney(value)}</td>
                <td class="r">${mosSauDat}</td>
                <td class="c"></td>
            </tr>`;
        });

        const footerRow = `<tr>
            <td colspan="7" class="b">TỔNG CỘNG</td>
            <td class="r"></td><td class="r"></td><td class="r"></td><td class="r"></td><td class="r"></td>
            <td class="r"></td><td class="r"></td><td class="r"></td>
            <td class="r b">${fmt(totalQty)}</td>
            <td class="r">${fmt(totalBB)}</td>
            <td class="r">${fmt(totalNB)}</td>
            <td class="r b">${fmtMoney(totalValue)}</td>
            <td class="r"></td><td class="c"></td>
        </tr>`;

        const html = `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8">
<title>Phiếu Đặt Hàng – ${request.draft_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 8mm 7mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 7pt; color: #000; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.title { text-align: center; font-size: 10pt; font-weight: 900; color: #c00; text-transform: uppercase; line-height: 1.5; margin-top: 6px; }
.subtitle { text-align: center; font-size: 8pt; font-style: italic; color: #c00; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 6.5pt; table-layout: fixed; }
thead th { background: #e8e8e8; border: 1px solid #999; padding: 2px 3px; font-size: 6pt; font-weight: 700; text-align: center; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tbody td { border: 1px solid #bbb; padding: 1.5px 3px; vertical-align: middle; font-size: 6.5pt; line-height: 1.2; }
tfoot td { background: #f0f0f0; font-weight: 900; border: 1px solid #999; padding: 2px 3px; font-size: 6.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.r { text-align: right; } .c { text-align: center; } .b { font-weight: 900; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
.hdr-group { background: #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { body { margin: 0; } }
</style>
</head><body>
<div class="title">BẢNG KÊ DANH MỤC PHỤ TÙNG, VẬT TƯ THƯƠNG HIỆU<br/>ĐỀ XUẤT ĐẶT HÀNG TUẦN ${weekOfMonth} THÁNG ${pad(month)} NĂM ${year}</div>
<div class="subtitle">(Đính kèm theo tờ trình số:&hellip;/&hellip;/ Ngày &hellip;&hellip; tháng ${pad(month)} năm ${year})</div>
<table>
<colgroup>
<col style="width:22px"><col style="width:62px"><col style="width:110px"><col style="width:32px"><col style="width:48px">
<col style="width:26px"><col style="width:30px">
<col style="width:32px"><col style="width:32px"><col style="width:36px">
<col style="width:34px"><col style="width:30px"><col style="width:34px"><col style="width:30px"><col style="width:34px">
<col style="width:32px"><col style="width:32px"><col style="width:32px"><col style="width:40px">
<col style="width:34px"><col style="width:34px">
</colgroup>
<thead>
<tr>
<th rowspan="2">STT</th>
<th rowspan="2">Mã Phụ Tùng</th>
<th rowspan="2">Tên Phụ Tùng</th>
<th rowspan="2">Nhóm loại hình</th>
<th rowspan="2">Mẫu xe</th>
<th rowspan="2">LOIS</th>
<th rowspan="2">Thời gian hàng về<br/>(Tháng)</th>
<th colspan="3" class="hdr-group">Tồn Việt Nam</th>
<th rowspan="2">BQ bán hàng GT</th>
<th rowspan="2">Cơ số tồn Việt Nam<br/>(Tháng BH)</th>
<th rowspan="2">Đặt NCC chưa giao</th>
<th rowspan="2">Số lượng nợ</th>
<th rowspan="2">Số lượng tồn kho<br/>định mức</th>
<th colspan="4" class="hdr-group">Đề xuất đặt hàng dự trữ tuần ${pad(weekOfMonth)} tháng ${pad(month)}, năm ${year}</th>
<th rowspan="2">Tổng Cơ số tồn sau đặt<br/>(tháng BH)</th>
<th rowspan="2">Cơ số tồn định mức<br/>đã duyệt</th>
</tr>
<tr>
<th>PP</th><th>ĐL</th><th>Tổng tồn</th>
<th>Tổng số</th><th>Miền Bắc</th><th>Miền Nam</th><th>Thành tiền<br/>(Tr. đ)</th>
</tr>
</thead>
<tbody>${bodyRows}</tbody>
<tfoot>${footerRow}</tfoot>
</table>
</body></html>`;

        const w = window.open('', '_blank', 'width=1200,height=800');
        if (!w) return alert('Trình duyệt đã chặn popup. Hãy cho phép popup để in.');
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 600);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-2 md:p-3 overflow-hidden">
            {/* Backdrop with blur */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
            
            {/* Main Modal Container — Styled like SkuDetail but maximized */}
            <div className="relative w-full max-w-[1850px] h-[98vh] bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn border border-white/20">

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

            {/* ═══ BODY: Top Actions/Tabs + Table ══════════════════════════════════════ */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white">

                {/* ── NEW TOP NAVIGATION & ACTION BAR ────────────────── */}
                <div className="shrink-0 flex flex-col border-b border-slate-200 bg-white shadow-sm z-20">
                    
                    {/* Upper Row: Tabs & General Actions */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50/50 border-b border-slate-100 gap-4">
                        {/* Tabs */}
                        <div className="flex bg-slate-100/50 p-1 rounded-xl gap-1 shrink-0 border border-slate-200/60">
                            {[
                                { id: 'info', icon: 'fa-circle-info', label: 'Duyệt đơn' },
                                { id: 'history', icon: 'fa-clock-rotate-left', label: 'Lịch sử', count: actions.length },
                                { id: 'matrix', icon: 'fa-table-cells', label: 'Ma trận' }
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

                        {/* Quick Action Stats (Visible always in info tab or as header) */}
                        <div className="flex items-center gap-4">
                            {canAct && (
                                <div className="flex items-center gap-3">
                                    <textarea
                                        value={comment}
                                        onChange={e => { setComment(e.target.value); if (commentError) setCommentError(''); }}
                                        placeholder="Ghi chú gửi cho người đề xuất..."
                                        rows={1}
                                        className={`w-[300px] xl:w-[450px] bg-white border rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 resize-none transition-all font-bold ${
                                            commentError ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:ring-blue-100/50 shadow-inner'
                                        }`}
                                    />
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => handleAction('approved')}
                                            disabled={isSubmitting || selectedItems.size === 0}
                                            className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black px-5 py-1.5 rounded-lg text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-md shadow-emerald-200/50"
                                        >
                                            {submittingAction === 'approved' ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check-double" />}
                                            Duyệt
                                        </button>
                                        <button
                                            onClick={() => handleAction('returned')}
                                            disabled={isSubmitting}
                                            className="border border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50 active:scale-[0.98] disabled:opacity-50 font-black px-4 py-1.5 rounded-lg text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                                        >
                                            {submittingAction === 'returned' ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-rotate-left" />}
                                            Trả lời
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-1.5">
                                <button onClick={handlePrintOrder} className="border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all">
                                    <i className="fas fa-print" /> In phiếu
                                </button>
                                {canAct && !confirmReject && (
                                    <button onClick={() => setConfirmReject(true)} className="text-rose-400 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border border-transparent hover:border-rose-100 transition-all">
                                        Từ chối
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Lower Row: Tab-Specific Content (Stats, History, Matrix) */}
                    <div className={`overflow-hidden transition-all duration-300 ${sidebarTab === 'info' ? 'bg-white' : 'bg-slate-50 border-t border-slate-100'}`}>
                        {sidebarTab === 'info' && (
                            <div className="px-5 py-3 flex items-center justify-between gap-6 border-b border-slate-100 bg-slate-50/30">
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Sức khoẻ tồn kho</span>
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

                                {confirmReject && (
                                    <div className="flex items-center gap-3 bg-rose-50 px-4 py-1.5 rounded-xl border border-rose-200 animate-fadeIn">
                                        <span className="text-[10px] font-black text-rose-700 flex items-center gap-1.5 shrink-0">
                                            <i className="fas fa-triangle-exclamation" /> Xác nhận từ chối đơn hàng?
                                        </span>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAction('rejected')} className="bg-rose-600 hover:bg-rose-700 text-white font-black px-3 py-1 rounded-lg text-[9px] uppercase transition-colors">Xác nhận</button>
                                            <button onClick={() => setConfirmReject(false)} className="text-slate-500 hover:text-slate-700 font-bold px-2 py-1 text-[9px]">Huỷ</button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="ml-auto flex items-center gap-6">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 italic">
                                        <i className="fas fa-circle-check text-blue-500" />
                                        Đã chọn {selectedItems.size}/{rows.length} SKU
                                    </div>
                                    {hasChanges && (
                                        <button onClick={() => setLocalQtys(Object.fromEntries(Object.entries(snap.quantities).map(([k, v]) => [k, { air: v.air, sea: v.sea }])))}
                                            className="text-[10px] text-amber-600 hover:text-amber-700 font-black bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/50 flex items-center gap-1.5 transition-colors">
                                            <i className="fas fa-arrow-rotate-left" /> Hoàn tác thay đổi
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
                                            <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Lịch sử phê duyệt</span>
                                        </div>
                                        {actions.length === 0 ? (
                                            <p className="text-center py-10 text-slate-400 text-sm font-bold">Chưa có hành động nào.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {actions.map(a => {
                                                    const s = ACTION_STYLE[a.action] || ACTION_STYLE.commented;
                                                    const actorName = usersMap[a.actor_id] || 'N/A';
                                                    const actionLabels: Record<string, string> = { approved: 'Đã duyệt', returned: 'Trả lại', rejected: 'Từ chối', commented: 'Bình luận' };
                                                    return (
                                                        <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative pl-10 overflow-hidden">
                                                            <div className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center ${s.cls.replace('text-', 'bg-')}/10 border-r border-slate-100`}>
                                                                <i className={`fas ${s.icon} ${s.cls} text-sm`} />
                                                            </div>
                                                            <div className="flex justify-between items-start mb-1">
                                                                <span className={`text-xs font-black uppercase ${s.cls}`}>{actionLabels[a.action] || a.action}</span>
                                                                <span className="text-[10px] font-black text-slate-400">Lv{a.level}</span>
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
                                            <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Ma trận cung ứng</span>
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

                {/* ── MAIN CONTENT: Order Table ───────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-[60vh] bg-white">


                    {/* Table title bar */}
                    <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 gap-3">
                        <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Chi tiết đặt hàng</span>
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
                        <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1200px]">
                            <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30">
                                <tr className="text-xs uppercase font-black tracking-wider text-slate-400">
                                    <th className="px-3 py-3 w-10 text-center border-b border-slate-200 sticky left-0 z-40 bg-slate-50/95">
                                        <div className="flex flex-col items-center gap-1">
                                            <input type="checkbox" checked={selectedItems.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 cursor-pointer accent-blue-600 rounded" />
                                            <span className="text-[8px] uppercase font-bold tracking-tighter leading-none">All</span>
                                        </div>
                                    </th>
                                    <th className="px-3 py-2.5 min-w-[200px] sticky left-10 z-40 bg-slate-50/95 border-b border-slate-200 border-r border-slate-200">SKU Identity</th>
                                    <th className="px-3 py-2.5 text-center border-b border-slate-200 min-w-[110px]">Health & MOS</th>
                                    <th className="px-3 py-2.5 text-center border-b border-slate-200 min-w-[100px]">Nhu cầu (M1/FC)</th>
                                    <th className="px-3 py-2.5 text-right border-b border-slate-200 min-w-[110px]">Kho & Đại lý</th>
                                    <th className="px-2 py-2.5 text-center border-x border-slate-200 bg-rose-50/30 border-b border-slate-200 min-w-[85px]">
                                        <span className="text-rose-600">Air Qty</span>
                                    </th>
                                    <th className="px-2 py-2.5 text-center border-r border-slate-200 bg-blue-50/30 border-b border-slate-200 min-w-[85px]">
                                        <span className="text-blue-700">Sea Qty</span>
                                    </th>
                                    <th className="px-3 py-2.5 min-w-[150px] border-b border-slate-200">Warnings / Notes</th>
                                    <th className="px-3 py-2.5 text-right border-b border-slate-200 border-l border-slate-200 min-w-[110px]">Thành Tiền</th>
                                    <th className="px-3 py-2.5 sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200 min-w-[85px] text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {pagedRows.map((ctx, idx) => {
                                    const globalIdx = (safePage - 1) * pageSize + idx;
                                    const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                                    const origQ = snap.quantities[ctx.itemCode] || { air: 0, sea: 0 };
                                    const changed = q.air !== origQ.air || q.sea !== origQ.sea;
                                    const isSelected = selectedItems.has(ctx.itemCode);
                                    const rowValue = (ctx.unitCost || 0) * (q.air + q.sea);

                                    return (
                                        <tr key={ctx.itemCode}
                                            onClick={() => setInspectingItem(ctx)}
                                            className={`transition-all group cursor-pointer border-b border-slate-50 hover:bg-blue-50/20 ${!isSelected ? 'opacity-40 grayscale-[0.5]' : changed ? 'bg-amber-50/10' : ''}`}>
                                            
                                            <td className="px-3 py-3 text-center sticky left-0 z-10 bg-inherit" onClick={e => e.stopPropagation()}>
                                                <div className="flex flex-col items-center gap-1">
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleItem(ctx.itemCode)} className="w-4 h-4 cursor-pointer accent-blue-600 rounded" />
                                                    <div className="text-[10px] text-slate-400 font-black">{globalIdx + 1}</div>
                                                </div>
                                            </td>

                                            <td className="px-3 py-2 sticky left-10 z-10 bg-inherit border-r border-slate-100">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-black text-slate-800 text-sm font-mono tracking-tight">{ctx.itemCode}</span>
                                                    <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {ctx.priorityBucket || 'P3'}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate max-w-[170px] font-bold leading-tight mt-0.5">{ctx.itemName}</div>
                                            </td>

                                            <td className="px-3 py-2 text-center">
                                                <div className="flex flex-col items-center">
                                                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                        ctx.available < ctx.rop ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                        : ctx.available < ctx.safetyStock ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                                        {ctx.available <= 0 ? 'OOS' : ctx.available < ctx.rop ? 'RISK' : 'OK'}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                        <span className={`text-sm font-black ${ctx.mos < 1 ? 'text-rose-600' : 'text-slate-700'}`}>{(ctx.mos || 0).toFixed(1)}M</span>
                                                        <TrendBadge trend={ctx.trendFlag} size="sm" />
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-3 py-2 text-center">
                                                <div className="text-xs font-bold text-slate-400">M1: <span className="text-slate-800 font-black">{(ctx.m1Actual || 0).toLocaleString()}</span></div>
                                                <div className="text-xs font-bold text-slate-400 mt-1">FC: <span className="text-emerald-700 font-black">{(ctx.baseForecast || 0).toLocaleString()}</span></div>
                                            </td>

                                            <td className="px-3 py-2 text-right">
                                                <div className="text-sm font-black text-slate-800">Tồn: {(ctx.available || 0).toLocaleString()}</div>
                                                <DealerStockPopup items={ctx.dealerBreakdown || []}>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5 cursor-help border-b border-dashed border-slate-300 inline-block">
                                                        Đại lý: {(ctx.dealerInventory || 0).toLocaleString()}
                                                    </div>
                                                </DealerStockPopup>
                                            </td>

                                            <td className="px-2 py-2 bg-rose-50/20 text-center border-x border-slate-100" onClick={e => e.stopPropagation()}>
                                                <input type="number" value={q.air || ''} 
                                                    onChange={e => setQty(ctx.itemCode, 'air', e.target.value)}
                                                    className="w-16 text-center font-black text-sm border border-rose-200 rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-rose-200 transition-all" />
                                            </td>

                                            <td className="px-2 py-2 bg-blue-50/20 text-center border-r border-slate-100" onClick={e => e.stopPropagation()}>
                                                <input type="number" value={q.sea || ''} 
                                                    onChange={e => setQty(ctx.itemCode, 'sea', e.target.value)}
                                                    className="w-16 text-center font-black text-sm border border-blue-200 rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-blue-200 transition-all" />
                                            </td>

                                            <td className="px-3 py-2 max-w-[150px]">
                                                {(ctx.warnings || []).slice(0, 1).map((w, i) => (
                                                    <div key={i} className="text-[10px] text-rose-600 font-black leading-tight flex items-center gap-1">
                                                        <i className="fas fa-triangle-exclamation" /> {w}
                                                    </div>
                                                ))}
                                                {snap.notes[ctx.itemCode] && (
                                                    <div className="text-[10px] text-slate-500 italic mt-1 truncate" title={snap.notes[ctx.itemCode]}>
                                                        "{snap.notes[ctx.itemCode]}"
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-3 py-2 text-right font-black text-slate-900 bg-slate-50/30 border-l border-slate-100 text-sm">
                                                {currencyVND.format(rowValue)}
                                            </td>

                                            <td className="px-3 py-2 text-center sticky right-0 z-10 bg-inherit border-l border-slate-100" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => toggleItem(ctx.itemCode)} 
                                                    className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                    <i className={`fas ${isSelected ? 'fa-check' : 'fa-x'}`} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Trang {safePage} / {totalPages}</span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => goToPage(safePage - 1)} disabled={safePage === 1} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all">
                                    <i className="fas fa-chevron-left text-xs" />
                                </button>
                                <button onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all">
                                    <i className="fas fa-chevron-right text-xs" />
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>

        {/* ── INSPECTION POPUP: Detail Calculation ──────────────────────────── */}
        {inspectingItem && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fadeIn" onClick={() => setInspectingItem(null)} />
                <div className="relative w-full max-w-[1000px] bg-white rounded-[32px] shadow-2xl overflow-hidden animate-slideUp flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-2xl">
                                <i className="fas fa-magnifying-glass-chart text-blue-400 text-xl" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="font-black text-2xl font-mono tracking-tight">{inspectingItem.itemCode}</span>
                                    <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${inspectingItem.priorityBucket === 'P1' ? 'bg-rose-500 text-white' : 'bg-white/20 text-slate-300'}`}>
                                        {inspectingItem.priorityBucket || 'P3'}
                                    </span>
                                </div>
                                <div className="text-slate-400 font-bold text-sm mt-0.5">{inspectingItem.itemName}</div>
                            </div>
                        </div>
                        <button onClick={() => setInspectingItem(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
                            <i className="fas fa-xmark text-lg" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-8 space-y-10 custom-scrollbar">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Stock Logic */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-4 bg-emerald-500 rounded-full" /> Logic Tồn kho & Cung ứng
                                </h3>
                                <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200/60 shadow-inner">
                                    <StockProgressBar
                                        current={inspectingItem.available} rop={inspectingItem.rop}
                                        max={inspectingItem.stockMax || 1} ss={inspectingItem.safetyStock}
                                        onOrder={inspectingItem.totalPO} incoming={inspectingItem.incomingCurrentMonth}
                                        backorder={inspectingItem.backorder} 
                                        breakdown={inspectingItem.backorderBreakdown || []}
                                        draftAdd={(localQtys[inspectingItem.itemCode]?.air || 0) + (localQtys[inspectingItem.itemCode]?.sea || 0)}
                                        baseFc={inspectingItem.baseForecast}
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100/50">
                                        <div className="text-[10px] text-rose-500 font-black uppercase mb-1">Safety Stock</div>
                                        <div className="text-lg font-black text-rose-700">{(inspectingItem.safetyStock || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100/50">
                                        <div className="text-[10px] text-amber-500 font-black uppercase mb-1">Re-Order Point</div>
                                        <div className="text-lg font-black text-amber-700">{(inspectingItem.rop || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50">
                                        <div className="text-[10px] text-emerald-500 font-black uppercase mb-1">Stock Max</div>
                                        <div className="text-lg font-black text-emerald-700">{(inspectingItem.stockMax || 0).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Demand & Momentum */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" /> Nhu cầu & Xu hướng
                                </h3>
                                <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200/60 h-[280px] flex items-center justify-center shadow-inner">
                                    <SalesMomentum
                                        values={[inspectingItem.avgQty24M, inspectingItem.avgQty12M, inspectingItem.avgQty6M, inspectingItem.avgQty3M]}
                                        history={inspectingItem.salesHistory} forecast={inspectingItem.baseForecast}
                                    />
                                </div>
                                <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] text-blue-500 font-black uppercase">Xu hướng dự báo</div>
                                        <div className="text-sm font-black text-blue-800 mt-1 flex items-center gap-2">
                                            <TrendBadge trend={inspectingItem.trendFlag} />
                                            {inspectingItem.trendFlag === 'up' ? 'Tăng trưởng' : inspectingItem.trendFlag === 'down' ? 'Giảm dần' : 'Ổn định'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-blue-500 font-black uppercase">Dự báo (FC)</div>
                                        <div className="text-xl font-black text-blue-900">{(inspectingItem.baseForecast || 0).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                        <button onClick={() => setInspectingItem(null)} 
                            className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95">
                            Hoàn tất kiểm tra
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
);
};
