import React, { useMemo, useState, useEffect, useRef, useDeferredValue } from 'react';
import {
    InventoryItem,
    DashboardSettings,
    InventoryFilters,
    DEFAULT_FILTERS,
    OrderingDraft,
    getDebtStatus,
    COST_RANGES,
    FOB_COST_RANGES,
} from '../types/inventory';
import { FilterPanel } from '../components/FilterPanel';
import { parseInventorySearch, SearchResult, matchSearch } from '../utils/searchLogic';
import { StockProgressBar } from '../components/StockProgressBar';
import { SalesMomentum } from '../components/SalesMomentum';
import {
    exportOrderDraftToCSV,
    parseOrderingDraftCSV,
    calculatePickingPriority,
    CsvExportOptions,
} from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';
import { TrendBadge } from '../components/TrendBadge';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { SupersessionWarning } from '../components/SupersessionWarning';
import { SupersessionIndicator } from '../components/SupersessionIndicator';
import { DebtStatusBadge } from '../components/DebtStatusBadge';
import { ConsolidatedStockCell } from '../components/ConsolidatedStockCell';
import { DealerStockPopup } from '../components/DealerStockPopup';
import { AppSettings } from './Settings';
import {
    computeInventory,
    computeInventoryBatch,
    makeComputeParams,
    resolveItemProfile,
    MOS_LOW_STOCK_THRESHOLD,
} from '../utils/inventoryEngine';
import { Typography } from '../components/Typography';
import { CloudDraftModal } from '../components/CloudDraftModal';
import { useAuth } from '../utils/authContext';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import {
    listWorkflows,
    submitApprovalRequest,
    submitApprovalRequestPrecompressed,
    compressData,
    fetchRequestByDraftName,
    resubmitApprovalRequest,
    resubmitApprovalRequestPrecompressed,
    fetchRequestActions,
    normalizeBrand,
    processApprovalAction,
    computeSnapshotSummary,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalWorkflow, ApprovalAction } from '../types/inventory';
import { useDevice } from '../hooks/useDevice';
import { usePartAffinity } from '../hooks/usePartAffinity';
import { suggestForOrder, normalizePartCode } from '../utils/partAffinity';

import { FaIcon } from '../components/Icon';
import { DraftAnalysisCharts } from './ordering/DraftAnalysisCharts';
import { WarningConfirmation, ConfirmationQueueItem } from './ordering/WarningConfirmation';
import { SubmitApprovalModal } from './ordering/SubmitApprovalModal';
// --- MODULE-LEVEL CONSTANTS ---
const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

// --- GLOBAL UTILITIES ---
const currencyFormatterVND = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
});
const currencyFormatterEUR = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
});

export interface OrderingProps {
    data: InventoryItem[];
    enrichedData?: InventoryItem[];
    isEngineProcessing?: boolean;
    onItemSelect: (item: InventoryItem) => void;
    initialParams?: { lt: number; sp: number; ssp: number };
    initialState?: any;
    onSaveState?: (state: any) => void;
    sharedDraft?: OrderingDraft;
    onUpdateDraft?: (draft: OrderingDraft) => void;
    graph?: SupersessionGraph;
    appSettings?: AppSettings;
    onUpdateSettings?: (s: AppSettings) => void;
    activeApprovalRequest?: ApprovalRequest | null;
}

export const Ordering = ({
    data,
    enrichedData,
    isEngineProcessing,
    onItemSelect,
    initialParams,
    initialState,
    onSaveState,
    sharedDraft,
    onUpdateDraft,
    graph,
    appSettings,
    activeApprovalRequest: externalRequest,
}: OrderingProps) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();
    const [settings, setSettings] = useState<DashboardSettings>(
        initialState?.settings || {
            snapshotDate: new Date().toISOString().split('T')[0],
            warehouseScope: 'All',
            costBasis: 'FOB',
            params: initialParams || { lt: 90, sp: 30, ssp: 15 },
            sourceProfiles: appSettings?.sourceProfiles,
            loisProfiles: appSettings?.loisProfiles || [],
            seasonalityTuning: appSettings?.seasonalityTuning || { useSPD: true, tetWeight: 1.2, weatherWeight: 1.0 },
        },
    );

    useEffect(() => {
        if (appSettings?.sourceProfiles || appSettings?.seasonalityTuning || appSettings?.loisProfiles) {
            setSettings(prev => ({
                ...prev,
                sourceProfiles: appSettings?.sourceProfiles || prev.sourceProfiles,
                loisProfiles: appSettings?.loisProfiles || prev.loisProfiles,
                seasonalityTuning: appSettings?.seasonalityTuning || prev.seasonalityTuning,
            }));
        }
    }, [appSettings?.sourceProfiles, appSettings?.seasonalityTuning, appSettings?.loisProfiles]);
    const [filters, setFilters] = useState<InventoryFilters>(initialState?.filters || DEFAULT_FILTERS);
    const [orderQuantities, setOrderQuantities] = useState<Record<string, { air: number; sea: number }>>(
        sharedDraft?.quantities || initialState?.quantities || {},
    );
    const [orderNotes, setOrderNotes] = useState<Record<string, string>>(
        sharedDraft?.notes || initialState?.notes || {},
    );
    const [viewFilter, setViewFilter] = useState<'all' | 'draft' | 'suggested' | 'seasonal'>(
        initialState?.viewFilter || (externalRequest ? 'draft' : 'all'),
    );

    useEffect(() => {
        if (externalRequest) {
            setApprovalRequest(externalRequest);
            setOrderQuantities(externalRequest.snapshot_data?.quantities || {});
            setOrderNotes(externalRequest.snapshot_data?.notes || {});
            setViewFilter('draft');
        }
    }, [externalRequest]);
    const [sortKey, setSortKey] = useState<string>('priority');
    const [searchResult, setSearchResult] = useState<SearchResult>(() =>
        initialState?.filters?.search
            ? parseInventorySearch(initialState.filters.search)
            : { type: 'EMPTY', tokens: [], displayTokens: [], raw: '' },
    );
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(initialState?.itemsPerPage || 20);

    const deferredFilters = useDeferredValue(filters);
    const deferredViewFilter = useDeferredValue(viewFilter);
    const deferredSearchResult = useDeferredValue(searchResult);
    const deferredSortKey = useDeferredValue(sortKey);

    // Debounced search input
    const [localSearch, setLocalSearch] = useState(filters.search);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => { setLocalSearch(filters.search); }, [filters.search]);
    useEffect(() => () => clearTimeout(searchDebounceRef.current), []);

    const [supersessionWarnings, setSupersessionWarnings] = useState<Record<string, number>>({});
    const [confirmationQueue, setConfirmationQueue] = useState<{ code: string; type: 'air' | 'sea'; val: number }[]>(
        [],
    );
    const [confirmedSkus, setConfirmedSkus] = useState<Set<string>>(new Set());
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
    const [currentDraftName, setCurrentDraftName] = useState<string>('');
    const [submitDraftName, setSubmitDraftName] = useState('');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState<{ step: string; pct: number } | null>(null);
    const [returnReason, setReturnReason] = useState<string>('');

    const { user, profile } = useAuth();
    const isLocked = approvalRequest?.status === 'approved';
    const isReturned = approvalRequest?.status === 'returned';
    const isApproverMode =
        profile?.role &&
        ['admin', 'approver'].includes(profile.role) &&
        approvalRequest &&
        ['pending', 'in_progress'].includes(approvalRequest.status);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);

    const originalDraft = useMemo(() => {
        return approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities;
    }, [approvalRequest]);

    useEffect(() => {
        if (onUpdateDraft) onUpdateDraft({ quantities: orderQuantities, notes: orderNotes });
    }, [orderQuantities, orderNotes, onUpdateDraft]);
    useEffect(() => {
        if (onSaveState)
            onSaveState({
                settings,
                filters,
                quantities: orderQuantities,
                notes: orderNotes,
                viewFilter,
                itemsPerPage,
            });
    }, [settings, filters, orderQuantities, orderNotes, viewFilter, itemsPerPage, onSaveState]);

    useEffect(() => {
        if (approvalRequest?.status === 'returned') {
            fetchRequestActions(approvalRequest.id).then(acts => {
                const last = [...acts].reverse().find(a => a.action === 'returned');
                setReturnReason(last?.comment || '');
            });
        } else {
            setReturnReason('');
        }
    }, [approvalRequest?.id, approvalRequest?.status]);

    const handleOpenSubmitModal = async (draftNameOpt?: string | React.MouseEvent) => {
        const passedName = typeof draftNameOpt === 'string' ? draftNameOpt : '';
        const [wfs] = await Promise.all([listWorkflows()]);
        setWorkflows(wfs);
        setSubmitDraftName(passedName || currentDraftName || '');
        setSelectedWorkflowId(wfs[0]?.id || '');
        setIsSubmitModalOpen(true);
    };

    const handleApprove = async () => {
        if (!approvalRequest) return;
        if (
            !confirm(
                'Bạn chắc chắn Phê duyệt đơn hàng này? Các điều chỉnh của bạn (nếu có) sẽ được tự động lưu lại hệ thống.',
            )
        )
            return;

        setIsSubmitting(true);
        const { success, error } = await processApprovalAction(
            approvalRequest.id,
            user!.id,
            'approved',
            undefined, // comment
            orderQuantities, // pass modified quantities
            undefined, // reason
            undefined, // expectedVersion
            undefined, // decisionSummary
            approvalRequest.snapshot_data, // passed snapshot to skip redownload
            orderNotes,
        );
        setIsSubmitting(false);
        if (success) {
            alert('Phê duyệt thành công!');
            setApprovalRequest({ ...approvalRequest, status: 'approved' });
        } else {
            alert('Lỗi: ' + error);
        }
    };

    const handleReturn = async () => {
        if (!approvalRequest) return;
        const reason = prompt('Nhập lý do trả lại đơn hàng cho Planner:');
        if (!reason) return;

        setIsSubmitting(true);
        const { success, error } = await processApprovalAction(
            approvalRequest.id,
            user!.id,
            'returned',
            undefined, // comment
            orderQuantities,
            reason,
            undefined, // expectedVersion
            undefined, // decisionSummary
            approvalRequest.snapshot_data, // passed snapshot to skip redownload
            orderNotes,
        );
        setIsSubmitting(false);
        if (success) {
            alert('Đã trả lại đơn hàng.');
            setApprovalRequest({ ...approvalRequest, status: 'returned' });
        } else {
            alert('Lỗi: ' + error);
        }
    };

    // Async snapshot builder — processes SKUs in chunks of 100 to avoid blocking UI thread
    const buildSnapshot = async (onProgress?: (step: string, pct: number) => void): Promise<any> => {
        const allCodes = Array.from(
            new Set([
                ...Object.keys(orderQuantities).filter(
                    code => (orderQuantities[code].air || 0) + (orderQuantities[code].sea || 0) > 0,
                ),
                ...(approvalRequest?.snapshot_data?.inventory_context?.map((ctx: any) => ctx.itemCode) || []),
            ]),
        );

        const CHUNK = 100;
        const inventory_context: any[] = [];
        const total = allCodes.length;

        for (let i = 0; i < total; i += CHUNK) {
            const batch = allCodes.slice(i, i + CHUNK);
            for (const code of batch) {
                const item = enrichedMap?.get(code);
                const c = item?.computed;
                const profile = item ? resolveItemProfile(item, settings.sourceProfiles) : undefined;
                inventory_context.push({
                    itemCode: code,
                    itemName: item?.ItemName || code,
                    typecar: item?.TypeCar || '',
                    loisGroup: item?.LOISGroup || '',
                    trendFlag: item?.TrendFlag || '',
                    status: item?.Status || '',
                    available: c?.available || 0,
                    safetyStock: c?.safetyStock || 0,
                    rop: c?.rop || 0,
                    stockMax: c?.stockMax || 0,
                    totalPO: item?.TotalPO || 0,
                    backorder: item?.Backorder || 0,
                    dealerInventory: item?.DealerInventory || 0,
                    mos: c?.mos || 0,
                    runway: c?.cst || 0,
                    baseForecast: item?.BaseForecast || 0,
                    priorityBucket: c?.priorityBucket || 'P3',
                    unitCost: c?.unitCost || 0,
                    warnings: (c?.warnings || []).map((w: any) => w.message),
                    m1Actual: item?.SalesHistory?.slice(-1)[0] || 0,
                    avgQty3M: item?.AvgQty3M || 0,
                    avgQty6M: item?.AvgQty6M || 0,
                    avgQty12M: item?.AvgQty12M || 0,
                    avgQty24M: item?.AvgQty24M || 0,
                    incomingCurrentMonth: c?.incomingCurrentMonth || 0,
                    incomingNextMonth: c?.incomingNextMonth || 0,
                    cst: c?.cst || 0,
                    // salesHistory omitted — saves ~60% payload; avgQty fields cover demand intel
                    // Regional breakdown + leadtime for print form
                    available_NB: item?.QuantityInventory_NB || 0,
                    available_BB: item?.QuantityInventory_BB || 0,
                    totalPO_NB: item?.TotalPO_NB || 0,
                    totalPO_BB: item?.TotalPO_BB || 0,
                    backorder_NB: item?.Backorder_NB || 0,
                    backorder_BB: item?.Backorder_BB || 0,
                    backorderBreakdown: item?.BackorderBreakdown || [],
                    dealerBreakdown: item?.DealerBreakdown || [],
                    effectiveLT: profile?.profile?.lt ?? settings.params.lt ?? 90,
                    qtyNB: c?.transfer?.suggestedOrderNB || 0,
                    qtyBB: c?.transfer?.suggestedOrderBB || 0,
                });
            }
            // Yield to browser after each chunk so UI stays responsive
            if (i + CHUNK < total) {
                const pct = Math.round(((i + CHUNK) / total) * 70); // 0–70% for building
                onProgress?.('Đang đóng gói dữ liệu...', pct);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        onProgress?.('Đang nén và gửi lên...', 80);
        return {
            quantities: orderQuantities,
            notes: orderNotes,
            inventory_context,
            submitted_at: new Date().toISOString(),
            app_version: '13',
        };
    };

    const handleSubmitApproval = async () => {
        if (!user || !submitDraftName.trim() || !selectedWorkflowId) return;
        setIsSubmitting(true);
        setSubmitProgress({ step: 'Đang chuẩn bị...', pct: 5 });
        try {
            // Step 1: Build snapshot in chunks (0–70%)
            const snapshot = await buildSnapshot((step, pct) => setSubmitProgress({ step, pct }));

            // Yield before JSON.stringify so progress bar renders first
            await new Promise(r => setTimeout(r, 0));
            setSubmitProgress({ step: 'Đang nén dữ liệu...', pct: 73 });
            await new Promise(r => setTimeout(r, 0));

            // Step 2: Pre-compress on client (gzip) — avoids blocking inside submitApprovalRequest
            const fullSnapshot = { ...snapshot, original_quantities: snapshot.quantities };
            const compressedBlob = await compressData(fullSnapshot);

            // Yield after compress so UI updates
            await new Promise(r => setTimeout(r, 0));
            setSubmitProgress({ step: 'Đang upload lên server...', pct: 85 });
            await new Promise(r => setTimeout(r, 0));

            // Step 3: Upload pre-compressed blob directly — no double stringify/compress
            const { id, error } = await submitApprovalRequestPrecompressed({
                draft_name: submitDraftName.trim(),
                brand: normalizeBrand(profile?.department),
                workflow_id: selectedWorkflowId,
                submitted_by: user.id,
                compressedBlob,
                meta: { submitted_at: snapshot.submitted_at, app_version: snapshot.app_version },
                summary: computeSnapshotSummary(fullSnapshot),
            });

            setIsSubmitting(false);
            setSubmitProgress(null);

            if (id) {
                setIsSubmitModalOpen(false);
                // Clearing the workbench state as requested: "hoàn thành và không lưu ở đây nữa"
                setOrderQuantities({});
                setOrderNotes({});
                setConfirmedSkus(new Set());
                setSupersessionWarnings({});
                setCurrentDraftName('');
                setApprovalRequest(null);
                alert(`✅ Đã gửi yêu cầu phê duyệt "${submitDraftName.trim()}" thành công!`);
            } else {
                alert(`❌ Lỗi khi gửi phê duyệt: ${error || 'Lỗi không xác định'}`);
            }
        } catch (err: any) {
            setIsSubmitting(false);
            setSubmitProgress(null);
            alert(`❌ Lỗi hệ thống: ${err.message || 'Vui lòng thử lại sau'}`);
        }
    };

    const handleResubmit = async () => {
        if (!approvalRequest) return;
        if (!confirm(`Gửi lại yêu cầu phê duyệt "${approvalRequest.draft_name}" với dữ liệu đã chỉnh sửa?`)) return;
        setIsSubmitting(true);
        setSubmitProgress({ step: 'Đang đóng gói dữ liệu...', pct: 10 });

        // Build → yield → compress → yield → upload (same chunked pipeline as submit)
        const snapshot = await buildSnapshot((step, pct) => setSubmitProgress({ step, pct }));
        await new Promise(r => setTimeout(r, 0));
        setSubmitProgress({ step: 'Đang nén dữ liệu...', pct: 73 });
        await new Promise(r => setTimeout(r, 0));
        const compressedBlob = await compressData(snapshot);
        await new Promise(r => setTimeout(r, 0));
        setSubmitProgress({ step: 'Đang gửi lại...', pct: 90 });
        await new Promise(r => setTimeout(r, 0));

        const ok = await resubmitApprovalRequestPrecompressed(
            approvalRequest.id,
            compressedBlob,
            {
                submitted_at: snapshot.submitted_at,
                app_version: snapshot.app_version,
                brand: normalizeBrand(profile?.department),
                summary: computeSnapshotSummary(snapshot),
            },
            approvalRequest.version,
            { actorId: user!.id, quantities: orderQuantities, notes: orderNotes },
        );
        setIsSubmitting(false);
        setSubmitProgress(null);
        if (ok) {
            // Clearing the workbench state as requested: "hoàn thành và không lưu ở đây nữa"
            setOrderQuantities({});
            setOrderNotes({});
            setConfirmedSkus(new Set());
            setSupersessionWarnings({});
            setCurrentDraftName('');
            setApprovalRequest(null);
            alert(`✅ Đã gửi lại yêu cầu phê duyệt "${approvalRequest.draft_name}" thành công!`);
        } else {
            alert('Lỗi khi gửi lại yêu cầu.');
        }
    };

    const handleMainFilterChange = (f: InventoryFilters) => {
        if (f.search !== filters.search) setSearchResult(parseInventorySearch(f.search));
        setFilters(f);
        setCurrentPage(1);
    };

    const computeParams = useMemo(() => makeComputeParams(settings), [settings]);
    const fallbackData = data;
    const activeEnrichedData = enrichedData || fallbackData;

    // O10 PERFORMANCE: Base metrics (no drafts) are now computed centrally in App.tsx!

    const { enrichedList, enrichedMap } = useMemo(() => {
        const itemMap = new Map<string, InventoryItem>();
        const list = activeEnrichedData.map(item => {
            const draft = orderQuantities[item.ItemCode];
            const od = originalDraft?.[item.ItemCode];
            const hasDraft = (draft && draft.air + draft.sea > 0) || (od && od.air + od.sea > 0);

            // If item has draft, re-calculate its simulations. Otherwise, use base item.
            let finalizedItem = item;
            if (hasDraft) {
                const itemProfile = resolveItemProfile(item, computeParams.sourceProfiles);
                const computed = computeInventory(item, computeParams, draft, itemProfile);

                // O12 FIX: Restore original AIR and total SEA order suggestions to ensure they remain static.
                // NOTE: We do NOT restore suggestedOrderNB, suggestedOrderBB, transferNBtoBB, transferBBtoNB
                // so that they can dynamically reflect the split for the newly drafted quantity based on target distribution!
                if (item.computed) {
                    computed.gapOrExcess = item.computed.gapOrExcess;
                    computed.suggestedBO = item.computed.suggestedBO;
                }

                finalizedItem = { ...item, computed };
            }

            itemMap.set(item.ItemCode, finalizedItem);
            return finalizedItem;
        });
        return { enrichedList: list, enrichedMap: itemMap };
    }, [activeEnrichedData, computeParams, orderQuantities, originalDraft]);

    const filteredData = useMemo(() => {
        let list = enrichedList.filter(i => {
            if (!matchSearch(i, deferredSearchResult)) return false;
            const d = orderQuantities[i.ItemCode] as { air: number; sea: number } | undefined;
            const od = originalDraft?.[i.ItemCode];
            const hasDraft = (d && d.air + d.sea > 0) || (od && od.air + od.sea > 0);
            // O8 Fix: 'Suggested' tab phải hiển thị cả items có AIR suggest (suggestedBO) lẫn SEA suggest (gapOrExcess)
            const hasSuggestion = (i.computed?.gapOrExcess || 0) > 0 || (i.computed?.suggestedBO || 0) > 0;
            if (deferredViewFilter === 'draft' && !hasDraft) return false;
            if (deferredViewFilter === 'suggested' && !hasSuggestion) return false;
            if (
                deferredViewFilter === 'seasonal' &&
                !i.computed?.warnings?.some((w: any) => w.code === 'SEASONAL_UPCOMING')
            )
                return false;
            if (deferredFilters.priority !== 'All' && i.computed?.priorityBucket !== deferredFilters.priority)
                return false;
            if (deferredFilters.status !== 'All' && i.Status !== deferredFilters.status) return false;
            if (deferredFilters.lois.length > 0 && !deferredFilters.lois.includes(i.LOISGroup)) return false;
            if (deferredFilters.source && deferredFilters.source.length > 0) {
                const sourceMatch = deferredFilters.source.some(s => {
                    const [brand, sid] = s.split('|');
                    return i.BrandName === brand && (i.SourceId || '') === sid;
                });
                if (!sourceMatch) return false;
            }
            if (deferredFilters.trend !== 'All' && i.TrendFlag !== deferredFilters.trend) return false;
            if (deferredFilters.showBackorders && i.Backorder <= 0) return false;
            if (deferredFilters.specialFilter === 'stockout' && !i.computed?.stockoutRiskFlag) return false;
            if (deferredFilters.specialFilter === 'excess' && (i.computed?.excessQty || 0) <= 0) return false;
            if (deferredFilters.specialFilter === 'has_po' && (i.TotalPO || 0) <= 0) return false;
            if (deferredFilters.specialFilter === 'has_supersession') {
                if (!graph) return false;
                const chain = graph.getChain(i.ItemCode);
                if (!chain || chain.allParts.length <= 1) return false;
            }
            if (deferredFilters.specialFilter === 'has_warning') {
                if (!i.computed?.warnings || i.computed.warnings.length === 0) return false;
            }
            if (deferredFilters.specialFilter === 'low_stock') {
                const avail = i.computed?.available || 0;
                const ss = i.computed?.safetyStock || 0;
                const mos = i.computed?.mos || 0;
                // Low stock: tồn vật lý < safety stock HOẶC MOS < ngưỡng thấp (nhưng chưa hẳn stockout)
                if (avail >= ss && mos >= MOS_LOW_STOCK_THRESHOLD) return false;
            }
            if (deferredFilters.costRange > 0) {
                const range = COST_RANGES[deferredFilters.costRange];
                if (i.UnitCost_PP < range.min || i.UnitCost_PP >= range.max) return false;
            }
            if (deferredFilters.fobCostRange > 0) {
                const range = FOB_COST_RANGES[deferredFilters.fobCostRange];
                if (i.UnitCost_FOB < range.min || i.UnitCost_FOB >= range.max) return false;
            }
            if (deferredFilters.debtStatus && deferredFilters.debtStatus.length > 0) {
                const status = getDebtStatus(i);
                if (!deferredFilters.debtStatus.includes(status)) return false;
            }
            if (deferredFilters.onlyAdjusted) {
                const current = (orderQuantities[i.ItemCode]?.air || 0) + (orderQuantities[i.ItemCode]?.sea || 0);
                const originalBase =
                    approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities;
                const original = (originalBase?.[i.ItemCode]?.air || 0) + (originalBase?.[i.ItemCode]?.sea || 0);
                const qtyChanged = current !== original;
                const currentNote = (orderNotes[i.ItemCode] || '').trim();
                const originalNotes = approvalRequest?.snapshot_data?.notes || {};
                const originalNote = (originalNotes[i.ItemCode] || '').trim();
                const noteChanged = currentNote !== originalNote;
                if (!qtyChanged && !noteChanged) return false;
            }
            return true;
        });

        return list.sort((a, b) => {
            switch (deferredSortKey) {
                case 'priority': {
                    const pa = PRIORITY_ORDER[a.computed?.priorityBucket || 'P3'];
                    const pb = PRIORITY_ORDER[b.computed?.priorityBucket || 'P3'];
                    if (pa !== pb) return pa - pb;
                    // Tiebreak: MOS tăng dần (thiếu hàng nhất lên đầu)
                    return (a.computed?.mos || 0) - (b.computed?.mos || 0);
                }
                case 'mos_asc':
                    return (a.computed?.mos || 0) - (b.computed?.mos || 0);
                case 'mos_desc':
                    return (b.computed?.mos || 0) - (a.computed?.mos || 0);
                case 'fc_desc':
                    return (b.BaseForecast || 0) - (a.BaseForecast || 0);
                case 'stock_desc':
                    return (b.computed?.available || 0) - (a.computed?.available || 0);
                case 'val_desc':
                    return (b.computed?.stockValue || 0) - (a.computed?.stockValue || 0);
                case 'bo_desc':
                    return (b.Backorder || 0) - (a.Backorder || 0);
                case 'price_desc':
                    return (b.computed?.unitCost || 0) - (a.computed?.unitCost || 0);
                default:
                    return 0;
            }
        });
    }, [
        enrichedList,
        deferredSearchResult,
        deferredViewFilter,
        deferredFilters,
        deferredSortKey,
        orderQuantities,
        graph,
    ]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage, itemsPerPage]);

    // ── Part Affinity suggestions (cho Submit modal) ──────────────────────────
    const { index: affinityIndex, isLoading: affinityLoading } = usePartAffinity();
    const orderedSetForAffinity = useMemo(() => {
        const s = new Set<string>();
        Object.entries(orderQuantities).forEach(([code, q]) => {
            if ((q?.air || 0) + (q?.sea || 0) > 0) s.add(code);
        });
        return s;
    }, [orderQuantities]);
    const affinitySuggestions = useMemo(() => {
        if (affinityLoading || orderedSetForAffinity.size === 0) return { mandatoryMissing: [], recommended: [] };
        return suggestForOrder(orderedSetForAffinity, affinityIndex, 5);
    }, [orderedSetForAffinity, affinityIndex, affinityLoading]);
    const affinityItemNames = useMemo(() => {
        const m: Record<string, string> = {};
        enrichedList.forEach(it => {
            m[normalizePartCode(it.ItemCode || '')] = it.ItemName || '';
        });
        return m;
    }, [enrichedList]);
    // Lookup: normalized SKU → raw ItemCode (vì enrichedMap key raw, affinity related đã normalize)
    const normalizedToRaw = useMemo(() => {
        const m: Record<string, string> = {};
        enrichedList.forEach(it => {
            m[normalizePartCode(it.ItemCode || '')] = it.ItemCode;
        });
        return m;
    }, [enrichedList]);
    const findRawCode = (normalizedSku: string): string => {
        return normalizedToRaw[normalizedSku] || normalizedSku;
    };

    /**
     * Add 1 Sea cho related SKU + auto-note ghi lý do (do mã liên quan).
     * Dùng chung cho inline banner + bulk + submit modal.
     */
    const addAffinityToOrder = (s: {
        relatedPart: string;
        type: 'mandatory' | 'recommended';
        score: number;
        triggeredBy: string[];
        note?: string;
    }) => {
        const code = findRawCode(s.relatedPart);
        const cur = orderQuantities[code] || { air: 0, sea: 0 };
        handleQtyChange(code, 'sea', (cur.sea || 0) + 1, true);
        const tag = s.type === 'mandatory' ? 'BẮT BUỘC' : `KHUYẾN NGHỊ ${s.score}`;
        const trigger = s.triggeredBy.join(', ');
        const autoNote = `Mã liên quan [${tag}]: do đặt ${trigger}${s.note ? ` — ${s.note}` : ''}`;
        setOrderNotes(prev => ({
            ...prev,
            [code]: prev[code] ? `${prev[code]}\n${autoNote}` : autoNote,
        }));
    };

    const handleQtyChange = (code: string, type: 'air' | 'sea', val: number, bypassConfirm = false) => {
        const item = enrichedMap.get(code);
        const snp = item?.SNP || 1;
        const correctedVal = val > 0 ? Math.ceil(val / snp) * snp : 0;

        // --- SAFEGUARDS ---
        // O11 UX: Session-based acknowledgement to prevent repetitive popups
        const isAlreadyConfirmed = confirmedSkus.has(code);

        if (!bypassConfirm && val > 0 && !isAlreadyConfirmed && item?.computed?.warnings) {
            const hasCriticalOrWarning = item.computed.warnings.some(
                w => w.type === 'Critical' || w.type === 'Warning',
            );
            if (hasCriticalOrWarning) {
                // Deduplicate queue: Only one popup per SKU. Update if already exists.
                setConfirmationQueue(prev => {
                    const existingIdx = prev.findIndex(q => q.code === code);
                    if (existingIdx !== -1) {
                        const next = [...prev];
                        next[existingIdx] = { code, type, val: correctedVal };
                        return next;
                    }
                    return [...prev, { code, type, val: correctedVal }];
                });
                return;
            }
        }

        if (val > 0 && graph) {
            const chain = graph.getChain(code);
            if (chain && chain.currentPart !== code) {
                setSupersessionWarnings(prev => ({
                    ...prev,
                    [code]: correctedVal,
                }));
            }
        }

        setOrderQuantities(p => {
            const current = (p[code] || { air: 0, sea: 0 }) as { air: number; sea: number };
            const next = { ...current, [type]: correctedVal };
            return { ...p, [code]: next };
        });
    };

    const confirmWarning = () => {
        if (confirmationQueue.length === 0) return;
        const { code, type, val } = confirmationQueue[0];
        const item = enrichedMap.get(code);

        // Auto-Audit: Add warning descriptions to notes
        if (item?.computed?.warnings) {
            const warningText = item.computed.warnings.map(w => `[${w.code}] ${w.message}`).join(' | ');
            setOrderNotes(prev => ({
                ...prev,
                [code]: prev[code] ? `${prev[code]}\nAUTO-AUDIT: ${warningText}` : `AUTO-AUDIT: ${warningText}`,
            }));
        }

        handleQtyChange(code, type, val, true);

        // Mark SKU as confirmed for this session
        setConfirmedSkus(prev => {
            const next = new Set(prev);
            next.add(code);
            return next;
        });

        setConfirmationQueue(prev => prev.slice(1));
    };

    const handleUseNewPart = (oldPart: string, newPart: string, qty: number) => {
        setOrderQuantities(prev => {
            const updated = { ...prev };
            const existingOld = prev[oldPart] || { air: 0, sea: 0 };
            const isAir = existingOld.air > 0;
            if (updated[oldPart]) delete updated[oldPart];
            const existingNew = updated[newPart] || { air: 0, sea: 0 };
            updated[newPart] = {
                air: existingNew.air + (isAir ? qty : 0),
                sea: existingNew.sea + (!isAir ? qty : 0),
            };
            return updated;
        });

        // Add automatic note
        setOrderNotes(prev => {
            const currentNote = prev[newPart] || '';
            const autoNote = `Mã cũ: ${oldPart} | SL: ${qty}`;
            return {
                ...prev,
                [newPart]: currentNote ? `${currentNote}\n${autoNote}` : autoNote,
            };
        });

        setSupersessionWarnings(prev => {
            const next = { ...prev };
            delete next[oldPart];
            return next;
        });
    };

    const handleConvertAll = () => {
        Object.entries(supersessionWarnings).forEach(([oldPart, qty]) => {
            if (graph) {
                const chain = graph.getChain(oldPart);
                if (chain && chain.currentPart !== oldPart) {
                    handleUseNewPart(oldPart, chain.currentPart, qty as number);
                }
            }
        });
    };

    const handleKeepOldPart = (oldPart: string) => {
        setSupersessionWarnings(prev => {
            const next = { ...prev };
            delete next[oldPart];
            return next;
        });
    };

    const handleExport = () => {
        const list: any[] = [];
        (Object.entries(orderQuantities) as [string, { air: number; sea: number }][]).forEach(([code, qty]) => {
            if (qty.air > 0 || qty.sea > 0) {
                const item = enrichedMap.get(code);
                if (item) list.push({ item, airQty: qty.air, seaQty: qty.sea, note: orderNotes[code] || '' });
            }
        });
        if (list.length === 0) return alert('Dự thảo trống');
        const exportOptions: CsvExportOptions | undefined = appSettings
            ? {
                  separator:
                      appSettings.exportSeparator === 'semicolon'
                          ? ';'
                          : appSettings.exportSeparator === 'tab'
                            ? '\t'
                            : ',',
                  encoding: appSettings.exportEncoding,
                  decimalPrecision: appSettings.exportDecimalPrecision,
                  exportColumns: appSettings.orderDraftColumns,
              }
            : undefined;
        exportOrderDraftToCSV(
            list,
            `Draft_Combined_${new Date().toISOString().slice(0, 10)}.csv`,
            settings.costBasis,
            exportOptions,
        );
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = event => {
            const text = event.target?.result as string;
            const { quantities, notes } = parseOrderingDraftCSV(text);
            if (Object.keys(quantities).length === 0) return alert('Không tìm thấy dữ liệu đặt hàng hợp lệ.');
            setOrderQuantities(p => ({ ...p, ...quantities }));
            setOrderNotes(p => ({ ...p, ...notes }));
            alert(`Đã nhập dự thảo thành công cho ${Object.keys(quantities).length} mã hàng.`);
        };
        reader.readAsText(file);
    };

    const handleClearDraft = () => {
        const hasDraft = Object.values(orderQuantities).some((v: any) => v.air + v.sea > 0);
        if (!hasDraft) return alert('Dự thảo hiện đang trống.');

        if (confirm(t('ord_confirm_clear'))) {
            setOrderQuantities({});
            setOrderNotes({});
            setConfirmedSkus(new Set());
            setSupersessionWarnings({});
            setCurrentDraftName('');
        }
    };

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    return (
        <div className="animate-fadeIn space-y-6 flex flex-col min-h-[calc(100vh-120px)] pb-12">
            {/* Page Header - Enhanced with professional Navy-Indigo gradient */}
            <div className="bg-gradient-professional rounded-3xl p-8 md:p-10 text-white relative overflow-hidden shadow-glass border border-white/10 group/header">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-50"></div>
                <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none group-hover/header:bg-blue-400/30 transition-all duration-1000 rotate-12"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-glass group-hover/header:scale-110 group-hover/header:rotate-6 transition-all duration-500">
                            <FaIcon className="fas fa-cart-shopping text-blue-400 text-2xl" />
                        </div>
                        <div>
                            <Typography
                                variant="h1"
                                className="tracking-tight uppercase text-white !text-3xl workbench-title"
                            >
                                {t('nav_ordering')}
                            </Typography>
                            <Typography
                                variant="body"
                                className="text-[#F5F5F5] font-medium opacity-100 decoration-blue-500/60 underline decoration-2 underline-offset-4 supply-chain-data"
                            >
                                Demand Intelligence & Ordering Workbench
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 backdrop-blur-sm px-5 py-2.5 rounded-2xl border border-white/10 shadow-glass">
                            <Typography
                                variant="label"
                                className="text-[#F5F5F5] !text-[10px] uppercase font-black tracking-widest opacity-80 metric-label"
                            >
                                SKU Base
                            </Typography>
                            <Typography variant="h2" className="text-white">
                                {data.length.toLocaleString()}
                            </Typography>
                        </div>
                        <div className="bg-blue-500/10 backdrop-blur-sm px-5 py-2.5 rounded-2xl border border-blue-400/20 shadow-glass">
                            <Typography
                                variant="label"
                                className="text-[#F5F5F5] !text-[10px] uppercase font-black tracking-widest opacity-80 metric-label"
                            >
                                In Draft
                            </Typography>
                            <Typography variant="h2" className="text-white">
                                {Object.values(orderQuantities).filter((v: any) => v.air + v.sea > 0).length}
                            </Typography>
                        </div>
                    </div>
                </div>
            </div>

            <FilterPanel
                data={data}
                settings={settings}
                onSettingsChange={setSettings}
                filters={filters}
                onFiltersChange={handleMainFilterChange}
                loisProfiles={appSettings?.loisProfiles}
                sourceName={(() => {
                    const brands = Array.from(new Set(data.map(i => i.BrandName).filter(Boolean)));
                    const sources = Array.from(new Set(data.map(i => i.SourceId).filter(Boolean)));

                    if (brands.length === 1 && sources.length > 1) return `[${brands[0]}] ${sources.length} Sources`;
                    if (brands.length > 1) return `[Mixed] ${brands.length} Brands`;
                    if (brands.length === 1 && sources.length === 1) {
                        const p = appSettings?.sourceProfiles?.find(
                            p =>
                                p.brand.toLowerCase() === brands[0].toLowerCase() &&
                                (p.id.toUpperCase() === sources[0].toUpperCase() ||
                                    p.name.toLowerCase().includes(sources[0].toLowerCase())),
                        );
                        if (p) return `[${p.brand}] ${p.id} – ${p.name}`;
                        return `[${brands[0]}] ${sources[0]}`;
                    }

                    const p = appSettings?.sourceProfiles?.find(p => p.id === appSettings?.activeSourceId);
                    if (p) return `[${p.brand || 'Kia'}] ${p.id} – ${p.name}`;

                    return undefined;
                })()}
            />
            {!isMobile && (
                <DraftAnalysisCharts
                    itemMap={enrichedMap}
                    orderQuantities={orderQuantities}
                    costBasis={settings.costBasis}
                />
            )}

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm">
                {Object.keys(supersessionWarnings).length > 0 && (
                    <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-amber-800">
                                <FaIcon className="fas fa-triangle-exclamation" />
                                <span className="text-sm font-black uppercase tracking-wider">
                                    Cảnh báo thay thế mã ({Object.keys(supersessionWarnings).length})
                                </span>
                            </div>
                            {Object.keys(supersessionWarnings).length > 1 && (
                                <button
                                    onClick={handleConvertAll}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2"
                                >
                                    <FaIcon className="fas fa-sync-alt" /> Chuyển tất cả sang mã mới
                                </button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {Object.entries(supersessionWarnings).map(([oldPart, qty]) => (
                                <SupersessionWarning
                                    key={oldPart}
                                    partNumber={oldPart}
                                    qty={qty}
                                    graph={graph}
                                    onUseCurrentPart={handleUseNewPart}
                                    onKeepOldPart={handleKeepOldPart}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {/* Cảnh báo Mã liên quan (Part Affinity) — inline banner cho planner xử lý nhanh */}
                {(affinitySuggestions.mandatoryMissing.length > 0 || affinitySuggestions.recommended.length > 0) && (
                    <div className="px-6 py-4 bg-blue-50/60 border-b border-blue-100">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-blue-800">
                                <FaIcon className="fas fa-link" />
                                <span className="text-sm font-black uppercase tracking-wider">
                                    Mã liên quan — gợi ý kèm theo
                                    {affinitySuggestions.mandatoryMissing.length > 0 && (
                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px]">
                                            {affinitySuggestions.mandatoryMissing.length} bắt buộc
                                        </span>
                                    )}
                                    {affinitySuggestions.recommended.length > 0 && (
                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px]">
                                            {affinitySuggestions.recommended.length} khuyến nghị
                                        </span>
                                    )}
                                </span>
                            </div>
                            {affinitySuggestions.mandatoryMissing.length > 1 && (
                                <button
                                    onClick={() => {
                                        affinitySuggestions.mandatoryMissing.forEach(s => addAffinityToOrder(s));
                                    }}
                                    className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2"
                                >
                                    <FaIcon className="fas fa-plus" /> Thêm tất cả bắt buộc
                                </button>
                            )}
                        </div>
                        <div className="space-y-1">
                            {[
                                ...affinitySuggestions.mandatoryMissing.map(s => ({ s, kind: 'm' as const })),
                                ...affinitySuggestions.recommended.slice(0, 3).map(s => ({ s, kind: 'r' as const })),
                            ].map(({ s, kind }) => {
                                const isM = kind === 'm';
                                const rawCode = findRawCode(s.relatedPart);
                                const item = enrichedMap.get(rawCode);
                                const c = item?.computed;
                                const stockNB = (item?.QuantityInventory_NB || 0) + (item?.QuantityDC_NB || 0);
                                const stockBB = (item?.QuantityInventory_BB || 0) + (item?.QuantityDC_BB || 0);
                                const totalStock = stockNB + stockBB;
                                const bo = item?.Backorder || 0;
                                const m1 =
                                    item?.SalesHistory && item.SalesHistory.length > 0
                                        ? item.SalesHistory[item.SalesHistory.length - 1]
                                        : 0;
                                const mos = c?.mos ?? 0;
                                const po = item?.TotalPO || 0;
                                const draftQty =
                                    (orderQuantities[rawCode]?.air || 0) + (orderQuantities[rawCode]?.sea || 0);
                                const classification = c?.classification;
                                const inApp = !!item;

                                const clsBadge =
                                    classification === 'critical'
                                        ? 'bg-red-100 text-red-700'
                                        : classification === 'strained'
                                          ? 'bg-orange-100 text-orange-700'
                                          : classification === 'dead'
                                            ? 'bg-slate-200 text-slate-600'
                                            : classification === 'slow'
                                              ? 'bg-slate-100 text-slate-500'
                                              : 'bg-emerald-100 text-emerald-700';
                                const clsLabel =
                                    classification === 'critical'
                                        ? '⚠ CRITICAL'
                                        : classification === 'strained'
                                          ? 'STRAINED'
                                          : classification === 'dead'
                                            ? 'DEAD'
                                            : classification === 'slow'
                                              ? 'SLOW'
                                              : classification === 'healthy'
                                                ? 'HEALTHY'
                                                : null;

                                return (
                                    <div
                                        key={`${kind}-${s.relatedPart}`}
                                        className={`flex items-center justify-between gap-3 bg-white border rounded-lg px-3 py-2 ${isM ? 'border-rose-200' : 'border-blue-100'}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span
                                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isM ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}
                                                >
                                                    {isM ? 'BẮT BUỘC' : `KN ${s.score}`}
                                                </span>
                                                <span className="font-mono text-sm font-black text-slate-800">
                                                    {s.relatedPart}
                                                </span>
                                                {affinityItemNames[s.relatedPart] && (
                                                    <span className="text-xs text-slate-500">
                                                        — {affinityItemNames[s.relatedPart]}
                                                    </span>
                                                )}
                                                {!inApp && (
                                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                                        KHÔNG CÓ TRONG DATA
                                                    </span>
                                                )}
                                                {clsLabel && (
                                                    <span
                                                        className={`text-[10px] font-black px-1.5 py-0.5 rounded ${clsBadge}`}
                                                    >
                                                        {clsLabel}
                                                    </span>
                                                )}
                                                {draftQty > 0 && (
                                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                        ĐÃ ĐẶT {draftQty}
                                                    </span>
                                                )}
                                            </div>
                                            {inApp && (
                                                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap tabular-nums">
                                                    <span>
                                                        <span className="text-slate-400">Tồn:</span>{' '}
                                                        <strong
                                                            className={
                                                                totalStock === 0 ? 'text-red-600' : 'text-slate-700'
                                                            }
                                                        >
                                                            {totalStock}
                                                        </strong>{' '}
                                                        <span className="text-slate-400">
                                                            (NB {stockNB} · BB {stockBB})
                                                        </span>
                                                    </span>
                                                    {bo > 0 && (
                                                        <span className="text-rose-600">
                                                            <span className="text-slate-400">BO:</span>{' '}
                                                            <strong>{bo}</strong>
                                                        </span>
                                                    )}
                                                    <span>
                                                        <span className="text-slate-400">M-1:</span>{' '}
                                                        <strong className="text-slate-700">{m1}</strong>
                                                    </span>
                                                    {mos > 0 && (
                                                        <span>
                                                            <span className="text-slate-400">MOS:</span>{' '}
                                                            <strong
                                                                className={
                                                                    mos > 6
                                                                        ? 'text-red-600'
                                                                        : mos > 3
                                                                          ? 'text-amber-600'
                                                                          : 'text-emerald-600'
                                                                }
                                                            >
                                                                {mos.toFixed(1)}
                                                            </strong>
                                                        </span>
                                                    )}
                                                    {po > 0 && (
                                                        <span>
                                                            <span className="text-slate-400">PO về:</span>{' '}
                                                            <strong className="text-blue-600">{po}</strong>
                                                        </span>
                                                    )}
                                                    {c?.urgentQty != null && c.urgentQty > 0 && (
                                                        <span className="text-rose-600">
                                                            <span className="text-slate-400">Đề xuất Air:</span>{' '}
                                                            <strong>{c.urgentQty}</strong>
                                                        </span>
                                                    )}
                                                    {c?.reserveQty != null && c.reserveQty > 0 && (
                                                        <span className="text-blue-600">
                                                            <span className="text-slate-400">Đề xuất Sea:</span>{' '}
                                                            <strong>{c.reserveQty}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                do đặt: <span className="font-mono">{s.triggeredBy.join(', ')}</span>
                                                {s.note && <span className="ml-2 italic">— {s.note}</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addAffinityToOrder(s)}
                                            disabled={!inApp}
                                            className={`text-[11px] font-bold px-2.5 py-1 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed ${isM ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                            title={
                                                !inApp
                                                    ? 'SKU không có trong data hiện tại'
                                                    : draftQty > 0
                                                      ? `Đã đặt ${draftQty}. Click để +1 Sea`
                                                      : 'Thêm 1 Sea + auto-note'
                                            }
                                        >
                                            + Thêm Sea
                                        </button>
                                    </div>
                                );
                            })}
                            {affinitySuggestions.recommended.length > 3 && (
                                <div className="text-[10px] text-slate-500 italic pl-2">
                                    … và {affinitySuggestions.recommended.length - 3} khuyến nghị khác (xem trong modal
                                    Xuất dự thảo)
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* ─── Compact/Flat Control Header ─── */}
                <div className="px-3 md:px-6 py-2 md:py-4 border-b border-slate-200 bg-white sticky top-0 z-40 flex flex-col gap-2 md:gap-4 shadow-sm">
                    {/* ROW 1: Tabs & Desktop Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Tabs Group */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="hidden md:block bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-blue-100 shrink-0">
                                {t('ord_workbench')}
                            </div>
                            {/* Flat Tabs for Mobile */}
                            <div className="lg-segmented w-full md:w-auto">
                                <button
                                    onClick={() => {
                                        setViewFilter('all');
                                        setCurrentPage(1);
                                    }}
                                    aria-pressed={viewFilter === 'all'}
                                    className={`flex-1 md:flex-none ${viewFilter === 'all' ? 'lg-active' : ''}`}
                                >
                                    {t('ord_tab_all')}
                                </button>
                                <button
                                    onClick={() => {
                                        setViewFilter('suggested');
                                        setCurrentPage(1);
                                    }}
                                    aria-pressed={viewFilter === 'suggested'}
                                    className={`flex-1 md:flex-none ${viewFilter === 'suggested' ? 'lg-active' : ''}`}
                                >
                                    {t('ord_tab_suggested')}
                                </button>
                                <button
                                    onClick={() => {
                                        setViewFilter('seasonal');
                                        setCurrentPage(1);
                                    }}
                                    aria-pressed={viewFilter === 'seasonal'}
                                    className={`flex-1 md:flex-none ${viewFilter === 'seasonal' ? 'lg-active' : ''}`}
                                >
                                    {t('ord_tab_seasonal')}
                                </button>
                                <button
                                    onClick={() => {
                                        setViewFilter('draft');
                                        setCurrentPage(1);
                                    }}
                                    aria-pressed={viewFilter === 'draft'}
                                    className={`flex-1 md:flex-none ${viewFilter === 'draft' ? 'lg-active' : ''}`}
                                >
                                    {t('ord_tab_draft')}
                                </button>
                            </div>

                            {/* Adjusted Items Filter Toggle (Approver/Returned context only) */}
                            {approvalRequest && (
                                <button
                                    onClick={() =>
                                        handleMainFilterChange({ ...filters, onlyAdjusted: !filters.onlyAdjusted })
                                    }
                                    aria-pressed={filters.onlyAdjusted}
                                    className={`lg-pill text-[10px] md:text-xs ${filters.onlyAdjusted ? 'lg-active' : ''}`}
                                >
                                    <FaIcon
                                        className={`fas ${filters.onlyAdjusted ? 'fa-check-circle' : 'fa-circle-dot'}`}
                                    />
                                    Có điều chỉnh
                                </button>
                            )}

                            {/* Desktop Sort */}
                            <div className="hidden md:flex items-center gap-2 shrink-0">
                                <FaIcon
                                    className="fas fa-sort-amount-down text-[10px]"
                                    style={{ color: 'rgba(15,17,22,0.4)' }}
                                />
                                <select
                                    value={sortKey}
                                    onChange={e => setSortKey(e.target.value)}
                                    className="lg-select cursor-pointer text-[10px]"
                                >
                                    <option value="priority">Sắp xếp: Hệ thống</option>
                                    <option value="mos_asc">MOS (Thấp nhất)</option>
                                    <option value="fc_desc">FC (Cao nhất)</option>
                                    <option value="stock_desc">Tồn kho (Nhiều nhất)</option>
                                    <option value="val_desc">Giá trị (Cao nhất)</option>
                                    <option value="bo_desc">Nợ BO (Nhiều nhất)</option>
                                    <option value="price_desc">Đơn giá (Cao nhất)</option>
                                </select>
                            </div>
                        </div>

                        {/* Desktop Action Buttons */}
                        <div className="hidden md:flex flex-wrap items-center gap-2 justify-end">
                            <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md border border-white/20 p-1.5 rounded-2xl shadow-sm">
                                <button
                                    onClick={() => setIsCloudModalOpen(true)}
                                    className="bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl transition-all border border-blue-400/30 flex items-center justify-center shadow-lg shadow-blue-500/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest backdrop-blur-sm active:scale-95"
                                >
                                    <FaIcon className="fas fa-cloud mr-2" /> Cloud
                                </button>
                                {!isApproverMode && (
                                    <>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".csv"
                                            onChange={handleImport}
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="bg-white/60 text-slate-700 hover:bg-white/80 rounded-xl transition-all border border-slate-200/50 flex items-center justify-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest active:scale-95"
                                        >
                                            <FaIcon className="fas fa-file-import mr-2 text-blue-500" /> Import
                                        </button>
                                        <button
                                            onClick={handleClearDraft}
                                            className="bg-white/60 text-rose-600 hover:bg-rose-50/80 rounded-xl transition-all border border-rose-200/50 flex items-center justify-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest active:scale-95"
                                        >
                                            <FaIcon className="fas fa-trash-can mr-2" /> Xóa Draft
                                        </button>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={handleExport}
                                className="bg-slate-800/90 hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-slate-900/10 flex items-center gap-2 border border-slate-700/50 backdrop-blur-md active:scale-95"
                            >
                                <FaIcon className="fas fa-file-export text-blue-300" /> {t('ord_export_btn')}
                            </button>
                            {isApproverMode ? (
                                <>
                                    <button
                                        onClick={handleReturn}
                                        disabled={isSubmitting}
                                        className="bg-rose-600/90 hover:bg-rose-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-rose-500/20 flex items-center gap-2 border border-rose-400/30 active:scale-95 backdrop-blur-sm"
                                    >
                                        <FaIcon className="fas fa-times" /> Trả lại
                                    </button>
                                    <button
                                        onClick={handleApprove}
                                        disabled={isSubmitting}
                                        className="bg-emerald-600/90 hover:bg-emerald-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-2 border border-emerald-400/30 active:scale-95 backdrop-blur-sm"
                                    >
                                        <FaIcon className="fas fa-check" /> Phê duyệt
                                    </button>
                                </>
                            ) : (
                                profile?.role &&
                                ['admin', 'planner'].includes(profile.role) &&
                                !isReturned && <div className="w-8" />
                            )}
                            {approvalRequest && <ApprovalStatusBadge status={approvalRequest.status} size="sm" />}
                        </div>
                    </div>

                    {/* ROW 2: Search + Mobile Controls (Flat minimal) */}
                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="flex-1 relative group">
                            <FaIcon className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs group-focus-within:text-blue-600 transition-colors" />
                            <input
                                type="text"
                                placeholder={t('ord_search_ph')}
                                value={localSearch}
                                onChange={e => {
                                    const val = e.target.value;
                                    setLocalSearch(val);
                                    clearTimeout(searchDebounceRef.current);
                                    searchDebounceRef.current = setTimeout(() => handleMainFilterChange({ ...filters, search: val }), 200);
                                }}
                                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-400 transition-all text-slate-700"
                            />
                        </div>

                        {/* Mobile Sort Icon Only */}
                        <div className="md:hidden flex items-center justify-center w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl relative shrink-0">
                            <FaIcon className="fas fa-sort-amount-down text-slate-500 text-xs" />
                            <select
                                value={sortKey}
                                onChange={e => setSortKey(e.target.value)}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            >
                                <option value="priority">Hệ thống</option>
                                <option value="mos_asc">MOS</option>
                                <option value="fc_desc">FC</option>
                                <option value="stock_desc">Tồn</option>
                                <option value="val_desc">Giá trị</option>
                            </select>
                        </div>

                        {/* Mobile Action Icons (Flat) */}
                        <div className="md:hidden flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={() => setIsCloudModalOpen(true)}
                                className="w-9 h-9 flex items-center justify-center text-blue-600 bg-blue-50/50 rounded-xl border border-blue-100 active:bg-blue-100"
                            >
                                <FaIcon className="fas fa-cloud text-xs" />
                            </button>
                            {!isApproverMode && (
                                <button
                                    onClick={handleClearDraft}
                                    className="w-9 h-9 flex items-center justify-center text-rose-600 bg-rose-50/50 rounded-xl border border-rose-100 active:bg-rose-100"
                                >
                                    <FaIcon className="fas fa-trash-can text-xs" />
                                </button>
                            )}
                            {isApproverMode ? (
                                <>
                                    <button
                                        onClick={handleReturn}
                                        disabled={isSubmitting}
                                        className="w-9 h-9 flex items-center justify-center text-rose-600 bg-rose-50/50 backdrop-blur-md rounded-xl border border-rose-200/50 active:bg-rose-100 disabled:opacity-40 active:scale-95 transition-all"
                                    >
                                        <FaIcon className="fas fa-times text-xs" />
                                    </button>
                                    <button
                                        onClick={handleApprove}
                                        disabled={isSubmitting}
                                        className="w-9 h-9 flex items-center justify-center text-emerald-600 bg-emerald-50/50 backdrop-blur-md rounded-xl border border-emerald-200/50 active:bg-emerald-100 disabled:opacity-40 active:scale-95 transition-all"
                                    >
                                        <FaIcon className="fas fa-check text-xs" />
                                    </button>
                                </>
                            ) : (
                                profile?.role &&
                                ['admin', 'planner'].includes(profile.role) &&
                                !isReturned && <div className="w-4" />
                            )}
                        </div>
                    </div>
                </div>
                {/* ─── Returned banner ─── */}
                {isReturned && (
                    <div className="mx-4 mb-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <FaIcon className="fas fa-rotate-left text-indigo-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <span className="text-indigo-800 font-black text-sm block">
                                    Draft bị trả lại — Approver đã điều chỉnh
                                </span>
                                {returnReason && (
                                    <div className="flex items-start gap-1.5 mt-1">
                                        <FaIcon className="fas fa-comment-dots text-indigo-400 text-xs mt-0.5 shrink-0" />
                                        <span className="text-indigo-700 text-xs font-medium italic">
                                            "{returnReason}"
                                        </span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleResubmit}
                                disabled={
                                    isSubmitting || Object.values(orderQuantities).every((v: any) => !v.air && !v.sea)
                                }
                                className="shrink-0 bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 backdrop-blur-sm border border-indigo-400/30"
                            >
                                {isSubmitting ? (
                                    <FaIcon className="fas fa-spinner fa-spin" />
                                ) : (
                                    <FaIcon className="fas fa-paper-plane" />
                                )}
                                Gửi lại
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-indigo-500 bg-indigo-100/60 rounded-lg px-3 py-1.5">
                            <FaIcon className="fas fa-circle-info text-indigo-400" />
                            Số lượng đặt hàng đã được cập nhật theo điều chỉnh của approver. Xem lại, sửa nếu cần rồi
                            nhấn Gửi lại.
                        </div>
                    </div>
                )}
                {/* ─── Lock banner ─── */}
                {isLocked && (
                    <div className="mx-4 mb-2 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        <FaIcon className="fas fa-lock text-emerald-600" />
                        <span className="text-emerald-700 font-black text-sm">
                            Draft đã được phê duyệt và khóa. Liên hệ approver để mở khóa chỉnh sửa.
                        </span>
                        <span className="ml-auto text-emerald-500 text-xs font-medium">
                            {approvalRequest?.draft_name}
                        </span>
                    </div>
                )}
                {/* ─── Scrollable table area (overflow-auto = both axes, scrollbar always at viewport edge) ─── */}
                {isMobile ? (
                    /* === MOBILE CARD VIEW === */
                    <div className="mobile-card-grid pb-4">
                        {paginatedData.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <FaIcon className="fas fa-box-open text-3xl mb-3 block" />
                                <p className="font-bold">Không có dữ liệu</p>
                            </div>
                        ) : (
                            paginatedData.map((item, idx) => {
                                const d = (orderQuantities[item.ItemCode] || { air: 0, sea: 0 }) as {
                                    air: number;
                                    sea: number;
                                };
                                const draftQtyTotal = d.air + d.sea;
                                const unitCost = item.computed?.unitCost || 0;
                                const mos = item.computed?.mos || 0;
                                const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                                const priority = calculatePickingPriority(item, draftQtyTotal);
                                const priorityClass =
                                    priority === 1 ? 'priority-p1' : priority === 2 ? 'priority-p2' : 'priority-p3';
                                const amount =
                                    draftQtyTotal > 0
                                        ? (settings.costBasis === 'PP'
                                              ? currencyFormatterVND
                                              : currencyFormatterEUR
                                          ).format(draftQtyTotal * unitCost)
                                        : null;
                                return (
                                    <div
                                        key={item.ItemCode}
                                        className={`mobile-item-card ${priorityClass} ${draftQtyTotal > 0 ? 'ring-1 ring-blue-200' : ''}`}
                                    >
                                        {/* Card Header */}
                                        <div
                                            className="flex items-start justify-between px-4 pt-3 pb-2 cursor-pointer active:bg-slate-50"
                                            onClick={() => onItemSelect(item)}
                                        >
                                            <div className="flex-1 min-w-0 pr-3">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-black text-slate-900 text-base tracking-tight">
                                                        {item.ItemCode}
                                                    </span>
                                                    <span
                                                        className={`badge-p${Math.min(priority, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}
                                                    >
                                                        P{priority}
                                                    </span>
                                                    {draftQtyTotal > 0 && (
                                                        <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                                                            Draft
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                                        L{item.LOISGroup}
                                                    </span>
                                                    {!isMobile && item.TrendFlag && (
                                                        <TrendBadge trend={item.TrendFlag} />
                                                    )}
                                                    {!isMobile && <DebtStatusBadge item={item} />}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div
                                                    className={`text-base font-black ${mos < 1 ? 'text-rose-600' : mos > 12 ? 'text-amber-600' : 'text-emerald-600'}`}
                                                >
                                                    {demandMonthly <= 0 ? '∞' : `${mos.toFixed(1)}M`}
                                                </div>
                                                <div className="text-[8px] font-black text-slate-400 uppercase">
                                                    MOS
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stock bar */}
                                        <div className="px-4 pb-2">
                                            <StockProgressBar
                                                current={item.computed?.available || 0}
                                                rop={item.computed?.rop || 0}
                                                max={item.computed?.isStopBiz ? 0 : item.computed?.stockMax || 1}
                                                ss={item.computed?.safetyStock}
                                                onOrder={item.TotalPO}
                                                incoming={item.computed?.incomingCurrentMonth}
                                                backorder={item.Backorder}
                                                draftAdd={draftQtyTotal}
                                                baseFc={item.BaseForecast}
                                            />
                                        </div>

                                        {isApproverMode && (
                                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">
                                                        Dự thảo Planner
                                                    </span>
                                                    <div className="flex gap-2 text-[9px] font-bold text-slate-500">
                                                        <span className="bg-rose-50 px-1 rounded text-rose-600">
                                                            Air:{' '}
                                                            {approvalRequest?.snapshot_data?.quantities?.[item.ItemCode]
                                                                ?.air || 0}
                                                        </span>
                                                        <span className="bg-blue-50 px-1 rounded text-blue-600">
                                                            Sea:{' '}
                                                            {approvalRequest?.snapshot_data?.quantities?.[item.ItemCode]
                                                                ?.sea || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="font-black text-slate-600">
                                                    {(approvalRequest?.snapshot_data?.quantities?.[item.ItemCode]
                                                        ?.air || 0) +
                                                        (approvalRequest?.snapshot_data?.quantities?.[item.ItemCode]
                                                            ?.sea || 0)}
                                                </span>
                                            </div>
                                        )}

                                        {/* QTY Inputs */}
                                        <div className="grid grid-cols-2 gap-px bg-slate-100 border-t border-slate-100">
                                            <div className="bg-rose-50/80 px-3 py-2.5">
                                                <div className="text-[9px] font-black text-rose-500 uppercase mb-1 flex items-center gap-1">
                                                    <FaIcon className="fas fa-plane-up text-[8px]" />
                                                    Air
                                                </div>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={d.air || ''}
                                                    onChange={e =>
                                                        !isLocked &&
                                                        handleQtyChange(
                                                            item.ItemCode,
                                                            'air',
                                                            parseInt(e.target.value) || 0,
                                                        )
                                                    }
                                                    readOnly={isLocked}
                                                    className="w-full bg-transparent text-base font-black text-rose-700 outline-none min-h-[36px]"
                                                    placeholder="0"
                                                />
                                                {(item.computed?.urgentQty ?? item.computed?.suggestedBO ?? 0) > 0 &&
                                                    d.air === 0 && (
                                                        <button
                                                            onClick={() =>
                                                                handleQtyChange(
                                                                    item.ItemCode,
                                                                    'air',
                                                                    (item.computed!.urgentQty ??
                                                                        item.computed!.suggestedBO)!,
                                                                )
                                                            }
                                                            title={item.computed?.urgentReason}
                                                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border mt-0.5 ${
                                                                item.computed?.classification === 'critical' ||
                                                                item.computed?.stockoutFlag
                                                                    ? 'text-red-700 bg-red-100 border-red-300 ring-1 ring-red-400'
                                                                    : item.computed?.classification === 'strained'
                                                                      ? 'text-orange-700 bg-orange-100 border-orange-300'
                                                                      : 'text-rose-600 bg-rose-100 border-rose-200'
                                                            }`}
                                                        >
                                                            {item.computed?.classification === 'critical'
                                                                ? '⚠CRIT'
                                                                : item.computed?.classification === 'strained'
                                                                  ? 'STRAIN'
                                                                  : 'AIR'}
                                                            {item.computed?.capLimited ? '↑' : ''}:{' '}
                                                            {item.computed!.urgentQty ?? item.computed!.suggestedBO}
                                                        </button>
                                                    )}
                                                {item.computed?.stockoutFlag &&
                                                    (item.computed?.urgentQty ?? 0) === 0 && (
                                                        <span
                                                            title={item.computed?.urgentReason}
                                                            className="text-[9px] font-black text-red-700 bg-red-100 border border-red-300 px-1.5 py-0.5 rounded-full mt-0.5 inline-block"
                                                        >
                                                            ⚠ STOCKOUT {item.computed?.stockoutQty}
                                                        </span>
                                                    )}
                                            </div>
                                            <div className="bg-blue-50/80 px-3 py-2.5">
                                                <div className="text-[9px] font-black text-blue-500 uppercase mb-1 flex items-center gap-1">
                                                    <FaIcon className="fas fa-ship text-[8px]" />
                                                    Sea
                                                </div>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={d.sea || ''}
                                                    onChange={e =>
                                                        !isLocked &&
                                                        handleQtyChange(
                                                            item.ItemCode,
                                                            'sea',
                                                            parseInt(e.target.value) || 0,
                                                        )
                                                    }
                                                    readOnly={isLocked}
                                                    className="w-full bg-transparent text-base font-black text-blue-700 outline-none min-h-[36px]"
                                                    placeholder="0"
                                                />
                                                {(item.computed?.reserveQty ?? item.computed?.gapOrExcess ?? 0) > 0 &&
                                                    d.sea === 0 && (
                                                        <button
                                                            onClick={() =>
                                                                handleQtyChange(
                                                                    item.ItemCode,
                                                                    'sea',
                                                                    (item.computed!.reserveQty ??
                                                                        item.computed!.gapOrExcess)!,
                                                                )
                                                            }
                                                            title={item.computed?.reserveReason}
                                                            className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200 mt-0.5"
                                                        >
                                                            MAX:{' '}
                                                            {item.computed!.reserveQty ?? item.computed!.gapOrExcess}
                                                        </button>
                                                    )}
                                            </div>
                                        </div>

                                        {/* Amount Footer */}
                                        {amount && (
                                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-400 uppercase">
                                                    Thành tiền
                                                </span>
                                                <span className="font-black text-slate-800 text-sm">{amount}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div ref={tableScrollRef} className="overflow-auto flex-1 relative custom-scrollbar bg-slate-50/50">
                        <table className="w-full text-sm text-left border-separate border-spacing-0 lg:min-w-[1600px] md:min-w-[1200px] min-w-[1000px]">
                            <thead className="bg-white/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30 shadow-sm">
                                <tr className="text-[10px] uppercase font-black tracking-widest">
                                    <th className="px-4 py-4 w-12 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-white shadow-sm">
                                        <Typography variant="label">#</Typography>
                                    </th>
                                    <th className="px-4 py-4 min-w-[180px] sticky left-12 z-40 bg-white border-b border-slate-200 sticky-column-shadow">
                                        <Typography variant="label">{t('ord_th_sku')}</Typography>
                                    </th>
                                    <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[110px] hidden xl:table-cell">
                                        <Typography variant="label">DEMAND</Typography>
                                    </th>
                                    <th className="px-4 py-4 min-w-[200px] text-right border-b border-slate-200">
                                        <Typography variant="label">Stock Health | MOS</Typography>
                                    </th>
                                    <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[110px] hidden lg:table-cell">
                                        <Typography variant="label">PO PIPELINE</Typography>
                                    </th>
                                    <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[120px] hidden lg:table-cell">
                                        <Typography variant="label">{t('ord_th_momentum')}</Typography>
                                    </th>
                                    <th className="px-4 py-4 text-center border-b border-slate-200 hidden md:table-cell">
                                        <Typography variant="label">{t('ord_th_dealer_cst')}</Typography>
                                    </th>
                                    {isApproverMode && (
                                        <th className="px-4 py-4 text-center border-l border-slate-200 bg-slate-50 border-b border-slate-200 min-w-[100px]">
                                            <Typography variant="label" className="text-slate-500">
                                                Dự thảo
                                            </Typography>
                                        </th>
                                    )}
                                    <th className="px-4 py-4 text-center border-x border-slate-200 bg-rose-50/20 border-b border-slate-200">
                                        <Typography variant="label" className="text-rose-600">
                                            {isApproverMode ? 'Duyệt Air' : 'Air'}
                                        </Typography>
                                    </th>
                                    <th className="px-4 py-4 text-center border-r border-slate-200 bg-blue-50/20 border-b border-slate-200">
                                        <Typography variant="label" className="text-blue-600">
                                            {isApproverMode ? 'Duyệt Sea' : 'Sea'}
                                        </Typography>
                                    </th>
                                    <th className="px-4 py-4 min-w-[150px] border-b border-slate-200 hidden xl:table-cell">
                                        {t('ord_th_note')}
                                    </th>
                                    <th className="px-4 py-4 text-right sticky right-0 z-40 bg-white border-b border-slate-200 border-l border-slate-200 shadow-inner">
                                        {t('ord_th_amount')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {paginatedData.map((item, idx) => {
                                    const d = (orderQuantities[item.ItemCode] || { air: 0, sea: 0 }) as {
                                        air: number;
                                        sea: number;
                                    };
                                    const draftQtyTotal = d.air + d.sea;
                                    const unitCost = item.computed?.unitCost || 0;
                                    const m1Actual =
                                        item.SalesHistory && item.SalesHistory.length > 0
                                            ? item.SalesHistory[item.SalesHistory.length - 1]
                                            : 0;
                                    const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                                    // O9 Fix: dùng computed.cst từ engine thay vì tính lại
                                    const currentCst = item.computed?.cst ?? 99.9;
                                    const projectedCst =
                                        demandMonthly > 0
                                            ? (item.NetDemand + item.DealerInventory + draftQtyTotal) / demandMonthly
                                            : 99.9;
                                    const displayCst = draftQtyTotal > 0 ? projectedCst : currentCst;
                                    const isCstImproved = draftQtyTotal > 0 && projectedCst > currentCst + 0.05;
                                    const incomingThisMonth = item.computed?.incomingCurrentMonth || 0;
                                    const priorityBorderClass =
                                        item.computed?.orderPriority === 'urgent_only'
                                            ? 'border-l-4 border-rose-500'
                                            : item.computed?.orderPriority === 'both'
                                              ? 'border-l-4 border-amber-500'
                                              : item.computed?.orderPriority === 'reserve_only'
                                                ? 'border-l-4 border-blue-400'
                                                : 'border-l-4 border-transparent';
                                    return (
                                        <tr
                                            key={item.ItemCode}
                                            className={`hover:bg-slate-50 transition-colors group ${draftQtyTotal > 0 ? 'bg-blue-50/20' : ''} ${priorityBorderClass}`}
                                        >
                                            <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs font-black border-b border-slate-50 sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                                                {(currentPage - 1) * itemsPerPage + idx + 1}
                                            </td>
                                            <td
                                                className="px-4 py-3 sticky left-12 z-10 bg-white group-hover:bg-slate-50 transition-colors sticky-column-shadow border-b border-slate-50"
                                                onClick={() => onItemSelect(item)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="text-lg font-black text-slate-900 flex items-center gap-2 group-hover:text-blue-700 transition-colors tracking-tight">
                                                        {item.ItemCode}
                                                    </div>
                                                    {(() => {
                                                        const p = calculatePickingPriority(item, draftQtyTotal);
                                                        return (
                                                            <span
                                                                className={`badge-p${Math.min(p, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}
                                                            >
                                                                P{p}
                                                            </span>
                                                        );
                                                    })()}
                                                    <SupersessionIndicator
                                                        partNumber={item.ItemCode}
                                                        graph={graph}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            onItemSelect(item);
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-xs text-slate-500 font-bold truncate max-w-[200px]">
                                                    {item.ItemName}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <DebtStatusBadge item={item} />
                                                    {item.computed?.warnings?.find(w => w.code === 'STK_GAP') && (
                                                        <span
                                                            className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-rose-600 text-white border border-rose-700 shadow-sm animate-pulse flex items-center gap-1 cursor-help"
                                                            title={
                                                                item.computed.warnings.find(w => w.code === 'STK_GAP')
                                                                    ?.message
                                                            }
                                                        >
                                                            <FaIcon className="fas fa-clock-rotate-left text-[10px]" />
                                                            Gap:{' '}
                                                            {
                                                                item.computed.warnings
                                                                    .find(w => w.code === 'STK_GAP')
                                                                    ?.message.split(': ')[1]
                                                                    .split(' ngày')[0]
                                                            }
                                                            d
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-blue-50 text-blue-700 border border-blue-100">
                                                        LOIS {item.LOISGroup}
                                                    </span>
                                                    {item.SourceId && (
                                                        <Typography
                                                            variant="label"
                                                            className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold"
                                                        >
                                                            {item.SourceId}
                                                        </Typography>
                                                    )}
                                                    {item.TypeCar && (
                                                        <span className="text-2xs font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                                            {item.TypeCar?.split(' | ')[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {/* DEMAND SIGNAL — cột tách riêng, đứng trước Stock Health */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50 hidden xl:table-cell">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div
                                                        className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80 shadow-sm"
                                                        title="Bán M-1 thực tế / Dự báo FC"
                                                    >
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                                                M-1
                                                            </span>
                                                            <span className="font-black text-slate-800 text-sm leading-none">
                                                                {(m1Actual || 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className="h-8 w-px bg-slate-200"></div>
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                                                                FC
                                                            </span>
                                                            <span className="font-black text-emerald-700 text-sm leading-none">
                                                                {item.BaseForecast
                                                                    ? item.BaseForecast >= 10
                                                                        ? Math.round(item.BaseForecast).toLocaleString()
                                                                        : item.BaseForecast.toFixed(1)
                                                                    : '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <TrendBadge trend={item.TrendFlag} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right border-b border-slate-50">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center justify-end gap-2 mb-1.5">
                                                        <ConsolidatedStockCell
                                                            item={item}
                                                            allItems={enrichedList}
                                                            graph={graph}
                                                        />
                                                        {(() => {
                                                            const effStock =
                                                                (item.computed?.available || 0) +
                                                                (incomingThisMonth || 0) -
                                                                (item.Backorder || 0);
                                                            const effMos =
                                                                demandMonthly <= 0 ? 99 : effStock / demandMonthly;
                                                            const colorClass =
                                                                effMos < 1.0
                                                                    ? 'bg-rose-100 text-rose-700 border-rose-200'
                                                                    : effMos <= 2.0
                                                                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                                      : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                            return (
                                                                <div
                                                                    className={`px-2 py-0.5 rounded-md border font-black text-xs text-center shadow-sm flex items-center gap-1 transition-all hover:scale-105 active:scale-95 cursor-help ${colorClass}`}
                                                                    title={`MOS tính cả hàng về & BO: ${effMos === 99 ? '∞' : effMos.toFixed(1)}M`}
                                                                >
                                                                    <FaIcon
                                                                        className={`fas ${effMos < 1.0 ? 'fa-triangle-exclamation' : 'fa-hourglass-half'} text-[10px] opacity-70`}
                                                                    />
                                                                    {demandMonthly <= 0
                                                                        ? '∞'
                                                                        : `${item.computed!.mos?.toFixed(1)}M`}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <StockProgressBar
                                                        current={item.computed?.available || 0}
                                                        rop={item.computed?.rop || 0}
                                                        max={
                                                            item.computed?.isStopBiz ? 0 : item.computed?.stockMax || 1
                                                        }
                                                        ss={item.computed?.safetyStock}
                                                        onOrder={item.TotalPO}
                                                        incoming={incomingThisMonth}
                                                        incomingNext={item.computed?.incomingNextMonth}
                                                        backorder={item.Backorder}
                                                        breakdown={item.BackorderBreakdown}
                                                        draftAdd={draftQtyTotal}
                                                        baseFc={item.BaseForecast}
                                                    />
                                                </div>
                                            </td>
                                            {/* SUPPLY PIPELINE — aligned with Dashboard style */}
                                            <td className="px-4 py-3 text-center border-b border-slate-50 min-w-[130px]">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    {incomingThisMonth > 0 ? (
                                                        <div className="flex flex-col items-center leading-none">
                                                            <Typography
                                                                variant="body"
                                                                className="font-black text-blue-700"
                                                            >
                                                                +{incomingThisMonth.toLocaleString()}
                                                            </Typography>
                                                            <Typography
                                                                variant="label"
                                                                className="text-blue-400 !font-bold normal-case text-[9px]"
                                                            >
                                                                Về tháng này
                                                            </Typography>
                                                        </div>
                                                    ) : (
                                                        <Typography variant="body" className="font-bold text-slate-300">
                                                            —
                                                        </Typography>
                                                    )}

                                                    {(item.TotalPO || 0) > 0 && (
                                                        <div
                                                            className="inline-flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shadow-sm"
                                                            title="Tổng PO Pipeline"
                                                        >
                                                            <FaIcon className="fas fa-ship text-indigo-400 text-[9px]" />
                                                            <span className="text-[10px] font-black text-indigo-600">
                                                                PO: {(item.TotalPO || 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center border-b border-slate-50 hidden lg:table-cell">
                                                <SalesMomentum
                                                    values={[
                                                        item.AvgQty24M,
                                                        item.AvgQty12M,
                                                        item.AvgQty6M,
                                                        item.AvgQty3M,
                                                    ]}
                                                    history={item.SalesHistory}
                                                    forecast={item.BaseForecast}
                                                />
                                            </td>

                                            <td className="px-4 py-3 text-center border-b border-slate-50 hidden md:table-cell">
                                                <div className="mt-1 flex flex-col items-center">
                                                    <DealerStockPopup items={item.DealerBreakdown || []}>
                                                        <span
                                                            className={`text-sm font-black tabular-nums flex items-center gap-1 cursor-help hover:scale-105 transition-transform ${(item.DealerBreakdown?.length || 0) > 0 ? 'text-blue-700' : 'text-slate-700'}`}
                                                        >
                                                            {(item.DealerBreakdown?.length || 0) > 0 && (
                                                                <FaIcon className="fas fa-warehouse text-[10px] opacity-60" />
                                                            )}
                                                            <span
                                                                className={
                                                                    (item.DealerBreakdown?.length || 0) > 0
                                                                        ? 'border-b border-dashed border-blue-300'
                                                                        : ''
                                                                }
                                                            >
                                                                {(item.DealerInventory || 0).toLocaleString()}
                                                            </span>
                                                        </span>
                                                    </DealerStockPopup>
                                                    <div
                                                        className={`text-sm font-black px-2 py-0.5 rounded-full mt-1.5 transition-all duration-500 ${isCstImproved ? 'bg-blue-600 text-white border border-blue-700 scale-110' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
                                                    >
                                                        {demandMonthly <= 0
                                                            ? 'CST: ∞'
                                                            : `CST: ${(displayCst || 0).toFixed(1)}`}
                                                    </div>
                                                </div>
                                            </td>
                                            {approvalRequest && (
                                                <td className="px-4 py-3 border-l border-slate-100 bg-slate-50/30 text-center border-b border-slate-50 min-w-[100px]">
                                                    <div className="flex flex-col items-center">
                                                        <div className="text-[10px] font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                                                            {(() => {
                                                                const originalBase =
                                                                    approvalRequest?.snapshot_data
                                                                        ?.original_quantities ||
                                                                    approvalRequest?.snapshot_data?.quantities;
                                                                return (
                                                                    (originalBase?.[item.ItemCode]?.air || 0) +
                                                                    (originalBase?.[item.ItemCode]?.sea || 0)
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="flex gap-1 text-[9px] text-slate-300 font-bold mt-1">
                                                            <span>
                                                                A:
                                                                {(() => {
                                                                    const originalBase =
                                                                        approvalRequest?.snapshot_data
                                                                            ?.original_quantities ||
                                                                        approvalRequest?.snapshot_data?.quantities;
                                                                    return originalBase?.[item.ItemCode]?.air || 0;
                                                                })()}
                                                            </span>
                                                            <span>
                                                                S:
                                                                {(() => {
                                                                    const originalBase =
                                                                        approvalRequest?.snapshot_data
                                                                            ?.original_quantities ||
                                                                        approvalRequest?.snapshot_data?.quantities;
                                                                    return originalBase?.[item.ItemCode]?.sea || 0;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            <td
                                                className={`px-4 py-3 border-x border-slate-100 text-center border-b border-slate-50 transition-all ${d.air !== ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.air || 0) ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-rose-50/10'}`}
                                            >
                                                <div className="relative group">
                                                    <input
                                                        type="number"
                                                        value={d.air || ''}
                                                        onChange={e =>
                                                            !isLocked &&
                                                            handleQtyChange(
                                                                item.ItemCode,
                                                                'air',
                                                                parseInt(e.target.value) || 0,
                                                            )
                                                        }
                                                        readOnly={isLocked}
                                                        className={`w-full bg-transparent focus:ring-0 text-center text-base font-black p-0 h-full ${d.air !== ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.air || 0) ? 'text-amber-700' : 'text-rose-700'}`}
                                                        placeholder="0"
                                                    />
                                                    {d.air !==
                                                        ((approvalRequest?.snapshot_data?.original_quantities ||
                                                            approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]
                                                            ?.air || 0) && (
                                                        <div
                                                            className={`absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-black shadow-sm z-10 whitespace-nowrap ${d.air > ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.air || 0) ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
                                                        >
                                                            {d.air >
                                                            ((approvalRequest?.snapshot_data?.original_quantities ||
                                                                approvalRequest?.snapshot_data?.quantities)?.[
                                                                item.ItemCode
                                                            ]?.air || 0)
                                                                ? '+'
                                                                : ''}
                                                            {d.air -
                                                                ((approvalRequest?.snapshot_data?.original_quantities ||
                                                                    approvalRequest?.snapshot_data?.quantities)?.[
                                                                    item.ItemCode
                                                                ]?.air || 0)}
                                                        </div>
                                                    )}
                                                </div>
                                                {(item.computed?.urgentQty ?? item.computed?.suggestedBO ?? 0) > 0 &&
                                                    d.air === 0 && (
                                                        <button
                                                            onClick={() =>
                                                                handleQtyChange(
                                                                    item.ItemCode,
                                                                    'air',
                                                                    (item.computed!.urgentQty ??
                                                                        item.computed!.suggestedBO)!,
                                                                )
                                                            }
                                                            title={item.computed?.urgentReason}
                                                            className={`block mx-auto mt-1.5 text-xs font-black px-2 py-0.5 rounded-full border ${
                                                                item.computed?.classification === 'critical' ||
                                                                item.computed?.stockoutFlag
                                                                    ? 'text-red-700 hover:text-red-900 bg-red-50 border-red-300 ring-1 ring-red-400'
                                                                    : item.computed?.classification === 'strained'
                                                                      ? 'text-orange-700 hover:text-orange-900 bg-orange-50 border-orange-300'
                                                                      : 'text-rose-600 hover:text-rose-800 bg-rose-50 border-rose-100'
                                                            }`}
                                                        >
                                                            {item.computed?.classification === 'critical'
                                                                ? '⚠CRIT'
                                                                : item.computed?.classification === 'strained'
                                                                  ? 'STRAIN'
                                                                  : 'AIR'}
                                                            {item.computed?.capLimited ? '↑' : ''}:{' '}
                                                            {item.computed!.urgentQty ?? item.computed!.suggestedBO}
                                                        </button>
                                                    )}
                                                {item.computed?.stockoutFlag &&
                                                    (item.computed?.urgentQty ?? 0) === 0 && (
                                                        <span
                                                            title={item.computed?.urgentReason}
                                                            className="block mx-auto mt-1.5 text-xs font-black text-red-700 bg-red-50 border border-red-300 px-2 py-0.5 rounded-full inline-block"
                                                        >
                                                            ⚠ STOCKOUT {item.computed?.stockoutQty}
                                                        </span>
                                                    )}
                                            </td>
                                            <td
                                                className={`px-4 py-3 border-r border-slate-100 text-center border-b border-slate-50 transition-all ${d.sea !== ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.sea || 0) ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-blue-50/10'}`}
                                            >
                                                <div className="relative group">
                                                    <input
                                                        type="number"
                                                        value={d.sea || ''}
                                                        onChange={e =>
                                                            !isLocked &&
                                                            handleQtyChange(
                                                                item.ItemCode,
                                                                'sea',
                                                                parseInt(e.target.value) || 0,
                                                            )
                                                        }
                                                        readOnly={isLocked}
                                                        className={`w-full bg-transparent focus:ring-0 text-center text-base font-black p-0 h-full ${d.sea !== ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.sea || 0) ? 'text-amber-700' : 'text-blue-700'}`}
                                                        placeholder="0"
                                                    />
                                                    {d.sea !==
                                                        ((approvalRequest?.snapshot_data?.original_quantities ||
                                                            approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]
                                                            ?.sea || 0) && (
                                                        <div
                                                            className={`absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-black shadow-sm z-10 whitespace-nowrap ${d.sea > ((approvalRequest?.snapshot_data?.original_quantities || approvalRequest?.snapshot_data?.quantities)?.[item.ItemCode]?.sea || 0) ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
                                                        >
                                                            {d.sea >
                                                            ((approvalRequest?.snapshot_data?.original_quantities ||
                                                                approvalRequest?.snapshot_data?.quantities)?.[
                                                                item.ItemCode
                                                            ]?.sea || 0)
                                                                ? '+'
                                                                : ''}
                                                            {d.sea -
                                                                ((approvalRequest?.snapshot_data?.original_quantities ||
                                                                    approvalRequest?.snapshot_data?.quantities)?.[
                                                                    item.ItemCode
                                                                ]?.sea || 0)}
                                                        </div>
                                                    )}
                                                </div>
                                                {(item.computed?.reserveQty ?? item.computed?.gapOrExcess ?? 0) > 0 &&
                                                    d.sea === 0 && (
                                                        <button
                                                            onClick={() =>
                                                                handleQtyChange(
                                                                    item.ItemCode,
                                                                    'sea',
                                                                    (item.computed!.reserveQty ??
                                                                        item.computed!.gapOrExcess)!,
                                                                )
                                                            }
                                                            title={item.computed?.reserveReason}
                                                            className={`block mx-auto mt-1.5 text-xs font-black px-3 py-1 rounded-full border transition-all shadow-sm ${
                                                                item.computed?.warnings?.some(
                                                                    w => w.code === 'TREND_DECLINE',
                                                                )
                                                                    ? 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-100'
                                                                    : 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100'
                                                            }`}
                                                        >
                                                            <FaIcon
                                                                className={`fas ${item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE') ? 'fa-triangle-exclamation' : 'fa-lightbulb'} mr-1.5`}
                                                            />
                                                            <span className="opacity-80 uppercase tracking-tight mr-1">
                                                                {item.computed?.warnings?.some(
                                                                    w => w.code === 'TREND_DECLINE',
                                                                )
                                                                    ? 'Thận trọng: '
                                                                    : 'MAX: '}
                                                            </span>
                                                            {item.computed!.reserveQty ?? item.computed!.gapOrExcess}
                                                        </button>
                                                    )}
                                                {(d.sea > 0 ||
                                                    (item.computed?.reserveQty ?? item.computed?.gapOrExcess ?? 0) >
                                                        0) &&
                                                    item.computed?.transfer &&
                                                    (item.computed.transfer.suggestedOrderNB > 0 ||
                                                        item.computed.transfer.suggestedOrderBB > 0) && (
                                                        <div className="mt-1 flex items-center justify-center gap-1.5 no-print scale-110">
                                                            <div
                                                                className="flex items-center gap-1 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50"
                                                                title="Miền Nam (NB)"
                                                            >
                                                                <span className="text-[9px] font-black text-indigo-400 uppercase leading-none">
                                                                    NB
                                                                </span>
                                                                <span className="text-[11px] font-black text-indigo-700 leading-none">
                                                                    {item.computed.transfer.suggestedOrderNB.toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div
                                                                className="flex items-center gap-1 bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100/50"
                                                                title="Miền Bắc (BB)"
                                                            >
                                                                <span className="text-[9px] font-black text-blue-400 uppercase leading-none">
                                                                    BB
                                                                </span>
                                                                <span className="text-[11px] font-black text-blue-700 leading-none">
                                                                    {item.computed.transfer.suggestedOrderBB.toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                {item.computed?.transfer &&
                                                    item.computed.transfer.transferNBtoBB > 0 && (
                                                        <div className="mt-1 flex justify-center">
                                                            <span
                                                                className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200"
                                                                title="Chuyển từ NB sang BB"
                                                            >
                                                                NB <FaIcon className="fas fa-arrow-right mx-0.5" /> BB:{' '}
                                                                {item.computed.transfer.transferNBtoBB}
                                                            </span>
                                                        </div>
                                                    )}
                                                {item.computed?.transfer &&
                                                    item.computed.transfer.transferBBtoNB > 0 && (
                                                        <div className="mt-1 flex justify-center">
                                                            <span
                                                                className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200"
                                                                title="Chuyển từ BB sang NB"
                                                            >
                                                                BB <FaIcon className="fas fa-arrow-right mx-0.5" /> NB:{' '}
                                                                {item.computed.transfer.transferBBtoNB}
                                                            </span>
                                                        </div>
                                                    )}
                                            </td>
                                            <td className="px-4 py-3 border-b border-slate-50 hidden xl:table-cell">
                                                <textarea
                                                    value={orderNotes[item.ItemCode] || ''}
                                                    onChange={e =>
                                                        setOrderNotes(p => ({ ...p, [item.ItemCode]: e.target.value }))
                                                    }
                                                    className="w-full text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:border-blue-300 resize-none h-10"
                                                    placeholder="..."
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-slate-900 text-base sticky right-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-b border-slate-50 border-l border-slate-200">
                                                {draftQtyTotal > 0 ? (
                                                    (settings.costBasis === 'PP'
                                                        ? currencyFormatterVND
                                                        : currencyFormatterEUR
                                                    ).format(draftQtyTotal * unitCost)
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
                )}{' '}
                {/* end isMobile */}
                <div className="p-4 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-600 bg-white">
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                        <select
                            value={itemsPerPage}
                            onChange={e => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 font-bold text-xs"
                        >
                            <option value={20}>20 {t('common_rows')}</option>
                            <option value={50}>50 {t('common_rows')}</option>
                            <option value={100}>100 {t('common_rows')}</option>
                        </select>
                        <span className="text-slate-400 whitespace-nowrap">
                            {t('common_total')}: <span className="text-slate-700">{filteredData.length}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2 sm:pb-0 max-w-full">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="pagination-pill text-slate-600 shrink-0"
                        >
                            <FaIcon className="fas fa-chevron-left text-[10px]" />
                        </button>
                        {[...Array(totalPages)].map((_, i) => {
                            const page = i + 1;
                            if (
                                totalPages > 5 &&
                                Math.abs(currentPage - page) > 1 &&
                                page !== 1 &&
                                page !== totalPages
                            ) {
                                if (page === 2 || page === totalPages - 1)
                                    return (
                                        <span key={i} className="px-1 text-slate-300">
                                            …
                                        </span>
                                    );
                                return null;
                            }
                            return (
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(page)}
                                    className={`pagination-pill shrink-0 ${currentPage === page ? 'active' : 'text-slate-600'}`}
                                >
                                    {page}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="pagination-pill text-slate-600 shrink-0"
                        >
                            <FaIcon className="fas fa-chevron-right text-[10px]" />
                        </button>
                    </div>
                </div>
            </div>

            <WarningConfirmation
                confirmationQueue={confirmationQueue}
                enrichedMap={enrichedMap}
                onDismiss={() => setConfirmationQueue(prev => prev.slice(1))}
                onConfirm={confirmWarning}
            />

            <CloudDraftModal
                isOpen={isCloudModalOpen}
                onClose={() => setIsCloudModalOpen(false)}
                currentDraft={{ quantities: orderQuantities, notes: orderNotes }}
                onLoadDraft={(draft, draftName) => {
                    setOrderQuantities(prev => ({ ...prev, ...draft.quantities }));
                    setOrderNotes(prev => ({ ...prev, ...draft.notes }));
                    if (draftName) setCurrentDraftName(draftName);
                    setViewFilter('draft');
                    // Tự động load approval request tương ứng với cloud draft
                    if (draftName) {
                        fetchRequestByDraftName(draftName).then(req => {
                            if (req) {
                                setApprovalRequest(req);
                                // Nếu đơn bị trả lại, override quantities bằng điều chỉnh của approver
                                if (req.status === 'returned' && req.snapshot_data?.quantities) {
                                    setOrderQuantities(req.snapshot_data.quantities);
                                }
                            } else {
                                setApprovalRequest(null);
                            }
                        });
                    }
                }}
                onLoadReturnedRequest={req => {
                    // Load từ snapshot: không cần cloud draft
                    const snap = req.snapshot_data;
                    setOrderQuantities(snap?.quantities || {});
                    setOrderNotes(snap?.notes || {});
                    setCurrentDraftName(req.draft_name);
                    setApprovalRequest(req);
                    setViewFilter('draft');
                }}
                onWaitAndSubmit={draftName => {
                    // Mở luôn modal submit với tên draft tương ứng sau một chút delay
                    setTimeout(() => {
                        handleOpenSubmitModal(draftName);
                    }, 200);
                }}
            />

            <SubmitApprovalModal
                isOpen={isSubmitModalOpen}
                onClose={() => setIsSubmitModalOpen(false)}
                draftName={submitDraftName}
                onDraftNameChange={setSubmitDraftName}
                workflows={workflows}
                selectedWorkflowId={selectedWorkflowId}
                onWorkflowChange={setSelectedWorkflowId}
                affinitySuggestions={affinitySuggestions}
                affinityItemNames={affinityItemNames}
                onAddAffinity={sku => {
                    const all = [...affinitySuggestions.mandatoryMissing, ...affinitySuggestions.recommended];
                    const s = all.find(x => x.relatedPart === sku);
                    if (s) addAffinityToOrder(s);
                }}
                isSubmitting={isSubmitting}
                submitProgress={submitProgress}
                onSubmit={handleSubmitApproval}
            />
        </div>
    );
};
