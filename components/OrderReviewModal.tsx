import React, { useState, useMemo } from 'react';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { SnapshotMatrix } from './SnapshotMatrix';
import { BackorderPopup } from './BackorderPopup';
import { DealerStockPopup } from './DealerStockPopup';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { processApprovalAction, unlockRequest, fetchWorkflowById, updateRequestStatus } from '../utils/supabase';
import { validateReason, getAvailableActions } from '../utils/approval-validation';
import { validatePreApproval } from '../utils/approval-rules';
import { useDecisionSupport } from '../hooks/useDecisionSupport';
import { DecisionSummaryPanel } from './DecisionSupport/DecisionSummaryPanel';
import { AdjustmentImpactPanel } from './DecisionSupport/AdjustmentImpactPanel';
import { DecisionConfirmDialog } from './DecisionSupport/DecisionConfirmDialog';
import { OrderItemRow } from './DecisionSupport/OrderItemRow';
import { WorkflowStepper } from './WorkflowStepper';
import { useEffect } from 'react';
import { ApprovalWorkflow } from '../types/inventory';
import { usePartAffinity } from '../hooks/usePartAffinity';
import { suggestForOrder, normalizePartCode } from '../utils/partAffinity';
import { AffinityReviewPanel } from './AffinityReviewPanel';
import { openPrintOrderForm } from '../utils/printOrderForm';
import { InspectionPopup } from './InspectionPopup';

import { FaIcon } from './Icon';
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
    rejected: { icon: 'fa-circle-xmark', cls: 'text-rose-500' },
    returned: { icon: 'fa-rotate-left', cls: 'text-indigo-500' },
    commented: { icon: 'fa-comment', cls: 'text-slate-400' },
};

export const OrderReviewModal = ({ request, actions, usersMap, onClose, onRefresh }: Props) => {
    const { user, profile } = useAuth();
    const { canApproveLevel, allowedLevels, canUnlock: canUnlockRole } = useApprovalAuth();
    const snap = request.snapshot_data;
    const snapInventoryContext = snap.inventory_context ?? [];
    const snapQuantities = snap.quantities ?? {};
    const proposerName = usersMap[request.submitted_by] || 'N/A';

    const [localQtys, setLocalQtys] = useState<Record<string, { air: number; sea: number }>>(() => {
        const qtys: Record<string, { air: number; sea: number }> = {};
        // Initialize from original context to ensure all known items have a record
        snapInventoryContext.forEach(ctx => {
            const q = snapQuantities[ctx.itemCode] || { air: 0, sea: 0 };
            qtys[ctx.itemCode] = { air: q.air, sea: q.sea };
        });
        return qtys;
    });
    const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        snapInventoryContext.forEach(ctx => {
            const q = snapQuantities[ctx.itemCode];
            if ((q?.air || 0) > 0 || (q?.sea || 0) > 0) {
                initial.add(ctx.itemCode);
            }
        });
        return initial;
    });
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState('');
    const [rejectionReason, setRejectionReason] = useState(''); // Phase 3
    const [returnReason, setReturnReason] = useState(''); // Phase 3
    const [unlockReason, setUnlockReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState<string | null>(null);
    const [showUnlock, setShowUnlock] = useState(false);
    const [showMatrix, setShowMatrix] = useState(false);

    const [showValidationWarnings, setShowValidationWarnings] = useState(true); // Phase 7
    const [sidebarTab, setSidebarTab] = useState<'info' | 'history' | 'matrix'>('info');
    const [inspectingItem, setInspectingItem] = useState<any>(null);
    const [pendingAction, setPendingAction] = useState<'approved' | 'rejected' | 'returned' | null>(null);
    const [workflow, setWorkflow] = useState<ApprovalWorkflow | null>(null);

    // ── Part Affinity suggestions (2026-05-26) ────────────────────────────────
    const { index: affinityIndex, isLoading: affinityLoading } = usePartAffinity();
    const orderedSet = useMemo(() => {
        const s = new Set<string>();
        Object.entries(localQtys).forEach(([code, q]) => {
            if ((q?.air || 0) + (q?.sea || 0) > 0) s.add(code);
        });
        return s;
    }, [localQtys]);
    const affinity = useMemo(() => {
        if (affinityLoading || orderedSet.size === 0) return { mandatoryMissing: [], recommended: [] };
        return suggestForOrder(orderedSet, affinityIndex, 5);
    }, [orderedSet, affinityIndex, affinityLoading]);
    const itemNamesMap = useMemo(() => {
        const m: Record<string, string> = {};
        (snap.inventory_context || []).forEach((c: any) => {
            m[normalizePartCode(c.itemCode)] = c.itemName || '';
        });
        return m;
    }, [snap.inventory_context]);
    const normalizedToRawMap = useMemo(() => {
        const m: Record<string, string> = {};
        (snap.inventory_context || []).forEach((c: any) => {
            m[normalizePartCode(c.itemCode)] = c.itemCode;
        });
        return m;
    }, [snap.inventory_context]);
    const handleAddAffinity = (sku: string) => {
        const rawSku = normalizedToRawMap[sku] || sku;
        setLocalQtys(prev => {
            const cur = prev[rawSku] || { air: 0, sea: 0 };
            return { ...prev, [rawSku]: { air: cur.air, sea: (cur.sea || 0) + 1 } };
        });
        setSelectedItems(prev => new Set([...prev, rawSku]));
    };

    // Fetch Workflow for Stepper
    useEffect(() => {
        if (request.workflow_id) {
            fetchWorkflowById(request.workflow_id).then(setWorkflow);
        }
    }, [request.workflow_id]);

    // Decision Support Hook
    const preApprovalResult = useMemo(() => validatePreApproval(request), [request]);
    const summary = useDecisionSupport(snap, localQtys, selectedItems, preApprovalResult);

    // Phase 1: Level-aware authorization
    const canAct = !!(
        profile?.role &&
        ['admin', 'approver'].includes(profile.role) &&
        ['pending', 'in_progress'].includes(request.status) &&
        canApproveLevel(request.current_level)
    );
    const canUnlock = canUnlockRole && request.status === 'approved';

    // Phase 2: Available actions based on state + role
    const availableActions = useMemo(
        () => getAvailableActions(request.status, profile?.role || 'viewer', allowedLevels, request.current_level),
        [request.status, profile?.role, allowedLevels, request.current_level],
    );

    const rows = useMemo(
        () =>
            snapInventoryContext.filter(ctx => {
                const cur = snapQuantities[ctx.itemCode] || { air: 0, sea: 0 };
                const orig = (snap as any).original_quantities?.[ctx.itemCode] || cur;
                return cur.air > 0 || cur.sea > 0 || orig.air > 0 || orig.sea > 0;
            }),
        [snap, snapInventoryContext, snapQuantities],
    );

    const totals = useMemo(() => {
        let air = 0,
            sea = 0,
            value = 0,
            oos = 0,
            risk = 0,
            bo = 0;
        rows.forEach(ctx => {
            const isSelected = selectedItems.has(ctx.itemCode);
            if (isSelected) {
                const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                air += q.air;
                sea += q.sea;
                value += (ctx.unitCost || 0) * (q.air + q.sea);
            }
            if ((ctx.available || 0) <= 0 && ctx.baseForecast > 0.02) oos++;
            if ((ctx.available || 0) < (ctx.safetyStock || 0) && ctx.baseForecast > 0.02) risk++;
            if ((ctx.backorder || 0) > (ctx.available || 0)) bo++;
        });
        const avgMos = rows.length > 0 ? rows.reduce((s, c) => s + (c.mos || 0), 0) / rows.length : 0;
        return { air, sea, value, oos, risk, bo, avgMos };
    }, [rows, localQtys, selectedItems]);

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const hasChanges = useMemo(
        () =>
            rows.some(ctx => {
                const orig = snapQuantities[ctx.itemCode] || { air: 0, sea: 0 };
                const cur = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
                const isSelected = selectedItems.has(ctx.itemCode);
                if (!isSelected && (orig.air > 0 || orig.sea > 0)) return true;
                if (isSelected && (orig.air !== cur.air || orig.sea !== cur.sea)) return true;
                return false;
            }),
        [rows, localQtys, selectedItems, snapQuantities],
    );

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

    const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));
    const handlePageSize = (n: number) => {
        setPageSize(n);
        setCurrentPage(1);
    };

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

    const handleAction = (action: 'approved' | 'rejected' | 'returned') => {
        setPendingAction(action);
    };

    const handleFinalConfirm = async (
        action: 'approved' | 'rejected' | 'returned',
        managerComment?: string,
        structuredReason?: string,
    ) => {
        if (!user) return;

        setIsSubmitting(true);
        setSubmittingAction(action);
        try {
            const finalQtys =
                action === 'approved'
                    ? Object.fromEntries(
                          Object.keys(localQtys).map(k => [
                              k,
                              selectedItems.has(k) ? localQtys[k] : { air: 0, sea: 0 },
                          ]),
                      )
                    : localQtys;

            const reason =
                structuredReason ||
                (action === 'rejected' ? rejectionReason : action === 'returned' ? returnReason : undefined);

            const result = await processApprovalAction(
                request.id,
                user.id,
                action,
                managerComment || comment || undefined,
                finalQtys,
                reason,
                request.version,
                summary,
                snap, // pass decompressed snapshot to avoid re-fetching compressed stub
            );

            if (!result.success && result.error) {
                setCommentError(result.error);
                setPendingAction(null);
                return;
            }
            onRefresh();
            onClose();
        } catch (_e) { /* approval action failed — silently handled */ } finally {
            setIsSubmitting(false);
            setSubmittingAction(null);
            setPendingAction(null);
        }
    };

    const handleActionLegacy = async (action: 'approved' | 'rejected' | 'returned') => {
        if (!user) return;

        // Phase 3: Validate reason for reject/return
        if (action === 'rejected') {
            const rv = validateReason('rejected', rejectionReason);
            if (!rv.valid) {
                setCommentError(rv.error || '');
                return;
            }
        }
        if (action === 'returned') {
            const rv = validateReason('returned', returnReason);
            if (!rv.valid) {
                setCommentError(rv.error || '');
                return;
            }
        }

        setCommentError('');
        setIsSubmitting(true);
        setSubmittingAction(action);
        try {
            const finalQtys =
                action === 'approved'
                    ? Object.fromEntries(
                          Object.keys(localQtys).map(k => [
                              k,
                              selectedItems.has(k) ? localQtys[k] : { air: 0, sea: 0 },
                          ]),
                      )
                    : localQtys;
            // Phase 3: pass dedicated reason; Phase 5: pass version for optimistic locking
            const reason = action === 'rejected' ? rejectionReason : action === 'returned' ? returnReason : undefined;
            const result = await processApprovalAction(
                request.id,
                user.id,
                action,
                comment || undefined,
                finalQtys,
                reason,
                request.version,
            );
            if (!result.success && result.error) {
                setCommentError(result.error);
                return;
            }
            onRefresh();
            onClose();
        } catch (_e) { /* rejection failed — silently handled */ } finally {
            setIsSubmitting(false);
            setSubmittingAction(null);
        }
    };

    const handleUnlock = async () => {
        if (!user || !unlockReason.trim()) return;
        setIsSubmitting(true);
        try {
            await unlockRequest(request.id, user.id, unlockReason);
            onRefresh();
            onClose();
        } catch (_e) { /* unlock failed — silently handled */ } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Print Order Form (popup) ─────────────────────────────────────────────
    const handlePrintOrder = () => openPrintOrderForm(request, rows, localQtys, selectedItems);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-2 md:p-3 overflow-hidden">
            {/* Backdrop with blur */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-all duration-500 opacity-100"
                onClick={onClose}
            />

            {/* Main Modal Container — Styled like SkuDetail but maximized */}
            <div className="relative w-full max-w-[1850px] h-[98vh] bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn border border-white/20">
                {/* ═══ TOP HEADER ══════════════════════════════════════════════════ */}
                <div
                    className="relative flex items-center gap-4 px-5 py-0 text-white shrink-0 h-14 overflow-hidden"
                    style={{
                        background:
                            'linear-gradient(to right, #0f172a 0%, #1e293b 25%, #0f2744 55%, #1e293b 80%, #0f172a 100%)',
                    }}
                >
                    {/* Subtle glow orb behind pills */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                            className="w-[480px] h-10 rounded-full opacity-10 blur-2xl"
                            style={{ background: 'radial-gradient(ellipse, #3b82f6 0%, #6366f1 50%, transparent 80%)' }}
                        />
                    </div>
                    {/* Bottom accent line */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-px"
                        style={{
                            background: 'linear-gradient(to right, transparent, #3b82f6 30%, #6366f1 60%, transparent)',
                        }}
                    />

                    {/* Back */}
                    <button
                        onClick={onClose}
                        className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-300 hover:text-white shrink-0"
                    >
                        <FaIcon className="fas fa-arrow-left text-sm" />
                    </button>

                    <div className="relative flex flex-col shrink-0 min-w-0 max-w-[320px]">
                        <div className="flex items-center gap-2">
                            <span className="font-black text-sm truncate uppercase tracking-tight">
                                {request.draft_name}
                            </span>
                            <ApprovalStatusBadge status={request.status} size="sm" />
                            {hasChanges && (
                                <div className="flex items-center gap-1.5 bg-amber-500 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-amber-500/20 animate-pulse uppercase tracking-wider">
                                    <FaIcon className="fas fa-pen-nib text-[8px]" /> Adjusting
                                </div>
                            )}
                            {request.brand && (
                                <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded font-black text-slate-300 shrink-0 border border-white/5 uppercase tracking-wider">
                                    {request.brand}
                                </span>
                            )}
                            {profile?.role === 'admin' &&
                                ['pending', 'in_progress', 'returned'].includes(request.status) && (
                                    <button
                                        onClick={async () => {
                                            if (window.confirm('Bạn có chắc muốn hủy đơn hàng này?')) {
                                                const res = await updateRequestStatus(request.id, 'cancelled');
                                                if (res.success) {
                                                    onRefresh();
                                                    onClose();
                                                }
                                            }
                                        }}
                                        className="text-[9px] bg-amber-500/20 hover:bg-amber-500 text-amber-500 hover:text-white px-2 py-0.5 rounded font-black border border-amber-500/30 transition-colors uppercase tracking-wider"
                                    >
                                        <FaIcon className="fas fa-ban mr-1" /> Hủy đơn
                                    </button>
                                )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 opacity-80">
                            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                <FaIcon className="fas fa-user text-[8px]" /> {proposerName}
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
                            <FaIcon className="fas fa-boxes-stacked text-slate-400 text-[10px]" />
                            <span className="text-[11px] font-black text-white">{rows.length}</span>
                            <span className="text-[10px] text-slate-400">SKU</span>
                        </div>
                        {/* Air */}
                        {totals.air > 0 && (
                            <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-400/25 rounded-lg px-3 py-1.5 shrink-0">
                                <FaIcon className="fas fa-plane text-rose-400 text-[10px]" />
                                <span className="text-[11px] font-black text-rose-300">
                                    {totals.air.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-rose-400/70">Air</span>
                            </div>
                        )}
                        {/* Sea */}
                        {totals.sea > 0 && (
                            <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-400/25 rounded-lg px-3 py-1.5 shrink-0">
                                <FaIcon className="fas fa-ship text-blue-400 text-[10px]" />
                                <span className="text-[11px] font-black text-blue-300">
                                    {totals.sea.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-blue-400/70">Sea</span>
                            </div>
                        )}
                        {/* Value */}
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/25 rounded-lg px-3 py-1.5 shrink-0">
                            <FaIcon className="fas fa-circle-dollar-to-slot text-emerald-400 text-[10px]" />
                            <span className="text-[11px] font-black text-emerald-300">
                                {(totals.value / 1e6).toFixed(1)}M
                            </span>
                            <span className="text-[10px] text-emerald-400/70">VNĐ</span>
                        </div>
                        {/* OOS warning */}
                        {totals.oos > 0 && (
                            <div className="flex items-center gap-1.5 bg-rose-600/20 border border-rose-500/30 rounded-lg px-3 py-1.5 shrink-0">
                                <FaIcon className="fas fa-circle-exclamation text-rose-400 text-[10px]" />
                                <span className="text-[11px] font-black text-rose-300">OOS: {totals.oos}</span>
                            </div>
                        )}
                        {/* Risk warning */}
                        {totals.risk > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/25 rounded-lg px-3 py-1.5 shrink-0">
                                <FaIcon className="fas fa-triangle-exclamation text-amber-400 text-[10px]" />
                                <span className="text-[11px] font-black text-amber-300">Risk: {totals.risk}</span>
                            </div>
                        )}
                        {/* Changed badge */}
                        {hasChanges && (
                            <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-1.5 shrink-0">
                                <FaIcon className="fas fa-pencil text-amber-400 text-[10px]" />
                                <span className="text-[11px] font-black text-amber-300">Đã điều chỉnh</span>
                            </div>
                        )}
                    </div>

                    {/* Right: level + date */}
                    <div className="relative shrink-0 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 font-black text-slate-300">
                            Level {request.current_level}
                        </span>
                        <span>
                            {new Date(request.submitted_at).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    </div>
                </div>

                {/* ═══ BODY: Top Actions/Tabs + Table ══════════════════════════════════════ */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white">
                    {/* ── Decision Summary (Sticky) ── */}
                    <DecisionSummaryPanel
                        summary={summary}
                        onReset={() =>
                            setLocalQtys(
                                Object.fromEntries(
                                    Object.entries(snapQuantities).map(([k, v]) => [k, { air: v.air, sea: v.sea }]),
                                ),
                            )
                        }
                    />

                    {/* ── Adjustment Impact (Conditional) ── */}
                    {hasChanges && <AdjustmentImpactPanel summary={summary} />}

                    {/* ── NEW TOP NAVIGATION & ACTION BAR ────────────────── */}
                    <div className="shrink-0 flex flex-col border-b border-slate-200 bg-white shadow-sm z-20">
                        {/* Upper Row: Tabs & General Actions */}
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 backdrop-blur-md border-b border-slate-100 gap-4">
                            {/* Tabs */}
                            <div className="flex bg-slate-100/50 p-1 rounded-xl gap-1 shrink-0 border border-slate-200/60">
                                {[
                                    { id: 'info', icon: 'fa-circle-info', label: 'Duyệt đơn' },
                                    {
                                        id: 'history',
                                        icon: 'fa-clock-rotate-left',
                                        label: 'Lịch sử',
                                        count: actions.length,
                                    },
                                    { id: 'matrix', icon: 'fa-table-cells', label: 'Ma trận' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setSidebarTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${sidebarTab === tab.id ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        <FaIcon className={`fas ${tab.icon}`} /> {tab.label}
                                        {tab.count !== undefined && tab.count > 0 && (
                                            <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded-full text-slate-500">
                                                {tab.count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Quick Action Stats (Visible always in info tab or as header) */}
                            <div className="flex items-center gap-4">
                                {canAct && (
                                    <div className="flex items-center gap-3">
                                        <textarea
                                            value={comment}
                                            onChange={e => {
                                                setComment(e.target.value);
                                                if (commentError) setCommentError('');
                                            }}
                                            placeholder="Ghi chú gửi cho người đề xuất..."
                                            rows={1}
                                            className={`w-[300px] xl:w-[450px] bg-white border rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 resize-none transition-all font-bold ${
                                                commentError
                                                    ? 'border-rose-400 focus:ring-rose-100'
                                                    : 'border-slate-200 focus:ring-blue-100/50 shadow-inner'
                                            }`}
                                        />
                                        {hasChanges && (
                                            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-200 px-3 py-1.5 rounded-xl animate-pulse">
                                                <FaIcon className="fas fa-pen-nib text-amber-600 text-xs" />
                                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                                                    Adjustment Mode
                                                </span>
                                            </div>
                                        )}
                                        {(affinity.mandatoryMissing.length > 0 || affinity.recommended.length > 0) && (
                                            <div className="max-w-md">
                                                <AffinityReviewPanel
                                                    mandatoryMissing={affinity.mandatoryMissing}
                                                    recommended={affinity.recommended}
                                                    itemNames={itemNamesMap}
                                                    onAdd={handleAddAffinity}
                                                />
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAction('approved')}
                                                disabled={isSubmitting || selectedItems.size === 0}
                                                className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black px-6 py-2 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl shadow-emerald-200/50"
                                            >
                                                {submittingAction === 'approved' ? (
                                                    <FaIcon className="fas fa-spinner fa-spin" />
                                                ) : (
                                                    <FaIcon className="fas fa-check-double" />
                                                )}
                                                Duyệt đơn
                                            </button>
                                            <button
                                                onClick={() => handleAction('returned')}
                                                disabled={isSubmitting}
                                                className="border-2 border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100/50 active:scale-[0.98] disabled:opacity-50 font-black px-5 py-2 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                                            >
                                                {submittingAction === 'returned' ? (
                                                    <FaIcon className="fas fa-spinner fa-spin" />
                                                ) : (
                                                    <FaIcon className="fas fa-rotate-left" />
                                                )}
                                                Trả lại
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-1.5">
                                    <button
                                        onClick={handlePrintOrder}
                                        className="text-blue-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all"
                                    >
                                        <FaIcon className="fas fa-print" /> In phiếu
                                    </button>
                                    {canAct && (
                                        <button
                                            onClick={() => handleAction('rejected')}
                                            className="text-slate-400 hover:text-rose-500 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:bg-rose-50/50"
                                        >
                                            Từ chối đơn
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Lower Row: Tab-Specific Content (Stats, History, Matrix) */}
                        <div
                            className={`overflow-hidden transition-all duration-300 ${sidebarTab === 'info' ? 'h-0 opacity-0' : 'bg-slate-50 border-t border-slate-100 opacity-100'}`}
                        >
                            {sidebarTab === 'info' && (
                                <div className="px-5 py-3 flex items-center justify-between gap-6 border-b border-slate-100 bg-slate-50/30">
                                    <div className="flex items-center gap-4 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                                Sức khoẻ tồn kho
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {totals.oos > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100">
                                                    <span className="text-[10px] font-black text-rose-400 uppercase">
                                                        OOS
                                                    </span>
                                                    <span className="text-sm font-black text-rose-600">
                                                        {totals.oos}
                                                    </span>
                                                </div>
                                            )}
                                            {totals.risk > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100">
                                                    <span className="text-[10px] font-black text-amber-500 uppercase">
                                                        Risk
                                                    </span>
                                                    <span className="text-sm font-black text-amber-600">
                                                        {totals.risk}
                                                    </span>
                                                </div>
                                            )}
                                            {totals.bo > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100">
                                                    <span className="text-[10px] font-black text-indigo-400 uppercase">
                                                        BO
                                                    </span>
                                                    <span className="text-sm font-black text-indigo-600">
                                                        {totals.bo}
                                                    </span>
                                                </div>
                                            )}
                                            <div
                                                className={`flex items-center gap-2 px-3 py-1 rounded-full border ${totals.avgMos < 1 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}
                                            >
                                                <span className="text-[10px] font-black uppercase opacity-60">MOS</span>
                                                <span className="text-sm font-black">{totals.avgMos.toFixed(1)}M</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ml-auto flex items-center gap-6">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 italic">
                                            <FaIcon className="fas fa-circle-check text-blue-500" />
                                            Đã chọn {selectedItems.size}/{rows.length} SKU
                                        </div>
                                        {hasChanges && (
                                            <button
                                                onClick={() =>
                                                    setLocalQtys(
                                                        Object.fromEntries(
                                                            Object.entries(snapQuantities).map(([k, v]) => [
                                                                k,
                                                                { air: v.air, sea: v.sea },
                                                            ]),
                                                        ),
                                                    )
                                                }
                                                className="text-[10px] text-amber-600 hover:text-amber-700 font-black bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/50 flex items-center gap-1.5 transition-colors"
                                            >
                                                <FaIcon className="fas fa-arrow-rotate-left" /> Hoàn tác thay đổi
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {(sidebarTab === 'info' || sidebarTab === 'history' || sidebarTab === 'matrix') && (
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {sidebarTab === 'info' && (
                                        <div className="p-2 border-b border-slate-100">
                                            <WorkflowStepper
                                                request={request}
                                                workflow={workflow}
                                                actions={actions}
                                                usersMap={usersMap}
                                            />
                                        </div>
                                    )}
                                    {sidebarTab === 'history' && (
                                        <div className="p-6">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="w-2 h-5 bg-slate-400 rounded-full" />
                                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                                        Lịch sử phê duyệt
                                                    </span>
                                                </div>
                                                {actions.length === 0 ? (
                                                    <p className="text-center py-10 text-slate-400 text-sm font-bold">
                                                        Chưa có hành động nào.
                                                    </p>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {actions.map((a, idx) => {
                                                            const s = ACTION_STYLE[a.action] || ACTION_STYLE.commented;
                                                            const actorName = usersMap[a.actor_id] || 'N/A';
                                                            const actionLabels: Record<string, string> = {
                                                                approved: 'Đã duyệt',
                                                                returned: 'Trả lại',
                                                                rejected: 'Từ chối',
                                                                commented: 'Bình luận',
                                                            };
                                                            const meta = a.metadata as any;
                                                            const isResubmit = meta?.is_resubmit;
                                                            const displayLabel = isResubmit
                                                                ? 'Gửi lại'
                                                                : actionLabels[a.action] || a.action;
                                                            const displayStyle = isResubmit
                                                                ? { cls: 'text-blue-600', icon: 'fa-rotate-right' }
                                                                : s;

                                                            const snapQty = meta?.snapshot_quantities as Record<
                                                                string,
                                                                { air: number; sea: number }
                                                            > | null;
                                                            const snapNotes = meta?.snapshot_notes as Record<
                                                                string,
                                                                string
                                                            > | null;
                                                            const origQty = meta?.original_quantities as Record<
                                                                string,
                                                                { air: number; sea: number }
                                                            > | null;

                                                            const qtyDiffs: {
                                                                code: string;
                                                                oldTotal: number;
                                                                newTotal: number;
                                                            }[] = [];
                                                            const noteDiffs: {
                                                                code: string;
                                                                oldNote: string;
                                                                newNote: string;
                                                            }[] = [];

                                                            if (snapQty && origQty) {
                                                                const allCodes = new Set([
                                                                    ...Object.keys(snapQty),
                                                                    ...Object.keys(origQty),
                                                                ]);
                                                                allCodes.forEach(code => {
                                                                    const oldT =
                                                                        (origQty[code]?.air || 0) +
                                                                        (origQty[code]?.sea || 0);
                                                                    const newT =
                                                                        (snapQty[code]?.air || 0) +
                                                                        (snapQty[code]?.sea || 0);
                                                                    if (oldT !== newT)
                                                                        qtyDiffs.push({
                                                                            code,
                                                                            oldTotal: oldT,
                                                                            newTotal: newT,
                                                                        });
                                                                });
                                                            }
                                                            if (snapNotes) {
                                                                const prevAction = idx > 0 ? actions[idx - 1] : null;
                                                                const prevNotes = (prevAction?.metadata as any)
                                                                    ?.snapshot_notes as Record<string, string> | null;
                                                                Object.keys(snapNotes).forEach(code => {
                                                                    const newN = (snapNotes[code] || '').trim();
                                                                    const oldN = (prevNotes?.[code] || '').trim();
                                                                    if (newN !== oldN)
                                                                        noteDiffs.push({
                                                                            code,
                                                                            oldNote: oldN,
                                                                            newNote: newN,
                                                                        });
                                                                });
                                                            }

                                                            return (
                                                                <div
                                                                    key={a.id}
                                                                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative pl-10 overflow-hidden"
                                                                >
                                                                    <div
                                                                        className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center ${displayStyle.cls.replace('text-', 'bg-')}/10 border-r border-slate-100`}
                                                                    >
                                                                        <FaIcon
                                                                            className={`fas ${displayStyle.icon} ${displayStyle.cls} text-sm`}
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <span
                                                                            className={`text-xs font-black uppercase ${displayStyle.cls}`}
                                                                        >
                                                                            {displayLabel}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5">
                                                                            {meta?.version_before && (
                                                                                <span className="text-[9px] font-black text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded">
                                                                                    v{meta.version_before}→v
                                                                                    {meta.version_after}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-[10px] font-black text-slate-400">
                                                                                {a.level > 0 ? `Lv${a.level}` : ''}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-xs font-bold text-slate-700 mb-1">
                                                                        {actorName}
                                                                    </div>
                                                                    {meta?.reason && (
                                                                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2 font-bold">
                                                                            Lý do: {meta.reason}
                                                                        </p>
                                                                    )}
                                                                    {a.comment && !isResubmit && (
                                                                        <p className="text-xs text-slate-500 italic mb-2">
                                                                            "{a.comment}"
                                                                        </p>
                                                                    )}

                                                                    {qtyDiffs.length > 0 && (
                                                                        <div className="mb-2 border border-slate-100 rounded-lg overflow-hidden">
                                                                            <div className="text-[9px] font-black text-slate-500 uppercase px-2 py-1 bg-slate-50 border-b border-slate-100">
                                                                                Thay đổi SL ({qtyDiffs.length})
                                                                            </div>
                                                                            <div className="max-h-24 overflow-y-auto">
                                                                                {qtyDiffs.slice(0, 10).map(d => (
                                                                                    <div
                                                                                        key={d.code}
                                                                                        className="flex items-center justify-between px-2 py-0.5 text-[10px] border-b border-slate-50 last:border-0"
                                                                                    >
                                                                                        <span className="font-bold text-slate-600 truncate max-w-[120px]">
                                                                                            {d.code}
                                                                                        </span>
                                                                                        <span>
                                                                                            <span className="text-red-400 line-through">
                                                                                                {d.oldTotal}
                                                                                            </span>{' '}
                                                                                            →{' '}
                                                                                            <span className="text-emerald-600 font-black">
                                                                                                {d.newTotal}
                                                                                            </span>
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                                {qtyDiffs.length > 10 && (
                                                                                    <div className="text-[9px] text-slate-400 px-2 py-0.5 text-center">
                                                                                        +{qtyDiffs.length - 10} mã khác
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {noteDiffs.length > 0 && (
                                                                        <div className="mb-2 border border-slate-100 rounded-lg overflow-hidden">
                                                                            <div className="text-[9px] font-black text-slate-500 uppercase px-2 py-1 bg-slate-50 border-b border-slate-100">
                                                                                Thay đổi Ghi chú ({noteDiffs.length})
                                                                            </div>
                                                                            <div className="max-h-24 overflow-y-auto">
                                                                                {noteDiffs.slice(0, 5).map(d => (
                                                                                    <div
                                                                                        key={d.code}
                                                                                        className="px-2 py-1 text-[10px] border-b border-slate-50 last:border-0"
                                                                                    >
                                                                                        <span className="font-bold text-slate-600">
                                                                                            {d.code}:{' '}
                                                                                        </span>
                                                                                        {d.oldNote && (
                                                                                            <span className="text-red-400 line-through mr-1">
                                                                                                "{d.oldNote}"
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="text-emerald-600 font-bold">
                                                                                            "{d.newNote}"
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                                {noteDiffs.length > 5 && (
                                                                                    <div className="text-[9px] text-slate-400 px-2 py-0.5 text-center">
                                                                                        +{noteDiffs.length - 5} ghi chú
                                                                                        khác
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div className="text-[10px] text-slate-400 font-bold border-t border-slate-50 pt-2">
                                                                        {new Date(a.acted_at).toLocaleString('vi-VN')}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {sidebarTab === 'matrix' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-2 h-5 bg-blue-500 rounded-full" />
                                                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                                    Ma trận cung ứng
                                                </span>
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
                        <div className="px-4 py-2.5 bg-slate-50/40 backdrop-blur-sm border-b border-slate-200 flex items-center justify-between shrink-0 gap-3">
                            <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-sm font-black text-slate-500 uppercase tracking-widest">
                                    Chi tiết đặt hàng
                                </span>
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                                    {rows.length} mã
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Lines-per-page — matches Ordering.tsx select style */}
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <span className="font-bold text-slate-400">Dòng/trang</span>
                                    <select
                                        value={pageSize}
                                        onChange={e => handlePageSize(Number(e.target.value))}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 outline-none cursor-pointer text-slate-700 font-bold text-xs hover:border-slate-300 transition-colors"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                                <div className="w-px h-4 bg-slate-200" />
                                <div className="flex items-center gap-2 text-xs font-bold">
                                    {totals.air > 0 && (
                                        <span className="text-rose-600">
                                            <FaIcon className="fas fa-plane mr-1" />
                                            Air: {totals.air}
                                        </span>
                                    )}
                                    {totals.sea > 0 && (
                                        <span className="text-blue-700">
                                            <FaIcon className="fas fa-ship mr-1" />
                                            Sea: {totals.sea}
                                        </span>
                                    )}
                                    <span className="text-emerald-700 font-black">
                                        {currencyVND.format(totals.value)}
                                    </span>
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
                                                <input
                                                    type="checkbox"
                                                    checked={selectedItems.size === rows.length && rows.length > 0}
                                                    onChange={handleToggleAll}
                                                    className="w-4 h-4 cursor-pointer accent-blue-600 rounded"
                                                />
                                                <span className="text-[8px] uppercase font-bold tracking-tighter leading-none">
                                                    All
                                                </span>
                                            </div>
                                        </th>
                                        <th className="px-3 py-2.5 min-w-[200px] sticky left-10 z-40 bg-slate-50/95 border-b border-slate-200 border-r border-slate-200">
                                            SKU Identity & Health
                                        </th>
                                        <th className="px-3 py-2.5 text-center border-b border-slate-200 min-w-[100px]">
                                            Vận chuyển
                                        </th>
                                        <th className="px-2 py-2.5 text-center border-b border-slate-200 bg-indigo-50/30 min-w-[80px]">
                                            Đặt MN (NB)
                                        </th>
                                        <th className="px-2 py-2.5 text-center border-b border-slate-200 bg-blue-50/30 min-w-[80px]">
                                            Đặt MB (BB)
                                        </th>
                                        <th className="px-2 py-2.5 text-center border-b border-slate-200 bg-slate-100/50 min-w-[90px] font-black">
                                            Tổng đặt
                                        </th>
                                        <th className="px-3 py-2.5 text-right border-b border-slate-200 min-w-[100px]">
                                            Đơn giá
                                        </th>
                                        <th className="px-3 py-2.5 min-w-[150px] border-b border-slate-200">
                                            Ghi chú / Cảnh báo
                                        </th>
                                        <th className="px-3 py-2.5 text-right border-b border-slate-200 border-l border-slate-200 min-w-[110px] bg-slate-100/30">
                                            Thành Tiền
                                        </th>
                                        <th className="px-3 py-2.5 sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200 min-w-[70px] text-center">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {pagedRows.map((ctx, idx) => {
                                        const globalIdx = (safePage - 1) * pageSize + idx;
                                        return (
                                            <OrderItemRow
                                                key={ctx.itemCode}
                                                ctx={ctx}
                                                idx={idx}
                                                globalIdx={globalIdx}
                                                safePage={safePage}
                                                isSelected={
                                                    selectedItems.size === 0 ? false : selectedItems.has(ctx.itemCode)
                                                }
                                                localQty={localQtys[ctx.itemCode] || { air: 0, sea: 0 }}
                                                origQty={snapQuantities[ctx.itemCode] || { air: 0, sea: 0 }}
                                                onToggle={toggleItem}
                                                onSetQty={setQty}
                                                onInspect={setInspectingItem}
                                                currencyVND={currencyVND}
                                            />
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                    Trang {safePage} / {totalPages}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => goToPage(safePage - 1)}
                                        disabled={safePage === 1}
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all"
                                    >
                                        <FaIcon className="fas fa-chevron-left text-xs" />
                                    </button>
                                    <button
                                        onClick={() => goToPage(safePage + 1)}
                                        disabled={safePage === totalPages}
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all"
                                    >
                                        <FaIcon className="fas fa-chevron-right text-xs" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <InspectionPopup item={inspectingItem} localQtys={localQtys} onClose={() => setInspectingItem(null)} />

            {/* ── FINAL DECISION CHECKPOINT ────────────────────────────────────── */}
            {pendingAction && (
                <DecisionConfirmDialog
                    action={pendingAction}
                    summary={summary}
                    onConfirm={(comment, reason) => handleFinalConfirm(pendingAction, comment, reason)}
                    onCancel={() => setPendingAction(null)}
                />
            )}
        </div>
    );
};
