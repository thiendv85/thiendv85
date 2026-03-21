
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, DashboardSettings, InventoryFilters, DEFAULT_FILTERS, OrderingDraft, getDebtStatus, COST_RANGES, FOB_COST_RANGES } from '../types/inventory';
import { FilterPanel } from '../components/FilterPanel';
import { parseInventorySearch, SearchResult, matchSearch } from '../utils/searchLogic';
import { StockProgressBar } from '../components/StockProgressBar';
import { SalesMomentum } from '../components/SalesMomentum';
import { exportOrderDraftToCSV, parseOrderingDraftCSV, calculatePickingPriority, CsvExportOptions } from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { SupersessionWarning } from '../components/SupersessionWarning';
import { SupersessionIndicator } from '../components/SupersessionIndicator';
import { ConsolidatedStockCell } from '../components/ConsolidatedStockCell';
import { AppSettings } from './Settings';
import { computeInventory, computeInventoryBatch, makeComputeParams, resolveItemProfile } from '../utils/inventoryEngine';
import { Typography } from '../components/Typography';
import { CloudDraftModal } from '../components/CloudDraftModal';

// --- GLOBAL UTILITIES ---
const currencyFormatterVND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const currencyFormatterEUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const CombinedDebtStatusBadge = ({ item, draftQty = 0 }: { item: InventoryItem, draftQty?: number }) => {
    const priority = calculatePickingPriority(item, draftQty);
    const bo = item.Backorder;
    const available = Math.max(0, item.computed?.available || 0);
    const incomingTotal = item.TotalPO;
    const incomingMonth = item.computed?.incomingCurrentMonth || 0;
    const totalSupply = available + incomingTotal + draftQty;

    let debtLabel = "Normal";
    let debtClasses = "text-slate-400";
    if (bo > 0) {
        if (bo <= available) { debtLabel = "Stock Cover"; debtClasses = "bg-atp-success/10 text-atp-success border-atp-success/30"; }
        else if (bo <= available + incomingMonth) { debtLabel = "Month Cover"; debtClasses = "bg-atp-secondary/10 text-atp-secondary border-atp-secondary/30"; }
        else if (bo <= available + incomingTotal) { debtLabel = "PO Cover"; debtClasses = "bg-atp-primary/10 text-atp-primary border-atp-primary/30"; }
        else if (bo <= totalSupply) { debtLabel = "Draft Covers"; debtClasses = "bg-atp-primary/5 text-atp-primary/70 border-atp-primary/20"; }
        else if (incomingTotal > 0) { debtLabel = "Deficit (PO)"; debtClasses = "bg-atp-accent/10 text-atp-accent border-atp-accent/30"; }
        else { debtLabel = "Deficit (No PO)"; debtClasses = "bg-atp-action/10 text-atp-action border-atp-action/30"; }
    }

    const badgeClass = `badge-p${Math.min(priority, 5)}`;

    return (
        <div className="flex flex-col items-center gap-1">
            <Typography variant="label" className={`px-2 py-0.5 rounded-lg font-bold flex-shrink-0 ${badgeClass}`}>
                P{priority}
            </Typography>
            <Typography variant="label" className={`px-1.5 py-0.5 rounded font-bold border truncate max-w-[80px] ${debtClasses} !text-[9px] text-center`}>
                {debtLabel}
            </Typography>
        </div>
    );
};

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
                    <Typography variant="h1" className="text-atp-action">{formatter.format(stats.airVal)}</Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold">{stats.airQty.toLocaleString()} units</Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div className="h-full bg-atp-action transition-all duration-1000 shadow-[0_0_8px_rgba(220,38,38,0.3)]" style={{ width: `${(stats.airVal / stats.totalVal) * 100}%` }}></div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-atp-secondary/30 shadow-sm transition-all group/sea">
                <div>
                    <Typography variant="label" className="text-slate-500 mb-4 flex items-center gap-2 transition-transform group-hover/sea:translate-x-1"><i className="fas fa-ship text-atp-secondary"></i> {t('ord_sea_title')}</Typography>
                    <Typography variant="h1" className="text-atp-secondary">{formatter.format(stats.seaVal)}</Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold">{stats.seaQty.toLocaleString()} units</Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div className="h-full bg-atp-secondary transition-all duration-1000 shadow-[0_0_8px_rgba(51,65,85,0.3)]" style={{ width: `${(stats.seaVal / stats.totalVal) * 100}%` }}></div>
                </div>
            </div>
            <div className="bg-atp-primary p-6 rounded-2xl flex flex-col justify-center text-white relative overflow-hidden shadow-glass group/total">
                <div className="absolute -right-4 -bottom-4 opacity-10 text-8xl transform -rotate-12 transition-transform group-hover/total:scale-125 duration-700"><i className="fas fa-cart-flatbed-boxes"></i></div>
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,#ffffff10,transparent)] pointer-events-none"></div>
                <Typography variant="label" className="text-slate-300 mb-2">{t('ord_total_val')}</Typography>
                <Typography variant="h1" className="text-white text-4xl">{formatter.format(stats.totalVal)}</Typography>
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
}

export const Ordering = ({ data, onItemSelect, initialParams, initialState, onSaveState, sharedDraft, onUpdateDraft, graph, appSettings }: OrderingProps) => {
    const { t } = useLanguage();
    const [settings, setSettings] = useState<DashboardSettings>(initialState?.settings || {
        snapshotDate: new Date().toISOString().split('T')[0],
        warehouseScope: 'All',
        costBasis: 'FOB',
        demandSource: '3M',
        params: initialParams || { lt: 90, sp: 30, ssp: 15 },
        sourceProfiles: appSettings?.sourceProfiles
    });

    useEffect(() => {
        if (appSettings?.sourceProfiles) {
            setSettings(prev => ({ ...prev, sourceProfiles: appSettings.sourceProfiles }));
        }
    }, [appSettings?.sourceProfiles]);
    const [filters, setFilters] = useState<InventoryFilters>(initialState?.filters || DEFAULT_FILTERS);
    const [orderQuantities, setOrderQuantities] = useState<Record<string, { air: number, sea: number }>>(sharedDraft?.quantities || initialState?.quantities || {});
    const [orderNotes, setOrderNotes] = useState<Record<string, string>>(sharedDraft?.notes || initialState?.notes || {});
    const [viewFilter, setViewFilter] = useState<'all' | 'draft' | 'suggested'>(initialState?.viewFilter || 'all');
    const [sortKey, setSortKey] = useState<string>('priority');
    const [searchResult, setSearchResult] = useState<SearchResult>(() => initialState?.filters?.search ? parseInventorySearch(initialState.filters.search) : { type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(initialState?.itemsPerPage || 20);

    const [supersessionWarnings, setSupersessionWarnings] = useState<Record<string, number>>({});
    const [confirmationQueue, setConfirmationQueue] = useState<{ code: string, type: 'air' | 'sea', val: number }[]>([]);
    const [confirmedSkus, setConfirmedSkus] = useState<Set<string>>(new Set());
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (onUpdateDraft) onUpdateDraft({ quantities: orderQuantities, notes: orderNotes }); }, [orderQuantities, orderNotes, onUpdateDraft]);
    useEffect(() => { if (onSaveState) onSaveState({ settings, filters, quantities: orderQuantities, notes: orderNotes, viewFilter, itemsPerPage }); }, [settings, filters, orderQuantities, orderNotes, viewFilter, itemsPerPage, onSaveState]);

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
            if (filters.priority !== 'All' && i.computed?.priorityBucket !== filters.priority) return false;
            if (filters.status !== 'All' && i.Status !== filters.status) return false;
            if (filters.lois !== 'All' && i.LOISGroup !== filters.lois) return false;
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
            <DraftAnalysisCharts itemMap={enrichedMap} orderQuantities={orderQuantities} costBasis={settings.costBasis} />

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

                <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-center bg-white sticky top-0 z-40 gap-4">
                    <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border border-blue-100">{t('ord_workbench')}</div>
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                            <button onClick={() => { setViewFilter('all'); setCurrentPage(1); }} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${viewFilter === 'all' ? 'bg-white text-blue-700 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_all')}</button>
                            <button onClick={() => { setViewFilter('suggested'); setCurrentPage(1); }} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${viewFilter === 'suggested' ? 'bg-white text-blue-700 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_suggested')}</button>
                            <button onClick={() => { setViewFilter('draft'); setCurrentPage(1); }} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${viewFilter === 'draft' ? 'bg-white text-blue-700 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{t('ord_tab_draft')}</button>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <i className="fas fa-sort-amount-down text-slate-400 text-xs"></i>
                            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer uppercase">
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
                    <div className="flex-1 w-full max-w-md relative group mx-2">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors text-sm"></i>
                        <input type="text" placeholder={t('ord_search_ph')} value={filters.search} onChange={(e) => handleMainFilterChange({ ...filters, search: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-blue-400 transition-all text-slate-700" />
                    </div>
                    <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                        <button onClick={() => setIsCloudModalOpen(true)} className="bg-blue-50/50 text-blue-700 hover:bg-blue-100 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-blue-200 flex items-center gap-2 mr-2">
                            <i className="fas fa-cloud"></i> Quản lý Cloud
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
                        <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-200"><i className="fas fa-file-import mr-2"></i> {t('ord_import_btn')}</button>
                        <button
                            onClick={() => {
                                const total = Object.values(orderQuantities).filter((v: any) => v.air + v.sea > 0).length;
                                if (total === 0) return alert('Dự thảo đang trống.');
                                if (window.confirm(`Xóa toàn bộ dự thảo (${total} mã hàng)?`)) {
                                    setOrderQuantities({});
                                    setOrderNotes({});
                                }
                            }}
                            className="bg-rose-50 text-rose-700 hover:bg-rose-100 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-rose-200 flex items-center gap-2"
                        >
                            <i className="fas fa-trash-alt"></i> Xóa dự thảo
                        </button>
                        <button onClick={handleExport} className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 border border-blue-700"><i className="fas fa-file-export"></i> {t('ord_export_btn')}</button>
                    </div>
                </div>
                {/* ─── Scrollable table area (overflow-auto = both axes, scrollbar always at viewport edge) ─── */}
                <div
                    ref={tableScrollRef}
                    className="overflow-auto flex-1 relative custom-scrollbar"
                >
                    <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1800px]">
                        <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 sticky top-0 z-30">
                            <tr className="text-xs uppercase font-black tracking-wider">
                                <th className="px-4 py-4 w-12 text-center text-slate-400 border-b border-slate-200 sticky left-0 z-40 bg-slate-50/95 shadow-sm"><Typography variant="label">#</Typography></th>
                                <th className="px-4 py-4 min-w-[200px] sticky left-12 z-40 bg-slate-50/95 border-b border-slate-200 sticky-column-shadow"><Typography variant="label">{t('ord_th_sku')}</Typography></th>
                                <th className="px-4 py-4 min-w-[145px] text-right border-b border-slate-200"><Typography variant="label">{t('ord_th_health')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200"><Typography variant="label">{t('th_incoming')}</Typography></th>
                                <th className="px-4 py-4 border-b border-slate-200 min-w-[90px] text-center"><Typography variant="label">{t('ord_th_debt')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[100px]"><Typography variant="label">{t('ord_th_demand')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[120px]"><Typography variant="label">{t('ord_th_momentum')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200 min-w-[80px]"><Typography variant="label">{t('ord_th_mos')}</Typography></th>
                                <th className="px-4 py-4 text-center border-b border-slate-200"><Typography variant="label">{t('ord_th_dealer_cst')}</Typography></th>
                                <th className="px-4 py-4 text-center border-x border-slate-200 bg-rose-50/10 border-b border-slate-200"><Typography variant="label" className="text-rose-600">{t('ord_th_air')}</Typography></th>
                                <th className="px-4 py-4 text-center border-r border-slate-200 bg-blue-50/10 border-b border-slate-200"><Typography variant="label" className="text-blue-600">{t('ord_th_sea')}</Typography></th>
                                <th className="px-4 py-4 min-w-[150px] border-b border-slate-200">{t('ord_th_note')}</th>
                                <th className="px-4 py-4 text-right sticky right-0 z-40 bg-slate-50/95 border-b border-slate-200 border-l border-slate-200">{t('ord_th_amount')}</th>
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
                                                <div className="font-black text-slate-800 text-base uppercase cursor-pointer hover:text-blue-600 font-mono tracking-tight">{item.ItemCode}</div>
                                                <SupersessionIndicator partNumber={item.ItemCode} graph={graph} onClick={(e) => { e.stopPropagation(); onItemSelect(item); }} />
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold truncate max-w-[200px]">{item.ItemName}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-black px-1.5 py-0.5 rounded uppercase bg-blue-50 text-blue-700 border border-blue-100">LOIS {item.LOISGroup}</span>
                                                {item.SourceId && (
                                                    <span className="text-2xs font-black px-1.5 py-0.5 rounded uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                        {item.SourceId}
                                                    </span>
                                                )}
                                                {item.TypeCar && (
                                                    <span className="text-2xs font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                                        {item.TypeCar}
                                                    </span>
                                                )}
                                                <span className={`text-xs font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1 border ${item.TrendFlag === 'Up' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-50 border-slate-100'}`}><i className={`fas fa-${item.TrendFlag === 'Up' ? 'arrow-trend-up' : 'minus'}`}></i> {item.TrendFlag}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right border-b border-slate-50">
                                            <div className="flex flex-col items-end">
                                                <ConsolidatedStockCell item={item} allItems={enrichedList} graph={graph} />
                                                <StockProgressBar current={item.computed?.available || 0} rop={item.computed?.rop || 0}
                                                    // O6 Fix: max fallback dùng 0 nếu isStop, không dùng 100 tùy tiện
                                                    max={item.computed?.isStopBiz ? 0 : (item.computed?.stockMax || 1)}
                                                    ss={item.computed?.safetyStock} onOrder={item.TotalPO} incoming={incomingThisMonth} backorder={item.Backorder} breakdown={item.BackorderBreakdown} draftAdd={draftQtyTotal} baseFc={item.BaseForecast} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50"><div className={`text-base font-black ${incomingThisMonth > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{incomingThisMonth > 0 ? `+${incomingThisMonth.toLocaleString()}` : '-'}</div>{incomingThisMonth > 0 && <div className="text-2xs font-bold text-blue-400 uppercase leading-tight">Về trong tháng</div>}</td>
                                        <td className="px-4 py-3 border-b border-slate-50"><CombinedDebtStatusBadge item={item} draftQty={draftQtyTotal} /></td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            <div className="flex flex-col items-center">
                                                <div className="font-black text-slate-900 text-base leading-tight">{(m1Actual || 0).toLocaleString()}</div>
                                                <div className="text-xs font-black text-emerald-600 uppercase leading-tight">FC: {item.BaseForecast ? (item.BaseForecast >= 10 ? Math.round(item.BaseForecast).toLocaleString() : item.BaseForecast.toFixed(1)) : '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            <SalesMomentum values={[item.AvgQty24M, item.AvgQty12M, item.AvgQty6M, item.AvgQty3M]} history={item.SalesHistory} forecast={item.BaseForecast} />
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50"><div className={`text-base font-black ${item.computed!.mos < 1 ? 'text-rose-700' : (item.computed!.mos > 12 ? 'text-amber-700' : 'text-emerald-700')}`}>{(item.computed?.mos || 0).toFixed(1)} <span className="text-xs text-slate-500">M</span></div></td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50"><div className="text-sm font-black text-slate-800">{(item.DealerInventory || 0).toLocaleString()}</div><div className="mt-1 flex flex-col items-center"><div className={`text-sm font-black px-2 py-0.5 rounded-full transition-all duration-500 ${isCstImproved ? 'bg-blue-600 text-white border border-blue-700 scale-110' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>CST: {(displayCst || 0).toFixed(1)}</div></div></td>
                                        <td className="px-4 py-3 border-x border-slate-100 bg-rose-50/10 text-center border-b border-slate-50">
                                            <input type="number" value={d.air || ''} onChange={e => handleQtyChange(item.ItemCode, 'air', parseInt(e.target.value) || 0)} className="w-20 text-center font-black text-sm border border-rose-200 rounded-xl p-2 focus:border-rose-400 outline-none bg-white transition-all text-rose-700" placeholder="0" />
                                            {((item.computed?.suggestedBO || 0) > 0) && d.air === 0 && (
                                                <button onClick={() => handleQtyChange(item.ItemCode, 'air', item.computed!.suggestedBO!)} className="block mx-auto mt-1.5 text-xs font-black text-rose-600 hover:text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">BO: {item.computed.suggestedBO}</button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 bg-blue-50/10 text-center border-b border-slate-50">
                                            <input type="number" value={d.sea || ''} onChange={e => handleQtyChange(item.ItemCode, 'sea', parseInt(e.target.value) || 0)} className="w-20 text-center font-black text-sm border border-blue-200 rounded-xl p-2 focus:border-blue-400 outline-none bg-white transition-all text-blue-700" placeholder="0" />
                                            {((item.computed?.gapOrExcess || 0) > 0) && d.sea === 0 && (
                                                <button 
                                                    onClick={() => {
                                                        const isDecline = item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE');
                                                        const targetVal = isDecline 
                                                            ? Math.max(0, (item.computed?.rop || 0) - (item.computed?.available || 0) - (item.TotalPO || 0))
                                                            : item.computed!.gapOrExcess!;
                                                        handleQtyChange(item.ItemCode, 'sea', Math.ceil((targetVal || 1) / (item.SNP || 1)) * (item.SNP || 1));
                                                    }} 
                                                    className={`block mx-auto mt-1.5 text-xs font-black px-2 py-0.5 rounded-full border transition-all ${
                                                        item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE')
                                                            ? 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-100'
                                                            : 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100'
                                                    }`}
                                                >
                                                    {item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE') ? 'Thận trọng: ' : 'Suggest: '}
                                                    {item.computed?.warnings?.some(w => w.code === 'TREND_DECLINE') 
                                                        ? Math.ceil(Math.max(0, (item.computed?.rop || 0) - (item.computed?.available || 0) - (item.TotalPO || 0)) / (item.SNP || 1)) * (item.SNP || 1)
                                                        : item.computed.gapOrExcess}
                                                </button>
                                            )}
                                            {item.computed?.transfer && item.computed.transfer.transferNBtoBB > 0 && (
                                                <div className="mt-1 flex justify-center"><span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200" title="Chuyển từ NB sang BB">NB <i className="fas fa-arrow-right mx-0.5"></i> BB: {item.computed.transfer.transferNBtoBB}</span></div>
                                            )}
                                            {item.computed?.transfer && item.computed.transfer.transferBBtoNB > 0 && (
                                                <div className="mt-1 flex justify-center"><span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase border border-amber-200" title="Chuyển từ BB sang NB">BB <i className="fas fa-arrow-right mx-0.5"></i> NB: {item.computed.transfer.transferBBtoNB}</span></div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 border-b border-slate-50"><textarea value={orderNotes[item.ItemCode] || ''} onChange={e => setOrderNotes(p => ({ ...p, [item.ItemCode]: e.target.value }))} className="w-full text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:border-blue-300 resize-none h-10" placeholder="..." /></td>
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
                <div className="p-4 border-t-2 border-slate-200 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-600 bg-white">
                    <div className="flex items-center gap-4">
                        <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 font-bold text-sm">
                            <option value={20}>20 {t('common_rows')}</option>
                            <option value={50}>50 {t('common_rows')}</option>
                            <option value={100}>100 {t('common_rows')}</option>
                        </select>
                        <span className="text-slate-400">{t('common_total')}: <span className="text-slate-700">{filteredData.length}</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="pagination-pill text-slate-600"><i className="fas fa-chevron-left text-xs"></i></button>
                        {[...Array(totalPages)].map((_, i) => {
                            const page = i + 1;
                            if (totalPages > 7 && Math.abs(currentPage - page) > 2 && page !== 1 && page !== totalPages) {
                                if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>;
                                return null;
                            }
                            return <button key={i} onClick={() => setCurrentPage(page)} className={`pagination-pill ${currentPage === page ? 'active' : 'text-slate-600'}`}>{page}</button>;
                        })}
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="pagination-pill text-slate-600"><i className="fas fa-chevron-right text-xs"></i></button>
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
                onLoadDraft={(draft) => {
                    setOrderQuantities(prev => ({ ...prev, ...draft.quantities }));
                    setOrderNotes(prev => ({ ...prev, ...draft.notes }));
                }}
            />
        </div >
    );
};
