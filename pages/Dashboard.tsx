
import React, { useMemo, useState, useEffect } from 'react';
import { InventoryItem, DashboardSettings, InventoryFilters, DEFAULT_FILTERS, COST_RANGES, FOB_COST_RANGES, getDebtStatus, OrderingDraft } from '../types/inventory';
import { FilterPanel } from '../components/FilterPanel';
import { MetricCard } from '../components/MetricCard';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { Typography } from '../components/Typography';
import { parseInventorySearch, SearchResult, matchSearch, prepareSearchCache } from '../utils/searchLogic';
import { useLanguage } from '../utils/i18n';
import { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';
import { AppSettings } from './Settings';
import { CsvExportOptions } from '../utils/csvParser';
import { computeInventoryBatch, makeComputeParams } from '../utils/inventoryEngine';
import { DemandIntelligence } from './DemandIntelligence';
import { SupersessionManagement } from './SupersessionManagement';
import { useDevice } from '../hooks/useDevice';

const formatPct = (val: number) => `${(val || 0).toFixed(1)}%`;

const getLoisSubgroup = (item: InventoryItem): string => {
    return (item.LOISGroup || '').trim().toUpperCase();
};

// Derived from appSettings in the component

export type DashboardSubTab = 'overview' | 'intelligence' | 'supersession';

// Rule: rerender-no-inline-components — Extract LoisRow to a separate memoized component
interface LoisRowProps {
    label: string;
    subKeys: string[];
    isHeader?: boolean;
    groupColor?: string;
    matrixData: Record<string, any>;
    grandStats: any;
    loisProfiles: import('../types/inventory').LoisProfile[];
    selectedSubgroup: string | null;
    onToggleSubgroup: (subgroup: string) => void;
    formatNum: (val: number) => string;
}

const LoisRow = React.memo(({
    label, subKeys, isHeader = false, groupColor,
    matrixData, grandStats, loisProfiles, selectedSubgroup,
    onToggleSubgroup, formatNum
}: LoisRowProps) => {
    const { isMobile } = useDevice();

    const row = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0, boItems: 0, boValue: 0, bmwCount: 0, trendSum: 0, trendCount: 0 };
    subKeys.forEach(k => {
        if (matrixData[k]) {
            row.items += matrixData[k].items;
            row.turnover += matrixData[k].turnover;
            row.noStock += matrixData[k].noStock;
            row.short += matrixData[k].short;
            row.stockVal += matrixData[k].stockVal;
            row.poVal += matrixData[k].poVal;
            row.excessItems += matrixData[k].excessItems;
            row.excessVal += matrixData[k].excessVal;
            row.boItems += matrixData[k].boItems;
            row.boValue += matrixData[k].boValue;
            row.bmwCount += matrixData[k].bmwCount;
            row.trendSum += matrixData[k].trendSum;
            row.trendCount += matrixData[k].trendCount;
        }
    });

    if (row.items === 0 && !isHeader) return null;

    const isActive = !isHeader && subKeys.length === 1 && selectedSubgroup === subKeys[0];
    const avgTrend = row.trendCount > 0 ? row.trendSum / row.trendCount : 0;
    const excessPct = row.stockVal > 0 ? (row.excessVal / row.stockVal) * 100 : 0;
    const actualMOS = row.turnover > 0 ? (row.stockVal * 12 / row.turnover) : 0;

    const profile = (!isHeader && subKeys.length === 1) ? (loisProfiles.find(p => p.id === subKeys[0]) || null) : null;
    const targetMOS = profile ? profile.targetMOS : null;
    const targetExcess = profile ? profile.targetExcessPct : null;
    const subDesc = profile ? profile.name : '';

    const mosOk = (targetMOS && actualMOS > 0) ? (actualMOS >= targetMOS * 0.5 && actualMOS <= targetMOS * 1.5) : null;
    const excessOk = targetExcess ? excessPct <= targetExcess : null;

    return (
        <tr 
            onClick={() => !isHeader && subKeys.length === 1 && onToggleSubgroup(subKeys[0])} 
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !isHeader && subKeys.length === 1 && onToggleSubgroup(subKeys[0]); } }}
            role={isHeader ? 'presentation' : 'button'}
            tabIndex={isHeader ? -1 : 0}
            aria-label={isHeader ? undefined : `Lọc theo nhóm ${label}`}
            className={`${isHeader ? 'bg-slate-50/50 uppercase tracking-widest' : (isActive ? 'bg-blue-50/80 shadow-inner' : 'bg-white hover:bg-slate-50/80')} border-b border-slate-100 transition-all cursor-pointer text-sm hover:translate-x-1 duration-200 focus:outline-none focus:bg-blue-50`}
        >
            <td className={`px-3 py-2 border-r border-slate-100 ${isHeader ? 'text-slate-900 font-black' : 'text-slate-700'}`}>
                <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                    {isHeader ? (
                        <>
                            <div className={`w-1.5 h-3.5 ${groupColor} rounded-full shadow-sm flex-shrink-0`}></div>
                            <Typography variant="body" className="font-black truncate">
                                {label}
                            </Typography>
                        </>
                    ) : (
                        <div className={`segment-pill ${
                            row.noStock > 0 ? 'segment-pill-alert' : 
                            row.short > 0 ? 'segment-pill-warning' : 
                            'segment-pill-success'
                        }`}>
                            {label}
                        </div>
                    )}
                    {!isHeader && subDesc && (
                        <span className="text-slate-400 font-bold ml-1.5 text-[9px] tracking-tight truncate opacity-70">— {subDesc}</span>
                    )}
                </div>
            </td>
            <td className="px-3 py-1.5 text-right font-bold text-slate-800">
                <Typography variant="body-sm" className="font-bold tabular-nums">
                    {formatNum(row.turnover)}
                </Typography>
                {!isHeader && !isMobile && subKeys.length === 1 && row.turnover > 0 && (
                    <Typography variant="label" className={`ml-1 ${avgTrend > 0 ? 'text-atp-success' : 'text-atp-action'}`}>
                        {avgTrend > 0 ? '↑' : '↓'}{Math.abs(avgTrend).toFixed(0)}%
                    </Typography>
                )}
            </td>
            <td className={`px-3 py-1.5 text-right ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="label" className="text-slate-400 font-bold !italic">
                    {(row.turnover / (grandStats.grandTurnover || 1) * 100).toFixed(1)}%
                </Typography>
            </td>
            <td className="px-3 py-2 text-center">
                <Typography variant="body-sm" className="text-slate-500 tabular-nums">
                    {row.items.toLocaleString()}
                </Typography>
            </td>
            <td className={`px-3 py-2 text-center ${row.noStock > 0 ? 'bg-atp-action/5' : ''}`}>
                <Typography variant="body-sm" className={`font-bold tabular-nums ${row.noStock > 0 ? 'text-atp-action' : 'text-slate-300'}`}>
                    {row.noStock > 0 ? row.noStock.toLocaleString() : '—'}
                </Typography>
            </td>
            <td className={`px-3 py-2 text-center ${row.short > 0 ? 'bg-atp-accent/5' : ''} ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="body-sm" className={`font-bold tabular-nums ${row.short > 0 ? 'text-atp-accent' : 'text-slate-300'}`}>
                    {row.short > 0 ? row.short.toLocaleString() : '—'}
                </Typography>
            </td>
            <td className={`px-3 py-1.5 text-right bg-blue-50/20 ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="body-sm" className="font-bold text-blue-700 tabular-nums">
                    {formatNum(row.stockVal)}
                </Typography>
            </td>
            <td className={`px-3 py-1 text-center border-x border-blue-100 bg-blue-50/20 ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="label" className={`!italic tabular-nums ${mosOk === true ? 'text-emerald-600' : mosOk === false ? 'text-rose-500' : 'text-slate-600'}`}>
                    {actualMOS > 0 ? actualMOS.toFixed(1) : '-'}M
                </Typography>
                {targetMOS && (
                    <Typography variant="label" className="text-slate-400 font-bold leading-none mt-0.5 whitespace-nowrap block !text-[9px]">
                        <i className="fas fa-bullseye mr-0.5 opacity-70"></i>{targetMOS}M
                    </Typography>
                )}
            </td>
            <td className={`px-3 py-1.5 text-right uppercase ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="body-sm" className="font-bold text-slate-500 tabular-nums">
                    {formatNum(row.poVal)}
                </Typography>
            </td>
            <td className={`px-3 py-2 text-center ${row.boItems > 0 ? 'bg-rose-50/30' : ''}`}>
                <Typography variant="body-sm" className={`font-bold tabular-nums ${row.boItems > 0 ? 'text-rose-600' : 'text-slate-200'}`}>
                    {row.boItems > 0 ? row.boItems.toLocaleString() : '—'}
                </Typography>
            </td>
            <td className={`px-3 py-2 text-right ${row.boValue > 0 ? 'bg-rose-50/30' : ''} ${isMobile ? 'hidden' : ''}`}>
                <Typography variant="body-sm" className={`font-bold tabular-nums ${row.boValue > 0 ? 'text-rose-700' : 'text-slate-200'}`}>
                    {row.boValue > 0 ? formatNum(row.boValue) : '—'}
                </Typography>
            </td>
            <td className="px-3 py-2 text-center">
                <Typography variant="body-sm" className="font-black text-slate-400 tabular-nums">
                    {row.excessItems > 0 ? row.excessItems.toLocaleString() : '—'}
                </Typography>
            </td>
            <td className="px-3 py-2 text-right text-slate-400">
                <Typography variant="body-sm" className="font-bold tabular-nums">
                    {formatNum(row.excessVal)}
                </Typography>
            </td>
            <td className="px-3 py-1 text-center border-l border-slate-100">
                <div className={`font-black text-xs !italic tabular-nums ${excessOk === true ? 'text-emerald-600' : excessOk === false ? 'text-rose-500' : 'text-slate-600'}`}>
                    {excessPct.toFixed(1)}%
                </div>
                {targetExcess && (
                    <div className="text-3xs text-slate-600 font-bold leading-none mt-0.5 whitespace-nowrap">
                        <i className="fas fa-bullseye mr-0.5 opacity-80"></i>≤{targetExcess}%
                    </div>
                )}
            </td>
        </tr>
    );
});

export const Dashboard = ({ data, onItemSelect, initialParams, initialState, onSaveState, draftData, graph, appSettings, supersessionProps }: {
    data: InventoryItem[],
    onItemSelect: (item: InventoryItem) => void,
    initialParams?: any,
    initialState?: any,
    onSaveState?: (s: any) => void,
    draftData?: OrderingDraft,
    graph?: SupersessionGraph,
    appSettings?: AppSettings,
    onUpdateSettings?: (s: AppSettings) => void,
    supersessionProps?: {
        mappings: SupersessionMapping[];
        onUpdateMappings: (mappings: SupersessionMapping[]) => void;
        onAddMapping: () => void;
        onEditMapping: (mapping: SupersessionMapping) => void;
    };
}) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();

    const loisProfiles = appSettings?.loisProfiles || DEFAULT_LOIS_PROFILES;

    const LOIS_HIERARCHY = useMemo(() => {
        const groups: Record<string, string[]> = {};
        loisProfiles.forEach(p => {
            const pg = p.parentGroup || 'U';
            if (!groups[pg]) groups[pg] = [];
            groups[pg].push(p.id);
        });

        const colorMap: Record<string, string> = {
            'L': 'bg-atp-secondary',
            'O': 'bg-atp-accent',
            'I': 'bg-slate-400',
            'S': 'bg-atp-primary',
            'U': 'bg-slate-300'
        };

        return Object.entries(groups).map(([label, sub]) => ({
            label: label,
            sub: sub,
            color: colorMap[label] || 'bg-slate-500'
        }));
    }, [loisProfiles]);

    const [subTab, setSubTab] = useState<DashboardSubTab>(initialState?.subTab || 'overview');
    const [settings, setSettings] = useState<DashboardSettings>(initialState?.settings || {
        snapshotDate: new Date().toISOString().split('T')[0],
        warehouseScope: 'All',
        costBasis: 'PP',
        demandSource: '3M',
        applySeasonality: false, // Default to OFF for manual control as requested
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
    const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
    const [searchResult, setSearchResult] = useState<SearchResult>({ type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });
    const [showSimulation, setShowSimulation] = useState(false);

    useEffect(() => { if (onSaveState) onSaveState({ settings, filters, subTab }); }, [settings, filters, subTab, onSaveState]);

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
        return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', notation: "compact" }).format(safeVal);
    };
    // Same as formatCurrency but without the unit suffix — used in table cells that have units in headers
    const formatNum = (val: number) => formatCurrency(val).replace(/ tr$/, '');


    const enrichedData = useMemo(() => {
        // ✅ Dùng engine tập trung — fix Bug 1 (excessQty ko trừ BO),
        // Bug 2 (demandSource bị bỏ qua), Bug 3 (priority không nhất quán)
        const params = makeComputeParams(settings);
        return computeInventoryBatch(data, params, draftData?.quantities);
    }, [data, settings, draftData]);

    const { matrixData, grandStats, deltaStats, criticalStockouts } = useMemo(() => {
        const matrix: Record<string, any> = {};
        let grandTurnover = 0, grandStock = 0, grandPOVal = 0, grandExcess = 0;
        let grandNoStock = 0, grandShort = 0, grandExcessItems = 0;
        let grandBOItems = 0, grandBOValue = 0;
        let deltaStockoutResolved = 0, deltaExcessAdded = 0, deltaStockValAdded = 0;
        let criticalStockoutsCount = 0;

        enrichedData.forEach(item => {
            const comp = item.computed!;
            const sim = comp.simulated!;
            const activeStockVal = (showSimulation ? sim.stockValue : comp.stockValue) || 0;
            const activeExcessVal = (showSimulation ? sim.excessValue : comp.excessValue) || 0;
            const activeIsShort = showSimulation ? sim.stockoutRiskFlag : comp.stockoutRiskFlag;
            const activeIsNoStock = (showSimulation ? (sim.totalStock <= 0) : (comp.available <= 0)) && item.BaseForecast > 0.02;
            const activeExcessQty = (showSimulation ? sim.excessQty : comp.excessQty) || 0;

            const sales12M = item.SalesHistory.reduce((a, b) => a + b, 0);

            // Calculate Item Level Trend
            const last6 = item.SalesHistory.slice(-6).reduce((a, b) => a + b, 0);
            const first6 = item.SalesHistory.slice(0, 6).reduce((a, b) => a + b, 0);
            const itemTrend = first6 > 0 ? ((last6 - first6) / first6) * 100 : 0;

            const turnVal = sales12M * comp.unitCost;
            const poVal = showSimulation ? (sim.totalIncomingValue || 0) : ((item.TotalPO || 0) * comp.unitCost);
            const sub = getLoisSubgroup(item);

            // O3 Refinement: Matrix thống kê nợ thực tế hiện tại (Physical Debt). 
            // Dùng (Backorder > available) để phản ánh đúng thực tế hiện trường, không trừ PO đang về.
            // Khi Simulation active, dùng boQty từ sim (đã trừ Draft + PO)
            const isBO = showSimulation ? (sim.boQty > 0) : ((item.Backorder || 0) > (comp.available || 0));
            const boVal = showSimulation ? (sim.boValue || 0) : (isBO ? Math.max(0, (item.Backorder || 0) - (comp.available || 0)) * comp.unitCost : 0);
            const isBmw = (item.TypeCar || '').toUpperCase().includes('BMW');

            grandTurnover += turnVal || 0;
            grandStock += activeStockVal || 0;
            grandPOVal += poVal || 0;
            grandExcess += activeExcessVal || 0;

            if (isBO) { grandBOItems++; grandBOValue += boVal; }

            // Banner Logic: L1-L3 SKUs with stockout risk and active forecast
            if (['1', '2', '3'].includes(item.LOISGroup) && (comp.available <= 0 || comp.stockoutRiskFlag) && item.BaseForecast > 0.02) {
                criticalStockoutsCount++;
            }

            if (showSimulation) {
                if (comp.stockoutRiskFlag && !sim.stockoutRiskFlag) deltaStockoutResolved++;
                if (sim.excessValue > comp.excessValue) deltaExcessAdded += ((sim.excessValue - comp.excessValue) || 0);
                deltaStockValAdded += ((sim.stockValue - comp.stockValue) || 0);
            }

            if (!matrix[sub]) matrix[sub] = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0, boItems: 0, boValue: 0, bmwCount: 0, trendSum: 0, trendCount: 0 };
            matrix[sub].items++;
            matrix[sub].turnover += turnVal || 0;

            if (activeIsNoStock) { matrix[sub].noStock++; grandNoStock++; }
            if (activeIsShort) { matrix[sub].short++; grandShort++; }

            matrix[sub].stockVal += activeStockVal || 0;
            matrix[sub].poVal += poVal || 0;

            if (activeExcessQty > 0) { matrix[sub].excessItems++; grandExcessItems++; }

            matrix[sub].excessVal += activeExcessVal || 0;

            if (isBO) { matrix[sub].boItems++; matrix[sub].boValue += boVal; }
            if (isBmw) matrix[sub].bmwCount++;

            matrix[sub].trendSum += itemTrend;
            matrix[sub].trendCount++;
        });
        return {
            matrixData: matrix,
            grandStats: {
                grandTurnover, grandStock, grandPOVal, grandExcess, totalSKUs: data.length,
                grandNoStock, grandShort, grandExcessItems, grandBOItems, grandBOValue
            },
            deltaStats: { deltaStockoutResolved, deltaExcessAdded, deltaStockValAdded },
            criticalStockouts: criticalStockoutsCount
        };
    }, [enrichedData, showSimulation]);

    const indexedData = useMemo(() => {
        return prepareSearchCache(enrichedData);
    }, [enrichedData]);

    const filteredList = useMemo(() => {
        let result = indexedData;
        if (selectedSubgroup) {
            result = result.filter(item => getLoisSubgroup(item) === selectedSubgroup);
        }
        return result.filter(i => {
            if (!matchSearch(i, searchResult)) return false;
            if (filters.priority !== 'All' && i.computed?.priorityBucket !== filters.priority) return false;
            if (filters.status !== 'All' && i.Status !== filters.status) return false;
            if (filters.lois.length > 0 && !filters.lois.includes(i.LOISGroup)) return false;
            if (filters.trend !== 'All' && i.TrendFlag !== filters.trend) return false;

            if (filters.costRange > 0) {
                const range = COST_RANGES[filters.costRange];
                if (i.UnitCost_PP < range.min || i.UnitCost_PP >= range.max) return false;
            }
            if (filters.fobCostRange > 0) {
                const range = FOB_COST_RANGES[filters.fobCostRange];
                if (i.UnitCost_FOB < range.min || i.UnitCost_FOB >= range.max) return false;
            }
            if (filters.specialFilter === 'stockout' && !i.computed?.stockoutRiskFlag) return false;
            if (filters.specialFilter === 'critical_stockout') {
                const comp = i.computed;
                const isCriticalMatch = comp && ['1', '2', '3'].includes(i.LOISGroup) && (comp.available <= 0 || comp.stockoutRiskFlag) && i.BaseForecast > 0.02;
                if (!isCriticalMatch) return false;
            }
            if (filters.specialFilter === 'excess' && (i.computed?.excessQty || 0) <= 0) return false;
            if (filters.specialFilter === 'has_seasonality' && (i.computed?.ssi || 1) <= 1.0) return false;
            if (filters.specialFilter === 'has_po' && (i.TotalPO || 0) <= 0) return false;
            if (filters.specialFilter === 'has_supersession') {
                if (!graph) return false;
                const chain = graph.getChain(i.ItemCode);
                if (!chain || chain.allParts.length <= 1) return false;
            }
            if (filters.showBackorders && i.Backorder <= 0) return false;
            if (filters.debtStatus && filters.debtStatus.length > 0) {
                const status = getDebtStatus(i);
                if (!filters.debtStatus.includes(status)) return false;
            }
            return true;
        });
    }, [enrichedData, selectedSubgroup, searchResult, filters, graph]);


    // Functional update for subgroup toggle to keep callback stable
    const handleToggleSubgroup = React.useCallback((subKey: string) => {
        setSelectedSubgroup(prev => prev === subKey ? null : subKey);
    }, []);


    // ===== PRINT: open a clean new window with standalone HTML =====
    const handlePrint = () => {
        const pd = new Date();
        const dateStr = pd.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = pd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        // --- build rows accepts the data source as parameter ---
        const fv = (v: number) => formatCurrency(v).replace(/ tr$/, ''); // no-unit version for table cells
        const buildTableRows = (mx: Record<string, any>, gs: { grandTurnover: number, grandStock: number, grandPOVal: number, grandExcess: number, totalSKUs: number, grandNoStock: number, grandShort: number, grandExcessItems: number, grandBOItems: number, grandBOValue: number }) => {
            let rows = '';
            LOIS_HIERARCHY.forEach(group => {
                const hRow = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, boItems: 0, boValue: 0, excessItems: 0, excessVal: 0, bmwCount: 0, trendSum: 0, trendCount: 0 };
                group.sub.forEach(k => {
                    if (mx[k]) {
                        hRow.items += mx[k].items; hRow.turnover += mx[k].turnover; hRow.noStock += mx[k].noStock; hRow.short += mx[k].short;
                        hRow.stockVal += mx[k].stockVal; hRow.poVal += mx[k].poVal; hRow.boItems += mx[k].boItems; hRow.boValue += mx[k].boValue;
                        hRow.excessItems += mx[k].excessItems; hRow.excessVal += mx[k].excessVal; hRow.bmwCount += mx[k].bmwCount;
                        hRow.trendSum += mx[k].trendSum; hRow.trendCount += mx[k].trendCount;
                    }
                });
                if (hRow.items === 0) return;
                const hTrend = hRow.trendCount > 0 ? hRow.trendSum / hRow.trendCount : 0;
                const hExPct = hRow.stockVal > 0 ? (hRow.excessVal / hRow.stockVal * 100) : 0;
                const hTurnPct = gs.grandTurnover > 0 ? (hRow.turnover / gs.grandTurnover * 100) : 0;
                const hMOS = hRow.turnover > 0 ? (hRow.stockVal * 12 / hRow.turnover) : 0;

                rows += `<tr class="group-hdr">
                    <td>${group.label}</td>
                    <td class="r">${fv(hRow.turnover)}<span class="trend ${hTrend > 0 ? 'up' : 'dn'}">${hTrend > 0 ? '\u2191' : '\u2193'}${Math.abs(hTrend).toFixed(0)}%</span></td>
                    <td class="r blue">${hTurnPct.toFixed(1)}%</td>
                    <td class="c">${hRow.items.toLocaleString()}</td>
                    <td class="c ${hRow.noStock > 0 ? 'red' : ''}">${hRow.noStock > 0 ? hRow.noStock.toLocaleString() : '-'}</td>
                    <td class="c ${hRow.short > 0 ? 'amb' : 'muted'}">${hRow.short > 0 ? hRow.short.toLocaleString() : '-'}</td>
                    <td class="r grn">${fv(hRow.stockVal)}</td>
                    <td class="c ${hMOS > 6 ? 'red' : hMOS > 3 ? 'amb' : 'grn'}">${hMOS > 0 ? hMOS.toFixed(1) : '-'}M</td>
                    <td class="r blue">${fv(hRow.poVal)}</td>
                    <td class="c ${hRow.boItems > 0 ? 'red' : 'muted'}">${hRow.boItems > 0 ? hRow.boItems.toLocaleString() : '-'}</td>
                    <td class="r ${hRow.boValue > 0 ? 'red' : 'muted'}">${fv(hRow.boValue)}</td>
                    <td class="c muted">${hRow.excessItems > 0 ? hRow.excessItems.toLocaleString() : '-'}</td>
                    <td class="r muted">${fv(hRow.excessVal)}</td>
                    <td class="c ${hExPct > 15 ? 'red' : 'grn'}">${hExPct.toFixed(1)}%</td>
                </tr>`;

                if (group.sub.length > 1) group.sub.forEach(k => {
                    if (!mx[k] || mx[k].items === 0) return;
                    const d = mx[k];
                    const trend = d.trendCount > 0 ? d.trendSum / d.trendCount : 0;
                    const exPct = d.stockVal > 0 ? (d.excessVal / d.stockVal * 100) : 0;
                    const turnPct = gs.grandTurnover > 0 ? (d.turnover / gs.grandTurnover * 100) : 0;
                    const dMOS = d.turnover > 0 ? (d.stockVal * 12 / d.turnover) : 0;
                    // Target Lookup
                    const tgtCfg = loisProfiles.find(p => p.id === k) || null;
                    const tgtMOS = tgtCfg ? tgtCfg.targetMOS : null;
                    const tgtEx = tgtCfg ? tgtCfg.targetExcessPct : null;
                    const dDesc = tgtCfg ? tgtCfg.name : '';

                    const mosOk = (tgtMOS && dMOS > 0) ? (dMOS >= tgtMOS * 0.5 && dMOS <= tgtMOS * 1.5) : null;
                    const exOk = tgtEx ? exPct <= tgtEx : null;

                    rows += `<tr class="sub-row">
                        <td class="indent">${k}${dDesc ? ` <span style="font-weight:400;color:#555;font-size:6pt">— ${dDesc}</span>` : ''}</td>
                        <td class="r">${fv(d.turnover)}<span class="trend ${trend > 0 ? 'up' : 'dn'}">${trend > 0 ? '\u2191' : '\u2193'}${Math.abs(trend).toFixed(0)}%</span></td>
                        <td class="r blue">${turnPct.toFixed(1)}%</td>
                        <td class="c">${d.items.toLocaleString()}</td>
                        <td class="c ${d.noStock > 0 ? 'red' : 'muted'}">${d.noStock > 0 ? d.noStock.toLocaleString() : '-'}</td>
                        <td class="c ${d.short > 0 ? 'amb' : 'muted'}">${d.short > 0 ? d.short.toLocaleString() : '-'}</td>
                        <td class="r grn">${fv(d.stockVal)}</td>
                        <td class="c ${mosOk === true ? 'grn' : mosOk === false ? 'red' : 'muted'}">
                            ${dMOS > 0 ? dMOS.toFixed(1) : '-'}M
                            ${tgtMOS ? `<br/><small>🎯 ${tgtMOS}M</small>` : ''}
                        </td>
                        <td class="r blue">${fv(d.poVal)}</td>
                        <td class="c ${d.boItems > 0 ? 'red' : 'muted'}">${d.boItems > 0 ? d.boItems.toLocaleString() : '-'}</td>
                        <td class="r ${d.boValue > 0 ? 'red' : 'muted'}">${fv(d.boValue)}</td>
                        <td class="c muted">${d.excessItems > 0 ? d.excessItems.toLocaleString() : '-'}</td>
                        <td class="r muted">${fv(d.excessVal)}</td>
                        <td class="c ${exOk === true ? 'grn' : exOk === false ? 'red' : 'muted'}">
                            ${exPct.toFixed(1)}%
                            ${tgtEx ? `<br/><small>🎯 ≤${tgtEx}%</small>` : ''}
                        </td>
                    </tr>`;
                });
            });
            return rows;
        };

        const makeFooter = (gs: { grandTurnover: number, grandStock: number, grandPOVal: number, grandExcess: number, totalSKUs: number, grandNoStock: number, grandShort: number, grandExcessItems: number, grandBOItems: number, grandBOValue: number }) => {
            const exPct = gs.grandStock > 0 ? (gs.grandExcess / gs.grandStock * 100) : 0;
            const gMOS = gs.grandTurnover > 0 ? (gs.grandStock * 12 / gs.grandTurnover) : 0;
            return `<tr class="footer-row">
                <td>T\u1ed4NG C\u1ed8NG</td>
                <td class="r">${fv(gs.grandTurnover)}</td>
                <td class="r">100%</td>
                <td class="c">${gs.totalSKUs.toLocaleString()}</td>
                <td class="c red">${gs.grandNoStock.toLocaleString()}</td>
                <td class="c amb">${gs.grandShort.toLocaleString()}</td>
                <td class="r grn">${fv(gs.grandStock)}</td>
                <td class="c">${gMOS > 0 ? gMOS.toFixed(1) : '-'}M</td>
                <td class="r blue">${fv(gs.grandPOVal)}</td>
                <td class="c red">${gs.grandBOItems.toLocaleString()}</td>
                <td class="r red">${fv(gs.grandBOValue)}</td>
                <td class="c muted">${gs.grandExcessItems.toLocaleString()}</td>
                <td class="r muted">${fv(gs.grandExcess)}</td>
                <td class="c grn">${exPct.toFixed(1)}%</td>
            </tr>`;
        };

        // ---- Compute CURRENT matrix (real stock) ----
        const curMatrix: Record<string, any> = {};
        let cGT = 0, cGS = 0, cGPO = 0, cGEx = 0, cGNS = 0, cGSh = 0, cGEI = 0, cGBI = 0, cGBV = 0;
        enrichedData.forEach(item => {
            const comp = item.computed!; const sub = getLoisSubgroup(item);
            const turn = item.SalesHistory.reduce((a: number, b: number) => a + b, 0) * comp.unitCost;
            const po = (item.TotalPO || 0) * comp.unitCost;
            const l6 = item.SalesHistory.slice(-6).reduce((a: number, b: number) => a + b, 0);
            const f6 = item.SalesHistory.slice(0, 6).reduce((a: number, b: number) => a + b, 0);
            const tr = f6 > 0 ? ((l6 - f6) / f6) * 100 : 0;
            const isBO = (item.Backorder || 0) > (comp.available || 0);
            const boVal = isBO ? Math.max(0, (item.Backorder || 0) - (comp.available || 0)) * comp.unitCost : 0;
            const isBmw = (item.TypeCar || '').toUpperCase().includes('BMW');

            if (!curMatrix[sub]) curMatrix[sub] = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0, boItems: 0, boValue: 0, bmwCount: 0, trendSum: 0, trendCount: 0 };
            curMatrix[sub].items++; curMatrix[sub].turnover += turn; curMatrix[sub].stockVal += comp.stockValue || 0;
            curMatrix[sub].poVal += po; curMatrix[sub].excessVal += comp.excessValue || 0; curMatrix[sub].trendSum += tr; curMatrix[sub].trendCount++;
            if (comp.available <= 0 && item.BaseForecast > 0.02) { curMatrix[sub].noStock++; cGNS++; }
            if (comp.stockoutRiskFlag) { curMatrix[sub].short++; cGSh++; }
            if ((comp.excessQty || 0) > 0) { curMatrix[sub].excessItems++; cGEI++; }
            if (isBO) { curMatrix[sub].boItems++; curMatrix[sub].boValue += boVal; cGBI++; cGBV += boVal; }
            if (isBmw) curMatrix[sub].bmwCount++;
            cGT += turn; cGS += comp.stockValue || 0; cGPO += po; cGEx += comp.excessValue || 0;
        });
        const curGS2 = { grandTurnover: cGT, grandStock: cGS, grandPOVal: cGPO, grandExcess: cGEx, totalSKUs: data.length, grandNoStock: cGNS, grandShort: cGSh, grandExcessItems: cGEI, grandBOItems: cGBI, grandBOValue: cGBV };

        // ---- Compute SIMULATION matrix (simulated stock = current + PO + drafts) ----
        const simMatrix: Record<string, any> = {};
        let sGT = 0, sGS = 0, sGPO = 0, sGEx = 0, sGNS = 0, sGSh = 0, sGEI = 0, sGBI = 0, sGBV = 0, dSOR = 0, dEA = 0, dSA = 0;
        enrichedData.forEach(item => {
            const comp = item.computed!; const sim = comp.simulated!; const sub = getLoisSubgroup(item);
            const turn = item.SalesHistory.reduce((a: number, b: number) => a + b, 0) * comp.unitCost;
            const po = sim.totalIncomingValue || 0;
            const l6 = item.SalesHistory.slice(-6).reduce((a: number, b: number) => a + b, 0);
            const f6 = item.SalesHistory.slice(0, 6).reduce((a: number, b: number) => a + b, 0);
            const tr = f6 > 0 ? ((l6 - f6) / f6) * 100 : 0;
            const isBO = sim.boQty > 0;
            const boVal = sim.boValue || 0;
            const isBmw = (item.TypeCar || '').toUpperCase().includes('BMW');

            if (!simMatrix[sub]) simMatrix[sub] = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0, boItems: 0, boValue: 0, bmwCount: 0, trendSum: 0, trendCount: 0 };
            simMatrix[sub].items++; simMatrix[sub].turnover += turn; simMatrix[sub].stockVal += sim.stockValue || 0;
            simMatrix[sub].poVal += po; simMatrix[sub].excessVal += sim.excessValue || 0; simMatrix[sub].trendSum += tr; simMatrix[sub].trendCount++;
            if (sim.totalStock <= 0 && item.BaseForecast > 0.02) { simMatrix[sub].noStock++; sGNS++; }
            if (sim.stockoutRiskFlag) { simMatrix[sub].short++; sGSh++; }
            if ((sim.excessQty || 0) > 0) { simMatrix[sub].excessItems++; sGEI++; }
            if (isBO) { simMatrix[sub].boItems++; simMatrix[sub].boValue += boVal; sGBI++; sGBV += boVal; }
            if (isBmw) simMatrix[sub].bmwCount++;
            if (comp.stockoutRiskFlag && !sim.stockoutRiskFlag) dSOR++;
            if ((sim.excessValue || 0) > (comp.excessValue || 0)) dEA += ((sim.excessValue || 0) - (comp.excessValue || 0));
            dSA += ((sim.stockValue || 0) - (comp.stockValue || 0));
            sGT += turn; sGS += sim.stockValue || 0; sGPO += po; sGEx += sim.excessValue || 0;
        });
        const simGS2 = { grandTurnover: sGT, grandStock: sGS, grandPOVal: sGPO, grandExcess: sGEx, totalSKUs: data.length, grandNoStock: sGNS, grandShort: sGSh, grandExcessItems: sGEI, grandBOItems: sGBI, grandBOValue: sGBV };

        const tableHTML = (isSimulation: boolean) => {
            const mx = isSimulation ? simMatrix : curMatrix;
            const gs = isSimulation ? simGS2 : curGS2;
            const exPctGrand = gs.grandStock > 0 ? (gs.grandExcess / gs.grandStock * 100) : 0;
            return `
            <div class="page-header">
                <div class="logo-area"><div class="logo-box">ATP</div><div><div class="company-name">Auto Parts Governance</div><div class="page-title">Báo cáo Tồn Kho</div></div></div>
                <div class="header-right">
                    <div class="badge">${isSimulation ? '\u2726 SIMULATION ACTIVE \u2013 Bao g\u1ed3m D\u1ef1 Th\u1ea3o + PO' : '\u2714 HI\u1ec6N T\u1ea0I \u2013 T\u1ed3n kho th\u1ef1c t\u1ebf'}</div>
                    <div class="header-meta">In l\u00fac: ${dateStr} \u2014 ${timeStr} &nbsp;|&nbsp; SKU: ${gs.totalSKUs} &nbsp;|&nbsp; <span class="red">OOS: ${gs.grandNoStock}</span> &nbsp;|&nbsp; <span class="amb">Risk: ${gs.grandShort}</span></div>
                </div>
            </div>
            <div class="kpi-bar">
                <div class="kpi-card">
                    <div class="kpi-label">Doanh s\u1ed1 v\u1ed1n (12 th\u00e1ng)</div>
                    <div class="kpi-value">${formatCurrency(gs.grandTurnover)}</div>
                    <div class="kpi-sub">T\u1ed5ng doanh thu theo gi\u00e1 v\u1ed1n</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">T\u1ed3n kho hi\u1ec7n h\u1eefu</div>
                    <div class="kpi-value">${formatCurrency(gs.grandStock)}</div>
                    <div class="kpi-sub">Gi\u00e1 tr\u1ecb t\u1ed3n (GH)</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">H\u00e0ng \u0111ang v\u1ec1 (PO)</div>
                    <div class="kpi-value">${formatCurrency(gs.grandPOVal)}</div>
                    <div class="kpi-sub">Gi\u00e1 tr\u1ecb Pipeline</div>
                </div>
                <div class="kpi-card kpi-alert">
                    <div class="kpi-label">Gi\u00e1 tr\u1ecb d\u01b0 th\u1eeba</div>
                    <div class="kpi-value">${formatCurrency(gs.grandExcess)}</div>
                    <div class="kpi-sub">${exPctGrand.toFixed(1)}% t\u1ed3n kho \u2014 ${gs.grandExcessItems} SKU</div>
                </div>
            </div>
            ${isSimulation ? `<div class="delta-bar"><div class="delta-card"><div class="delta-label">Stockout Resolved</div><div class="delta-val">-${dSOR}</div></div><div class="delta-card"><div class="delta-label">Capital Added</div><div class="delta-val">${formatCurrency(dSA)}</div></div><div class="delta-card"><div class="delta-label">Excess Added</div><div class="delta-val">${formatCurrency(dEA)}</div></div></div>` : ''}
            <table>
                <colgroup>
                    <col style="width:105px"><col style="width:75px"><col style="width:45px">
                    <col style="width:40px"><col style="width:40px"><col style="width:40px">
                    <col style="width:75px"><col style="width:55px"><col style="width:70px">
                    <col style="width:40px"><col style="width:70px">
                    <col style="width:40px"><col style="width:70px"><col style="width:50px">
                </colgroup>
                <thead>
                    <tr>
                        <th>Ph\u00e2n kh\u00fac</th><th class="r">Turn. (tr)</th><th class="r">% Tr</th><th class="c">SKU</th>
                        <th class="c">${isSimulation ? 'OOS' : 'OOS'}</th><th class="c">Risk</th><th class="r">Stock (tr)</th>
                        <th class="c">MOS</th><th class="r">PO (tr)</th>
                        <th class="c">BO #</th><th class="r">BO Val</th>
                        <th class="c">Exc #</th><th class="r">Exc Val</th><th class="c">% Exc</th>
                    </tr>
                </thead>
                <tbody>${buildTableRows(mx, gs)}</tbody>
                <tfoot>${makeFooter(gs)}</tfoot>
            </table>
            <div class="footnote"><span>${isSimulation ? '* Simulation = T\u1ed3n kho + PO \u0111ang ch\u1edd + D\u1ef1 th\u1ea3o \u0111\u1eb7t h\u00e0ng' : '* OOS = H\u1ebft h\u00e0ng | Risk = D\u01b0\u1edbi ROP | Exc = T\u1ed3n d\u01b0 v\u01b0\u1ee3t Max'}</span><span>Trang ${isSimulation ? '2' : '1'} / 2 \u2014 ${isSimulation ? 'Simulation Active' : 'Hi\u1ec7n T\u1ea1i'}</span></div>
            `;
        };


        const html = `<!DOCTYPE html><html lang="vi"><head>
            <meta charset="UTF-8">
            <title>Báo cáo Tồn Kho – ${dateStr}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap" rel="stylesheet">
            <style>
                @page { size: A4 landscape; margin: 8mm 7mm; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 7pt; color: #000; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .page { width: 100%; page-break-after: always; }
                .page:last-child { page-break-after: avoid; }
                /* Header */
                .page-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 5px; }
                .logo-area { display: flex; align-items: center; gap: 10px; }
                .logo-box { width:32px; height:32px; background:#000; border-radius:4px; display:flex; align-items:center; justify-content:center; color:white; font-weight:900; font-size:8.5pt; flex-shrink:0; }
                .company-name { font-size:6pt; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; }
                .page-title { font-size:11.5pt; font-weight:900; color:#000; line-height:1.2; }
                .header-right { text-align:right; }
                .badge { display:inline-block; padding:2px 10px; border-radius:3px; font-weight:700; font-size:7pt; margin-bottom:3px; border:1.5px solid #000; background:white; color:#000; }
                .header-meta { font-size:6.5pt; color:#555; }
                /* KPI strip */
                .kpi-bar { display:flex; gap:6px; margin-bottom:5px; }
                .kpi-card { flex:1; padding:5px 8px; border:1px solid #ddd; border-radius:3px; background:#fafafa; }
                .kpi-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; color:#555; letter-spacing:0.05em; }
                .kpi-value { font-size:11pt; font-weight:900; color:#000; line-height:1.2; margin-top:1px; }
                .kpi-sub { font-size:6.5pt; color:#555; margin-top:1px; }
                .kpi-card.kpi-alert .kpi-value { text-decoration:underline; }
                /* Delta bar – borders only */
                .delta-bar { display:flex; gap:8px; margin-bottom:5px; }
                .delta-card { flex:1; padding:4px 8px; border-radius:3px; border:1px solid #ccc; background:#fafafa; }
                .delta-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; color:#444; }
                .delta-val { font-size:11pt; font-weight:900; color:#000; }
                /* Table */
                table { width:100%; border-collapse:collapse; font-size:7.5pt; table-layout: fixed; }
                thead th { background:#ececec; color:#000; padding:3px 2px; font-size:7pt; font-weight:900; text-transform:uppercase; border:1px solid #ccc; letter-spacing:0.01em; }
                tbody td { padding:2px 3px; border:1px solid #ddd; vertical-align:middle; line-height:1.1; color:#000; background:white; font-weight:500; overflow: hidden; }
                tr.group-hdr td { border-top:1.5px solid #999; border-bottom:1px solid #ccc; font-weight:900; background:#f5f5f5; color:#000; font-size:7.5pt; }
                tr.group-hdr td:first-child { border-left:3px solid #555; padding-left:4px; }
                tr.sub-row td { color:#000; font-weight:500; }
                tr.sub-row td.indent { padding-left:12px; color:#000; }
                tr.sub-row:nth-child(even) td { background:#fafafa; }
                tfoot td { background:#ececec; color:#000; font-weight:900; padding:3px 4px; border:1px solid #ccc; text-transform:uppercase; font-size:7.5pt; }
                /* Align */
                .r { text-align:right; } .c { text-align:center; }
                /* Emphasis via typography */
                .red { color:#d32f2f; font-weight:900; }
                .amb { color:#ed6c02; font-weight:800; }
                .grn { color:#2e7d32; font-weight:600; }
                .blue { color:#1976d2; font-weight:500; }
                .muted { color:#777; font-weight:400; }
                .up { color:#2e7d32; font-weight:700; } .dn { color:#d32f2f; font-weight:700; }
                .trend { margin-left:2px; font-size:5.5pt; }
                small { font-size:6pt; color:#666; display:block; line-height:1; margin-top: 1px; }
                .footnote { display:flex; justify-content:space-between; margin-top:4px; font-size:6.5pt; color:#444; border-top:1px solid #ddd; padding-top:3px; }
            </style>
        </head><body>
            <div class="page">${tableHTML(false)}</div>
            <div class="page">${tableHTML(true)}</div>
        </body></html>`;

        const w = window.open('', '_blank', 'width=1200,height=800');
        if (!w) return alert('Trình duyệt đã chặn popup. Hãy cho phép popup để in.');
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 600);
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
                            <i className="fas fa-chart-simple text-blue-400"></i>
                        </div>
                        <div className="overflow-hidden">
                            <Typography variant="h2" className="tracking-tight uppercase text-white !text-xl workbench-title leading-none truncate">{t('nav_dashboard')}</Typography>
                            <Typography variant="label" className="text-white/50 !text-[10px] font-medium supply-chain-data truncate block">{t('app_subtitle')}</Typography>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">SKU</span>
                            <span className="text-sm font-black text-white">{grandStats.totalSKUs.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-400/20 px-3 py-2 rounded-xl">
                            <i className="fas fa-circle-xmark text-rose-400 text-[10px]"></i>
                            <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest">OOS</span>
                            <span className="text-sm font-black text-rose-300">{grandStats.grandNoStock}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/20 px-3 py-2 rounded-xl">
                            <i className="fas fa-triangle-exclamation text-amber-400 text-[10px]"></i>
                            <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Risk</span>
                            <span className="text-sm font-black text-amber-300">{grandStats.grandShort}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom row: sub-tab nav */}
                <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1 overflow-x-auto custom-scrollbar no-scrollbar-at-mobile">
                    {([
                        { id: 'overview' as const, label: t('nav_dashboard'), icon: 'fa-chart-simple' },
                        { id: 'intelligence' as const, label: 'Demand Intelligence', icon: 'fa-brain' },
                        { id: 'supersession' as const, label: t('nav_supersession'), icon: 'fa-arrows-rotate' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                ${subTab === tab.id
                                    ? 'bg-white/15 text-white border border-white/25 shadow-inner'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <i className={`fas ${tab.icon} text-[10px] ${subTab === tab.id ? 'text-blue-300' : ''}`}></i>
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
                    updateTuning={(t) => {
                        setSettings(prev => ({ ...prev, seasonalityTuning: t }));
                        if (onUpdateSettings && appSettings) {
                            onUpdateSettings({ ...appSettings, seasonalityTuning: t });
                        }
                    }}
                    initialState={initialState?.demandState}
                    onSaveState={(s) => { if (onSaveState) onSaveState({ settings, filters, subTab, demandState: s }); }}
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

            {subTab === 'overview' && <>
            {/* Alert + KPI row */}
            <div className="flex flex-col gap-3 no-print">
                {/* Compact alert — inline above KPI */}
                {criticalStockouts > 0 && (
                    <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl animate-fadeIn">
                        <i className="fas fa-triangle-exclamation text-rose-500 text-sm shrink-0"></i>
                        <span className="text-sm font-bold text-rose-800 flex-1">
                            <span className="font-black">{criticalStockouts}</span> mã stockout ưu tiên cao cần xử lý ngay
                        </span>
                        <button
                            onClick={() => {
                                handleFiltersChange({ ...filters, priority: 'All', specialFilter: 'critical_stockout' });
                                setTimeout(() => document.getElementById('inventory-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                            }}
                            className="shrink-0 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide hover:bg-rose-700 transition-colors flex items-center gap-1.5"
                        >
                            <i className="fas fa-arrow-right text-[10px]"></i> Xem ngay
                        </button>
                    </div>
                )}

                {/* KPI GRID */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard label={t('kpi_turnover')} value={formatCurrency(grandStats.grandTurnover)} subValue={t('kpi_turnover_sub')} icon="fa-arrow-trend-up" color="professional" onClick={() => {}} />
                    <MetricCard label={t('kpi_stock')} value={formatCurrency(grandStats.grandStock)} subValue={t('kpi_stock_sub')} icon="fa-warehouse" color="emerald" onClick={() => {
                        handleFiltersChange({ ...filters, specialFilter: 'critical_stockout' });
                        setTimeout(() => document.getElementById('inventory-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    }} />
                    <MetricCard label={t('kpi_pipeline')} value={formatCurrency(grandStats.grandPOVal)} subValue={t('kpi_pipeline_sub')} icon="fa-truck-fast" color="blue" onClick={() => {}} />
                    <MetricCard label={t('kpi_excess')} value={formatCurrency(grandStats.grandExcess)} subValue="Impact Value" icon="fa-circle-exclamation" color="rose" onClick={() => {
                        handleFiltersChange({ ...filters, specialFilter: 'excess' });
                        setTimeout(() => document.getElementById('inventory-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    }} />
                </div>
            </div>

            <div id="inventory-table-section" className="bg-white border border-slate-200/60 shadow-soft rounded-3xl overflow-hidden hover:shadow-medium transition-shadow">
                {showSimulation && (
                    <div className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 px-6 py-4 flex items-center justify-between no-print animate-fadeIn">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-blue flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><i className="fas fa-microchip-ai"></i></div>
                            <div>
                                <Typography variant="h3" className="text-blue-900 font-bold">Simulation Active</Typography>
                                <Typography variant="label" className="text-blue-600 block">Including Draft + PO</Typography>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-left sm:text-right w-full sm:w-auto">
                            <div className="flex items-center sm:block gap-3">
                                <div className="text-xs text-blue-400 font-black uppercase">Stockout Resolved</div>
                                <div className="text-2xl font-black text-emerald-600">-{deltaStats.deltaStockoutResolved}</div>
                            </div>
                            <div className="flex items-center sm:block gap-3">
                                <div className="text-xs text-blue-400 font-black uppercase">Capital Added</div>
                                <div className="text-2xl font-black text-slate-900">{formatCurrency(deltaStats.deltaStockValAdded)}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white sticky top-0 z-30">
                    <Typography variant="h2" className="text-slate-900 uppercase tracking-tight flex items-center gap-3">
                        <i className="fas fa-grid-horizontal text-blue-600"></i> {t('matrix_title')}
                    </Typography>
                    <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                            <button onClick={() => setShowSimulation(false)} className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all whitespace-nowrap ${!showSimulation ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{t('current')}</button>
                            <button onClick={() => setShowSimulation(true)} className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all whitespace-nowrap ${showSimulation ? 'bg-gradient-blue text-white shadow-glow-blue' : 'text-slate-500 hover:text-slate-700'}`}>Simulated</button>
                        </div>
                        <button onClick={handlePrint} className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all hover:text-blue-600 shrink-0"><i className="fas fa-print"></i></button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: isMobile ? '120px' : '145px' }} /> {/* Nhóm */}
                            <col style={{ width: '100px' }} />  {/* Turnover */}
                            <col style={{ width: '68px' }} className={isMobile ? 'hidden' : ''} />   {/* % Turn */}
                            <col style={{ width: '60px' }} />   {/* SKU */}
                            <col style={{ width: '60px' }} />   {/* OOS */}
                            <col style={{ width: '60px' }} className={isMobile ? 'hidden' : ''} />   {/* Risk */}
                            <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />  {/* Stock Val */}
                            <col style={{ width: '75px' }} className={isMobile ? 'hidden' : ''} />   {/* MOS w Tgt */}
                            <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />  {/* PO Val */}
                            <col style={{ width: '60px' }} />   {/* BO # */}
                            <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />  {/* BO Val */}
                            <col style={{ width: '60px' }} className={isMobile ? 'hidden' : ''} />   {/* Exc # */}
                            <col style={{ width: '100px' }} className={isMobile ? 'hidden' : ''} />  {/* Exc Val */}
                            <col style={{ width: '75px' }} className={isMobile ? 'hidden' : ''} />   {/* % Exc w Tgt */}
                        </colgroup>
                        <thead className="bg-slate-50/50 border-b border-slate-200/60 backdrop-blur-sm">
                            <tr>
                                <th className="px-3 py-3 border-r border-slate-100"><Typography variant="label" className="font-black text-[11px] text-slate-900">{t('matrix_segment')}</Typography></th>
                                <th className="px-3 py-3 text-right"><Typography variant="label" className="font-black text-[11px] text-slate-900">Turnover</Typography></th>
                                <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-extrabold text-[11px] !italic text-slate-500">% Turn</Typography></th>
                                <th className="px-3 py-3 text-center"><Typography variant="label" className="font-black text-[11px] text-slate-900">SKU</Typography></th>
                                <th className="px-3 py-3 text-center"><Typography variant="label" className="font-black text-[11px] text-rose-600">OOS</Typography></th>
                                <th className={`px-3 py-3 text-center ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-amber-600">Risk</Typography></th>
                                <th className={`px-3 py-3 text-right bg-blue-50/10 ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-emerald-700">Stock Val</Typography></th>
                                <th className={`px-3 py-3 text-center border-x border-blue-100 bg-blue-50/10 ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] !italic text-slate-600">MOS</Typography></th>
                                <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-blue-600">PO Val</Typography></th>
                                <th className="px-3 py-3 text-center bg-rose-50/10"><Typography variant="label" className="font-black text-[11px] text-rose-700">BO #</Typography></th>
                                <th className={`px-3 py-3 text-right bg-rose-50/10 ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-rose-700">BO Val</Typography></th>
                                <th className={`px-3 py-3 text-center ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-slate-600">Exc #</Typography></th>
                                <th className={`px-3 py-3 text-right ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-black text-[11px] text-slate-600">Exc Val</Typography></th>
                                <th className={`px-3 py-3 text-center border-l border-slate-200 ${isMobile ? 'hidden' : ''}`}><Typography variant="label" className="font-extrabold text-[11px] !italic text-slate-500">% Exc</Typography></th>
                            </tr>
                        </thead>
                        <tbody>
                            {LOIS_HIERARCHY.map(group => {
                                const groupStockVal = group.sub.reduce((s, k) => s + (matrixData[k]?.stockVal || 0), 0);
                                const groupPoVal = group.sub.reduce((s, k) => s + (matrixData[k]?.poVal || 0), 0);
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
                                        {group.sub.length > 0 && group.sub.map(subKey => (
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
                                    <Typography variant="label" className="text-slate-500 font-black text-[11px]">TỔNG CỘNG</Typography>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                    <Typography variant="body" className="font-black text-[13px] text-slate-900">{formatNum(grandStats.grandTurnover)}</Typography>
                                </td>
                                <td className={`px-3 py-2.5 text-right ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="label" className="font-black text-[11px] !italic text-slate-400">100%</Typography>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                    <Typography variant="body" className="font-black text-[13px] text-slate-900">{grandStats.totalSKUs.toLocaleString()}</Typography>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                    <Typography variant="body" className="font-black text-[13px] text-rose-600">{grandStats.grandNoStock.toLocaleString()}</Typography>
                                </td>
                                <td className={`px-3 py-2.5 text-center ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-amber-600">{grandStats.grandShort.toLocaleString()}</Typography>
                                </td>
                                <td className={`px-3 py-2.5 text-right ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-blue-700">{formatNum(grandStats.grandStock)}</Typography>
                                </td>
                                <td className={`px-3 py-1 text-center border-x border-slate-200 bg-slate-200/50 ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="label" className="font-black text-[12px] !italic text-blue-800">{(grandStats.grandTurnover > 0 ? (grandStats.grandStock * 12 / grandStats.grandTurnover) : 0).toFixed(1)}M</Typography>
                                </td>
                                <td className={`px-3 py-4 text-right ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-slate-600">{formatNum(grandStats.grandPOVal)}</Typography>
                                </td>
                                <td className="px-3 py-4 text-center bg-rose-50/30">
                                    <Typography variant="body" className="font-black text-[13px] text-rose-700">{grandStats.grandBOItems.toLocaleString()}</Typography>
                                </td>
                                <td className={`px-3 py-4 text-right bg-rose-50/30 ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-rose-700">{formatNum(grandStats.grandBOValue)}</Typography>
                                </td>
                                <td className={`px-3 py-4 text-center ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-slate-500">{grandStats.grandExcessItems.toLocaleString()}</Typography>
                                </td>
                                <td className={`px-3 py-4 text-right ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="body" className="font-black text-[13px] text-slate-500">{formatNum(grandStats.grandExcess)}</Typography>
                                </td>
                                <td className={`px-3 py-4 text-center rounded-br-xl border-l border-slate-200 ${isMobile ? 'hidden' : ''}`}>
                                    <Typography variant="label" className="text-blue-700 font-black text-[12px] !italic">{(grandStats.grandStock > 0 ? (grandStats.grandExcess / grandStats.grandStock) * 100 : 0).toFixed(1)}%</Typography>
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
                exportOptions={appSettings ? {
                    separator: appSettings.exportSeparator === 'semicolon' ? ';' : appSettings.exportSeparator === 'tab' ? '\t' : ',',
                    encoding: appSettings.exportEncoding,
                    decimalPrecision: appSettings.exportDecimalPrecision,
                    exportColumns: appSettings.exportColumns,
                } as CsvExportOptions : undefined}
            />
            </>}
        </div>
    );
};

