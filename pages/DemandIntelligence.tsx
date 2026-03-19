
import React, { useMemo, useState, useEffect } from 'react';
import { InventoryItem, LOIS_DESCRIPTIONS, OrderingDraft } from '../types/inventory';
import { MetricCard } from '../components/MetricCard';
import { StockProgressBar } from '../components/StockProgressBar';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../utils/i18n';
import { parseInventorySearch, SearchResult, matchSearch } from '../utils/searchLogic';
import { StockoutReportWithLeadTime } from '../components/StockoutReportWithLeadTime';

interface DemandIntelligenceProps {
    data: InventoryItem[];
    onItemSelect: (item: InventoryItem) => void;
    initialState?: any;
    onSaveState?: (state: any) => void;
    draftData?: OrderingDraft;
    onUpdateDraft?: (draft: OrderingDraft) => void;
}

const Sparkline = ({ values, severity, forecast }: { values: number[], severity: string, forecast?: number[] }) => {
    const width = 120;
    const height = 32;
    const padding = 2;
    const combined = forecast ? [...values, ...forecast] : values;
    const max = Math.max(...combined, 1);
    const min = 0;
    const getX = (i: number) => padding + (i / (combined.length - 1)) * (width - padding * 2);
    const getY = (v: number) => height - padding - ((v - min) / (max - min)) * (height - padding * 2);
    const points = values.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
    let forecastPoints = "";
    if (forecast) {
        forecastPoints = [values[values.length - 1], ...forecast].map((v, i) => `${getX(values.length - 1 + i)},${getY(v)}`).join(' ');
    }
    let color = '#94a3b8';
    if (severity === 'CRITICAL') color = '#e11d48';
    if (severity === 'HIGH') color = '#f97316';
    if (severity === 'OVERSTOCK') color = '#64748b';
    if (severity === 'WATCH') color = '#10b981';

    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {forecast && <polyline points={forecastPoints} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.6" />}
            <circle cx={getX(values.length - 1)} cy={getY(values[values.length - 1])} r={2.5} fill={color} />
        </svg>
    );
};

const SupplyHealthBar = ({ dos, status }: { dos: number, status: string }) => {
    const percentage = Math.min(100, Math.max(0, (dos / 90) * 100));
    let colorClass = "bg-emerald-500";
    let textClass = "text-emerald-700";
    let label = `Còn ${dos.toFixed(0)} ngày`;

    if (status === 'ALREADY_OOS') {
        colorClass = "bg-slate-300";
        textClass = "text-rose-700 font-black";
        label = "HẾT HÀNG";
    } else if (status === 'IMMINENT') {
        colorClass = "bg-rose-500";
        textClass = "text-rose-700 font-black";
        label = `Cạn trong ${dos.toFixed(0)} ngày`;
    } else if (status === 'LOW_STOCK') {
        colorClass = "bg-amber-500";
        textClass = "text-amber-700";
    }

    return (
        <div className="w-full min-w-[100px]">
            <div className="flex justify-between items-end mb-1">
                <span className={`text-2xs font-bold ${textClass} uppercase tracking-tight`}>{label}</span>
                <span className="text-2xs text-slate-500 font-bold">{dos > 90 ? '>90d' : `${dos.toFixed(0)}d`}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: status === 'ALREADY_OOS' ? '0%' : `${percentage}%` }}></div>
            </div>
        </div>
    );
};

const ActionButton = ({ action, onClick }: { action: string, onClick: () => void }) => {
    let label = "Review";
    let classes = "bg-slate-100 text-slate-600 hover:bg-slate-200";
    let icon = "fa-glasses";

    switch (action) {
        case 'EXPEDITE_AIR': label = "Ship AIR Gấp"; classes = "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200 shadow-md"; icon = "fa-plane-departure"; break;
        case 'REVIEW_PO': label = "Xem xét PO"; classes = "bg-amber-50 text-white hover:bg-amber-600 shadow-amber-200 shadow-md"; icon = "fa-clipboard-check"; break;
        case 'CONSUME': label = "Theo dõi tồn"; classes = "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"; icon = "fa-box-open"; break;
        case 'CANCEL_PO': label = "Cắt/Hủy PO"; classes = "bg-slate-700 text-white hover:bg-slate-800"; icon = "fa-ban"; break;
    }

    return (
        <button onClick={onClick} className={`w-full py-1.5 rounded-lg text-2xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${classes}`}>
            <i className={`fas ${icon}`}></i> {label}
        </button>
    );
};

export const DemandIntelligence = ({ data, onItemSelect, initialState, onSaveState, draftData, onUpdateDraft }: DemandIntelligenceProps) => {
    const { t } = useLanguage();
    const [viewMode, setViewMode] = useState<'ANALYTICS' | 'LEAD_TIME'>(initialState?.viewMode || 'ANALYTICS');
    const [aiResults, setAiResults] = useState<Record<string, any>>(initialState?.aiResults || {});
    const [severityFilter, setSeverityFilter] = useState<'ALL' | 'STOCKOUT_RISK' | 'CRITICAL' | 'HIGH' | 'WATCH' | 'OVERSTOCK'>('ALL');
    const [sortKey, setSortKey] = useState<string>('severity');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25);
    const [searchText, setSearchText] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult>({ type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });

    useEffect(() => { if (onSaveState) onSaveState({ viewMode, aiResults }); }, [viewMode, aiResults, onSaveState]);

    const handleSearchChange = (text: string) => {
        setSearchText(text);
        setSearchResult(parseInventorySearch(text));
        setCurrentPage(1);
    };

    const handleLeadTimeAction = (sku: string, qty: number, method: 'AIR' | 'SEA') => {
        if (!onUpdateDraft) return;

        const currentQuantities = { ...draftData?.quantities };
        const currentNotes = { ...draftData?.notes };

        // Add to existing quantity if any
        const existing = currentQuantities[sku] || { air: 0, sea: 0 };
        const newQuantities = method === 'AIR'
            ? { ...existing, air: existing.air + qty }
            : { ...existing, sea: existing.sea + qty };

        currentQuantities[sku] = newQuantities;

        // Add note
        const timestamp = new Date().toLocaleDateString();
        const actionNote = `[${timestamp}] Auto-Order ${qty} via ${method} (Stockout Prevention)`;
        currentNotes[sku] = currentNotes[sku] ? `${currentNotes[sku]}; ${actionNote}` : actionNote;

        onUpdateDraft({ quantities: currentQuantities, notes: currentNotes });
        alert(`Đã thêm ${qty} units mã ${sku} vào giỏ hàng (${method})!`);
    };

    const analyzedData = useMemo(() => {
        if (!data || data.length === 0) return [];
        const results: any[] = [];
        const LT = 90, SP = 30, SSP = 15;
        for (const item of data) {
            const history = item.SalesHistory || [];
            if (history.length === 0) continue;
            const fullHistory = history.length >= 12 ? history.slice(-12) : [...Array(12 - history.length).fill(0), ...history];
            const actualM1 = fullHistory[11];
            const forecastM1 = item.BaseForecast || 0;
            const avg3M = item.AvgQty3M || 0;
            const deviation = actualM1 - forecastM1;
            const mean = fullHistory.slice(0, 11).reduce((a, b) => a + b, 0) / 11;
            const variance = fullHistory.slice(0, 11).reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 11;
            const stdDev = Math.sqrt(variance);
            let anomalyType = 'NORMAL';
            if (actualM1 > (mean + 2.5 * stdDev) && actualM1 > 2) anomalyType = 'SPIKE';
            else if (mean > 2 && actualM1 === 0) anomalyType = 'DROP';
            const available = item.QuantityInventory_NB + item.QuantityInventory_BB + item.QuantityDC_NB + item.QuantityDC_BB;
            const burnRateMonthly = Math.max(avg3M, actualM1, forecastM1, 0.1);
            const burnRateDaily = burnRateMonthly / 30;
            const dos = available / burnRateDaily;
            const cst = (available + item.TotalPO) / burnRateMonthly;
            const ss = burnRateDaily * SSP;
            const rop = burnRateDaily * (LT + SSP);
            const stockMax = burnRateDaily * (LT + SP + SSP);
            let stockoutStatus = 'SAFE';
            if (available <= 0) stockoutStatus = 'ALREADY_OOS';
            else if (dos < 15) stockoutStatus = 'IMMINENT';
            else if (dos < 30) stockoutStatus = 'LOW_STOCK';
            let severity = 'NORMAL', action = 'MONITOR';
            if (stockoutStatus === 'ALREADY_OOS' || item.Backorder > 0) { severity = 'CRITICAL'; action = 'EXPEDITE_AIR'; }
            else if (stockoutStatus === 'IMMINENT') { severity = anomalyType === 'SPIKE' ? 'CRITICAL' : 'HIGH'; action = 'EXPEDITE_AIR'; }
            else if (stockoutStatus === 'LOW_STOCK') { severity = anomalyType === 'SPIKE' ? 'HIGH' : 'WATCH'; action = 'REVIEW_PO'; }
            else if (anomalyType === 'DROP' && dos > 180) { severity = 'OVERSTOCK'; action = 'CANCEL_PO'; }
            let assessment = `${item.TrendFlag === 'Up' ? t('di_msg_increase') : t('di_msg_stable')}. [${t('di_msg_acc')}: ${forecastM1 > 0 ? (100 - Math.min(100, (Math.abs(deviation) / forecastM1) * 100)).toFixed(0) : 'N/A'}%]. `;
            results.push({ item, fullHistory, actualM1, forecastM1, deviation, available, dos, burnRateDaily, stockoutStatus, ss, rop, stockMax, anomalyType, severity, action, generatedAssessment: assessment, cst, accuracy: forecastM1 > 0 ? (100 - Math.min(100, (Math.abs(deviation) / forecastM1) * 100)).toFixed(0) : 'N/A' });
        }
        return results;
    }, [data, t]);

    const filteredData = useMemo(() => {
        let result = analyzedData.filter(d => {
            if (severityFilter === 'STOCKOUT_RISK') return d.dos < 15 || d.item.Backorder > 0;
            if (severityFilter !== 'ALL') return d.severity === severityFilter;
            return true;
        });

        if (searchResult.type !== 'EMPTY') result = result.filter(d => matchSearch(d.item, searchResult));

        // Sorting
        return result.sort((a, b) => {
            switch (sortKey) {
                case 'dos_asc': return a.dos - b.dos;
                case 'dos_desc': return b.dos - a.dos;
                case 'fc_desc': return b.forecastM1 - a.forecastM1;
                case 'cst_desc': return b.cst - a.cst;
                case 'severity':
                default:
                    const priority: any = { 'CRITICAL': 0, 'HIGH': 1, 'OVERSTOCK': 2, 'WATCH': 3, 'NORMAL': 4 };
                    return priority[a.severity] - priority[b.severity] || a.dos - b.dos;
            }
        });
    }, [analyzedData, severityFilter, searchResult, sortKey]);

    const paginatedData = useMemo(() => filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredData, currentPage, itemsPerPage]);

    const metrics = useMemo(() => {
        let crit = 0, high = 0, over = 0, stockoutRisk = 0;
        analyzedData.forEach(d => {
            if (d.severity === 'CRITICAL') crit++;
            if (d.severity === 'HIGH') high++;
            if (d.severity === 'OVERSTOCK') over++;
            if (d.dos < 15 || d.item.Backorder > 0) stockoutRisk++;
        });
        return { critical: crit, high: high, overstock: over, stockoutRisk };
    }, [analyzedData]);

    return (
        <div className="animate-fadeIn space-y-6 pb-24">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-cyan-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
                            <i className="fas fa-wave-square text-emerald-300"></i> {t('di_title')}
                        </h2>
                        <p className="text-emerald-200 text-sm font-bold mt-1 uppercase tracking-widest">{t('di_subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* View Switcher */}
                        <div className="flex bg-white/10 backdrop-blur-sm p-1 rounded-xl border border-white/10">
                            <button onClick={() => setViewMode('ANALYTICS')} className={`px-4 py-2 rounded-lg text-2xs font-black uppercase transition-all ${viewMode === 'ANALYTICS' ? 'bg-white text-emerald-800 shadow-sm' : 'text-white/70 hover:text-white'}`}>
                                <i className="fas fa-chart-line mr-2"></i> Analytics
                            </button>
                            <button onClick={() => setViewMode('LEAD_TIME')} className={`px-4 py-2 rounded-lg text-2xs font-black uppercase transition-all ${viewMode === 'LEAD_TIME' ? 'bg-white text-emerald-800 shadow-sm' : 'text-white/70 hover:text-white'}`}>
                                <i className="fas fa-shipping-fast mr-2"></i> Lead Time
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === 'LEAD_TIME' ? (
                <div className="animate-fadeIn">
                    <StockoutReportWithLeadTime
                        data={data}
                        onAction={handleLeadTimeAction}
                    />
                </div>
            ) : (
                <div className="animate-fadeIn space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <MetricCard label={t('di_risk_stockout')} value={metrics.stockoutRisk.toString()} subValue={t('di_sub_stockout')} icon="fa-triangle-exclamation" color="rose" onClick={() => setSeverityFilter('STOCKOUT_RISK')} isActive={severityFilter === 'STOCKOUT_RISK'} />
                        <MetricCard label={t('di_risk_critical')} value={metrics.critical.toString()} subValue={t('di_sub_critical')} icon="fa-plane-departure" color="rose" onClick={() => setSeverityFilter('CRITICAL')} isActive={severityFilter === 'CRITICAL'} />
                        <MetricCard label={t('di_risk_high')} value={metrics.high.toString()} subValue={t('di_sub_high')} icon="fa-bell" color="amber" onClick={() => setSeverityFilter('HIGH')} isActive={severityFilter === 'HIGH'} />
                        <MetricCard label={t('di_risk_overstock')} value={metrics.overstock.toString()} subValue={t('di_sub_overstock')} icon="fa-scissors" color="slate" onClick={() => setSeverityFilter('OVERSTOCK')} isActive={severityFilter === 'OVERSTOCK'} />
                        <MetricCard label={t('di_risk_watch')} value={(analyzedData.length - metrics.critical - metrics.high - metrics.overstock).toString()} subValue={t('di_sub_watch')} icon="fa-shield-halved" color="emerald" onClick={() => setSeverityFilter('WATCH')} isActive={severityFilter === 'WATCH'} />
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                        <div className="px-8 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-40 gap-4 shadow-sm">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    {['ALL', 'STOCKOUT_RISK', 'CRITICAL', 'HIGH', 'WATCH', 'OVERSTOCK'].map(f => (
                                        <button key={f} onClick={() => setSeverityFilter(f as any)} className={`px-4 py-1.5 text-2xs font-black rounded-lg transition-all uppercase ${severityFilter === f ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{f.replace('_', ' ')}</button>
                                    ))}
                                </div>

                                {/* SORT COMPONENT */}
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                                    <i className="fas fa-sort-amount-down text-slate-400 text-2xs"></i>
                                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="bg-transparent text-2xs font-black text-slate-700 outline-none cursor-pointer uppercase">
                                        <option value="severity">Sắp xếp: Mức rủi ro</option>
                                        <option value="dos_asc">DOS (Thấp nhất)</option>
                                        <option value="fc_desc">FC (Cao nhất)</option>
                                        <option value="cst_desc">CST (Dài nhất)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className="relative group w-full md:w-64"><i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input type="text" placeholder={t('common_search')} value={searchText} onChange={e => handleSearchChange(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-bold focus:bg-white focus:border-blue-400 transition-all" /></div>
                                <div className="text-2xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{t('db_items_found')}: {filteredData.length}</div>
                            </div>
                        </div>

                        <div className="overflow-x-auto flex-1 relative custom-scrollbar"><table className="w-full text-xs text-left border-separate border-spacing-0 min-w-[1700px] table-zebra"><thead className="bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 text-slate-600 font-black uppercase text-2xs tracking-widest sticky top-0 z-30 shadow-sm"><tr><th className="px-4 py-4 w-12 text-center text-slate-400 border-b border-slate-100 sticky left-0 z-40 bg-slate-50/95">#</th><th className="px-6 py-4 min-w-[250px] sticky left-12 z-40 bg-slate-50/95 sticky-column-shadow border-b border-slate-100">{t('di_th_sku')}</th><th className="px-6 py-4 text-center border-b border-slate-100">{t('di_th_trend')}</th><th className="px-6 py-4 text-center border-b border-slate-100">{t('ord_th_demand')}</th><th className="w-1 p-0 bg-slate-200 border-b border-slate-100"></th><th className="px-6 py-4 min-w-[180px] border-b border-slate-100">{t('di_th_supply')}</th><th className="px-6 py-4 pl-4 min-w-[150px] border-b border-slate-100">{t('di_th_plan')}</th><th className="px-6 py-4 text-center border-b border-slate-100">{t('di_th_cst')}</th><th className="px-6 py-4 text-center border-b border-slate-100">{t('di_th_action')}</th><th className="px-6 py-4 min-w-[350px] bg-slate-100/30 border-l border-slate-200 text-slate-700 border-b border-slate-100">{t('di_th_insight')}</th></tr></thead>
                            <tbody className="bg-white">{paginatedData.map((row, idx) => (
                                <tr key={row.item.ItemCode} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-4 py-3 text-center text-slate-500 font-mono text-2xs font-black sticky left-0 z-10 bg-white group-hover:bg-slate-50">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-3 sticky left-12 z-10 bg-white group-hover:bg-slate-50 transition-colors sticky-column-shadow" onClick={() => onItemSelect(row.item)}><div className="font-black text-slate-900 font-mono text-sm uppercase group-hover:text-blue-600 transition-colors cursor-pointer">{row.item.ItemCode}</div><div className="text-2xs font-bold text-slate-500 truncate max-w-[180px]">{row.item.ItemName}</div></td>
                                    <td className="px-6 py-3 text-center"><Sparkline values={row.fullHistory} severity={row.severity} forecast={[row.forecastM1]} /></td>
                                    <td className="px-6 py-3 text-center"><div className="font-black text-slate-900 text-sm">{row.actualM1.toLocaleString()}</div><div className="text-2xs font-black text-emerald-600">FC: {row.forecastM1 || '-'}</div></td>
                                    <td className="w-1 p-0 bg-slate-100"></td>
                                    <td className="px-6 py-3"><SupplyHealthBar dos={row.dos} status={row.stockoutStatus} /></td>
                                    <td className="px-6 py-3 pl-4"><div className="flex gap-1 w-full text-2xs font-black"><div className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500 w-1/2 text-center">S:{Math.ceil(row.ss)}</div><div className="bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded text-rose-600 w-1/2 text-center">R:{Math.ceil(row.rop)}</div></div></td>
                                    <td className="px-6 py-3 text-center"><div className={`inline-flex flex-col items-center px-2 py-1 rounded border ${row.cst < 1 ? 'bg-rose-100 text-rose-700' : row.cst > 12 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}><span className="text-xs font-black">{row.cst.toFixed(1)}</span><span className="text-2xs font-bold uppercase opacity-80">CST</span></div></td>
                                    <td className="px-6 py-3 text-center"><ActionButton action={row.action} onClick={() => onItemSelect(row.item)} /></td>
                                    <td className="px-6 py-3 bg-slate-50/40 border-l border-slate-200 text-slate-700"><p className="text-xs font-medium leading-relaxed">{row.generatedAssessment}</p></td>
                                </tr>
                            ))}</tbody></table></div>
                        <div className="px-8 py-3 border-t-2 border-slate-200 flex justify-between items-center bg-white text-xs font-black uppercase text-slate-600">
                            <div className="flex items-center gap-4">
                                <span className="text-slate-400">{t('common_total')}: <span className="text-slate-700">{filteredData.length} SKU</span></span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="pagination-pill text-slate-600"><i className="fas fa-chevron-left text-xs"></i></button>
                                {(() => { const tp = Math.ceil(filteredData.length / itemsPerPage); return [...Array(tp)].map((_, i) => { const page = i + 1; if (tp > 7 && Math.abs(currentPage - page) > 2 && page !== 1 && page !== tp) { if (page === 2 || page === tp - 1) return <span key={i} className="px-1 text-slate-300">…</span>; return null; } return <button key={i} onClick={() => setCurrentPage(page)} className={`pagination-pill ${currentPage === page ? 'active' : 'text-slate-600'}`}>{page}</button>; }); })()}
                                <button disabled={currentPage >= Math.ceil(filteredData.length / itemsPerPage)} onClick={() => setCurrentPage(p => p + 1)} className="pagination-pill text-slate-600"><i className="fas fa-chevron-right text-xs"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
