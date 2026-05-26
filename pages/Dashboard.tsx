import React, { useMemo, useState, useEffect, useDeferredValue } from 'react';
import {
    InventoryItem,
    DashboardSettings,
    InventoryFilters,
    DEFAULT_FILTERS,
    COST_RANGES,
    FOB_COST_RANGES,
    getDebtStatus,
    OrderingDraft,
    LoisProfile,
} from '../types/inventory';
import { FilterPanel } from '../components/FilterPanel';
import { MetricCard } from '../components/MetricCard';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { Typography } from '../components/Typography';
import { parseInventorySearch, SearchResult, matchSearch, prepareSearchCache } from '../utils/searchLogic';
import { useLanguage } from '../utils/i18n';
import { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';
import { AppSettings } from './Settings';
import { CsvExportOptions } from '../utils/csvParser';
import { DemandIntelligence } from './DemandIntelligence';
import { SupersessionManagement } from './SupersessionManagement';
import { useDevice } from '../hooks/useDevice';
import { LoisRow } from './dashboard/LoisRow';
import { openPrintWindow } from './dashboard/DashboardPrint';

import { FaIcon } from '../components/Icon';
const DEFAULT_LOIS_PROFILES: LoisProfile[] = [];

const getLoisSubgroup = (item: InventoryItem): string => {
    return (item.LOISGroup || '').trim().toUpperCase();
};

export type DashboardSubTab = 'overview' | 'intelligence' | 'supersession';

export const Dashboard = ({
    data,
    enrichedData,
    isEngineProcessing,
    onItemSelect,
    initialParams,
    initialState,
    onSaveState,
    draftData,
    graph,
    appSettings,
    onUpdateSettings,
    supersessionProps,
}: {
    data: InventoryItem[];
    enrichedData?: InventoryItem[];
    isEngineProcessing?: boolean;
    onItemSelect: (item: InventoryItem) => void;
    initialParams?: any;
    initialState?: any;
    onSaveState?: (s: any) => void;
    draftData?: OrderingDraft;
    graph?: SupersessionGraph;
    appSettings?: AppSettings;
    onUpdateSettings?: (s: AppSettings) => void;
    supersessionProps?: {
        mappings: SupersessionMapping[];
        onUpdateMappings: (mappings: SupersessionMapping[]) => void;
        onAddMapping: () => void;
        onEditMapping: (mapping: SupersessionMapping) => void;
    };
}) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();
    const fallbackData = data; // Unused if enrichedData is passed correctly
    const activeEnrichedData = enrichedData || fallbackData;

    const loisProfiles = appSettings?.loisProfiles || DEFAULT_LOIS_PROFILES;

    const LOIS_HIERARCHY = useMemo(() => {
        const groups: Record<string, string[]> = {};
        loisProfiles.forEach(p => {
            const pg = p.parentGroup || 'U';
            if (!groups[pg]) groups[pg] = [];
            groups[pg].push(p.id);
        });

        const colorMap: Record<string, string> = {
            L: 'bg-atp-secondary',
            O: 'bg-atp-accent',
            I: 'bg-slate-400',
            S: 'bg-atp-primary',
            U: 'bg-slate-300',
        };

        return Object.entries(groups).map(([label, sub]) => ({
            label: label,
            sub: sub,
            color: colorMap[label] || 'bg-slate-500',
        }));
    }, [loisProfiles]);

    const [subTab, setSubTab] = useState<DashboardSubTab>(initialState?.subTab || 'overview');
    const [settings, setSettings] = useState<DashboardSettings>(
        initialState?.settings || {
            snapshotDate: new Date().toISOString().split('T')[0],
            warehouseScope: 'All',
            costBasis: 'PP',
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
    const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
    const [searchResult, setSearchResult] = useState<SearchResult>({
        type: 'EMPTY',
        tokens: [],
        displayTokens: [],
        raw: '',
    });
    const [showSimulation, setShowSimulation] = useState(false);

    const deferredFilters = useDeferredValue(filters);
    const deferredSearchResult = useDeferredValue(searchResult);
    const deferredSelectedSubgroup = useDeferredValue(selectedSubgroup);

    useEffect(() => {
        if (onSaveState) onSaveState({ settings, filters, subTab });
    }, [settings, filters, subTab, onSaveState]);

    const handleFiltersChange = (newFilters: InventoryFilters) => {
        if (newFilters.search !== filters.search) setSearchResult(parseInventorySearch(newFilters.search));
        setFilters(newFilters);
    };

    const formatCurrency = (val: number) => {
        const safeVal = val || 0;
        if (settings.costBasis === 'PP') {
            const inMillions = Math.round(safeVal / 1000000);
            return new Intl.NumberFormat('en-US').format(inMillions) + ' tr';
        }
        return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', notation: 'compact' }).format(
            safeVal,
        );
    };
    // Same as formatCurrency but without the unit suffix — used in table cells that have units in headers
    const formatNum = (val: number) => formatCurrency(val).replace(/ tr$/, '');

    // ═══ O10/O12 FIX: EnrichedData now computed centrally in App.tsx ═══
    // Dashboard just uses the activeEnrichedData directly.

    const { matrixData, grandStats, deltaStats, criticalStockouts, printData } = useMemo(() => {
        // SINGLE-PASS: Compute current matrix, simulation matrix, AND active-view matrix simultaneously.
        // Previously this was 1 loop here + 2 more loops in handlePrint = 3x 50K iterations.
        // Now: 1 loop total, handlePrint reuses printData.
        const matrix: Record<string, any> = {};
        const curMatrix: Record<string, any> = {};
        const simMatrix: Record<string, any> = {};
        const emptyBucket = () => ({
            items: 0,
            turnover: 0,
            noStock: 0,
            short: 0,
            stockVal: 0,
            poVal: 0,
            excessItems: 0,
            excessVal: 0,
            boItems: 0,
            boValue: 0,
            bmwCount: 0,
            trendSum: 0,
            trendCount: 0,
        });

        let grandTurnover = 0,
            grandStock = 0,
            grandPOVal = 0,
            grandExcess = 0;
        let grandNoStock = 0,
            grandShort = 0,
            grandExcessItems = 0;
        let grandBOItems = 0,
            grandBOValue = 0;
        let deltaStockoutResolved = 0,
            deltaExcessAdded = 0,
            deltaStockValAdded = 0;
        let criticalStockoutsCount = 0;

        // Simulation grand stats
        let sGT = 0,
            sGS = 0,
            sGPO = 0,
            sGEx = 0,
            sGNS = 0,
            sGSh = 0,
            sGEI = 0,
            sGBI = 0,
            sGBV = 0;
        // Current grand stats
        let cGT = 0,
            cGS = 0,
            cGPO = 0,
            cGEx = 0,
            cGNS = 0,
            cGSh = 0,
            cGEI = 0,
            cGBI = 0,
            cGBV = 0;
        let dSOR = 0,
            dEA = 0,
            dSA = 0;

        activeEnrichedData.forEach(item => {
            const comp = item.computed!;
            const sim = comp.simulated!;
            const sub = getLoisSubgroup(item);
            const isBmw = (item.TypeCar || '').toUpperCase().includes('BMW');

            // Shared computed values
            const sales12M = item.SalesHistory.reduce((a, b) => a + b, 0);
            const last6 = item.SalesHistory.slice(-6).reduce((a, b) => a + b, 0);
            const first6 = item.SalesHistory.slice(0, 6).reduce((a, b) => a + b, 0);
            const itemTrend = first6 > 0 ? ((last6 - first6) / first6) * 100 : 0;
            const turnVal = sales12M * comp.unitCost;

            // ── Active-view matrix (used by on-screen table) ──
            const activeStockVal = (showSimulation ? sim.stockValue : comp.stockValue) || 0;
            const activeExcessVal = (showSimulation ? sim.excessValue : comp.excessValue) || 0;
            const activeIsShort = showSimulation ? sim.stockoutRiskFlag : comp.stockoutRiskFlag;
            const activeIsNoStock =
                (showSimulation ? sim.totalStock <= 0 : comp.available <= 0) && item.BaseForecast > 0.02;
            const activeExcessQty = (showSimulation ? sim.excessQty : comp.excessQty) || 0;
            const poVal = showSimulation ? sim.totalIncomingValue || 0 : (item.TotalPO || 0) * comp.unitCost;
            const isBO = showSimulation ? sim.boQty > 0 : (item.Backorder || 0) > (comp.available || 0);
            const boVal = showSimulation
                ? sim.boValue || 0
                : isBO
                  ? Math.max(0, (item.Backorder || 0) - (comp.available || 0)) * comp.unitCost
                  : 0;

            grandTurnover += turnVal || 0;
            grandStock += activeStockVal || 0;
            grandPOVal += poVal || 0;
            grandExcess += activeExcessVal || 0;
            if (isBO) {
                grandBOItems++;
                grandBOValue += boVal;
            }

            if (
                ['1', '2', '3'].includes(item.LOISGroup) &&
                (comp.available <= 0 || comp.stockoutRiskFlag) &&
                item.BaseForecast > 0.02
            ) {
                criticalStockoutsCount++;
            }
            if (showSimulation) {
                if (comp.stockoutRiskFlag && !sim.stockoutRiskFlag) deltaStockoutResolved++;
                if (sim.excessValue > comp.excessValue) deltaExcessAdded += sim.excessValue - comp.excessValue || 0;
                deltaStockValAdded += sim.stockValue - comp.stockValue || 0;
            }

            if (!matrix[sub]) matrix[sub] = emptyBucket();
            matrix[sub].items++;
            matrix[sub].turnover += turnVal || 0;
            if (activeIsNoStock) {
                matrix[sub].noStock++;
                grandNoStock++;
            }
            if (activeIsShort) {
                matrix[sub].short++;
                grandShort++;
            }
            matrix[sub].stockVal += activeStockVal || 0;
            matrix[sub].poVal += poVal || 0;
            if (activeExcessQty > 0) {
                matrix[sub].excessItems++;
                grandExcessItems++;
            }
            matrix[sub].excessVal += activeExcessVal || 0;
            if (isBO) {
                matrix[sub].boItems++;
                matrix[sub].boValue += boVal;
            }
            if (isBmw) matrix[sub].bmwCount++;
            matrix[sub].trendSum += itemTrend;
            matrix[sub].trendCount++;

            // ── CURRENT matrix (for print page 1) ──
            const curPO = (item.TotalPO || 0) * comp.unitCost;
            const curIsBO = (item.Backorder || 0) > (comp.available || 0);
            const curBoVal = curIsBO ? Math.max(0, (item.Backorder || 0) - (comp.available || 0)) * comp.unitCost : 0;

            if (!curMatrix[sub]) curMatrix[sub] = emptyBucket();
            curMatrix[sub].items++;
            curMatrix[sub].turnover += turnVal;
            curMatrix[sub].stockVal += comp.stockValue || 0;
            curMatrix[sub].poVal += curPO;
            curMatrix[sub].excessVal += comp.excessValue || 0;
            curMatrix[sub].trendSum += itemTrend;
            curMatrix[sub].trendCount++;
            if (comp.available <= 0 && item.BaseForecast > 0.02) {
                curMatrix[sub].noStock++;
                cGNS++;
            }
            if (comp.stockoutRiskFlag) {
                curMatrix[sub].short++;
                cGSh++;
            }
            if ((comp.excessQty || 0) > 0) {
                curMatrix[sub].excessItems++;
                cGEI++;
            }
            if (curIsBO) {
                curMatrix[sub].boItems++;
                curMatrix[sub].boValue += curBoVal;
                cGBI++;
                cGBV += curBoVal;
            }
            if (isBmw) curMatrix[sub].bmwCount++;
            cGT += turnVal;
            cGS += comp.stockValue || 0;
            cGPO += curPO;
            cGEx += comp.excessValue || 0;

            // ── SIMULATION matrix (for print page 2) ──
            const simPO = sim.totalIncomingValue || 0;
            const simIsBO = sim.boQty > 0;
            const simBoVal = sim.boValue || 0;

            if (!simMatrix[sub]) simMatrix[sub] = emptyBucket();
            simMatrix[sub].items++;
            simMatrix[sub].turnover += turnVal;
            simMatrix[sub].stockVal += sim.stockValue || 0;
            simMatrix[sub].poVal += simPO;
            simMatrix[sub].excessVal += sim.excessValue || 0;
            simMatrix[sub].trendSum += itemTrend;
            simMatrix[sub].trendCount++;
            if (sim.totalStock <= 0 && item.BaseForecast > 0.02) {
                simMatrix[sub].noStock++;
                sGNS++;
            }
            if (sim.stockoutRiskFlag) {
                simMatrix[sub].short++;
                sGSh++;
            }
            if ((sim.excessQty || 0) > 0) {
                simMatrix[sub].excessItems++;
                sGEI++;
            }
            if (simIsBO) {
                simMatrix[sub].boItems++;
                simMatrix[sub].boValue += simBoVal;
                sGBI++;
                sGBV += simBoVal;
            }
            if (isBmw) simMatrix[sub].bmwCount++;
            if (comp.stockoutRiskFlag && !sim.stockoutRiskFlag) dSOR++;
            if ((sim.excessValue || 0) > (comp.excessValue || 0))
                dEA += (sim.excessValue || 0) - (comp.excessValue || 0);
            dSA += (sim.stockValue || 0) - (comp.stockValue || 0);
            sGT += turnVal;
            sGS += sim.stockValue || 0;
            sGPO += simPO;
            sGEx += sim.excessValue || 0;
        });

        return {
            matrixData: matrix,
            grandStats: {
                grandTurnover,
                grandStock,
                grandPOVal,
                grandExcess,
                totalSKUs: data.length,
                grandNoStock,
                grandShort,
                grandExcessItems,
                grandBOItems,
                grandBOValue,
            },
            deltaStats: { deltaStockoutResolved, deltaExcessAdded, deltaStockValAdded },
            criticalStockouts: criticalStockoutsCount,
            // Pre-computed print data — eliminates 2 extra 50K loops in handlePrint
            printData: {
                curMatrix,
                curGS: {
                    grandTurnover: cGT,
                    grandStock: cGS,
                    grandPOVal: cGPO,
                    grandExcess: cGEx,
                    totalSKUs: data.length,
                    grandNoStock: cGNS,
                    grandShort: cGSh,
                    grandExcessItems: cGEI,
                    grandBOItems: cGBI,
                    grandBOValue: cGBV,
                },
                simMatrix,
                simGS: {
                    grandTurnover: sGT,
                    grandStock: sGS,
                    grandPOVal: sGPO,
                    grandExcess: sGEx,
                    totalSKUs: data.length,
                    grandNoStock: sGNS,
                    grandShort: sGSh,
                    grandExcessItems: sGEI,
                    grandBOItems: sGBI,
                    grandBOValue: sGBV,
                },
                deltaStockoutResolved: dSOR,
                deltaExcessAdded: dEA,
                deltaStockValAdded: dSA,
            },
        };
    }, [activeEnrichedData, showSimulation]);

    const indexedData = useMemo(() => {
        return prepareSearchCache(activeEnrichedData);
    }, [activeEnrichedData]);

    const filteredList = useMemo(() => {
        let result = indexedData;
        if (deferredSelectedSubgroup) {
            result = result.filter(item => getLoisSubgroup(item) === deferredSelectedSubgroup);
        }
        return result.filter(i => {
            if (!matchSearch(i, deferredSearchResult)) return false;
            if (deferredFilters.priority !== 'All' && i.computed?.priorityBucket !== deferredFilters.priority)
                return false;
            if (deferredFilters.status !== 'All' && i.Status !== deferredFilters.status) return false;
            if (deferredFilters.lois.length > 0 && !deferredFilters.lois.includes(i.LOISGroup)) return false;
            if (deferredFilters.trend !== 'All' && i.TrendFlag !== deferredFilters.trend) return false;

            if (deferredFilters.costRange > 0) {
                const range = COST_RANGES[deferredFilters.costRange];
                if (i.UnitCost_PP < range.min || i.UnitCost_PP >= range.max) return false;
            }
            if (deferredFilters.fobCostRange > 0) {
                const range = FOB_COST_RANGES[deferredFilters.fobCostRange];
                if (i.UnitCost_FOB < range.min || i.UnitCost_FOB >= range.max) return false;
            }
            if (deferredFilters.specialFilter === 'stockout' && !i.computed?.stockoutRiskFlag) return false;
            if (deferredFilters.specialFilter === 'critical_stockout') {
                const comp = i.computed;
                const isCriticalMatch =
                    comp &&
                    ['1', '2', '3'].includes(i.LOISGroup) &&
                    (comp.available <= 0 || comp.stockoutRiskFlag) &&
                    i.BaseForecast > 0.02;
                if (!isCriticalMatch) return false;
            }
            if (deferredFilters.specialFilter === 'excess' && (i.computed?.excessQty || 0) <= 0) return false;
            if (deferredFilters.specialFilter === 'has_seasonality' && (i.computed?.ssi || 1) <= 1.0) return false;
            if (deferredFilters.specialFilter === 'has_po' && (i.TotalPO || 0) <= 0) return false;
            if (deferredFilters.specialFilter === 'has_supersession') {
                if (!graph) return false;
                const chain = graph.getChain(i.ItemCode);
                if (!chain || chain.allParts.length <= 1) return false;
            }
            if (deferredFilters.showBackorders && i.Backorder <= 0) return false;
            if (deferredFilters.debtStatus && deferredFilters.debtStatus.length > 0) {
                const status = getDebtStatus(i);
                if (!deferredFilters.debtStatus.includes(status)) return false;
            }
            if (deferredFilters.source && deferredFilters.source.length > 0) {
                const sourceKey = `${i.BrandName || ''}|${i.SourceId || ''}`;
                if (!deferredFilters.source.includes(sourceKey)) return false;
            }
            return true;
        });
    }, [indexedData, deferredSelectedSubgroup, deferredSearchResult, deferredFilters, graph]);

    // Functional update for subgroup toggle to keep callback stable
    const handleToggleSubgroup = React.useCallback((subKey: string) => {
        setSelectedSubgroup(prev => (prev === subKey ? null : subKey));
    }, []);

    const handlePrint = () => {
        openPrintWindow({
            data,
            appSettings,
            loisProfiles,
            LOIS_HIERARCHY,
            formatCurrency,
            printData,
        });
    };

    return (
        <div className="animate-fadeIn space-y-4 pb-32">
            {/* Compact Header — title + stats + sub-tabs in one band */}
            <div className="bg-gradient-professional rounded-2xl text-white relative overflow-hidden shadow-glass border border-white/10">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40"></div>
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                {/* Top row: title + stats */}
                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between px-6 py-4 gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                            <FaIcon className="fas fa-chart-simple text-blue-400" />
                        </div>
                        <div className="overflow-hidden">
                            <Typography
                                variant="h2"
                                className="tracking-tight uppercase text-white !text-xl workbench-title leading-none truncate"
                            >
                                {t('nav_dashboard')}
                            </Typography>
                            <Typography
                                variant="label"
                                className="text-white/50 !text-[10px] font-medium supply-chain-data truncate block"
                            >
                                {t('app_subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">SKU</span>
                            <span className="text-sm font-black text-white">
                                {grandStats.totalSKUs.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-400/20 px-3 py-2 rounded-xl">
                            <FaIcon className="fas fa-circle-xmark text-rose-400 text-[10px]" />
                            <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest">OOS</span>
                            <span className="text-sm font-black text-rose-300">{grandStats.grandNoStock}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/20 px-3 py-2 rounded-xl">
                            <FaIcon className="fas fa-triangle-exclamation text-amber-400 text-[10px]" />
                            <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">
                                Risk
                            </span>
                            <span className="text-sm font-black text-amber-300">{grandStats.grandShort}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom row: sub-tab nav */}
                <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1 overflow-x-auto custom-scrollbar no-scrollbar-at-mobile">
                    {(
                        [
                            { id: 'overview' as const, label: t('nav_dashboard'), icon: 'fa-chart-simple' },
                            { id: 'intelligence' as const, label: 'Demand Intelligence', icon: 'fa-brain' },
                            { id: 'supersession' as const, label: t('nav_supersession'), icon: 'fa-arrows-rotate' },
                        ] as const
                    ).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                ${
                                    subTab === tab.id
                                        ? 'bg-white/15 text-white border border-white/25 shadow-inner'
                                        : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <FaIcon
                                className={`fas ${tab.icon} text-[10px] ${subTab === tab.id ? 'text-blue-300' : ''}`}
                            />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sub-Tab Content */}
            {subTab === 'intelligence' && (
                <DemandIntelligence
                    data={enrichedData}
                    onItemSelect={onItemSelect}
                    appSettings={appSettings}
                    seasonalityTuning={settings.seasonalityTuning}
                    updateTuning={t => {
                        setSettings(prev => ({ ...prev, seasonalityTuning: t }));
                        if (onUpdateSettings && appSettings) {
                            onUpdateSettings({ ...appSettings, seasonalityTuning: t });
                        }
                    }}
                    initialState={initialState?.demandState}
                    onSaveState={s => {
                        if (onSaveState) onSaveState({ settings, filters, subTab, demandState: s });
                    }}
                />
            )}

            {subTab === 'supersession' && supersessionProps && (
                <SupersessionManagement
                    data={data}
                    mappings={supersessionProps.mappings}
                    onUpdateMappings={supersessionProps.onUpdateMappings}
                    onItemSelect={onItemSelect}
                    onAddMapping={supersessionProps.onAddMapping}
                    onEditMapping={supersessionProps.onEditMapping}
                />
            )}

            {subTab === 'overview' && (
                <>
                    {/* Alert + KPI row */}
                    <div className="flex flex-col gap-3 no-print">
                        {/* Compact alert — inline above KPI */}
                        {criticalStockouts > 0 && (
                            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl animate-fadeIn">
                                <FaIcon className="fas fa-triangle-exclamation text-rose-500 text-sm shrink-0" />
                                <span className="text-sm font-bold text-rose-800 flex-1">
                                    <span className="font-black">{criticalStockouts}</span> mã stockout ưu tiên cao cần
                                    xử lý ngay
                                </span>
                                <button
                                    onClick={() => {
                                        handleFiltersChange({
                                            ...filters,
                                            priority: 'All',
                                            specialFilter: 'critical_stockout',
                                        });
                                        setTimeout(
                                            () =>
                                                document
                                                    .getElementById('inventory-table-section')
                                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                            100,
                                        );
                                    }}
                                    className="shrink-0 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide hover:bg-rose-700 transition-colors flex items-center gap-1.5"
                                >
                                    <FaIcon className="fas fa-arrow-right text-[10px]" /> Xem ngay
                                </button>
                            </div>
                        )}

                        {/* KPI GRID */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <MetricCard
                                label={t('kpi_turnover')}
                                value={formatCurrency(grandStats.grandTurnover)}
                                subValue={t('kpi_turnover_sub')}
                                icon="fa-arrow-trend-up"
                                color="professional"
                                onClick={() => {}}
                            />
                            <MetricCard
                                label={t('kpi_stock')}
                                value={formatCurrency(grandStats.grandStock)}
                                subValue={t('kpi_stock_sub')}
                                icon="fa-warehouse"
                                color="emerald"
                                onClick={() => {
                                    handleFiltersChange({ ...filters, specialFilter: 'critical_stockout' });
                                    setTimeout(
                                        () =>
                                            document
                                                .getElementById('inventory-table-section')
                                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                        100,
                                    );
                                }}
                            />
                            <MetricCard
                                label={t('kpi_pipeline')}
                                value={formatCurrency(grandStats.grandPOVal)}
                                subValue={t('kpi_pipeline_sub')}
                                icon="fa-truck-fast"
                                color="blue"
                                onClick={() => {}}
                            />
                            <MetricCard
                                label={t('kpi_excess')}
                                value={formatCurrency(grandStats.grandExcess)}
                                subValue="Impact Value"
                                icon="fa-circle-exclamation"
                                color="rose"
                                onClick={() => {
                                    handleFiltersChange({ ...filters, specialFilter: 'excess' });
                                    setTimeout(
                                        () =>
                                            document
                                                .getElementById('inventory-table-section')
                                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                        100,
                                    );
                                }}
                            />
                        </div>
                    </div>

                    <div
                        id="inventory-table-section"
                        className="bg-white border border-slate-200/60 shadow-soft rounded-3xl overflow-hidden hover:shadow-medium transition-shadow min-h-[400px]"
                    >
                        {showSimulation && (
                            <div className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 px-6 py-4 flex items-center justify-between no-print animate-fadeIn">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-blue flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                        <FaIcon className="fas fa-microchip-ai" />
                                    </div>
                                    <div>
                                        <Typography variant="h3" className="text-blue-900 font-bold">
                                            Simulation Active
                                        </Typography>
                                        <Typography variant="label" className="text-blue-600 block">
                                            Including Draft + PO
                                        </Typography>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-left sm:text-right w-full sm:w-auto">
                                    <div className="flex items-center sm:block gap-3">
                                        <div className="text-xs text-blue-400 font-black uppercase">
                                            Stockout Resolved
                                        </div>
                                        <div className="text-2xl font-black text-emerald-600">
                                            -{deltaStats.deltaStockoutResolved}
                                        </div>
                                    </div>
                                    <div className="flex items-center sm:block gap-3">
                                        <div className="text-xs text-blue-400 font-black uppercase">Capital Added</div>
                                        <div className="text-2xl font-black text-slate-900">
                                            {formatCurrency(deltaStats.deltaStockValAdded)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white sticky top-0 z-30">
                            <Typography
                                variant="h2"
                                className="text-slate-900 uppercase tracking-tight flex items-center gap-3"
                            >
                                <FaIcon className="fas fa-grid-horizontal text-blue-600" /> {t('matrix_title')}
                            </Typography>
                            <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                                <div className="lg-segmented">
                                    <button
                                        onClick={() => setShowSimulation(false)}
                                        aria-pressed={!showSimulation}
                                        className={!showSimulation ? 'lg-active' : ''}
                                    >
                                        {t('current')}
                                    </button>
                                    <button
                                        onClick={() => setShowSimulation(true)}
                                        aria-pressed={showSimulation}
                                        className={showSimulation ? 'lg-active' : ''}
                                    >
                                        Simulated
                                    </button>
                                </div>
                                <button
                                    onClick={handlePrint}
                                    className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all hover:text-blue-600 shrink-0"
                                >
                                    <FaIcon className="fas fa-print" />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: isMobile ? '120px' : '145px' }} /> {/* Nhóm */}
                                    <col style={{ width: '100px' }} /> {/* Turnover */}
                                    <col style={{ width: '68px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* % Turn */}
                                    <col style={{ width: '60px' }} /> {/* SKU */}
                                    <col style={{ width: '60px' }} /> {/* OOS */}
                                    <col style={{ width: '60px' }} className={isMobile ? 'hidden' : ''} /> {/* Risk */}
                                    <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* Stock Val */}
                                    <col style={{ width: '75px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* MOS w Tgt */}
                                    <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* PO Val */}
                                    <col style={{ width: '60px' }} /> {/* BO # */}
                                    <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* BO Val */}
                                    <col style={{ width: '60px' }} className={isMobile ? 'hidden' : ''} /> {/* Exc # */}
                                    <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* Exc Val */}
                                    <col style={{ width: '75px' }} className={isMobile ? 'hidden' : ''} />{' '}
                                    {/* % Exc w Tgt */}
                                </colgroup>
                                <thead className="bg-slate-50/50 border-b border-slate-200/60 backdrop-blur-sm">
                                    <tr>
                                        <th className="px-3 py-3 border-r border-slate-100">
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-slate-900"
                                            >
                                                {t('matrix_segment')}
                                            </Typography>
                                        </th>
                                        <th className="px-3 py-3 text-right">
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-slate-900"
                                            >
                                                Turnover
                                            </Typography>
                                        </th>
                                        <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-extrabold text-[11px] !italic text-slate-500"
                                            >
                                                % Turn
                                            </Typography>
                                        </th>
                                        <th className="px-3 py-3 text-center">
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-slate-900"
                                            >
                                                SKU
                                            </Typography>
                                        </th>
                                        <th className="px-3 py-3 text-center">
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-rose-600"
                                            >
                                                OOS
                                            </Typography>
                                        </th>
                                        <th className={`px-3 py-3 text-center ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-amber-600"
                                            >
                                                Risk
                                            </Typography>
                                        </th>
                                        <th
                                            className={`px-3 py-3 text-right bg-blue-50/10 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-emerald-700"
                                            >
                                                Stock Val
                                            </Typography>
                                        </th>
                                        <th
                                            className={`px-3 py-3 text-center border-x border-blue-100 bg-blue-50/10 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] !italic text-slate-600"
                                            >
                                                MOS
                                            </Typography>
                                        </th>
                                        <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-blue-600"
                                            >
                                                PO Val
                                            </Typography>
                                        </th>
                                        <th className="px-3 py-3 text-center bg-rose-50/10">
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-rose-700"
                                            >
                                                BO #
                                            </Typography>
                                        </th>
                                        <th
                                            className={`px-3 py-3 text-right bg-rose-50/10 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-rose-700"
                                            >
                                                BO Val
                                            </Typography>
                                        </th>
                                        <th className={`px-3 py-3 text-center ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-slate-600"
                                            >
                                                Exc #
                                            </Typography>
                                        </th>
                                        <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] text-slate-600"
                                            >
                                                Exc Val
                                            </Typography>
                                        </th>
                                        <th
                                            className={`px-3 py-3 text-center border-l border-slate-200 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="font-extrabold text-[11px] !italic text-slate-500"
                                            >
                                                % Exc
                                            </Typography>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {LOIS_HIERARCHY.map(group => {
                                        const groupStockVal = group.sub.reduce(
                                            (s, k) => s + (matrixData[k]?.stockVal || 0),
                                            0,
                                        );
                                        const groupPoVal = group.sub.reduce(
                                            (s, k) => s + (matrixData[k]?.poVal || 0),
                                            0,
                                        );
                                        if (groupStockVal === 0 && groupPoVal === 0) return null;
                                        return (
                                            <React.Fragment key={group.label}>
                                                <LoisRow
                                                    label={group.label}
                                                    subKeys={group.sub}
                                                    isHeader={true}
                                                    groupColor={group.color}
                                                    matrixData={matrixData}
                                                    grandStats={grandStats}
                                                    loisProfiles={loisProfiles}
                                                    selectedSubgroup={selectedSubgroup}
                                                    onToggleSubgroup={handleToggleSubgroup}
                                                    formatNum={formatNum}
                                                />
                                                {group.sub.length > 0 &&
                                                    group.sub.map(subKey => (
                                                        <LoisRow
                                                            key={subKey}
                                                            label={subKey}
                                                            subKeys={[subKey]}
                                                            matrixData={matrixData}
                                                            grandStats={grandStats}
                                                            loisProfiles={loisProfiles}
                                                            selectedSubgroup={selectedSubgroup}
                                                            onToggleSubgroup={handleToggleSubgroup}
                                                            formatNum={formatNum}
                                                        />
                                                    ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-100 text-slate-900 border-t-2 border-slate-200 shadow-sm sticky bottom-0 z-20">
                                    <tr>
                                        <td className="px-3 py-2.5 border-r border-slate-200 rounded-bl-xl">
                                            <Typography
                                                variant="label"
                                                className="text-slate-500 font-black text-[11px]"
                                            >
                                                TỔNG CỘNG
                                            </Typography>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-slate-900"
                                            >
                                                {formatNum(grandStats.grandTurnover)}
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-2.5 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="label"
                                                className="font-black text-[11px] !italic text-slate-400"
                                            >
                                                100%
                                            </Typography>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-slate-900"
                                            >
                                                {grandStats.totalSKUs.toLocaleString()}
                                            </Typography>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <Typography variant="body" className="font-black text-[13px] text-rose-600">
                                                {grandStats.grandNoStock.toLocaleString()}
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-2.5 text-center ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-amber-600"
                                            >
                                                {grandStats.grandShort.toLocaleString()}
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-2.5 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography variant="body" className="font-black text-[13px] text-blue-700">
                                                {formatNum(grandStats.grandStock)}
                                            </Typography>
                                        </td>
                                        <td
                                            className={`px-3 py-1 text-center border-x border-slate-200 bg-slate-200/50 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="font-black text-[12px] !italic text-blue-800"
                                            >
                                                {(grandStats.grandTurnover > 0
                                                    ? (grandStats.grandStock * 12) / grandStats.grandTurnover
                                                    : 0
                                                ).toFixed(1)}
                                                M
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-4 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-slate-600"
                                            >
                                                {formatNum(grandStats.grandPOVal)}
                                            </Typography>
                                        </td>
                                        <td className="px-3 py-4 text-center bg-rose-50/30">
                                            <Typography variant="body" className="font-black text-[13px] text-rose-700">
                                                {grandStats.grandBOItems.toLocaleString()}
                                            </Typography>
                                        </td>
                                        <td
                                            className={`px-3 py-4 text-right bg-rose-50/30 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography variant="body" className="font-black text-[13px] text-rose-700">
                                                {formatNum(grandStats.grandBOValue)}
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-4 text-center ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-slate-500"
                                            >
                                                {grandStats.grandExcessItems.toLocaleString()}
                                            </Typography>
                                        </td>
                                        <td className={`px-3 py-4 text-right ${isMobile ? 'hidden' : ''}`}>
                                            <Typography
                                                variant="body"
                                                className="font-black text-[13px] text-slate-500"
                                            >
                                                {formatNum(grandStats.grandExcess)}
                                            </Typography>
                                        </td>
                                        <td
                                            className={`px-3 py-4 text-center rounded-br-xl border-l border-slate-200 ${isMobile ? 'hidden' : ''}`}
                                        >
                                            <Typography
                                                variant="label"
                                                className="text-blue-700 font-black text-[12px] !italic"
                                            >
                                                {(grandStats.grandStock > 0
                                                    ? (grandStats.grandExcess / grandStats.grandStock) * 100
                                                    : 0
                                                ).toFixed(1)}
                                                %
                                            </Typography>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <FilterPanel
                        data={data}
                        settings={settings}
                        onSettingsChange={setSettings}
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        sourceName={(() => {
                            const brands = Array.from(new Set(data.map(i => i.BrandName).filter(Boolean)));
                            const sources = Array.from(new Set(data.map(i => i.SourceId).filter(Boolean)));

                            if (brands.length === 1 && sources.length > 1)
                                return `[${brands[0]}] ${sources.length} Sources`;
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
                            if (p) return `[${p.brand || 'Brand'}] ${p.id} – ${p.name}`;

                            return undefined;
                        })()}
                    />
                    <ExecutiveDashboard
                        filteredData={filteredList}
                        allData={data} // PASS FULL DATASET
                        onItemSelect={onItemSelect}
                        settings={settings}
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        searchResult={searchResult}
                        draftData={draftData}
                        graph={graph}
                        exportOptions={
                            appSettings
                                ? ({
                                      separator:
                                          appSettings.exportSeparator === 'semicolon'
                                              ? ';'
                                              : appSettings.exportSeparator === 'tab'
                                                ? '\t'
                                                : ',',
                                      encoding: appSettings.exportEncoding,
                                      decimalPrecision: appSettings.exportDecimalPrecision,
                                      exportColumns: appSettings.exportColumns,
                                  } as CsvExportOptions)
                                : undefined
                        }
                    />
                </>
            )}
        </div>
    );
};
