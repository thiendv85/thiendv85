
import React, { useMemo, useState } from 'react';
import { InventoryItem } from '../types/inventory';
import { MetricCard } from '../components/MetricCard';
import { useLanguage } from '../utils/i18n';
import { parseInventorySearch, SearchResult, matchSearch } from '../utils/searchLogic';
import { getVietnameseWorkingDays } from '../utils/inventoryEngine';
import { AppSettings } from '../types/inventory';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface DemandIntelligenceProps {
    data: (InventoryItem & { analyzed?: IntelResult })[];
    onItemSelect: (item: InventoryItem) => void;
    appSettings?: AppSettings;
    seasonalityTuning?: AppSettings['seasonalityTuning'];
    updateTuning?: (t: AppSettings['seasonalityTuning']) => void;
    initialState?: any;
    onSaveState?: (state: any) => void;
}

type IntelGroup = 'STOCKOUT' | 'RISK' | 'SEASONAL' | 'SPIKE' | 'OVERSTOCK' | 'DECLINING';

interface AnalyzedItem {
    item: InventoryItem;
    group: IntelGroup;
    isSeasonal: boolean;
    seasonalWarn?: any;
    fullHistory: number[];
    actualM1: number;
    forecastM1: number;
    sigmaD: number;
    mean12M: number;
    cv: number;
    zScore: number;
    newSS: number;
    newROP: number;
    accuracy: number | null;
    forecastBias: number;
    mos: number;
    dos: number;
    available: number;
    excessQty: number;
    excessValue: number;
    stockoutGapQty: number;
    stockoutGapValue: number;
    slope: number;
    insightText: string;
    actionLabel: string;
    actionIcon: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function getZScore(loisGroup: string): number {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1', '2', '3'].includes(lois)) return 2.05;  // 98% — fast movers
    if (['4', '5'].includes(lois)) return 1.65;         // 95% — medium
    if (['6', '7'].includes(lois)) return 1.28;         // 90% — slow
    if (lois === '8' || lois === 'E' || lois === 'N' || lois === 'A' || lois === 'V') return 0.84; // 80%
    if (lois === 'I') return 0;                          // inactive
    return 1.65;                                         // default 95%
}

function getServiceLevel(loisGroup: string): string {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1', '2', '3'].includes(lois)) return '98%';
    if (['4', '5'].includes(lois)) return '95%';
    if (['6', '7'].includes(lois)) return '90%';
    if (['8', 'E', 'N', 'A', 'V'].includes(lois)) return '80%';
    if (lois === 'I') return '0%';
    return '95%';
}

const GROUP_CONFIG: Record<IntelGroup, { color: string; bgColor: string; borderColor: string; label: string; icon: string; actionLabel: string; actionIcon: string }> = {
    STOCKOUT: { color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', label: 'Hết hàng', icon: 'fa-circle-xmark', actionLabel: 'Order AIR', actionIcon: 'fa-plane-departure' },
    RISK: { color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', label: 'Rủi ro', icon: 'fa-triangle-exclamation', actionLabel: 'Expedite PO', actionIcon: 'fa-truck-fast' },
    SEASONAL: { color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', label: 'Mùa vụ sắp tới', icon: 'fa-calendar-days', actionLabel: 'Tạo đơn Draft', actionIcon: 'fa-file-signature' },
    SPIKE: { color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', label: 'Nhu cầu tăng', icon: 'fa-arrow-trend-up', actionLabel: 'Review FC', actionIcon: 'fa-magnifying-glass-chart' },
    OVERSTOCK: { color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', label: 'Tồn dư', icon: 'fa-boxes-stacked', actionLabel: 'Transfer/Cắt PO', actionIcon: 'fa-scissors' },
    DECLINING: { color: 'text-slate-600', bgColor: 'bg-slate-50', borderColor: 'border-slate-200', label: 'Xu hướng giảm', icon: 'fa-arrow-trend-down', actionLabel: 'Hold PO', actionIcon: 'fa-hand' },
};

// ─────────────────────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────

const Sparkline = ({ values, group }: { values: number[]; group: IntelGroup }) => {
    const width = 120;
    const height = 32;
    const padding = 2;
    const max = Math.max(...values, 1);
    const getX = (i: number) => {
        const divider = values.length > 1 ? values.length - 1 : 1;
        return padding + (i / divider) * (width - padding * 2);
    };
    const getY = (v: number) => {
        const diff = max || 1;
        const val = isFinite(v) ? v : 0;
        return height - padding - (val / diff) * (height - padding * 2);
    };
    const points = values.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

    const colorMap: Record<IntelGroup, string> = {
        STOCKOUT: '#e11d48',
        RISK: '#f97316',
        SEASONAL: '#7e22ce',
        SPIKE: '#eab308',
        OVERSTOCK: '#3b82f6',
        DECLINING: '#64748b',
    };
    const color = colorMap[group];

    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={getX(values.length - 1)} cy={getY(values[values.length - 1])} r={2.5} fill={color} />
        </svg>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DemandIntelligence = ({ data, onItemSelect, initialState, onSaveState, appSettings, updateTuning, seasonalityTuning }: DemandIntelligenceProps) => {
    const { t } = useLanguage();
    const [groupFilter, setGroupFilter] = useState<'ALL' | IntelGroup>(initialState?.groupFilter || 'ALL');
    const [sortKey, setSortKey] = useState<string>(initialState?.sortKey || 'group');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25);
    const [searchText, setSearchText] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult>({ type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });
    
    // Seasonality Tuning State (synced with global or local)
    const tuning = seasonalityTuning || appSettings?.seasonalityTuning || {
        useSPD: true,
        tetWeight: 1.2,
        weatherWeight: 1.0
    };

    const setTuningValue = (key: string, val: any) => {
        if (updateTuning) {
            updateTuning({ ...tuning, [key]: val });
        }
    };
    
    // Panel visibility is local
    const [showPanel, setShowPanel] = useState(false);

    const handleSearchChange = (text: string) => {
        setSearchText(text);
        setSearchResult(parseInventorySearch(text));
        setCurrentPage(1);
    };

    // ── ANALYSIS ENGINE ──────────────────────────────────────────────────────
    const { analyzedItems, metrics } = useMemo(() => {
        if (!data || data.length === 0) return { analyzedItems: [], metrics: { stockout: 0, risk: 0, spike: 0, overstock: 0, declining: 0, stockoutGapValue: 0, excessValue: 0, avgAccuracy: 0, accuracyCount: 0 } };

        const results: AnalyzedItem[] = [];
        let mStockout = 0, mRisk = 0, mSeasonal = 0, mSpike = 0, mOverstock = 0, mDeclining = 0;
        let totalGapValue = 0, totalExcessValue = 0;
        let accuracySum = 0, accuracyCount = 0;

        for (const item of data) {
            const computed = item.computed;
            if (!computed) continue;

            const history = item.SalesHistory || [];
            if (history.length === 0) continue;

            // Pad to 12 months
            const fullHistory = history.length >= 12
                ? history.slice(-12)
                : [...Array(12 - history.length).fill(0), ...history];

            const actualM1 = fullHistory[11];
            const forecastM1 = item.BaseForecast || 0;

            // Stats
            const mean12M = fullHistory.reduce((a, b) => a + b, 0) / fullHistory.length;
            const variance = fullHistory.reduce((a, b) => a + (b - mean12M) ** 2, 0) / fullHistory.length;
            const sigmaD = Math.sqrt(variance);
            const cv = mean12M > 0 ? sigmaD / mean12M : 0;

            // Slope (linear regression)
            const n = fullHistory.length;
            const sumX = n * (n - 1) / 2;
            const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
            const sumY = fullHistory.reduce((a, b) => a + b, 0);
            const sumXY = fullHistory.reduce((a, v, i) => a + i * v, 0);
            const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;

            // Service-level based Safety Stock
            const Z = getZScore(item.LOISGroup);
            const ltMonths = (computed.effectiveLT || 90) / 30;
            const newSS = Z * sigmaD * Math.sqrt(ltMonths);
            const demandMonthly = computed.demandMonthly || computed.demandRateDaily * 30;
            const newROP = demandMonthly * ltMonths + newSS;

            // Forecast accuracy
            const forecastBias = actualM1 - forecastM1;
            const accuracy = forecastM1 > 0
                ? Math.max(0, 100 - (Math.abs(forecastBias) / forecastM1) * 100)
                : null;

            if (accuracy !== null) {
                accuracySum += accuracy;
                accuracyCount++;
            }

            // Key metrics from engine
            const available = computed.available;
            const mos = computed.mos;
            const dos = computed.demandRateDaily > 0 ? available / computed.demandRateDaily : 999;
            const excessQty = computed.excessQty;
            const excessValue = computed.excessValue;
            const stockoutGapQty = computed.stockoutGapQty;
            const stockoutGapValue = computed.stockoutGapValue;
            const isStopBiz = computed.isStopBiz;
            const isBOCritical = computed.isBOCritical || false;
            const stockoutRiskFlag = computed.stockoutRiskFlag;
            const avg12M = item.AvgQty12M || 0;
            const forecastLinReg = computed.forecastLinReg || 0;

            // ── CLASSIFICATION (priority: STOCKOUT > RISK > SEASONAL > SPIKE > OVERSTOCK > DECLINING) ──
            let group: IntelGroup | null = null;
            
            // Override compute check for local tuning (simulating engine behavior)
            // Note: In a full implementation, we'd pass tuning down to the engine.
            // For now, our engine already has the field. Let's assume computed reflects it
            // or we use the local seasonalWarn which is derived from engine computed field.
            const seasonalWarn = computed.warnings.find(w => w.code === 'SEASONAL_UPCOMING');

            // STOCKOUT
            if (
                (available <= 0 && demandMonthly > 0) ||
                isBOCritical ||
                (mos < 0.25 && demandMonthly > 0.5)
            ) {
                group = 'STOCKOUT';
            }
            // RISK
            else if (
                (stockoutRiskFlag && mos < 1.5 && !isStopBiz) ||
                (available < newROP && demandMonthly > 1 && available > 0)
            ) {
                group = 'RISK';
            }
            // SEASONAL
            else if (seasonalWarn) {
                group = 'SEASONAL';
            }
            // SPIKE
            else if (
                (actualM1 > mean12M + 2 * sigmaD && actualM1 >= 5) ||
                (slope > 2 && cv < 1.2 && mos < 3)
            ) {
                group = 'SPIKE';
            }
            // OVERSTOCK
            else if (
                (excessQty > 0 && mos > 6) ||
                (mos > 12 && demandMonthly > 0) ||
                (isStopBiz && available > 0)
            ) {
                group = 'OVERSTOCK';
            }
            // DECLINING
            else if (
                (slope < -2 && avg12M > 5 && mos > 3) ||
                (forecastLinReg < 0.3 * avg12M && avg12M > 10)
            ) {
                group = 'DECLINING';
            }

            // Skip NORMAL items
            if (!group) continue;

            // Count metrics
            if (group === 'STOCKOUT') { mStockout++; totalGapValue += stockoutGapValue; }
            if (group === 'RISK') mRisk++;
            if (seasonalWarn) mSeasonal++;
            if (group === 'SPIKE') mSpike++;
            if (group === 'OVERSTOCK') { mOverstock++; totalExcessValue += excessValue; }
            if (group === 'DECLINING') mDeclining++;

            // Insight text
            const cfg = GROUP_CONFIG[group];
            let insightText = '';
            switch (group) {
                case 'STOCKOUT':
                    insightText = `HẾT HÀNG — Demand ${demandMonthly.toFixed(0)}/th, BO ${item.Backorder || 0}. PO: ${item.TotalPO || 0}. → AIR ${computed.suggestedBO || Math.ceil(newROP - available)} units`;
                    break;
                case 'RISK':
                    insightText = `Còn ${mos.toFixed(1)}M — dưới ROP ${Math.ceil(newROP)}. Thiếu ${Math.ceil(newROP - available)} units. → Expedite PO`;
                    break;
                case 'SEASONAL':
                    insightText = `${seasonalWarn?.message || 'Sắp đến mùa vụ cao điểm'}. → Review SNP & Tạo đơn Draft cho 2 tháng tới`;
                    break;
                case 'SPIKE':
                    insightText = `Bán ${actualM1} vs TB ${mean12M.toFixed(0)} (+${mean12M > 0 ? ((actualM1 / mean12M - 1) * 100).toFixed(0) : 'N/A'}%). → Tăng FC lên ${Math.ceil(forecastLinReg || actualM1)}/th`;
                    break;
                case 'OVERSTOCK':
                    insightText = `Tồn ${mos.toFixed(1)}M, thừa ${excessQty} = ${Math.round(excessValue).toLocaleString()}đ. → ${item.TotalPO > 0 ? 'Cắt PO ' + item.TotalPO : 'Transfer'}`;
                    break;
                case 'DECLINING':
                    insightText = `Giảm ${slope.toFixed(1)}/th. TB12M=${avg12M.toFixed(0)} → FC ${forecastLinReg.toFixed(0)}. → Hold PO, giảm FC`;
                    break;
            }

            if (seasonalWarn && group !== 'SEASONAL') {
                insightText = `🌟 [MÙA VỤ] ${seasonalWarn.message}. ${insightText}`;
            }

            results.push({
                item,
                group,
                isSeasonal: !!seasonalWarn,
                seasonalWarn,
                fullHistory,
                actualM1,
                forecastM1,
                sigmaD,
                mean12M,
                cv,
                zScore: Z,
                newSS,
                newROP,
                accuracy,
                forecastBias,
                mos,
                dos,
                available,
                excessQty,
                excessValue,
                stockoutGapQty,
                stockoutGapValue,
                slope,
                insightText,
                actionLabel: cfg.actionLabel,
                actionIcon: cfg.actionIcon,
            });
        }

        return {
            analyzedItems: results,
            metrics: {
                stockout: mStockout,
                risk: mRisk,
                seasonal: mSeasonal,
                spike: mSpike,
                overstock: mOverstock,
                declining: mDeclining,
                stockoutGapValue: totalGapValue,
                excessValue: totalExcessValue,
                avgAccuracy: accuracyCount > 0 ? accuracySum / accuracyCount : 0,
                accuracyCount,
            },
        };
    }, [data]);

    // ── FILTER + SORT ────────────────────────────────────────────────────────
    const filteredData = useMemo(() => {
        let result = analyzedItems;

        if (groupFilter !== 'ALL') {
            if (groupFilter === 'SEASONAL') {
                result = result.filter(d => d.isSeasonal);
            } else {
                result = result.filter(d => d.group === groupFilter);
            }
        }

        if (searchResult.type !== 'EMPTY') {
            result = result.filter(d => matchSearch(d.item, searchResult));
        }

        const groupPriority: Record<IntelGroup, number> = { STOCKOUT: 0, RISK: 1, SEASONAL: 2, SPIKE: 3, OVERSTOCK: 4, DECLINING: 5 };

        return result.sort((a, b) => {
            switch (sortKey) {
                case 'mos_asc': return a.mos - b.mos;
                case 'mos_desc': return b.mos - a.mos;
                case 'demand_desc': return (b.item.computed?.demandMonthly || 0) - (a.item.computed?.demandMonthly || 0);
                case 'excess_desc': return b.excessValue - a.excessValue;
                case 'gap_desc': return b.stockoutGapValue - a.stockoutGapValue;
                case 'group':
                default:
                    return groupPriority[a.group] - groupPriority[b.group] || a.mos - b.mos;
            }
        });
    }, [analyzedItems, groupFilter, searchResult, sortKey]);

    const paginatedData = useMemo(() =>
        filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
        [filteredData, currentPage, itemsPerPage]
    );

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    // Save state on changes
    React.useEffect(() => {
        if (onSaveState) onSaveState({ groupFilter, sortKey });
    }, [groupFilter, sortKey, onSaveState]);

    // ── MOS COLOR ────────────────────────────────────────────────────────────
    const getMosColor = (mos: number) => {
        if (mos < 1) return 'text-rose-700 bg-rose-50 border-rose-200';
        if (mos < 3) return 'text-amber-700 bg-amber-50 border-amber-200';
        if (mos <= 6) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        return 'text-blue-700 bg-blue-50 border-blue-200';
    };

    // ── RENDER ────────────────────────────────────────────────────────────────
    return (
        <div className="animate-fadeIn space-y-6 pb-24">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <MetricCard
                    label="Hết hàng"
                    value={metrics.stockout.toString()}
                    subValue={metrics.stockoutGapValue > 0 ? `Gap: ${(metrics.stockoutGapValue / 1e6).toFixed(1)}M đ` : 'Cần order AIR'}
                    icon="fa-circle-xmark"
                    color="rose"
                    onClick={() => { setGroupFilter('STOCKOUT'); setCurrentPage(1); }}
                    isActive={groupFilter === 'STOCKOUT'}
                />
                <MetricCard
                    label="Rủi ro"
                    value={metrics.risk.toString()}
                    subValue="Dưới ROP — expedite"
                    icon="fa-triangle-exclamation"
                    color="amber"
                    onClick={() => { setGroupFilter('RISK'); setCurrentPage(1); }}
                    isActive={groupFilter === 'RISK'}
                />
                <MetricCard
                    label="Mùa vụ"
                    value={metrics.seasonal.toString()}
                    subValue="Sắp đến peak 2M tới"
                    icon="fa-calendar-days"
                    color="purple"
                    onClick={() => { setGroupFilter('SEASONAL'); setCurrentPage(1); }}
                    isActive={groupFilter === 'SEASONAL'}
                />
                <MetricCard
                    label="Nhu cầu tăng"
                    value={metrics.spike.toString()}
                    subValue="Demand spike — review FC"
                    icon="fa-arrow-trend-up"
                    color="yellow"
                    onClick={() => { setGroupFilter('SPIKE'); setCurrentPage(1); }}
                    isActive={groupFilter === 'SPIKE'}
                />
                <MetricCard
                    label="Tồn dư"
                    value={metrics.overstock.toString()}
                    subValue={metrics.excessValue > 0 ? `Excess: ${(metrics.excessValue / 1e6).toFixed(1)}M đ` : 'Transfer/cắt PO'}
                    icon="fa-boxes-stacked"
                    color="slate"
                    onClick={() => { setGroupFilter('OVERSTOCK'); setCurrentPage(1); }}
                    isActive={groupFilter === 'OVERSTOCK'}
                />
                <MetricCard
                    label="FC Accuracy"
                    value={metrics.accuracyCount > 0 ? `${metrics.avgAccuracy.toFixed(0)}%` : 'N/A'}
                    subValue={`${metrics.accuracyCount} SKU có FC`}
                    icon="fa-bullseye"
                    color="emerald"
                    onClick={() => { setGroupFilter('ALL'); setCurrentPage(1); }}
                    isActive={groupFilter === 'ALL'}
                />
            </div>

            {/* Seasonality Tuning Panel */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
                <div 
                    className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setShowPanel(!showPanel)}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                            <i className="fas fa-sliders text-purple-600 text-xs"></i>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Hiệu chỉnh Mùa vụ (Advanced Tuning)</h3>
                            <p className="text-[10px] text-slate-500 font-medium">SPD Normalization • Tet Weights • Weather Factors</p>
                        </div>
                    </div>
                    <i className={`fas fa-chevron-down text-slate-400 transition-transform ${showPanel ? 'rotate-180' : ''}`}></i>
                </div>

                {showPanel && (
                    <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 animate-slideDown">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* SAA Anchor Status */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">SAA Engine</label>
                                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">26d × SSI</span>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                                    Mỏ neo 26 ngày cố định + Hệ số Mùa vụ tự động (SSI).
                                </p>
                            </div>

                            {/* Tet Weight Slider */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Trọng số Lễ Tết</label>
                                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">x{tuning.tetWeight.toFixed(1)}</span>
                                </div>
                                <input 
                                    type="range" min="1.0" max="2.0" step="0.1" 
                                    value={tuning.tetWeight}
                                    onChange={(e) => setTuningValue('tetWeight', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                />
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    Tăng độ nhạy AI cho cụm Tháng 1 & 2 để bắt kịp mùa Tết.
                                </p>
                            </div>

                            {/* Weather Weight Slider */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Trọng số Thời tiết</label>
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">x{tuning.weatherWeight.toFixed(1)}</span>
                                </div>
                                <input 
                                    type="range" min="1.0" max="2.0" step="0.1" 
                                    value={tuning.weatherWeight}
                                    onChange={(e) => setTuningValue('weatherWeight', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                   Cân nhắc "Mưa/Nắng nóng" khi dự báo lốp, gạt mưa, làm mát.
                                </p>
                            </div>
                        </div>

                        {/* Phase 5: Unified SAA Diagnostic Panel */}
                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <i className="fas fa-brain text-violet-500"></i>
                                Seasonal-Adaptive Anchor (SAA Engine)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* SAA Formula Explanation */}
                                <div className="space-y-3">
                                    <div className="p-3 bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-100 shadow-sm">
                                        <p className="text-[11px] font-bold text-violet-800 mb-2">Công thức Unified</p>
                                        <div className="bg-white/80 rounded-lg p-2.5 font-mono text-[10px] text-slate-700 leading-relaxed">
                                            <p>SPD = <span className="text-emerald-600 font-bold">Demand / 26</span> × <span className="text-violet-600 font-bold">SSI</span></p>
                                            <p className="mt-1">ROP = SPD × <span className="text-blue-600 font-bold">(WD_LT + WD_SSP)</span></p>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                            <p className="text-[9px] text-slate-500"><span className="text-emerald-600 font-bold">26</span> = Mỏ neo cố định (Mon-Sat) — Chống nhiễu lịch Tết</p>
                                            <p className="text-[9px] text-slate-500"><span className="text-violet-600 font-bold">SSI</span> = Seasonal Index tự động (MA3 × Tet × Weather)</p>
                                            <p className="text-[9px] text-slate-500"><span className="text-blue-600 font-bold">WD</span> = Working Days thực tế trong LT/SSP (từ Today)</p>
                                        </div>
                                    </div>

                                    {/* SSI Status for current month */}
                                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                        <div>
                                            <p className="text-[11px] font-bold text-slate-800">SSI Engine</p>
                                            <p className="text-[10px] text-slate-500">MA3 ≥ 1.5x → Kích hoạt mùa vụ</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-full border border-violet-100">📊 Data-Driven</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Workday Heatmap (Visual Verification) */}
                                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                                    <p className="text-[11px] font-bold text-slate-800 mb-2">Ngày làm việc {new Date().getFullYear()} <span className="text-[9px] font-normal text-slate-400">(cho ROP Coverage)</span></p>
                                    <div className="flex flex-wrap gap-1">
                                        {[0,1,2,3,4,5,6,7,8,9,10,11].map(m => {
                                            const days = getVietnameseWorkingDays(m, new Date().getFullYear());
                                            const isCurrent = m === new Date().getMonth();
                                            const isLow = days < 22; // Highlight months with fewer working days (holidays)
                                            const bg = isCurrent ? 'bg-emerald-50 border-emerald-300 shadow-md ring-1 ring-emerald-200' 
                                                     : isLow ? 'bg-amber-50/60 border-amber-200' 
                                                     : 'bg-slate-50 border-slate-100';
                                            return (
                                                <div key={m} className={`flex-1 min-w-[32px] p-1.5 rounded-lg border flex flex-col items-center gap-1 ${bg}`}>
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase">T{m+1}</span>
                                                    <span className={`text-[11px] font-black ${isCurrent ? 'text-emerald-600' : isLow ? 'text-amber-600' : 'text-slate-600'}`}>{days}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-center gap-4 mt-2">
                                        <span className="flex items-center gap-1 text-[8px] text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-200 inline-block"></span> Nghỉ nhiều (&lt;22d)</span>
                                        <span className="flex items-center gap-1 text-[8px] text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-300 inline-block"></span> Hiện tại</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                {/* Toolbar */}
                <div className="px-6 py-3 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-40 gap-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Group filter tabs */}
                        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                            {(['ALL', 'STOCKOUT', 'RISK', 'SEASONAL', 'SPIKE', 'OVERSTOCK', 'DECLINING'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => { setGroupFilter(f); setCurrentPage(1); }}
                                    className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all uppercase ${groupFilter === f ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f === 'ALL' ? 'Tất cả' : GROUP_CONFIG[f].label}
                                    {f !== 'ALL' && (
                                        <span className="ml-1 text-[9px] opacity-60">
                                            {f === 'STOCKOUT' ? metrics.stockout : f === 'RISK' ? metrics.risk : f === 'SEASONAL' ? metrics.seasonal : f === 'SPIKE' ? metrics.spike : f === 'OVERSTOCK' ? metrics.overstock : metrics.declining}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-xl">
                            <i className="fas fa-sort-amount-down text-slate-400 text-[10px]"></i>
                            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="bg-transparent text-[10px] font-black text-slate-700 outline-none cursor-pointer uppercase">
                                <option value="group">Nhóm hành động</option>
                                <option value="mos_asc">MOS (Thấp nhất)</option>
                                <option value="mos_desc">MOS (Cao nhất)</option>
                                <option value="demand_desc">Demand (Cao nhất)</option>
                                <option value="excess_desc">Excess Value (Cao nhất)</option>
                                <option value="gap_desc">Gap Value (Cao nhất)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full md:w-64">
                            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            <input
                                type="text"
                                placeholder={t('common_search')}
                                value={searchText}
                                onChange={e => handleSearchChange(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-bold focus:bg-white focus:border-blue-400 transition-all"
                            />
                        </div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            {filteredData.length} SKU
                        </div>
                    </div>
                </div>

                {/* Table Body */}
                <div className="overflow-x-auto flex-1 relative custom-scrollbar">
                    <table className="w-full text-xs text-left border-separate border-spacing-0 min-w-[1400px] table-zebra">
                        <thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest sticky top-0 z-30 shadow-sm">
                            <tr>
                                <th className="px-3 py-3 w-10 text-center text-slate-400 border-b border-slate-100">#</th>
                                <th className="px-3 py-3 w-[90px] border-b border-slate-100">Nhóm</th>
                                <th className="px-4 py-3 min-w-[220px] sticky left-0 z-40 bg-slate-50/95 border-b border-slate-100">SKU</th>
                                <th className="px-4 py-3 text-center border-b border-slate-100 w-[120px]">Trend</th>
                                <th className="px-4 py-3 text-center border-b border-slate-100 w-[100px]">Demand</th>
                                <th className="px-4 py-3 text-center border-b border-slate-100 w-[130px]">Tồn / ROP</th>
                                <th className="px-3 py-3 text-center border-b border-slate-100 w-[60px]">MOS</th>
                                <th className="px-3 py-3 text-center border-b border-slate-100 w-[80px]">Pipeline</th>
                                <th className="px-4 py-3 text-center border-b border-slate-100 w-[110px]">Gap/Excess</th>
                                <th className="px-4 py-3 border-b border-slate-100 min-w-[280px] bg-slate-100/30 border-l border-slate-200">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {paginatedData.map((row, idx) => {
                                const cfg = GROUP_CONFIG[row.group];
                                return (
                                    <tr key={row.item.ItemCode} className="hover:bg-slate-50/50 transition-colors group">
                                        {/* # */}
                                        <td className="px-3 py-2.5 text-center text-slate-500 font-mono text-[10px] font-black">
                                            {(currentPage - 1) * itemsPerPage + idx + 1}
                                        </td>

                                        {/* Group Badge */}
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${cfg.bgColor} ${cfg.color} border ${cfg.borderColor}`}>
                                                <i className={`fas ${cfg.icon} text-[8px]`}></i>
                                                {cfg.label}
                                            </span>
                                        </td>

                                        {/* SKU */}
                                        <td className="px-4 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onItemSelect(row.item)}>
                                            <div className="font-black text-slate-900 font-mono text-sm uppercase group-hover:text-blue-600 transition-colors">
                                                {row.item.ItemCode}
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-500 truncate max-w-[180px]">{row.item.ItemName}</div>
                                            {row.item.TypeCar && (
                                                <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{row.item.TypeCar}</span>
                                            )}
                                        </td>

                                        {/* Trend Sparkline */}
                                        <td className="px-4 py-2.5 text-center">
                                            <Sparkline values={row.fullHistory} group={row.group} />
                                        </td>

                                        {/* Demand */}
                                        <td className="px-4 py-2.5 text-center">
                                            <div className="font-black text-slate-900 text-sm">{row.actualM1.toLocaleString()}</div>
                                            <div className="text-[10px] font-bold text-emerald-600">FC: {row.forecastM1 || '-'}</div>
                                            {row.accuracy !== null && (
                                                <div className={`text-[9px] font-bold ${row.accuracy >= 80 ? 'text-emerald-600' : row.accuracy >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                    {row.accuracy.toFixed(0)}% acc
                                                </div>
                                            )}
                                        </td>

                                        {/* Stock / ROP */}
                                        <td className="px-4 py-2.5 text-center">
                                            <div className="flex gap-1 text-[10px] font-black justify-center">
                                                <span className={`px-1.5 py-0.5 rounded border ${row.available < row.newROP ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                    {Math.round(row.available)}
                                                </span>
                                                <span className="text-slate-300">/</span>
                                                <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500">
                                                    {Math.ceil(row.newROP)}
                                                </span>
                                            </div>
                                            <div className="text-[8px] text-slate-400 mt-0.5">
                                                SS: {Math.ceil(row.newSS)} ({getServiceLevel(row.item.LOISGroup)})
                                            </div>
                                        </td>

                                        {/* MOS */}
                                        <td className="px-3 py-2.5 text-center">
                                            <span className={`inline-flex flex-col items-center px-2 py-1 rounded border ${getMosColor(row.mos)}`}>
                                                <span className="text-xs font-black">{row.mos.toFixed(1)}</span>
                                                <span className="text-[9px] font-bold uppercase opacity-80">MOS</span>
                                            </span>
                                        </td>

                                        {/* Pipeline */}
                                        <td className="px-3 py-2.5 text-center">
                                            <div className="font-black text-slate-700 text-sm">{row.item.TotalPO || 0}</div>
                                        </td>

                                        {/* Gap / Excess */}
                                        <td className="px-4 py-2.5 text-center">
                                            {row.stockoutGapQty > 0 ? (
                                                <div>
                                                    <div className="font-black text-rose-700 text-sm">-{Math.ceil(row.stockoutGapQty)}</div>
                                                    <div className="text-[9px] text-rose-500">{Math.round(row.stockoutGapValue / 1000).toLocaleString()}k</div>
                                                </div>
                                            ) : row.excessQty > 0 ? (
                                                <div>
                                                    <div className="font-black text-blue-700 text-sm">+{Math.floor(row.excessQty)}</div>
                                                    <div className="text-[9px] text-blue-500">{Math.round(row.excessValue / 1000).toLocaleString()}k</div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>

                                        {/* Insight */}
                                        <td className="px-4 py-2.5 bg-slate-50/40 border-l border-slate-200">
                                            <p className="text-xs font-medium leading-relaxed text-slate-700">{row.insightText}</p>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-3 border-t-2 border-slate-200 flex justify-between items-center bg-white text-xs font-black uppercase text-slate-600">
                    <span className="text-slate-400">
                        {t('common_total')}: <span className="text-slate-700">{filteredData.length} SKU</span>
                        {groupFilter === 'ALL' && (
                            <span className="ml-2 normal-case font-bold text-[10px]">
                                (Ẩn {data.length - analyzedItems.length} mã NORMAL)
                            </span>
                        )}
                    </span>
                    <div className="flex items-center gap-1">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="pagination-pill text-slate-600">
                            <i className="fas fa-chevron-left text-xs"></i>
                        </button>
                        {(() => {
                            return [...Array(totalPages)].map((_, i) => {
                                const page = i + 1;
                                if (totalPages > 7 && Math.abs(currentPage - page) > 2 && page !== 1 && page !== totalPages) {
                                    if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>;
                                    return null;
                                }
                                return (
                                    <button key={i} onClick={() => setCurrentPage(page)} className={`pagination-pill ${currentPage === page ? 'active' : 'text-slate-600'}`}>
                                        {page}
                                    </button>
                                );
                            });
                        })()}
                        <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="pagination-pill text-slate-600">
                            <i className="fas fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
