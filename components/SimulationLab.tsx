
import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../types/inventory';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../utils/i18n';
import { Typography } from './Typography';

interface SimulationLabProps {
    item: InventoryItem;
}

// Redesigned MetricBar with better visibility
const MetricBar = ({ label, baseline, scenario, unit = '', showDelta = true }: {
    label: string,
    baseline: number,
    scenario?: number,
    unit?: string,
    showDelta?: boolean
}) => {
    const max = scenario ? Math.max(baseline, scenario) : baseline;
    // Prevent division by zero if max is 0
    const safeMax = max > 0 ? max : 1;
    const delta = scenario ? ((scenario - baseline) / (baseline || 1) * 100) : 0;
    const isIncrease = delta > 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Typography variant="label" className="text-slate-500 uppercase tracking-wider">{label}</Typography>
                {scenario && showDelta && Math.abs(delta) > 0.1 && (
                    <Typography variant="mono-sm" className={`px-2 py-0.5 rounded-lg border font-bold ${isIncrease ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        }`}>
                        {isIncrease ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
                    </Typography>
                )}
            </div>

            {/* Baseline bar */}
            <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden relative shadow-inner">
                    <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${Math.min((baseline / safeMax) * 100, 100)}%` }}
                    ></div>
                </div>
                <Typography variant="h3" className="text-slate-900 min-w-[70px] text-right">
                    {baseline.toLocaleString()}<span className="text-xs text-slate-400 ml-0.5">{unit}</span>
                </Typography>
            </div>

            {/* Scenario bar */}
            {scenario !== undefined && (
                <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden relative shadow-inner">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${isIncrease
                                ? 'bg-gradient-to-r from-orange-400 to-rose-500'
                                : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                }`}
                            style={{ width: `${Math.min((scenario / safeMax) * 100, 100)}%` }}
                        ></div>
                    </div>
                    <Typography variant="h3" className={`min-w-[70px] text-right ${isIncrease ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {scenario.toLocaleString()}<span className="text-xs opacity-70 ml-0.5">{unit}</span>
                    </Typography>
                </div>
            )}
        </div>
    );
};

export const SimulationLab = ({ item }: SimulationLabProps) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'BASIC' | 'SCENARIO'>('BASIC');

    // Current inventory position
    const currentStock = useMemo(() => {
        return (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0) +
            (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0);
    }, [item]);

    // Basic State - Initialize with smart defaults from engine logic
    const computed = item.computed;
    const [simLT, setSimLT] = useState(computed?.effectiveLT || 90);
    const [simSP, setSimSP] = useState(computed?.effectiveSP || 30); // Stock Period (Days)
    const [simSSP, setSimSSP] = useState(computed?.effectiveSSP || 30); // Safety Stock Period (Days)

    const [simDemand, setSimDemand] = useState(() => {
        // Priority: BaseForecast > Avg3M > Avg6M > Avg12M
        return item.BaseForecast > 0
            ? Math.round(item.BaseForecast)
            : Math.round(item.AvgQty3M || item.AvgQty6M || item.AvgQty12M || 0);
    });

    // Scenario State
    const [scenarioDemandPct, setScenarioDemandPct] = useState(0);
    const [scenarioLTPct, setScenarioLTPct] = useState(0);

    const [isForecasting, setIsForecasting] = useState(false);
    const [aiResult, setAIResult] = useState<any>(null);

    // Calculate sigma (standard deviation) for safety stock
    const sigma = useMemo(() => {
        const history = item.SalesHistory || [];
        if (history.length < 2) return 0;
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
        return Math.sqrt(variance);
    }, [item.SalesHistory]);

    // Smart input validation with context
    const inputWarnings = useMemo(() => {
        const warnings = [];
        const avgDemand = item.AvgQty12M || item.AvgQty6M || item.AvgQty3M || 1;

        if (simDemand < 0) {
            warnings.push({ type: 'error', msg: "❌ Demand không thể âm" });
        } else if (simDemand > avgDemand * 5) {
            warnings.push({ type: 'warning', msg: `⚠️ Demand gấp ${(simDemand / avgDemand).toFixed(1)}x TB` });
        } else if (simDemand > avgDemand * 3) {
            warnings.push({ type: 'info', msg: `ℹ️ Demand > 3x TB (${avgDemand.toFixed(0)})` });
        }

        if (simLT > 180) {
            warnings.push({ type: 'warning', msg: "⚠️ Lead time > 6 tháng" });
        } else if (simLT < 30) {
            warnings.push({ type: 'info', msg: "ℹ️ Lead time < 1 tháng" });
        }

        return warnings;
    }, [simDemand, simLT, item]);

    // Core calculation logic (Period-based, matching inventoryEngine.ts)
    const calculateMetrics = (demand: number, ltDays: number, spDays: number, sspDays: number) => {
        const demandRateDaily = demand / 30;

        // Match inventoryEngine.ts logic:
        // SS = daily × ssp
        // ROP = daily × (lt + ssp)
        // Max = ROP + daily × sp

        const safetyStock = demandRateDaily * sspDays;
        const rop = demandRateDaily * (ltDays + sspDays);
        const max = rop + demandRateDaily * spDays;

        // Net Reserve: Subtract backorder
        const netAvailable = Math.max(0, currentStock - (item.Backorder || 0));
        const netReserve = Math.max(0, currentStock + (item.TotalPO || 0) - (item.Backorder || 0));

        // REALISTIC CAPITAL: Only count what we need to ORDER
        const gapQty = Math.max(0, max - netReserve);
        const capitalRequired = gapQty * item.UnitCost_PP;

        // Stockout risk: if current + pipeline < ROP
        const totalSupply = currentStock + (item.TotalPO || 0);
        const stockoutRisk = netReserve < rop;
        const stockoutGap = stockoutRisk ? Math.max(0, rop - netReserve) : 0;

        // Months of stock
        const mos = demand > 0 ? (netAvailable / demand) : 0;

        // Stock at Delivery = netAvailable - projected consumption
        const stockAtDelivery = netAvailable - (demandRateDaily * ltDays);

        return {
            rop,
            max,
            safetyStock,
            capitalRequired,
            gapQty,
            stockoutRisk,
            stockoutGap,
            mos,
            totalSupply,
            stockAtDelivery,
            netAvailable
        };
    };

    const baseline = useMemo(() =>
        calculateMetrics(simDemand, simLT, simSP, simSSP),
        [simDemand, simLT, simSP, simSSP, currentStock, item.TotalPO]
    );

    const scenario = useMemo(() => {
        const d = simDemand * (1 + scenarioDemandPct / 100);
        const l = simLT * (1 + scenarioLTPct / 100);
        return calculateMetrics(d, l, simSP, simSSP);
    }, [simDemand, simLT, scenarioDemandPct, scenarioLTPct, simSP, simSSP, currentStock, item.TotalPO]);

    const handleSmartForecast = async () => {
        setIsForecasting(true);
        setAIResult(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Analyze SKU ${item.ItemCode}. History: ${item.SalesHistory.join(', ')}. Trend: ${item.TrendFlag}. Return JSON { "predicted_demand": number, "confidence": "HIGH"|"MEDIUM"|"LOW", "trend_analysis": "string" }`;
            const res = await ai.models.generateContent({ model: 'gemini-2.0-flash-exp', contents: prompt, config: { responseMimeType: "application/json" } });
            const result = JSON.parse(res.text);
            if (result.predicted_demand > 0) {
                setSimDemand(Math.round(result.predicted_demand));
                setAIResult(result);
            }
        } catch (err) {
            const fallbackDemand = Math.round((item.AvgQty3M * 0.5) + (item.AvgQty6M * 0.3) + (item.AvgQty12M * 0.2));
            setSimDemand(fallbackDemand);
            setAIResult({ predicted_demand: fallbackDemand, confidence: 'MEDIUM', trend_analysis: 'Sử dụng weighted average (Fallback)' });
        } finally {
            setIsForecasting(false);
        }
    };

    const handleExport = () => {
        const text = `SIMULATION: ${item.ItemCode}\nDemand: ${simDemand}\nROP: ${baseline.rop.toFixed(0)}\nMax: ${baseline.max.toFixed(0)}\nCapital: ${baseline.capitalRequired.toLocaleString()} VND`;
        navigator.clipboard.writeText(text);
        alert('✅ Đã copy báo cáo!');
    };

    return (
        <div className="bg-white p-6 rounded-3xl shadow-glass border border-slate-100/50 flex flex-col space-y-5 relative transition-all hover:shadow-xl duration-500">
            {/* Header & Mode Switch */}
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-4">
                    <Typography variant="h3" className="text-slate-800 flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-glass-sm border border-indigo-100">
                            <i className="fas fa-flask text-xs"></i>
                        </div>
                        {t('sim_title') || 'WHAT-IF LAB'}
                    </Typography>
                    <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
                        <div className="flex flex-col">
                            <Typography variant="label" className="text-slate-400 !text-[9px]">STOCK</Typography>
                            <Typography variant="mono-sm" className="font-bold text-slate-700">{currentStock.toLocaleString()}</Typography>
                        </div>
                        <div className="flex flex-col">
                            <Typography variant="label" className="text-slate-400 !text-[9px]">PIPE</Typography>
                            <Typography variant="mono-sm" className="font-bold text-blue-600">{(item.TotalPO || 0).toLocaleString()}</Typography>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        title="Copy Report"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all border border-transparent hover:border-slate-200"
                    >
                        <i className="fas fa-copy text-xs"></i>
                    </button>
                    <div className="flex bg-slate-100/50 backdrop-blur-sm p-1 rounded-xl border border-slate-200 shadow-inner scale-90 origin-right ml-1">
                        <button onClick={() => setMode('BASIC')} className={`px-4 py-1.5 text-2xs font-bold rounded-lg uppercase tracking-wider transition-all ${mode === 'BASIC' ? 'bg-white shadow-soft text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>{t('sim_basic') || 'CƠ BẢN'}</button>
                        <button onClick={() => setMode('SCENARIO')} className={`px-4 py-1.5 text-2xs font-bold rounded-lg uppercase tracking-wider transition-all ${mode === 'SCENARIO' ? 'bg-white shadow-soft text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>{t('sim_scenario') || 'KỊCH BẢN'}</button>
                    </div>
                </div>
            </div>

            {/* Removed redundant context cards, integrated into header */}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Controls & AI */}
                <div className="space-y-5">
                    {mode === 'SCENARIO' && (
                        <div className="grid grid-cols-1 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <div>
                                <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                                    <span className="text-blue-700">Demand Change</span>
                                    <span className="text-slate-900">{scenarioDemandPct > 0 ? '+' : ''}{scenarioDemandPct}%</span>
                                </div>
                                <input type="range" min="-50" max="100" step="5" value={scenarioDemandPct} onChange={e => setScenarioDemandPct(Number(e.target.value))} className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                                    <span className="text-orange-700">Lead Time Change</span>
                                    <span className="text-slate-900">{scenarioLTPct > 0 ? '+' : ''}{scenarioLTPct}%</span>
                                </div>
                                <input type="range" min="-50" max="100" step="5" value={scenarioLTPct} onChange={e => setScenarioLTPct(Number(e.target.value))} className="w-full h-1.5 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                            </div>
                        </div>
                    )}

                    {mode === 'BASIC' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="relative group">
                                    <Typography variant="label" className="text-slate-500 uppercase tracking-tight mb-1 ml-1 block !text-[9px]">Demand / Month</Typography>
                                    <input type="number" value={simDemand} onChange={e => setSimDemand(Math.max(0, Number(e.target.value)))} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-400 transition-all shadow-inner" />
                                </div>
                                <div className="relative group">
                                    <Typography variant="label" className="text-slate-500 uppercase tracking-tight mb-1 ml-1 block !text-[9px]">Lead Time (Days)</Typography>
                                    <input type="number" value={simLT} onChange={e => setSimLT(Math.max(1, Number(e.target.value)))} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-400 transition-all shadow-inner" />
                                </div>
                                <div className="relative group">
                                    <Typography variant="label" className="text-slate-500 uppercase tracking-tight mb-1 ml-1 block !text-[9px]">Stock Period (SP)</Typography>
                                    <input type="number" value={simSP} onChange={e => setSimSP(Math.max(1, Number(e.target.value)))} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-inner" />
                                </div>
                                <div className="relative group">
                                    <Typography variant="label" className="text-slate-500 uppercase tracking-tight mb-1 ml-1 block !text-[9px]">Safety Period (SSP)</Typography>
                                    <input type="number" value={simSSP} onChange={e => setSimSSP(Math.max(0, Number(e.target.value)))} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-emerald-400 transition-all shadow-inner" />
                                </div>
                            </div>
                            <button onClick={handleSmartForecast} disabled={isForecasting} className="w-full h-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl font-bold text-[9px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 hover:shadow-glass hover:scale-[1.01] transition-all disabled:opacity-60 border border-emerald-400/30">
                                {isForecasting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-robot text-sm"></i>}
                                <span>{isForecasting ? 'PROCESSING...' : 'AI FORECAST'}</span>
                            </button>
                        </div>
                    )}

                    {aiResult && (
                        <div className="bg-gradient-to-br from-emerald-50/30 to-teal-50/30 backdrop-blur-sm rounded-2xl p-4 border border-emerald-100/50 flex items-start gap-4 animate-fadeIn relative overflow-hidden shadow-sm">
                            <div className="w-10 h-10 bg-white/80 text-emerald-600 rounded-xl flex items-center justify-center shadow-soft border border-emerald-50 shrink-0 text-lg">🤖</div>
                            <div className="relative z-10 flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <Typography variant="h3" className="text-emerald-800 tracking-tight !text-[10px]">AI Insight</Typography>
                                    <Typography variant="mono-sm" className="bg-emerald-100/50 text-emerald-700 px-1.5 py-0.5 rounded-lg border border-emerald-200 !text-[9px] font-bold">{aiResult.confidence} CONFIDENCE</Typography>
                                </div>
                                <Typography variant="body-sm" className="text-emerald-800/80 leading-relaxed font-medium !text-xs italic">"{aiResult.trend_analysis.substring(0, 100)}..."</Typography>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Results */}
                <div className="space-y-4">
                    <div className="bg-slate-50/30 rounded-2xl border border-slate-100/50 p-4 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 !text-[10px]">
                                <i className="fas fa-calculator text-blue-400"></i> Results
                            </Typography>
                            {baseline.stockoutRisk && <Typography variant="mono-sm" className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg font-bold border border-rose-100 shadow-sm animate-pulse !text-[9px]">RISK</Typography>}
                        </div>
                        <div className="space-y-3">
                            <MetricBar label="Safety Stock" baseline={baseline.safetyStock} scenario={mode === 'SCENARIO' ? scenario.safetyStock : undefined} />
                            <MetricBar label="Reorder Point" baseline={baseline.rop} scenario={mode === 'SCENARIO' ? scenario.rop : undefined} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className={`rounded-2xl p-4 border transition-all flex flex-col justify-between h-24 relative overflow-hidden ${baseline.mos < 1 ? 'bg-rose-50/30 border-rose-100' : 'bg-slate-50/50 border-slate-100'}`}>
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 !text-[9px]">
                                <i className="fas fa-hourglass-half"></i> MOS
                            </Typography>
                            <div className="flex items-baseline gap-1.5">
                                <Typography variant="h3" className={`${baseline.mos < 1 ? 'text-rose-600' : baseline.mos < 2 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                    {baseline.mos > 99 ? '∞' : baseline.mos.toFixed(1)}
                                </Typography>
                                <Typography variant="label" className="text-slate-400 font-bold uppercase !text-[8px] tracking-tighter">Mths</Typography>
                            </div>
                        </div>

                        <div className={`rounded-2xl p-4 border transition-all flex flex-col justify-between h-24 relative overflow-hidden ${baseline.stockAtDelivery < 0 ? 'bg-rose-50/30 border-rose-100' : 'bg-slate-50/50 border-slate-100'}`}>
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 !text-[9px]">
                                <i className="fas fa-calendar-check mt-[1px]"></i> @ ETA
                            </Typography>
                            <div className="flex items-baseline gap-1.5">
                                <Typography variant="h3" className={`${baseline.stockAtDelivery < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                    {baseline.stockAtDelivery > 0 ? '+' : ''}{Math.round(baseline.stockAtDelivery).toLocaleString()}
                                </Typography>
                                <Typography variant="label" className="text-slate-400 font-bold uppercase !text-[8px] tracking-tighter">Units</Typography>
                            </div>
                        </div>

                        <div className="rounded-2xl p-4 border bg-white/50 border-slate-100 shadow-glass-sm flex flex-col justify-between h-24 relative overflow-hidden group">
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 !text-[9px]">
                                <i className="fas fa-wallet text-indigo-400"></i> Capital
                            </Typography>
                            <div className="flex items-baseline gap-1">
                                <Typography variant="h3" className="text-indigo-600 tracking-tighter">
                                    {new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(baseline.capitalRequired)}
                                </Typography>
                                <Typography variant="label" className="text-indigo-300 font-bold uppercase !text-[8px] tracking-tighter">VND</Typography>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom: Action Removed (Moved to header) */}
        </div>
    );
};
