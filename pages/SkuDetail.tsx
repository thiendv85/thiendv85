
import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, KittingDefinition } from '../types/inventory';
import { StatusBadge } from '../components/StatusBadge';
import { DebtStatusBadge } from '../components/DebtStatusBadge';
import { Typography } from '../components/Typography';
import { StockProgressBar } from '../components/StockProgressBar';
import { SalesHistoryChart } from '../components/SalesHistoryChart';
import { SimulationLab } from '../components/SimulationLab';
import { parseInventorySearch, matchSearch } from '../utils/searchLogic';
import { useLanguage } from '../utils/i18n';
import { DealerStockPopup } from '../components/DealerStockPopup';
import { BackorderPopup } from '../components/BackorderPopup';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { SupersessionChainViewer } from '../components/SupersessionChainViewer';
import { getDebtStatus, DEBT_STATUS_OPTIONS } from '../types/inventory';

import { FaIcon } from '../components/Icon';
interface SkuDetailProps {
    item: InventoryItem;
    allData?: InventoryItem[];
    onClose: () => void;
    onItemSelect: (item: InventoryItem) => void;
    kittingDefs?: KittingDefinition[];
    onNavigateToPackage?: (code: string) => void;
    graph?: SupersessionGraph;
}

const formatValue = (val: number, isFC: boolean = false) => {
    if (!isFC) return Math.round(val).toLocaleString();
    if (val < 5) return val.toFixed(1);
    return Math.round(val).toLocaleString();
};

// --- NEW COMPONENT: PACKAGE DETAIL POPUP ---
const PackageDetailPopup = ({
    packageCode,
    packageName,
    kittingDefs,
    allData,
    onClose,
    onItemClick,
    onOpenOptimizer
}: {
    packageCode: string,
    packageName: string,
    kittingDefs: KittingDefinition[],
    allData: InventoryItem[],
    onClose: () => void,
    onItemClick: (item: InventoryItem) => void,
    onOpenOptimizer?: (code: string) => void
}) => {
    // Filter all components belonging to this package
    const components = useMemo(() => {
        const defs = kittingDefs.filter(d => d.SetPartsCode === packageCode);

        // Map to include inventory data
        return defs.map(def => {
            const invItem = allData.find(i => i.ItemCode === def.ItemCode);
            const totalStock = invItem ? (invItem.QuantityInventory_NB + invItem.QuantityInventory_BB + invItem.QuantityDC_NB + invItem.QuantityDC_BB) : 0;
            const unitPrice = invItem ? invItem.UnitCost_PP : (def.UnitPrice || 0);

            return {
                ...def,
                inventoryItem: invItem,
                totalStock,
                unitPrice,
                totalValue: unitPrice * def.QtyRequired,
                isStockout: totalStock < def.QtyRequired
            };
        });
    }, [packageCode, kittingDefs, allData]);

    const totalPackageValue = components.reduce((sum, c) => sum + c.totalValue, 0);

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn border border-white/20">
                {/* Header */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <Typography variant="label" className="text-blue-600 mb-1 block">Chi tiết gói phụ tùng</Typography>
                        <Typography variant="h3" className="text-slate-900">{packageName}</Typography>
                        <Typography variant="mono-sm" className="text-slate-500 font-bold">{packageCode}</Typography>
                    </div>
                    <div className="flex items-center gap-3">
                        {onOpenOptimizer && (
                            <button
                                onClick={() => onOpenOptimizer(packageCode)}
                                className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-2xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                            >
                                <FaIcon className="fas fa-wand-magic-sparkles" /> Tối ưu hóa
                            </button>
                        )}
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all">
                            <FaIcon className="fas fa-times" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-0 custom-scrollbar flex-1">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-white sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                            <tr>
                                <th className="px-6 py-3"><Typography variant="label" className="text-slate-500">Mã linh kiện</Typography></th>
                                <th className="px-4 py-3"><Typography variant="label" className="text-slate-500">Tên phụ tùng</Typography></th>
                                <th className="px-4 py-3 text-center"><Typography variant="label" className="text-slate-500">Định mức</Typography></th>
                                <th className="px-4 py-3 text-center"><Typography variant="label" className="text-slate-500">Tồn kho</Typography></th>
                                <th className="px-4 py-3 text-right"><Typography variant="label" className="text-slate-500">Đơn giá</Typography></th>
                                <th className="px-4 py-3 text-right"><Typography variant="label" className="text-slate-500">Thành tiền</Typography></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {components.map((comp, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => comp.inventoryItem && onItemClick(comp.inventoryItem)}>
                                    <td className="px-6 py-4">
                                        <Typography variant="mono-sm" className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{comp.ItemCode}</Typography>
                                    </td>
                                    <td className="px-4 py-4">
                                        <Typography variant="body-sm" className="text-slate-600 font-medium">{comp.inventoryItem?.ItemName || comp.ItemNameEng}</Typography>
                                        {comp.inventoryItem?.Note && <Typography variant="label" className="text-amber-600 italic mt-0.5 !text-[10px]">{comp.inventoryItem.Note}</Typography>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-bold border border-slate-200">x{comp.QtyRequired}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded font-black border ${comp.isStockout ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                            {comp.totalStock.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                                        {new Intl.NumberFormat('vi-VN').format(comp.unitPrice)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                                        {new Intl.NumberFormat('vi-VN').format(comp.totalValue)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <Typography variant="body-sm" className="text-slate-400 font-bold">
                        Tổng số linh kiện: <span className="text-slate-900 border-b border-slate-200">{components.length}</span>
                    </Typography>
                    <div className="flex items-center gap-4">
                        <Typography variant="label" className="text-slate-400">Tổng giá trị gói:</Typography>
                        <Typography variant="h2" className="text-blue-700">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalPackageValue)}</Typography>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};


const StatCard = ({ label, value, sub, icon, color, onClick, children }: { label: string, value: string, sub?: string, icon: string, color: string, onClick?: () => void, children?: React.ReactNode }) => {
    const cardContent = (
        <div
            onClick={onClick}
            className={`p-3 md:p-4 rounded-2xl flex flex-col justify-between transition-all group ${onClick ? 'cursor-pointer' : ''} h-full relative min-w-[140px] md:min-w-0 snap-start shrink-0`}
        >
            <div className="flex justify-between items-start mb-1.5 md:mb-1.5 mb-1">
                <Typography variant="label" className="text-slate-500 leading-tight !text-[10px] md:text-xs">{label}</Typography>
                <div className={`w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center text-[10px] md:text-xs shadow-sm ${color} group-hover:scale-110 transition-transform shrink-0`}>
                    <FaIcon className={`fas ${icon}`} />
                </div>
            </div>

            <div>
                <Typography variant="h2" className="text-slate-900 leading-none tracking-tight text-lg md:text-xl">{value}</Typography>
                {sub && <Typography variant="label" className="text-slate-400 mt-1 truncate opacity-80 block !text-[9px] font-medium tracking-normal">{sub}</Typography>}
            </div>
            {children}
        </div>
    );
    return cardContent;
};

const WarehouseRow = ({ code, oh, dc, poTotal, poMonth, bo, boBreakdown, fc, mos }: { code: string, oh: number, dc: number, poTotal?: number, poMonth?: number, bo: number, boBreakdown?: any[], fc?: number, mos?: number }) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 px-2 rounded-lg hover:bg-slate-50 transition-all gap-1">
        <div className="flex items-center gap-1 shrink-0">
            <Typography variant="label" className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black shrink-0 text-[11px]">{code}</Typography>
        </div>
        <div className="flex items-center gap-0 text-right shrink-0">
            {/* OH */}
            <div className="w-14 border-l border-slate-50 first:border-l-0 pl-1">
                <Typography variant="label" className="text-slate-500 block mb-0.5 text-[10px] font-black">OH</Typography>
                <Typography variant="mono" className="font-bold text-sm md:text-base text-slate-900">{oh.toLocaleString()}</Typography>
            </div>
            
            {/* DC */}
            <div className="w-14 border-l border-slate-100 pl-1">
                <Typography variant="label" className="text-blue-500 block mb-0.5 text-[10px] font-black">DC</Typography>
                <Typography variant="mono" className="font-bold text-sm md:text-base text-blue-800">{dc.toLocaleString()}</Typography>
            </div>

            {/* BO */}
            <div className="w-14 border-l border-slate-100 pl-1">
                <Typography variant="label" className="text-rose-500 block mb-0.5 text-[10px] font-black">BO</Typography>
                <BackorderPopup items={boBreakdown || []}>
                    <Typography variant="mono" className={`font-bold text-sm md:text-base cursor-help transition-colors ${bo > 0 ? 'text-rose-600 border-b-2 border-dashed border-rose-300' : 'text-slate-300'}`}>
                        {bo.toLocaleString()}
                    </Typography>
                </BackorderPopup>
            </div>

            {/* PO(M) */}
            <div className="w-24 border-l border-slate-100 pl-1" title="Tổng PO (Trong tháng)">
                <Typography variant="label" className="text-indigo-500 block mb-0.5 text-[10px] font-black">PO (T/M)</Typography>
                {poTotal !== undefined ? (
                    <Typography variant="mono" className="font-bold text-sm md:text-base text-indigo-700">
                        {poTotal.toLocaleString()} <span className="text-[10px] font-black opacity-60">({(poMonth || 0).toLocaleString()})</span>
                    </Typography>
                ) : <Typography variant="mono" className="text-slate-200">-</Typography>}
            </div>

            {/* FC */}
            <div className="w-20 border-l border-slate-100 pl-1">
                <Typography variant="label" className="text-amber-600 block mb-0.5 text-[10px] font-black">FC</Typography>
                <Typography variant="mono" className="font-bold text-sm md:text-base text-amber-700">{formatValue(fc || 0, true)}</Typography>
            </div>

            {/* MOS */}
            <div className="w-14 border-l border-slate-100 pl-1">
                <Typography variant="label" className="text-emerald-600 block mb-0.5 text-[10px] font-black">MOS</Typography>
                <Typography variant="mono" className="font-black text-sm md:text-base text-emerald-700">{mos !== undefined ? mos.toFixed(1) : '-'}</Typography>
            </div>
        </div>
    </div>
);

export const SkuDetail = ({ item, allData = [], onClose, onItemSelect, kittingDefs = [], onNavigateToPackage, graph }: SkuDetailProps) => {
    const { t, language } = useLanguage();
    const [searchText, setSearchText] = useState('');
    const [viewingPackage, setViewingPackage] = useState<{ code: string, name: string } | null>(null);

    const pipelineList = useMemo(() => Object.entries(item.Pipeline || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([date, qty]) => ({ date, qty, region: '' })), [item.Pipeline]);
    const pipelineListNB = useMemo(() => Object.entries(item.Pipeline_NB || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([date, qty]) => ({ date, qty, region: 'NB' })), [item.Pipeline_NB]);
    const pipelineListBB = useMemo(() => Object.entries(item.Pipeline_BB || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([date, qty]) => ({ date, qty, region: 'BB' })), [item.Pipeline_BB]);

    // Merge or choose list
    const displayedPipeline = useMemo(() => {
        if (pipelineListNB.length > 0 || pipelineListBB.length > 0) {
            const merged = [...pipelineListNB, ...pipelineListBB].sort((a, b) => a.date.localeCompare(b.date));
            return merged;
        }
        return pipelineList;
    }, [pipelineList, pipelineListNB, pipelineListBB]);

    const averages = useMemo(() => {
        const stats = [
            { label: 'AVG 24M', value: item.AvgQty24M || 0 },
            { label: 'AVG 12M', value: item.AvgQty12M || 0 },
            { label: 'AVG 6M', value: item.AvgQty6M || 0 },
            { label: 'AVG 3M', value: item.AvgQty3M || 0 },
            { label: 'BASE FC', value: item.BaseForecast || 0, isForecast: true },
        ];
        return { stats, maxVal: Math.max(...stats.map(s => s.value)) };
    }, [item]);

    const peakData = useMemo(() => {
        const hist = item.SalesHistory || [];
        if (hist.every(v => v === 0)) return null;
        const max = Math.max(...hist);
        const idx = hist.lastIndexOf(max);
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (hist.length - idx));
        return { month: d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', year: '2-digit' }), value: max };
    }, [item.SalesHistory, language]);

    const totalAvailable = (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0) + (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0);

    // Filter Packages containing this SKU
    const relatedPackages = useMemo(() => {
        if (!kittingDefs || kittingDefs.length === 0) return [];
        // Unique packages only
        const setMap = new Map<string, { code: string, name: string, qty: number, model: string }>();
        kittingDefs.forEach(def => {
            if (def.ItemCode === item.ItemCode) {
                if (!setMap.has(def.SetPartsCode)) {
                    setMap.set(def.SetPartsCode, {
                        code: def.SetPartsCode,
                        name: def.SetPartsName,
                        qty: def.QtyRequired,
                        model: def.ModelCar || ''
                    });
                }
            }
        });
        return Array.from(setMap.values());
    }, [kittingDefs, item.ItemCode]);

    const hasSupersession = useMemo(() => {
        return graph ? graph.chains.has(item.ItemCode) : false;
    }, [graph, item.ItemCode]);


    if (!item) return null;

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC]">
            {/* Header Section - Sticky */}
            <div className="flex flex-col gap-2 md:gap-3 p-3 md:p-4 bg-[#F8FAFC] border-b border-slate-200 sticky top-0 z-30 shrink-0">
                <div className="flex justify-between items-center gap-2 md:gap-4">
                    <div className="relative group flex-1 max-w-sm">
                        <FaIcon className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                        <input
                            type="text" placeholder={t('sd_quick_search')} value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && allData.length > 0) {
                                    const res = parseInventorySearch(searchText);
                                    const found = allData.find(i => matchSearch(i, res));
                                    if (found) { onItemSelect(found); setSearchText(''); }
                                }
                            }}
                            className="w-full pl-9 pr-4 py-2 md:py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all border-none shadow-inner"
                        />
                    </div>
                    <button onClick={onClose} className="w-8 h-8 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm"><FaIcon className="fas fa-times text-base md:text-lg" /></button>
                </div>

                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-3 md:gap-5 w-full lg:w-auto overflow-hidden">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-700 to-blue-800 text-white rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-3xl font-black shrink-0 shadow-lg shadow-blue-100">
                            {item.ItemCode.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                                <Typography variant="h1" className="text-slate-900 tracking-tighter truncate md:!text-2xl !text-xl">{item.ItemCode}</Typography>
                                <DebtStatusBadge item={item} />
                                {item.computed?.warnings?.map((w, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm animate-pulse ${
                                            w.type === 'Critical' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                            w.type === 'Warning' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                            'bg-blue-50 text-blue-600 border-blue-100'
                                        }`}
                                        title={w.message}
                                    >
                                        <FaIcon className={`fas ${w.type === 'Critical' ? 'fa-fire' : w.type === 'Warning' ? 'fa-triangle-exclamation' : 'fa-info-circle'} text-[10px]`} />
                                        <Typography variant="label" className="font-black uppercase tracking-widest !text-[9px]">{w.code}</Typography>
                                    </div>
                                ))}
                                {item.TypeCar && <Typography variant="label" className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100 shadow-sm">{item.TypeCar}</Typography>}
                            </div>
                            <Typography variant="body-sm" className="font-semibold text-slate-500 truncate text-xs md:text-sm">{item.ItemName}</Typography>
                        </div>
                    </div>

                    <div className="flex overflow-x-auto no-scrollbar md:grid md:grid-cols-5 gap-3 w-full lg:w-auto snap-x md:pb-0 pb-1 -mx-3 px-3 md:mx-0 md:px-0">
                        <StatCard label={t('sd_avail_stock')} value={totalAvailable.toLocaleString()} icon="fa-box" color="bg-emerald-50 text-emerald-600" />

                        <div className="h-full min-w-[140px] md:min-w-0 snap-start shrink-0">
                            <BackorderPopup items={item.BackorderBreakdown || []}>
                                <div className="p-3 md:p-4 rounded-2xl flex flex-col justify-between transition-all group h-full cursor-help relative">
                                    <div className="flex justify-between items-start mb-1 md:mb-1.5">
                                        <Typography variant="label" className="text-slate-500 leading-tight !text-[10px] md:text-xs">BOOKING / BO</Typography>
                                        <div className={`w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center text-[10px] md:text-xs shadow-sm ${item.Backorder > 0 ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-400"} group-hover:scale-110 transition-transform shrink-0`}>
                                            <FaIcon className="fas fa-exclamation-circle" />
                                        </div>
                                    </div>
                                    <div>
                                        <Typography variant="h2" className="text-slate-900 leading-none tracking-tight text-lg md:text-xl">{item.Backorder.toLocaleString()}</Typography>
                                        {item.BackorderBreakdown && item.BackorderBreakdown.length > 0 && (
                                            <div className="absolute top-2 right-2 md:top-3 md:right-3 w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-blue-500 animate-pulse ring-2 ring-white"></div>
                                        )}
                                    </div>
                                </div>
                            </BackorderPopup>
                        </div>

                        <StatCard label={t('sd_net_bal')} value={`${item.NetDemand > 0 ? '+' : ''}${item.NetDemand.toLocaleString()}`} icon="fa-balance-scale" color={item.NetDemand >= 0 ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600"} />
                        <StatCard label={t('sd_pipeline')} value={(item.computed?.incomingCurrentMonth || 0).toLocaleString()} sub={`Tổng PO: ${(item.TotalPO || 0).toLocaleString()}`} icon="fa-ship" color="bg-blue-50 text-blue-600" />
                        <StatCard label={t('sd_val')} value={new Intl.NumberFormat('en-US', { notation: "compact" }).format(item.computed?.stockValue || 0)} icon="fa-coins" color="bg-amber-50 text-amber-600" />
                    </div>
                </div>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 custom-scrollbar pb-32">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">

                    {/* MAIN CONTENT AREA - ADJUSTED COLUMN SPAN */}
                    <div className="lg:col-span-7 space-y-4 md:space-y-6">

                        <div className="bg-white rounded-2xl md:rounded-3xl border-2 border-slate-100 shadow-sm p-4 md:p-5 overflow-hidden">
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-5 gap-3 md:gap-4">
                                <div>
                                    <Typography variant="h3" className="text-slate-800 flex items-center gap-2">
                                        <FaIcon className="fas fa-chart-line text-emerald-600" /> {t('sd_chart_title')}
                                    </Typography>
                                    <Typography variant="label" className="text-slate-400 mt-0.5 block tracking-wider uppercase !text-[9px]">{t('sd_chart_sub')}</Typography>
                                </div>

                                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar shrink-0">
                                    {averages.stats.map(s => (
                                        <div key={s.label} className={`px-4 py-2 text-center border-r border-slate-200 last:border-0 min-w-[80px] ${s.isForecast ? 'bg-amber-50 text-amber-700 rounded-lg' : ''}`}>
                                            <Typography variant="label" className={`mb-0.5 block !text-[9px] ${s.isForecast ? 'text-amber-600' : 'text-slate-400'}`}>{s.label}</Typography>
                                            <Typography variant="body" className={`font-bold ${s.isForecast ? 'text-amber-700' : 'text-slate-800'}`}>{formatValue(s.value, true)}</Typography>
                                        </div>
                                    ))}
                                    {peakData && (
                                        <div className="px-4 py-2 text-center min-w-[80px] bg-rose-50 rounded-lg mx-1 shadow-sm border border-rose-100">
                                            <Typography variant="label" className="text-rose-500 mb-0.5 block !text-[9px]">PEAK</Typography>
                                            <Typography variant="body" className="font-bold text-rose-600">{peakData.value}</Typography>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <SalesHistoryChart history={item.SalesHistory} forecast={item.BaseForecast} currentStock={totalAvailable} netDemand={item.NetDemand} />

                            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-50">
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 group hover:border-blue-200 transition-colors">
                                    <Typography variant="label" className="text-slate-400 mb-0.5 block !text-[10px]">MOS (M)</Typography>
                                    <Typography variant="h3" className="text-slate-800">{(item.computed?.mos || 0).toFixed(1)}</Typography>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 group hover:border-blue-200 transition-colors">
                                    <Typography variant="label" className="text-slate-400 mb-0.5 block !text-[10px]">TURNS (x)</Typography>
                                    <Typography variant="h3" className="text-slate-800">{(item.computed?.stockTurnRatio || 0).toFixed(1)}</Typography>
                                </div>
                                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-50 shadow-inner md:col-span-2">
                                    <Typography variant="label" className="text-slate-400 uppercase tracking-widest mb-2 block text-center font-bold !text-[9px]">Health Status Analysis</Typography>
                                    <StockProgressBar
                                        current={item.computed?.available || 0} rop={item.computed?.rop || 0} max={item.computed?.stockMax || 1}
                                        ss={item.computed?.safetyStock || 0} onOrder={item.TotalPO} incoming={item.computed?.incomingCurrentMonth || 0}
                                        backorder={item.Backorder} breakdown={item.BackorderBreakdown} baseFc={item.BaseForecast}
                                    />
                                </div>
                            </div>

                            {/* STATISTICAL INTELLIGENCE SECTION */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                                    <div className="flex justify-between items-center mb-2">
                                        <Typography variant="label" className="text-slate-500 font-bold uppercase tracking-widest !text-[10px]">Độ biến thiên (CV)</Typography>
                                        <FaIcon className={`fas fa-wave-square p-2 rounded-lg ${(item.computed?.cv ?? 0) > 0.5 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`} />
                                    </div>
                                    <Typography variant="h2" className={(item.computed?.cv ?? 0) > 0.5 ? 'text-rose-600' : 'text-slate-800'}>
                                        {(item.computed?.cv || 0).toFixed(2)}
                                    </Typography>
                                    <Typography variant="label" className="text-slate-400 mt-1 block !text-[10px]">
                                        {(item.computed?.cv ?? 0) > 0.5 ? '🔴 Nhu cầu không ổn định' : '🟢 Nhu cầu ổn định'}
                                    </Typography>
                                </div>

                                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                                    <div className="flex justify-between items-center mb-2">
                                        <Typography variant="label" className="text-slate-500 font-bold uppercase tracking-widest !text-[10px]">Hệ số góc (Slope)</Typography>
                                        <FaIcon className={`fas ${(item.computed?.slope ?? 0) < -1 ? 'fa-arrow-trend-down text-rose-500' : 'fa-arrow-trend-up text-emerald-500'} p-2 rounded-lg bg-slate-100`} />
                                    </div>
                                    <Typography variant="h2" className={(item.computed?.slope ?? 0) < -1 ? 'text-rose-600' : 'text-slate-800'}>
                                        {(item.computed?.slope || 0).toFixed(2)}
                                    </Typography>
                                    <Typography variant="label" className="text-slate-400 mt-1 block !text-[10px]">
                                        {(item.computed?.slope ?? 0) < -1 ? '🔴 Xu hướng giảm mạnh' : (item.computed?.slope ?? 0) > 1 ? '🔵 Xu hướng tăng' : '⚪ Xu hướng ổn định'}
                                    </Typography>
                                </div>

                                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                                    <div className="flex justify-between items-center mb-2">
                                        <Typography variant="label" className="text-slate-500 font-bold uppercase tracking-widest !text-[10px]">Dự báo LinReg</Typography>
                                        <FaIcon className="fas fa-magic p-2 rounded-lg bg-indigo-50 text-indigo-500" />
                                    </div>
                                    <Typography variant="h2" className="text-indigo-600">
                                        {(item.computed?.forecastLinReg || 0).toFixed(1)}
                                    </Typography>
                                    <Typography variant="label" className="text-slate-400 mt-1 block !text-[10px]">
                                        Dự báo toán học tháng tới
                                    </Typography>
                                </div>
                            </div>
                        </div>

                        {/* SUPERSESSION CHAIN VIEWER (IF EXISTS) */}
                        {hasSupersession && graph && (
                            <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm p-6">
                                <Typography variant="h3" className="text-slate-800 flex items-center gap-2 mb-4">
                                    <FaIcon className="fas fa-link text-purple-600" /> {t('sd_supersession')}
                                </Typography>
                                <SupersessionChainViewer
                                    partNumber={item.ItemCode}
                                    graph={graph}
                                    items={allData}
                                    onPartClick={(p) => {
                                        const found = allData.find(i => i.ItemCode === p);
                                        if (found) onItemSelect(found);
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* SIDEBAR AREA - ADJUSTED COLUMN SPAN */}
                    <div className="lg:col-span-5 space-y-4 md:space-y-6">
                        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-glass-sm p-4 md:p-6 overflow-hidden transition-all hover:shadow-glass">
                            <Typography variant="label" className="text-slate-400 uppercase tracking-widest mb-4 md:mb-5 flex items-center gap-2 font-bold">
                                <FaIcon className="fas fa-warehouse text-blue-500" /> {t('sd_supply_net')}
                            </Typography>
                            <div className="space-y-2">
                                <WarehouseRow
                                    code="NB"
                                    oh={item.QuantityInventory_NB} dc={item.QuantityDC_NB}
                                    poTotal={item.TotalPO_NB}
                                    poMonth={item.computed?.transfer?.incomingNB_Month ?? 0}
                                    bo={item.Backorder_NB}
                                    boBreakdown={item.BackorderBreakdown?.filter(d => d.Warehouse && (d.Warehouse.includes('NB') || d.Warehouse.includes('Nam')))}
                                    fc={item.Forecast_NB}
                                    mos={item.computed?.transfer?.mosNB ?? 0}
                                />
                                <WarehouseRow
                                    code="BB"
                                    oh={item.QuantityInventory_BB} dc={item.QuantityDC_BB}
                                    poTotal={item.TotalPO_BB}
                                    poMonth={item.computed?.transfer?.incomingBB_Month ?? 0}
                                    bo={item.Backorder_BB}
                                    boBreakdown={item.BackorderBreakdown?.filter(d => d.Warehouse && (d.Warehouse.includes('BB') || d.Warehouse.includes('Bắc')))}
                                    fc={item.Forecast_BB}
                                    mos={item.computed?.transfer?.mosBB ?? 0}
                                />
                                {item.computed?.transfer && (
                                    <div className="space-y-2 mt-4">
                                        {/* Rebalance Suggestion */}
                                        {(item.computed.transfer.transferNBtoBB > 0 || item.computed.transfer.transferBBtoNB > 0) && (
                                            <div className="mx-2 p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between group animate-in fade-in slide-in-from-top-2 border-dashed">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
                                                        <FaIcon className="fas fa-shuffle text-[10px]" />
                                                    </span>
                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{t('rebalance')}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-black text-slate-500">{item.computed.transfer.transferNBtoBB > 0 ? 'NB' : 'BB'}</span>
                                                    <FaIcon className="fas fa-long-arrow-alt-right text-blue-400" />
                                                    <span className="text-[10px] font-black text-slate-900">{item.computed.transfer.transferNBtoBB > 0 ? 'BB' : 'NB'}</span>
                                                    <span className="ml-2 px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-black shadow-sm">
                                                        {(item.computed.transfer.transferNBtoBB || item.computed.transfer.transferBBtoNB).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Allocation Suggestion */}
                                        {(item.computed.transfer.suggestedOrderNB > 0 || item.computed.transfer.suggestedOrderBB > 0) && (
                                            <div className="mx-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between group animate-in fade-in slide-in-from-top-2 border-dashed">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 shadow-sm group-hover:scale-110 transition-transform">
                                                        <FaIcon className="fas fa-cart-plus text-[10px]" />
                                                    </span>
                                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{t('allocation')}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {item.computed.transfer.suggestedOrderNB > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-500">SEA</span>
                                                            <FaIcon className="fas fa-long-arrow-alt-right text-indigo-400" />
                                                            <span className="text-[10px] font-black text-slate-900">NB</span>
                                                            <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                                                                {item.computed.transfer.suggestedOrderNB.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {item.computed.transfer.suggestedOrderBB > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-500">SEA</span>
                                                            <FaIcon className="fas fa-long-arrow-alt-right text-indigo-400" />
                                                            <span className="text-[10px] font-black text-slate-900">BB</span>
                                                            <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                                                                {item.computed.transfer.suggestedOrderBB.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="mt-5 pt-5 border-t border-slate-100 flex items-center justify-between px-2 bg-slate-50 rounded-xl p-4">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-tighter">{t('sd_dealer')}</span>
                                <DealerStockPopup items={item.DealerBreakdown || []}>
                                    <span className="font-mono font-black text-xl text-slate-900 cursor-help hover:text-blue-600 border-b-2 border-dashed border-slate-300 transition-colors">
                                        {item.DealerInventory.toLocaleString()}
                                    </span>
                                </DealerStockPopup>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-glass-sm p-4 md:p-6 max-h-80 flex flex-col transition-all hover:shadow-glass">
                            <div className="flex items-center justify-between mb-4 md:mb-5">
                                <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 font-bold">
                                    <FaIcon className="fas fa-shipping-fast text-blue-500" /> {t('sd_pipeline')}
                                </Typography>
                                <div className="flex gap-2">
                                    {item.TotalPO_NB !== undefined && <Typography variant="mono-sm" className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-100 font-bold">NB: {item.TotalPO_NB.toLocaleString()}</Typography>}
                                    {item.TotalPO_BB !== undefined && <Typography variant="mono-sm" className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-100 font-bold">BB: {item.TotalPO_BB.toLocaleString()}</Typography>}
                                    <Typography variant="mono-sm" className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200 font-bold">{displayedPipeline.length} PO</Typography>
                                </div>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-2 pr-1">
                                {displayedPipeline.length > 0 ? displayedPipeline.map((po, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-50 hover:bg-blue-50/20 transition-all group">
                                        <div className="flex items-center gap-2">
                                            {po.region && (
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${po.region === 'NB' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {po.region}
                                                </span>
                                            )}
                                            <span className="font-mono text-xs font-black text-slate-700 group-hover:text-blue-700">{po.date}</span>
                                        </div>
                                        <span className="text-xs font-black text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-50 shadow-sm">+{po.qty.toLocaleString()}</span>
                                    </div>
                                )) : <div className="text-center py-10 text-slate-300 italic text-2xs font-bold uppercase tracking-widest bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">No active PO found</div>}
                            </div>
                        </div>

                        {/* PACKAGE USAGE CARD */}
                        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-glass-sm p-4 md:p-6 overflow-hidden transition-all hover:shadow-glass">
                            <div className="flex items-center justify-between mb-4 md:mb-5">
                                <Typography variant="label" className="text-slate-400 uppercase tracking-widest flex items-center gap-2 font-bold">
                                    <FaIcon className="fas fa-boxes-packing text-indigo-500" /> CẤU THÀNH GÓI
                                </Typography>
                                <Typography variant="mono-sm" className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-lg border border-indigo-100 font-bold">{relatedPackages.length} Gói</Typography>
                            </div>

                            {relatedPackages.length > 0 ? (
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                    {relatedPackages.map((pkg, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setViewingPackage({ code: pkg.code, name: pkg.name })}
                                            className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-100 hover:border-indigo-300 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-black text-slate-700 truncate group-hover:text-indigo-600 transition-colors" title={pkg.name}>{pkg.name}</div>
                                                    <div className="text-2xs font-bold text-slate-400 font-mono">{pkg.code}</div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xs font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-indigo-600 shadow-sm">x{pkg.qty}</span>
                                                </div>
                                            </div>
                                            {pkg.model && <div className="mt-1 text-2xs font-bold text-slate-400 uppercase tracking-wider">{pkg.model}</div>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                                    <p className="text-slate-400 text-2xs font-bold uppercase tracking-widest">Không nằm trong gói nào</p>
                                </div>
                            )}
                        </div>

                        <SimulationLab item={item} />
                    </div>
                </div>

            </div>

            {viewingPackage && (
                <PackageDetailPopup
                    packageCode={viewingPackage.code}
                    packageName={viewingPackage.name}
                    kittingDefs={kittingDefs}
                    allData={allData}
                    onClose={() => setViewingPackage(null)}
                    onItemClick={(i) => { setViewingPackage(null); onItemSelect(i); }}
                    onOpenOptimizer={onNavigateToPackage}
                />
            )}
        </div>
    );
};
