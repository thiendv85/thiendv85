
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, DashboardSettings, InventoryFilters, DEFAULT_FILTERS, OrderingDraft, getDebtStatus, COST_RANGES, FOB_COST_RANGES } from '../types/inventory';
import { FilterPanel } from '../components/FilterPanel';
import { parseInventorySearch, SearchResult, matchSearch } from '../utils/searchLogic';
import { StockProgressBar } from '../components/StockProgressBar';
import { SalesMomentum } from '../components/SalesMomentum';
import { exportOrderDraftToCSV, parseOrderingDraftCSV, calculatePickingPriority, CsvExportOptions } from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';
import { TrendBadge } from '../components/TrendBadge';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { SupersessionWarning } from '../components/SupersessionWarning';
import { SupersessionIndicator } from '../components/SupersessionIndicator';
import { DebtStatusBadge } from '../components/DebtStatusBadge';
import { ConsolidatedStockCell } from '../components/ConsolidatedStockCell';
import { DealerStockPopup } from '../components/DealerStockPopup';
import { AppSettings } from './Settings';
import { computeInventory, computeInventoryBatch, makeComputeParams, resolveItemProfile, MOS_LOW_STOCK_THRESHOLD } from '../utils/inventoryEngine';
import { Typography } from '../components/Typography';
import { CloudDraftModal } from '../components/CloudDraftModal';
import { useAuth } from '../utils/authContext';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { listWorkflows, submitApprovalRequest, fetchRequestByDraftName, resubmitApprovalRequest, fetchRequestActions, normalizeBrand } from '../utils/supabase';
import { ApprovalRequest, ApprovalWorkflow, ApprovalAction } from '../types/inventory';
import { useDevice } from '../hooks/useDevice';

// --- MODULE-LEVEL CONSTANTS ---
const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

// --- GLOBAL UTILITIES ---
const currencyFormatterVND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const currencyFormatterEUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });



const DraftAnalysisCharts = ({ itemMap, orderQuantities, costBasis }: { itemMap: Map<string, InventoryItem>, orderQuantities: Record<string, { air: number, sea: number }>, costBasis: 'PP' | 'FOB' }) => {
    const { t } = useLanguage();
    const formatter = costBasis === 'PP' ? currencyFormatterVND : currencyFormatterEUR;
    const stats = useMemo(() => {
        let airVal = 0, seaVal = 0, airQty = 0, seaQty = 0;
        (Object.entries(orderQuantities) as [string, { air: number, sea: number }][]).forEach(([code, qty]) => {
            const item = itemMap.get(code);
            if (!item) return;
            const unitCost = costBasis === 'PP' ? item.UnitCost_PP : item.UnitCost_FOB;
            airVal += qty.air * unitCost;
            seaVal += qty.sea * unitCost;
            airQty += qty.air;
            seaQty += qty.sea;
        });
        return { airVal, seaVal, airQty, seaQty, totalVal: airVal + seaVal };
    }, [itemMap, orderQuantities, costBasis]);
    if (stats.totalVal === 0) return null;
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-atp-action/30 shadow-sm transition-all group/air">
                <div>
                    <Typography variant="label" className="text-slate-500 mb-4 flex items-center gap-2 transition-transform group-hover/air:translate-x-1"><i className="fas fa-plane-up text-atp-action"></i> {t('ord_air_title')}</Typography>
                    <Typography variant="h1" className="text-atp-action tabular-nums">{formatter.format(stats.airVal)}</Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold tabular-nums">{stats.airQty.toLocaleString()} units</Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div className="h-full bg-atp-action transition-all duration-1000 shadow-[0_0_8px_rgba(220,38,38,0.3)]" style={{ width: `${(stats.airVal / stats.totalVal) * 100}%` }}></div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-atp-secondary/30 shadow-sm transition-all group/sea">
                <div>
                    <Typography variant="label" className="text-slate-500 mb-4 flex items-center gap-2 transition-transform group-hover/sea:translate-x-1"><i className="fas fa-ship text-atp-secondary"></i> {t('ord_sea_title')}</Typography>
                    <Typography variant="h1" className="text-atp-secondary tabular-nums">{formatter.format(stats.seaVal)}</Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold tabular-nums">{stats.seaQty.toLocaleString()} units</Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div className="h-full bg-atp-secondary transition-all duration-1000 shadow-[0_0_8px_rgba(51,65,85,0.3)]" style={{ width: `${(stats.seaVal / stats.totalVal) * 100}%` }}></div>
                </div>
            </div>
            <div className="bg-atp-primary p-6 rounded-2xl flex flex-col justify-center text-white relative overflow-hidden shadow-glass group/total">
                <div className="absolute -right-4 -bottom-4 opacity-10 text-8xl transform -rotate-12 transition-transform group-hover/total:scale-125 duration-700"><i className="fas fa-cart-flatbed-boxes"></i></div>
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,#ffffff10,transparent)] pointer-events-none"></div>
                <Typography variant="label" className="text-slate-300 mb-2">{t('ord_total_val')}</Typography>
                <Typography variant="h1" className="text-white text-4xl tabular-nums">{formatter.format(stats.totalVal)}</Typography>
                <Typography variant="label" className="text-slate-400 mt-2 block !text-[10px] uppercase tracking-widest">{t('ord_total_hint')}</Typography>
            </div>
        </div>
    );
};

interface OrderingProps {
    data: InventoryItem[];
    onItemSelect: (item: InventoryItem) => void;
    initialParams?: { lt: number; sp: number; ssp: number };
    initialState?: any;
    onSaveState?: (state: any) => void;
    sharedDraft?: OrderingDraft;
    onUpdateDraft?: (draft: OrderingDraft) => void;
    graph?: SupersessionGraph;
    appSettings?: AppSettings;
    onUpdateSettings?: (s: AppSettings) => void;
}

export const Ordering = ({ data, onItemSelect, initialParams, initialState, onSaveState, sharedDraft, onUpdateDraft, graph, appSettings }: OrderingProps) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();
    const [settings, setSettings] = useState<DashboardSettings>(initialState?.settings || {
        snapshotDate: new Date().toISOString().split('T')[0],
        warehouseScope: 'All',
        costBasis: 'FOB',
        demandSource: '3M',
        params: initialParams || { lt: 90, sp: 30, ssp: 15 },
        sourceProfiles: appSettings?.sourceProfiles,
        loisProfiles: appSettings?.loisProfiles || [],
        seasonalityTuning: appSettings?.seasonalityTuning || { useSPD: true, tetWeight: 1.2, weatherWeight: 1.0 }
    });

    useEffect(() => {
        if (appSettings?.sourceProfiles || appSettings?.seasonalityTuning || appSettings?.loisProfiles) {
            setSettings(prev => ({ 
                ...prev, 
                sourceProfiles: appSettings?.sourceProfiles || prev.sourceProfiles,
                loisProfiles: appSettings?.loisProfiles || prev.loisProfiles,
                seasonalityTuning: appSettings?.seasonalityTuning || prev.seasonalityTuning
            }));
        }
    }, [appSettings?.sourceProfiles, appSettings?.seasonalityTuning, appSettings?.loisProfiles]);
    const [filters, setFilters] = useState<InventoryFilters>(initialState?.filters || DEFAULT_FILTERS);
    const [orderQuantities, setOrderQuantities] = useState<Record<string, { air: number, sea: number }>>(sharedDraft?.quantities || initialState?.quantities || {});
    const [orderNotes, setOrderNotes] = useState<Record<string, string>>(sharedDraft?.notes || initialState?.notes || {});
    const [viewFilter, setViewFilter] = useState<'all' | 'draft' | 'suggested' | 'seasonal'>(initialState?.viewFilter || 'all');
    const [sortKey, setSortKey] = useState<string>('priority');
    const [searchResult, setSearchResult] = useState<SearchResult>(() => initialState?.filters?.search ? parseInventorySearch(initialState.filters.search) : { type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(initialState?.itemsPerPage || 20);

    const [supersessionWarnings, setSupersessionWarnings] = useState<Record<string, number>>({});
    const [confirmationQueue, setConfirmationQueue] = useState<{ code: string, type: 'air' | 'sea', val: number }[]>([]);
    const [confirmedSkus, setConfirmedSkus] = useState<Set<string>>(new Set());
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
    const [submitDraftName, setSubmitDraftName] = useState('');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [returnReason, setReturnReason] = useState<string>('');

    const { user, profile } = useAuth();
    const isLocked = approvalRequest?.status === 'approved';
    const isReturned = approvalRequest?.status === 'returned';

    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (onUpdateDraft) onUpdateDraft({ quantities: orderQuantities, notes: orderNotes }); }, [orderQuantities, orderNotes, onUpdateDraft]);
    useEffect(() => { if (onSaveState) onSaveState({ settings, filters, quantities: orderQuantities, notes: orderNotes, viewFilter, itemsPerPage }); }, [settings, filters, orderQuantities, orderNotes, viewFilter, itemsPerPage, onSaveState]);

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

    const handleOpenSubmitModal = async () => {
        const [wfs] = await Promise.all([listWorkflows()]);
        setWorkflows(wfs);
        setSubmitDraftName('');
        setSelectedWorkflowId(wfs[0]?.id || '');
        setIsSubmitModalOpen(true);
    };

    const buildSnapshot = () => ({
        quantities: orderQuantities,
        notes: orderNotes,
        inventory_context: Object.keys(orderQuantities)
            .filter(code => (orderQuantities[code].air || 0) + (orderQuantities[code].sea || 0) > 0)
            .map(code => {
                const item = enrichedMap?.get(code);
                const c = item?.computed;
                const profile = item ? resolveItemProfile(item, settings.sourceProfiles) : undefined;
                return {
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
                    warnings: (c?.warnings || []).map(w => w.message),
                    m1Actual: (item?.SalesHistory?.slice(-1)[0]) || 0,
                    avgQty3M: item?.AvgQty3M || 0,
                    avgQty6M: item?.AvgQty6M || 0,
                    avgQty12M: item?.AvgQty12M || 0,
                    avgQty24M: item?.AvgQty24M || 0,
                    incomingCurrentMonth: c?.incomingCurrentMonth || 0,
                    incomingNextMonth: c?.incomingNextMonth || 0,
                    cst: c?.cst || 0,
                    salesHistory: item?.SalesHistory || [],
                    // Regional breakdown + leadtime for print form
                    available_NB: item?.QuantityInventory_NB || 0,
                    available_BB: item?.QuantityInventory_BB || 0,
                    totalPO_NB: item?.TotalPO_NB || 0,
                    totalPO_BB: item?.TotalPO_BB || 0,
                    backorder_NB: item?.Backorder_NB || 0,
                    backorder_BB: item?.Backorder_BB || 0,
                    backorderBreakdown: item?.BackorderBreakdown || [],
                    dealerBreakdown: item?.DealerBreakdown || [],
                    effectiveLT: profile.profile?.lt ?? settings.params.lt ?? 90,
                    qtyNB: c?.transfer?.suggestedOrderNB || 0,
                    qtyBB: c?.transfer?.suggestedOrderBB || 0,
                };
            }),
        submitted_at: new Date().toISOString(),
        app_version: '13',
    });

    const handleSubmitApproval = async () => {
        if (!user || !submitDraftName.trim() || !selectedWorkflowId) return;
        setIsSubmitting(true);
        const id = await submitApprovalRequest({
            draft_name: submitDraftName.trim(),
            brand: normalizeBrand(profile?.department),
            workflow_id: selectedWorkflowId,
            submitted_by: user.id,
            snapshot_data: buildSnapshot(),
        });
        setIsSubmitting(false);
        setIsSubmitModalOpen(false);
        if (id) {
            const req = await fetchRequestByDraftName(submitDraftName.trim());
            setApprovalRequest(req);
        }
    };

    const handleResubmit = async () => {
        if (!approvalRequest) return;
        if (!confirm(`Gửi lại yêu cầu phê duyệt "${approvalRequest.draft_name}" với dữ liệu đã chỉnh sửa?`)) return;
        setIsSubmitting(true);
        const ok = await resubmitApprovalRequest(approvalRequest.id, buildSnapshot());
        setIsSubmitting(false);
        if (ok) {
            const req = await fetchRequestByDraftName(approvalRequest.draft_name);
            setApprovalRequest(req);
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

    // O10 PERFORMANCE: Base metrics (no drafts) cached to prevent lag on edits
    const baseEnrichedList = useMemo(() => {
        return computeInventoryBatch(data, computeParams, {});
    }, [data, computeParams]);

    const { enrichedList, enrichedMap } = useMemo(() => {
        const itemMap = new Map<string, InventoryItem>();
        const list = baseEnrichedList.map(item => {
            const draft = orderQuantities[item.ItemCode];
            const hasDraft = draft && (draft.air + draft.sea > 0);

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
    }, [baseEnrichedList, computeParams, orderQuantities]);

    const filteredData = useMemo(() => {
        let list = enrichedList.filter(i => {
            if (!matchSearch(i, searchResult)) return false;
            const d = orderQuantities[i.ItemCode] as { air: number, sea: number } | undefined;
            const hasDraft = d && (d.air + d.sea > 0);
            // O8 Fix: 'Suggested' tab phải hiển thị cả items có AIR suggest (suggestedBO) lẫn SEA suggest (gapOrExcess)
            const hasSuggestion = (i.computed?.gapOrExcess || 0) > 0 || (i.computed?.suggestedBO || 0) > 0;
            if (viewFilter === 'draft' && !hasDraft) return false;
            if (viewFilter === 'suggested' && !hasSuggestion) return false;
            if (viewFilter === 'seasonal' && !i.computed?.warnings?.some((w: any) => w.code === 'SEASONAL_UPCOMING')) return false;
            if (filters.priority !== 'All' && i.computed?.priorityBucket !== filters.priority) return false;
            if (filters.status !== 'All' && i.Status !== filters.status) return false;
            if (filters.lois.length > 0 && !filters.lois.includes(i.LOISGroup)) return false;
            if (filters.source !== 'All') {
                const [brand, sid] = filters.source.split('|');
                if (i.BrandName !== brand || (i.SourceId || '') !== sid) return false;
            }
            if (filters.trend !== 'All' && i.TrendFlag !== filters.trend) return false;
            if (filters.showBackorders && i.Backorder <= 0) return false;
            if (filters.specialFilter === 'stockout' && !i.computed?.stockoutRiskFlag) return false;
            if (filters.specialFilter === 'excess' && (i.computed?.excessQty || 0) <= 0) return false;
            if (filters.specialFilter === 'has_po' && (i.TotalPO || 0) <= 0) return false;
            if (filters.specialFilter === 'has_supersession') {
                if (!graph) return false;
                const chain = graph.getChain(i.ItemCode);
                if (!chain || chain.allParts.length <= 1) return false;
            }
            if (filters.specialFilter === 'has_warning') {
                if (!i.computed?.warnings || i.computed.warnings.length === 0) return false;
            }
            if (filters.specialFilter === 'low_stock') {
                const avail = i.computed?.available || 0;
                const ss = i.computed?.safetyStock || 0;
                const mos = i.computed?.mos || 0;
                // Low stock: tồn vật lý < safety stock HOẶC MOS < ngưỡng thấp (nhưng chưa hẳn stockout)
                if (avail >= ss && mos >= MOS_LOW_STOCK_THRESHOLD) return false;
            }
            if (filters.costRange > 0) {
                const range = COST_RANGES[filters.costRange];
                if (i.UnitCost_PP < range.min || i.UnitCost_PP >= range.max) return false;
            }
            if (filters.fobCostRange > 0) {
                const range = FOB_COST_RANGES[filters.fobCostRange];
                if (i.UnitCost_FOB < range.min || i.UnitCost_FOB >= range.max) return false;
            }
            if (filters.debtStatus && filters.debtStatus.length > 0) {
                const status = getDebtStatus(i);
                if (!filters.debtStatus.includes(status)) return false;
            }
            return true;
        });

        return list.sort((a, b) => {
            switch (sortKey) {
                case 'priority': {
                    const pa = PRIORITY_ORDER[a.computed?.priorityBucket || 'P3'];
                    const pb = PRIORITY_ORDER[b.computed?.priorityBucket || 'P3'];
                    if (pa !== pb) return pa - pb;
                    // Tiebreak: MOS tăng dần (thiếu hàng nhất lên đầu)
                    return (a.computed?.mos || 0) - (b.computed?.mos || 0);
                }
                case 'mos_asc': return (a.computed?.mos || 0) - (b.computed?.mos || 0);
                case 'mos_desc': return (b.computed?.mos || 0) - (a.computed?.mos || 0);
                case 'fc_desc': return (b.BaseForecast || 0) - (a.BaseForecast || 0);
                case 'stock_desc': return (b.computed?.available || 0) - (a.computed?.available || 0);
                case 'val_desc': return (b.computed?.stockValue || 0) - (a.computed?.stockValue || 0);
                case 'bo_desc': return (b.Backorder || 0) - (a.Backorder || 0);
                case 'price_desc': return (b.computed?.unitCost || 0) - (a.computed?.unitCost || 0);
                default: return 0;
            }
        });
    }, [enrichedList, searchResult, orderQuantities, viewFilter, filters, sortKey, graph]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage, itemsPerPage]);

    const handleQtyChange = (code: string, type: 'air' | 'sea', val: number, bypassConfirm = false) => {
        const item = enrichedMap.get(code);
        const snp = item?.SNP || 1;
        const correctedVal = val > 0 ? Math.ceil(val / snp) * snp : 0;

        // --- SAFEGUARDS ---
        // O11 UX: Session-based acknowledgement to prevent repetitive popups
        const isAlreadyConfirmed = confirmedSkus.has(code);

        if (!bypassConfirm && val > 0 && !isAlreadyConfirmed && item?.computed?.warnings) {
            const hasCriticalOrWarning = item.computed.warnings.some(w => w.type === 'Critical' || w.type === 'Warning');
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
                    [code]: correctedVal
                }));
            }
        }

        setOrderQuantities(p => {
            const current = (p[code] || { air: 0, sea: 0 }) as { air: number, sea: number };
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
                [code]: prev[code] ? `${prev[code]}\nAUTO-AUDIT: ${warningText}` : `AUTO-AUDIT: ${warningText}`
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
                sea: existingNew.sea + (!isAir ? qty : 0)
            };
            return updated;
        });

        // Add automatic note
        setOrderNotes(prev => {
            const currentNote = prev[newPart] || "";
            const autoNote = `Mã cũ: ${oldPart} | SL: ${qty}`;
            return {
                ...prev,
                [newPart]: currentNote ? `${currentNote}\n${autoNote}` : autoNote
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
        (Object.entries(orderQuantities) as [string, { air: number, sea: number }][]).forEach(([code, qty]) => {
            if (qty.air > 0 || qty.sea > 0) {
                const item = enrichedMap.get(code);
                if (item) list.push({ item, airQty: qty.air, seaQty: qty.sea, note: orderNotes[code] || '' });
            }
        });
        if (list.length === 0) return alert('Dự thảo trống');
        const exportOptions: CsvExportOptions | undefined = appSettings ? {
            separator: appSettings.exportSeparator === 'semicolon' ? ';' : appSettings.exportSeparator === 'tab' ? '\t' : ',',
            encoding: appSettings.exportEncoding,
            decimalPrecision: appSettings.exportDecimalPrecision,
            exportColumns: appSettings.orderDraftColumns,
        } : undefined;
        exportOrderDraftToCSV(list, `Draft_Combined_${new Date().toISOString().slice(0, 10)}.csv`, settings.costBasis, exportOptions);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const { quantities, notes } = parseOrderingDraftCSV(text);
            if (Object.keys(quantities).length === 0) return alert("Không tìm thấy dữ liệu đặt hàng hợp lệ.");
            setOrderQuantities(p => ({ ...p, ...quantities }));
            setOrderNotes(p => ({ ...p, ...notes }));
            alert(`Đã nhập dự thảo thành công cho ${Object.keys(quantities).length} mã hàng.`);
        };
        reader.readAsText(file);
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
                            <i className="fas fa-cart-shopping text-blue-400 text-2xl"></i>
                        </div>
                        <div>
                            <Typography variant="h1" className="tracking-tight uppercase text-white !text-3xl workbench-title">
                                {t('nav_ordering')}
                            </Typography>
                            <Typography variant="body" className="text-[#F5F5F5] font-medium opacity-100 decoration-blue-500/60 underline decoration-2 underline-offset-4 supply-chain-data">
                                Demand Intelligence & Ordering Workbench
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 backdrop-blur-sm px-5 py-2.5 rounded-2xl border border-white/10 shadow-glass">
                            <Typography variant="label" className="text-[#F5F5F5] !text-[10px] uppercase font-black tracking-widest opacity-80 metric-label">SKU Base</Typography>
                            <Typography variant="h2" className="text-white">{data.length.toLocaleString()}</Typography>
                        </div>
                        <div className="bg-blue-500/10 backdrop-blur-sm px-5 py-2.5 rounded-2xl border border-blue-400/20 shadow-glass">
                            <Typography variant="label" className="text-[#F5F5F5] !text-[10px] uppercase font-black tracking-widest opacity-80 metric-label">In Draft</Typography>
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
                        const p = appSettings?.sourceProfiles?.find(p =>
                            p.brand.toLowerCase() === brands[0].toLowerCase() &&
                            (p.id.toUpperCase() === sources[0].toUpperCase() || p.name.toLowerCase().includes(sources[0].toLowerCase()))
                        );
                        if (p) return `[${p.brand}] ${p.id} – ${p.name}`;
                        return `[${brands[0]}] ${sources[0]}`;
                    }

                    const p = appSettings?.sourceProfiles?.find(p => p.id === appSettings?.activeSourceId);
                    if (p) return `[${p.brand || 'Kia'}] ${p.id} – ${p.name}`;

                    return undefined;
                })()}
            />
            {!isMobile && <DraftAnalysisCharts itemMap={enrichedMap} orderQuantities={orderQuantities} costBasis={settings.costBasis} />}

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm">

                {Object.keys(supersessionWarnings).length > 0 && (
                    <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-amber-800">
                                <i className="fas fa-triangle-exclamation"></i>
                                <span className="text-sm font-black uppercase tracking-wider">Cảnh báo thay thế mã ({Object.keys(supersessionWarnings).length})</span>
                            </div>
                            {Object.keys(supersessionWarnings).length > 1 && (
                                <button
                                    onClick={handleConvertAll}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2"
                                >
                                    <i className="fas fa-sync-alt"></i> Chuyển tất cả sang mã mới
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
                            <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                                <button onClick={() => { setViewFilter('all'); setCurrentPage(1); }} className={`flex-1 md:flex-none px-2 md:px-4 py-1.5 text-[10px] md:text-xs font-black rounded-lg transition-all ${viewFilter === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_all')}</button>
                                <button onClick={() => { setViewFilter('suggested'); setCurrentPage(1); }} className={`flex-1 md:flex-none px-2 md:px-4 py-1.5 text-[10px] md:text-xs font-black rounded-lg transition-all ${viewFilter === 'suggested' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_suggested')}</button>
                                <button onClick={() => { setViewFilter('seasonal'); setCurrentPage(1); }} className={`flex-1 md:flex-none px-2 md:px-4 py-1.5 text-[10px] md:text-xs font-black rounded-lg transition-all ${viewFilter === 'seasonal' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_seasonal')}</button>
                                <button onClick={() => { setViewFilter('draft'); setCurrentPage(1); }} className={`flex-1 md:flex-none px-2 md:px-4 py-1.5 text-[10px] md:text-xs font-black rounded-lg transition-all ${viewFilter === 'draft' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_draft')}</button>
                            </div>
                            {/* Desktop Sort */}
                            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
                                <i className="fas fa-sort-amount-down text-slate-400 text-[10px]"></i>
                                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="bg-transparent text-[10px] font-black text-slate-700 outline-none cursor-pointer uppercase">
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
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-1 rounded-2xl">
                                <button onClick={() => setIsCloudModalOpen(true)} className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all border border-blue-700 flex items-center justify-center shadow-glow px-4 py-2.5 text-[10px] font-black uppercase tracking-widest">
                                    <i className="fas fa-cloud mr-2"></i> Cloud
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
                                <button onClick={() => fileInputRef.current?.click()} className="bg-white text-slate-700 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 flex items-center justify-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest">
                                    <i className="fas fa-file-import mr-2"></i> Import
                                </button>
                            </div>
                            <button onClick={handleExport} className="bg-atp-secondary text-white hover:bg-slate-700 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center gap-2 border border-slate-800">
                                <i className="fas fa-file-export"></i> {t('ord_export_btn')}
                            </button>
                            {profile?.role && ['admin', 'planner'].includes(profile.role) && !isReturned && (
                                <button onClick={handleOpenSubmitModal} disabled={Object.values(orderQuantities).every((v: any) => !v.air && !v.sea)} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-glow flex items-center gap-2 border border-emerald-700">
                                    <i className="fas fa-paper-plane"></i> Phê duyệt
                                </button>
                            )}
                            {approvalRequest && <ApprovalStatusBadge status={approvalRequest.status} size="sm" />}
                        </div>
                    </div>

                    {/* ROW 2: Search + Mobile Controls (Flat minimal) */}
                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="flex-1 relative group">
                            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs group-focus-within:text-blue-600 transition-colors"></i>
                            <input type="text" placeholder={t('ord_search_ph')} value={filters.search} onChange={(e) => handleMainFilterChange({ ...filters, search: e.target.value })} className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-400 transition-all text-slate-700" />
                        </div>
                        
                        {/* Mobile Sort Icon Only */}
                        <div className="md:hidden flex items-center justify-center w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl relative shrink-0">
                            <i className="fas fa-sort-amount-down text-slate-500 text-xs"></i>
                            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer">
                                <option value="priority">Hệ thống</option>
                                <option value="mos_asc">MOS</option>
                                <option value="fc_desc">FC</option>
                                <option value="stock_desc">Tồn</option>
                                <option value="val_desc">Giá trị</option>
                            </select>
                        </div>
                        
                        {/* Mobile Action Icons (Flat) */}
                        <div className="md:hidden flex items-center gap-1.5 shrink-0">
                            <button onClick={() => setIsCloudModalOpen(true)} className="w-9 h-9 flex items-center justify-center text-blue-600 bg-blue-50/50 rounded-xl border border-blue-100 active:bg-blue-100">
                                <i className="fas fa-cloud text-xs"></i>
                            </button>
                            {profile?.role && ['admin', 'planner'].includes(profile.role) && !isReturned && (
                                <button onClick={handleOpenSubmitModal} disabled={Object.values(orderQuantities).every((v: any) => !v.air && !v.sea)} className="w-9 h-9 flex items-center justify-center text-emerald-600 bg-emerald-50/50 rounded-xl border border-emerald-100 active:bg-emerald-100 disabled:opacity-40">
                                    <i className="fas fa-paper-plane text-xs"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── Returned banner ─── */}
                {isReturned && (
                    <div className="mx-4 mb-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <i className="fas fa-rotate-left text-indigo-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <span className="text-indigo-800 font-black text-sm block">Draft bị trả lại — Approver đã điều chỉnh</span>
                                {returnReason && (
                                    <div className="flex items-start gap-1.5 mt-1">
                                        <i className="fas fa-comment-dots text-indigo-400 text-xs mt-0.5 shrink-0" />
                                        <span className="text-indigo-700 text-xs font-medium italic">"{returnReason}"</span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleResubmit}
                                disabled={isSubmitting || Object.values(orderQuantities).every((v: any) => !v.air && !v.sea)}
                                className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2"
                            >
                                {isSubmitting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                                Gửi lại
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-indigo-500 bg-indigo-100/60 rounded-lg px-3 py-1.5">
                            <i className="fas fa-circle-info text-indigo-400" />
                            Số lượng đặt hàng đã được cập nhật theo điều chỉnh của approver. Xem lại, sửa nếu cần rồi nhấn Gửi lại.
                        </div>
                    </div>
                )}

                {/* ─── Lock banner ─── */}
                {isLocked && (
                    <div className="mx-4 mb-2 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        <i className="fas fa-lock text-emerald-600" />
                        <span className="text-emerald-700 font-black text-sm">Draft đã được phê duyệt và khóa. Liên hệ approver để mở khóa chỉnh sửa.</span>
                        <span className="ml-auto text-emerald-500 text-xs font-medium">{approvalRequest?.draft_name}</span>
                    </div>
                )}

                {/* ─── Scrollable table area (overflow-auto = both axes, scrollbar always at viewport edge) ─── */}
                {isMobile ? (
                    /* === MOBILE CARD VIEW === */
                    <div className="mobile-card-grid pb-4">
                        {paginatedData.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <i className="fas fa-box-open text-3xl mb-3 block" />
                                <p className="font-bold">Không có dữ liệu</p>
                            </div>
                        ) : paginatedData.map((item, idx) => {
                            const d = (orderQuantities[item.ItemCode] || { air: 0, sea: 0 }) as { air: number, sea: number };
                            const draftQtyTotal = d.air + d.sea;
                            const unitCost = item.computed?.unitCost || 0;
                            const mos = item.computed?.mos || 0;
                            const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                            const priority = calculatePickingPriority(item, draftQtyTotal);
                            const priorityClass = priority === 1 ? 'priority-p1' : priority === 2 ? 'priority-p2' : 'priority-p3';
                            const amount = draftQtyTotal > 0 ? (settings.costBasis === 'PP' ? currencyFormatterVND : currencyFormatterEUR).format(draftQtyTotal * unitCost) : null;
                            return (
                                <div key={item.ItemCode} className={`mobile-item-card ${priorityClass} ${draftQtyTotal > 0 ? 'ring-1 ring-blue-200' : ''}`}>
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between px-4 pt-3 pb-2 cursor-pointer active:bg-slate-50" onClick={() => onItemSelect(item)}>
                                        <div className="flex-1 min-w-0 pr-3">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="font-black text-slate-900 text-base tracking-tight">{item.ItemCode}</span>
                                                <span className={`badge-p${Math.min(priority, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}>P{priority}</span>
                                                {draftQtyTotal > 0 && <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Draft</span>}
                                            </div>
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">L{item.LOISGroup}</span>
                                                {!isMobile && item.TrendFlag && <TrendBadge trend={item.TrendFlag} />}
                                                {!isMobile && <DebtStatusBadge item={item} />}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-base font-black ${mos < 1 ? 'text-rose-600' : mos > 12 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {demandMonthly <= 0 ? '∞' : `${mos.toFixed(1)}M`}
                                            </div>
                                            <div className="text-[8px] font-black text-slate-400 uppercase">MOS</div>
                                        </div>
                                    </div>

                                    {/* Stock bar */}
                                    <div className="px-4 pb-2">
                                        <StockProgressBar
                                            current={item.computed?.available || 0}
                                            rop={item.computed?.rop || 0}
                                            max={item.computed?.isStopBiz ? 0 : (item.computed?.stockMax || 1)}
                                            ss={item.computed?.safetyStock}
                                            onOrder={item.TotalPO}
                                            incoming={item.computed?.incomingCurrentMonth}
                                            backorder={item.Backorder}
                                            draftAdd={draftQtyTotal}
                                            baseFc={item.BaseForecast}
                                        />
                                    </div>

                                    {/* QTY Inputs */}
                                    <div className="grid grid-cols-2 gap-px bg-slate-100 border-t border-slate-100">
                                        <div className="bg-rose-50/80 px-3 py-2.5">
                                            <div className="text-[9px] font-black text-rose-500 uppercase mb-1 flex items-center gap-1">
                                                <i className="fas fa-plane-up text-[8px]" />Air
                                            </div>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                value={d.air || ''}
                                                onChange={e => !isLocked && handleQtyChange(item.ItemCode, 'air', parseInt(e.target.value) || 0)}
                                                readOnly={isLocked}
                                                className="w-full bg-transparent text-base font-black text-rose-700 outline-none min-h-[36px]"
                                                placeholder="0"
                                            />
                                            {((item.computed?.suggestedBO || 0) > 0) && d.air === 0 && (
                                                <button onClick={() => handleQtyChange(item.ItemCode, 'air', item.computed!.suggestedBO!)} className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full border border-rose-200 mt-0.5">BO: {item.computed!.suggestedBO}</button>
                                            )}
                                        </div>
                                        <div className="bg-blue-50/80 px-3 py-2.5">
                                            <div className="text-[9px] font-black text-blue-500 uppercase mb-1 flex items-center gap-1">
                                                <i className="fas fa-ship text-[8px]" />Sea
                                            </div>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                value={d.sea || ''}
                                                onChange={e => !isLocked && handleQtyChange(item.ItemCode, 'sea', parseInt(e.target.value) || 0)}
                                                readOnly={isLocked}
                                                className="w-full bg-transparent text-base font-black text-blue-700 outline-none min-h-[36px]"
                                                placeholder="0"
                                            />
                                            {((item.computed?.gapOrExcess || 0) > 0) && d.sea === 0 && (
                                                <button onClick={() => handleQtyChange(item.ItemCode, 'sea', Math.ceil((item.computed!.gapOrExcess! || 1) / (item.SNP || 1)) * (item.SNP || 1))} className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200 mt-0.5">Gợi ý: {item.computed!.gapOrExcess}</button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount Footer */}
                                    {amount && (
                                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Thành tiền</span>
                                            <span className="font-black text-slate-800 text-sm">{amount}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div
                    ref={tableScrollRef}
                    className="overflow-auto flex-1 relative custom-scrollbar bg-slate-50/50"
                >
                    <table className="w-full text-sm text-left border-separate border-spacing-0 lg:min-w-[1600px] md:min-w-[1200px] min-w-[1000px]">
                        <thead className="bg-white/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30 shadow-sm">
                            <tr className="text-[10px] uppercase font-black tracking-widest">
                                <th className="px-4 py-4 w-12 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-white shadow-sm"><Typography variant="label">#</Typography></th>
                                <th className="px-4 py-4 min-w-[180px] sticky left-12 z-40 bg-white border-b border-slate-200 sticky-column-shadow"><Typography variant="label">{t('ord_th_sku')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[110px] hidden xl:table-cell"><Typography variant="label">DEMAND</Typography></th>
                                <th className="px-4 py-4 min-w-[200px] text-right border-b border-slate-200"><Typography variant="label">Stock Health | MOS</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[110px] hidden lg:table-cell"><Typography variant="label">PO PIPELINE</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[120px] hidden lg:table-cell"><Typography variant="label">{t('ord_th_momentum')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 hidden md:table-cell"><Typography variant="label">{t('ord_th_dealer_cst')}</Typography></th>
                                <th className="px-4 py-4 text-center border-x border-slate-200 bg-rose-50/20 border-b border-slate-200"><Typography variant="label" className="text-rose-600">Air</Typography></th>
                                <th className="px-4 py-4 text-center border-r border-slate-200 bg-blue-50/20 border-b border-slate-200"><Typography variant="label" className="text-blue-600">Sea</Typography></th>
                                <th className="px-4 py-4 min-w-[150px] border-b border-slate-200 hidden xl:table-cell">{t('ord_th_note')}</th>
                                <th className="px-4 py-4 text-right sticky right-0 z-40 bg-white border-b border-slate-200 border-l border-slate-200 shadow-inner">{t('ord_th_amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {paginatedData.map((item, idx) => {
                                const d = (orderQuantities[item.ItemCode] || { air: 0, sea: 0 }) as { air: number, sea: number };
                                const draftQtyTotal = d.air + d.sea;
                                const unitCost = item.computed?.unitCost || 0;
                                const m1Actual = (item.SalesHistory && item.SalesHistory.length > 0) ? item.SalesHistory[item.SalesHistory.length - 1] : 0;
                                const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                                // O9 Fix: dùng computed.cst từ engine thay vì tính lại
                                const currentCst = item.computed?.cst ?? 99.9;
                                const projectedCst = demandMonthly > 0 ? (item.NetDemand + item.DealerInventory + draftQtyTotal) / demandMonthly : 99.9;
                                const displayCst = draftQtyTotal > 0 ? projectedCst : currentCst;
                                const isCstImproved = draftQtyTotal > 0 && projectedCst > (currentCst + 0.05);
                                const incomingThisMonth = item.computed?.incomingCurrentMonth || 0;
                                return (
                                    <tr key={item.ItemCode} className={`hover:bg-slate-50 transition-colors group ${draftQtyTotal > 0 ? 'bg-blue-50/20' : ''}`}>
                                        <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs font-black border-b border-slate-50 sticky left-0 z-10 bg-white group-hover:bg-slate-50">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                        <td className="px-4 py-3 sticky left-12 z-10 bg-white group-hover:bg-slate-50 transition-colors sticky-column-shadow border-b border-slate-50" onClick={() => onItemSelect(item)}>
                                            <div className="flex items-center gap-2">
                                                <div className="text-lg font-black text-slate-900 flex items-center gap-2 group-hover:text-blue-700 transition-colors tracking-tight">{item.ItemCode}</div>
                                                {(() => {
                                                    const p = calculatePickingPriority(item, draftQtyTotal);
                                                    return <span className={`badge-p${Math.min(p, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}>P{p}</span>;
                                                })()}
                                                <SupersessionIndicator partNumber={item.ItemCode} graph={graph} onClick={(e) => { e.stopPropagation(); onItemSelect(item); }} />
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold truncate max-w-[200px]">{item.ItemName}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <DebtStatusBadge item={item} />
                                                {item.computed?.warnings?.find(w => w.code === 'STK_GAP') && (
                                                    <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-rose-600 text-white border border-rose-700 shadow-sm animate-pulse flex items-center gap-1 cursor-help" title={item.computed.warnings.find(w => w.code === 'STK_GAP')?.message}>
                                                        <i className="fas fa-clock-rotate-left text-[10px]" />
                                                        Gap: {item.computed.warnings.find(w => w.code === 'STK_GAP')?.message.split(': ')[1].split(' ngày')[0]}d
                                                    </span>
                                                )}
                                                <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-blue-50 text-blue-700 border border-blue-100">LOIS {item.LOISGroup}</span>
                                                {item.SourceId && (
                                                    <Typography variant="label" className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
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
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80 shadow-sm" title="Bán M-1 thực tế / Dự báo FC">
                                                    <div className="flex flex-col items-start leading-tight">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">M-1</span>
                                                        <span className="font-black text-slate-800 text-sm leading-none">{(m1Actual || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-8 w-px bg-slate-200"></div>
                                                    <div className="flex flex-col items-start leading-tight">
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">FC</span>
                                                        <span className="font-black text-emerald-700 text-sm leading-none">{item.BaseForecast ? (item.BaseForecast >= 10 ? Math.round(item.BaseForecast).toLocaleString() : item.BaseForecast.toFixed(1)) : '-'}</span>
                                                    </div>
                                                </div>
                                                <TrendBadge trend={item.TrendFlag} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right border-b border-slate-50">
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-center justify-end gap-2 mb-1.5">
                                                    <ConsolidatedStockCell item={item} allItems={enrichedList} graph={graph} />
                                                    {(() => {
                                                        const effStock = (item.computed?.available || 0) + (incomingThisMonth || 0) - (item.Backorder || 0);
                                                        const effMos = demandMonthly <= 0 ? 99 : effStock / demandMonthly;
                                                        const colorClass = effMos < 1.0 
                                                            ? 'bg-rose-100 text-rose-700 border-rose-200' 
                                                            : effMos <= 2.0 
                                                                ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                                                : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                        return (
                                                            <div className={`px-2 py-0.5 rounded-md border font-black text-xs text-center shadow-sm flex items-center gap-1 transition-all hover:scale-105 active:scale-95 cursor-help ${colorClass}`} title={`MOS tính cả hàng về & BO: ${effMos === 99 ? '∞' : effMos.toFixed(1)}M`}>
                                                                <i className={`fas ${effMos < 1.0 ? 'fa-triangle-exclamation' : 'fa-hourglass-half'} text-[10px] opacity-70`} />
                                                                {demandMonthly <= 0 ? '∞' : `${item.computed!.mos?.toFixed(1)}M`}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <StockProgressBar current={item.computed?.available || 0} rop={item.computed?.rop || 0}
                                                    max={item.computed?.isStopBiz ? 0 : (item.computed?.stockMax || 1)}
                                                    ss={item.computed?.safetyStock} onOrder={item.TotalPO} incoming={incomingThisMonth} incomingNext={item.computed?.incomingNextMonth} backorder={item.Backorder} breakdown={item.BackorderBreakdown} draftAdd={draftQtyTotal} baseFc={item.BaseForecast} />
                                            </div>
                                        </td>
                                        {/* SUPPLY PIPELINE — aligned with Dashboard style */}
                                        <td className="px-4 py-3 text-center border-b border-slate-50 min-w-[130px]">
                                            <div className="flex flex-col items-center gap-1.5">
                                                {incomingThisMonth > 0 ? (
                                                    <div className="flex flex-col items-center leading-none">
                                                        <Typography variant="body" className="font-black text-blue-700">+{incomingThisMonth.toLocaleString()}</Typography>
                                                        <Typography variant="label" className="text-blue-400 !font-bold normal-case text-[9px]">Về tháng này</Typography>
                                                    </div>
                                                ) : (
                                                    <Typography variant="body" className="font-bold text-slate-300">—</Typography>
                                                )}
                                                
                                                {(item.TotalPO || 0) > 0 && (
                                                    <div className="inline-flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shadow-sm" title="Tổng PO Pipeline">
                                                        <i className="fas fa-ship text-indigo-400 text-[9px]" />
                                                        <span className="text-[10px] font-black text-indigo-600">PO: {(item.TotalPO || 0).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50 hidden lg:table-cell">
                                            <SalesMomentum values={[item.AvgQty24M, item.AvgQty12M, item.AvgQty6M, item.AvgQty3M]} history={item.SalesHistory} forecast={item.BaseForecast} />
                                        </td>

                                        <td className="px-4 py-3 text-center border-b border-slate-50 hidden md:table-cell">
                                            <div className="mt-1 flex flex-col items-center">
                                                <DealerStockPopup items={item.DealerBreakdown || []}>
                                                    <div className="text-sm font-black text-slate-800 cursor-help border-b border-dashed border-slate-300 inline-block">{(item.DealerInventory || 0).toLocaleString()}</div>
                                                </DealerStockPopup>
                                                <div className={`text-sm font-black px-2 py-0.5 rounded-full mt-1.5 transition-all duration-500 ${isCstImproved ? 'bg-blue-600 text-white border border-blue-700 scale-110' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                    {demandMonthly <= 0 ? 'CST: ∞' : `CST: ${(displayCst || 0).toFixed(1)}`}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 border-x border-slate-100 bg-rose-50/10 text-center border-b border-slate-50">
                                            <input type="number" value={d.air || ''} onChange={e => !isLocked && handleQtyChange(item.ItemCode, 'air', parseInt(e.target.value) || 0)} readOnly={isLocked} className="w-full bg-rose-50 border-0 focus:ring-0 text-center text-base font-black text-rose-700 p-0 h-full" placeholder="0" />
                                            {((item.computed?.suggestedBO || 0) > 0) && d.air === 0 && (
                                                <button onClick={() => handleQtyChange(item.ItemCode, 'air', item.computed!.suggestedBO!)} className="block mx-auto mt-1.5 text-xs font-black text-rose-600 hover:text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">BO: {item.computed.suggestedBO}</button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 bg-blue-50/10 text-center border-b border-slate-50">
                                            <input type="number" value={d.sea || ''} onChange={e => !isLocked && handleQtyChange(item.ItemCode, 'sea', parseInt(e.target.value) || 0)} readOnly={isLocked} className="w-full bg-blue-50 border-0 focus:ring-0 text-center text-base font-black text-blue-700 p-0 h-full" placeholder="0" />
                                            {((item.computed?.gapOrExcess || 0) > 0) && d.sea === 0 && (
                                                <button 
                                                    onClick={() => handleQtyChange(item.ItemCode, 'sea', item.computed!.gapOrExcess)} 
                                                    className={`block mx-auto mt-1.5 text-xs font-black px-3 py-1 rounded-full border transition-all shadow-sm ${
                                                        item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE')
                                                            ? 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-100'
                                                            : 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100'
                                                    }`}
                                                >
                                                    <i className={`fas ${item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE') ? 'fa-triangle-exclamation' : 'fa-lightbulb'} mr-1.5`} />
                                                    <span className="opacity-80 uppercase tracking-tight mr-1">
                                                        {item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE') ? 'Thận trọng: ' : ''}
                                                    </span>
                                                    {item.computed.gapOrExcess}
                                                </button>
                                            )}
                                            {(d.sea > 0 || (item.computed?.gapOrExcess || 0) > 0) && item.computed?.transfer && (item.computed.transfer.suggestedOrderNB > 0 || item.computed.transfer.suggestedOrderBB > 0) && (
                                                <div className="mt-1 flex items-center justify-center gap-1.5 no-print scale-110">
                                                    <div className="flex items-center gap-1 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50" title="Miền Nam (NB)">
                                                        <span className="text-[9px] font-black text-indigo-400 uppercase leading-none">NB</span>
                                                        <span className="text-[11px] font-black text-indigo-700 leading-none">{item.computed.transfer.suggestedOrderNB.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100/50" title="Miền Bắc (BB)">
                                                        <span className="text-[9px] font-black text-blue-400 uppercase leading-none">BB</span>
                                                        <span className="text-[11px] font-black text-blue-700 leading-none">{item.computed.transfer.suggestedOrderBB.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {item.computed?.transfer && item.computed.transfer.transferNBtoBB > 0 && (
                                                <div className="mt-1 flex justify-center"><span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200" title="Chuyển từ NB sang BB">NB <i className="fas fa-arrow-right mx-0.5"></i> BB: {item.computed.transfer.transferNBtoBB}</span></div>
                                            )}
                                            {item.computed?.transfer && item.computed.transfer.transferBBtoNB > 0 && (
                                                <div className="mt-1 flex justify-center"><span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200" title="Chuyển từ BB sang NB">BB <i className="fas fa-arrow-right mx-0.5"></i> NB: {item.computed.transfer.transferBBtoNB}</span></div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 border-b border-slate-50 hidden xl:table-cell"><textarea value={orderNotes[item.ItemCode] || ''} onChange={e => setOrderNotes(p => ({ ...p, [item.ItemCode]: e.target.value }))} className="w-full text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:border-blue-300 resize-none h-10" placeholder="..." /></td>
                                        <td className="px-4 py-3 text-right font-black text-slate-900 text-base sticky right-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-b border-slate-50 border-l border-slate-200">
                                            {draftQtyTotal > 0 ? (
                                                (settings.costBasis === 'PP' ? currencyFormatterVND : currencyFormatterEUR).format(draftQtyTotal * unitCost)
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
                )} {/* end isMobile */}
                <div className="p-4 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-600 bg-white">
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                        <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 font-bold text-xs">
                            <option value={20}>20 {t('common_rows')}</option>
                            <option value={50}>50 {t('common_rows')}</option>
                            <option value={100}>100 {t('common_rows')}</option>
                        </select>
                        <span className="text-slate-400 whitespace-nowrap">{t('common_total')}: <span className="text-slate-700">{filteredData.length}</span></span>
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2 sm:pb-0 max-w-full">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="pagination-pill text-slate-600 shrink-0"><i className="fas fa-chevron-left text-[10px]"></i></button>
                        {[...Array(totalPages)].map((_, i) => {
                            const page = i + 1;
                            if (totalPages > 5 && Math.abs(currentPage - page) > 1 && page !== 1 && page !== totalPages) {
                                if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>;
                                return null;
                            }
                            return <button key={i} onClick={() => setCurrentPage(page)} className={`pagination-pill shrink-0 ${currentPage === page ? 'active' : 'text-slate-600'}`}>{page}</button>;
                        })}
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="pagination-pill text-slate-600 shrink-0"><i className="fas fa-chevron-right text-[10px]"></i></button>
                    </div>
                </div>
            </div >

            {/* CONFIRMATION BANNER - GLOBAL CENTERING VIA PORTAL */}
            {confirmationQueue.length > 0 && createPortal(
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn">
                    <div 
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setConfirmationQueue(prev => prev.slice(1))}
                    ></div>
                    
                    <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-200 p-8 max-w-lg w-full relative animate-[scaleIn_0.2s_ease-out]">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-3xl mb-6 mx-auto">
                            <i className="fas fa-triangle-exclamation"></i>
                        </div>
                        <Typography variant="h2" className="text-center text-slate-900 mb-2">Kiểm tra rủi ro</Typography>
                        <Typography variant="body" className="text-center text-slate-500 mb-6 block">
                            Mã hàng <span className="font-black text-slate-900">{confirmationQueue[0].code}</span> có các cảnh báo cần lưu ý:
                        </Typography>

                        {/* ENRICHED METRICS SECTION */}
                        {(() => {
                            const item = enrichedMap.get(confirmationQueue[0].code);
                            if (!item) return null;
                            const history = item.SalesHistory || [];
                            const last3M = history.slice(-3).reduce((a, b) => a + b, 0) / 3 || 0;
                            const avg12M = history.reduce((a, b) => a + b, 0) / (history.length || 1);
                            const slope = item.computed?.slope || 0;
                            const available = item.computed?.available || 0;
                            const po = item.TotalPO || 0;
                            const bo = item.Backorder || 0;
                            const supplyCapability = available + po - bo;

                            return (
                                <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Tồn kho / PO</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-slate-700">{available}</span>
                                            <span className="text-slate-300">/</span>
                                            <span className="text-sm font-black text-blue-600">{po}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Khả năng cung ứng (Pos)</span>
                                        <div className={`text-sm font-black ${supplyCapability < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {supplyCapability > 0 ? '+' : ''}{supplyCapability}
                                        </div>
                                    </div>
                                    <div className="flex flex-col pt-2 border-t border-slate-200/50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Nợ hàng (BO)</span>
                                        <span className="text-sm font-black text-rose-600">{bo}</span>
                                    </div>
                                    <div className="flex flex-col text-right pt-2 border-t border-slate-200/50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Xu hướng (Slope)</span>
                                        <div className={`text-sm font-black ${slope < -1 ? 'text-rose-600' : slope > 1 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                            <i className={`fas ${slope < -1 ? 'fa-arrow-trend-down' : slope > 1 ? 'fa-arrow-trend-up' : 'fa-minus'} mr-1`}></i>
                                            {slope.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="flex flex-col col-span-2 pt-2 border-t border-slate-200/50">
                                        <div className="grid grid-cols-5 gap-1 items-center">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Avg 12M</span>
                                                <span className="text-xs font-black text-slate-700">{avg12M.toFixed(1)}</span>
                                            </div>
                                            <div className="flex flex-col text-center">
                                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">Tháng N-2</span>
                                                <span className="text-xs font-black text-blue-700">{history[history.length - 2] || 0}</span>
                                            </div>
                                            <div className="flex flex-col text-center">
                                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Tháng N-1</span>
                                                <span className="text-xs font-black text-indigo-700">{history[history.length - 1] || 0}</span>
                                            </div>
                                            <div className="flex flex-col text-center border-l border-slate-200 pl-1">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Avg 3M</span>
                                                <span className="text-xs font-black text-slate-700">{last3M.toFixed(1)}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] font-black text-amber-400 uppercase tracking-tighter">Forecast</span>
                                                <span className="text-xs font-black text-amber-600">{item.computed?.forecastLinReg?.toFixed(1) || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        
                        <div className="space-y-2 mb-8 max-h-[300px] overflow-y-auto pr-2 customer-scrollbar">
                            {enrichedMap.get(confirmationQueue[0].code)?.computed?.warnings.map((w, idx) => (
                                <div key={idx} className={`p-4 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-sm ${
                                    w.type === 'Critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                                    w.type === 'Warning' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                    'bg-blue-50 border-blue-100 text-blue-700'
                                }`}>
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                        w.type === 'Critical' ? 'bg-rose-100' :
                                        w.type === 'Warning' ? 'bg-amber-100' :
                                        'bg-blue-100'
                                    }`}>
                                        <i className={`fas ${w.type === 'Critical' ? 'fa-fire' : 'fa-triangle-exclamation'} text-xs`}></i>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-wider opacity-60">{w.code}</div>
                                        <div className="text-sm font-bold leading-tight">{w.message}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setConfirmationQueue(prev => prev.slice(1))}
                                className="py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                            >
                                Hủy bỏ
                            </button>
                            <button 
                                onClick={confirmWarning}
                                className="py-4 px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-200 active:scale-95 ml-auto w-full"
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                    {/* Inline style for scaleIn if not global */}
                    <style>{`
                        @keyframes scaleIn {
                            from { opacity: 0; transform: scale(0.95); }
                            to { opacity: 1; transform: scale(1); }
                        }
                    `}</style>
                </div>,
                document.body
            )}
            
            <CloudDraftModal
                isOpen={isCloudModalOpen}
                onClose={() => setIsCloudModalOpen(false)}
                currentDraft={{ quantities: orderQuantities, notes: orderNotes }}
                onLoadDraft={(draft, draftName) => {
                    setOrderQuantities(prev => ({ ...prev, ...draft.quantities }));
                    setOrderNotes(prev => ({ ...prev, ...draft.notes }));
                    // Tự động load approval request tương ứng với cloud draft
                    if (draftName) {
                        fetchRequestByDraftName(draftName).then(req => {
                            if (req) {
                                setApprovalRequest(req);
                                // Nếu đơn bị trả lại, override quantities bằng điều chỉnh của approver
                                if (req.status === 'returned' && req.snapshot_data?.quantities) {
                                    setOrderQuantities(req.snapshot_data.quantities);
                                }
                            }
                        });
                    }
                }}
                onLoadReturnedRequest={(req) => {
                    // Load từ snapshot: không cần cloud draft
                    const snap = req.snapshot_data;
                    setOrderQuantities(snap.quantities || {});
                    setOrderNotes(snap.notes || {});
                    setApprovalRequest(req);
                }}
            />

            {/* ─── Submit for Approval Modal ─── */}
            {isSubmitModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSubmitModalOpen(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-5 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <Typography variant="h3" className="text-slate-800">Gửi Phê duyệt</Typography>
                            <button onClick={() => setIsSubmitModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><i className="fas fa-xmark" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Tên Draft</label>
                                <input
                                    value={submitDraftName}
                                    onChange={e => setSubmitDraftName(e.target.value)}
                                    placeholder="VD: KIA_NB_Tháng4_2026"
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-400 text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Workflow Phê duyệt</label>
                                {workflows.length === 0 ? (
                                    <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">Chưa có workflow nào. Vui lòng tạo trong Settings.</p>
                                ) : (
                                    <select
                                        value={selectedWorkflowId}
                                        onChange={e => setSelectedWorkflowId(e.target.value)}
                                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-400 text-slate-800 bg-white"
                                    >
                                        {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleSubmitApproval}
                            disabled={isSubmitting || !submitDraftName.trim() || !selectedWorkflowId}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-2xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <><i className="fas fa-circle-notch fa-spin" /> Đang gửi...</> : <><i className="fas fa-paper-plane" /> Xác nhận gửi</>}
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
};
