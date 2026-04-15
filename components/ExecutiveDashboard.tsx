
import React, { useMemo, useState, useEffect } from 'react';
import { InventoryItem, DashboardSettings, InventoryFilters, getDebtStatus, OrderingDraft } from '../types/inventory';
import { StatusBadge } from './StatusBadge';
import { DebtStatusBadge } from './DebtStatusBadge';
import { StockProgressBar } from './StockProgressBar';
import { SalesMomentum } from './SalesMomentum';
import { exportToCSV, calculatePickingPriority, CsvExportOptions } from '../utils/csvParser';
import { SearchResult } from '../utils/searchLogic';
import { useLanguage } from '../utils/i18n';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { SupersessionIndicator } from './SupersessionIndicator';
import { ConsolidatedStockCell } from './ConsolidatedStockCell';
import { Typography } from './Typography';
import { TrendBadge } from './TrendBadge';

// Inline: StockOutCountdown
const StockOutCountdown = React.memo(({ current, onOrder, dailyDemand, backorder }: { current: number; onOrder: number; dailyDemand: number; backorder: number }) => {
    const available = Math.max(0, current - backorder);
    const totalAvail = available; // Chỉ tính tồn kho vật lý (Onhand) trừ đi nợ đơn (Backorder), không cộng PO (onOrder)
    if (dailyDemand <= 0) return <div className="text-slate-300 font-black text-base">∞</div>;
    const daysLeft = Math.floor(totalAvail / dailyDemand);
    const mos = daysLeft / 30;
    const color = mos < 1 ? 'text-atp-action' : mos < 2 ? 'text-atp-accent' : 'text-atp-success';
    return (
        <div className="flex flex-col items-center">
            <Typography variant="body" className={`font-bold ${color}`}>{daysLeft}d</Typography>
            <Typography variant="label" className="text-slate-500 !font-semibold normal-case">{mos.toFixed(1)} MOS</Typography>
        </div>
    );
});

interface ExecutiveDashboardProps {
    filteredData: InventoryItem[];
    allData?: InventoryItem[]; // NEW: Full dataset for consolidation
    onItemSelect: (item: InventoryItem) => void;
    settings: DashboardSettings;
    filters: InventoryFilters;
    onFiltersChange: (filters: InventoryFilters) => void;
    searchResult: SearchResult;
    draftData?: OrderingDraft;
    mode?: string;
    highlightTokens?: string[];
    graph?: SupersessionGraph;
    exportOptions?: CsvExportOptions;
}

export const ExecutiveDashboard = React.memo(({ filteredData, allData, onItemSelect, settings, filters, onFiltersChange, searchResult, draftData, graph, exportOptions }: ExecutiveDashboardProps) => {
    const { t } = useLanguage();
    const [sortKey, setSortKey] = useState<string>('priority');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [isMobile, setIsMobile] = useState(false);

    // Fallback if allData is not provided (though it should be)
    const inventorySource = allData || filteredData;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const sortedList = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            switch (sortKey) {
                case 'mos_asc': return (a.computed?.mos || 0) - (b.computed?.mos || 0);
                case 'mos_desc': return (b.computed?.mos || 0) - (a.computed?.mos || 0);
                case 'fc_desc': return (b.BaseForecast || 0) - (a.BaseForecast || 0);
                case 'stock_desc': return (b.computed?.available || 0) - (a.computed?.available || 0);
                case 'val_desc': return (b.computed?.stockValue || 0) - (a.computed?.stockValue || 0);
                case 'bo_desc': return (b.Backorder || 0) - (a.Backorder || 0);
                case 'price_desc': return (b.computed?.unitCost || 0) - (a.computed?.unitCost || 0);
                default: // Priority Default
                    return (b.computed?.priorityScore || 0) - (a.computed?.priorityScore || 0);
            }
        });
    }, [filteredData, sortKey]);

    const paginatedData = useMemo(() => sortedList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [sortedList, currentPage, itemsPerPage]);
    const currencyFormatter = useMemo(() => new Intl.NumberFormat(settings.costBasis === 'PP' ? 'vi-VN' : 'en-IE', { style: 'currency', currency: settings.costBasis === 'PP' ? 'VND' : 'EUR', notation: "compact" }), [settings.costBasis]);
    const totalPages = Math.ceil(sortedList.length / itemsPerPage);

    return (
        <div className="flex flex-col bg-white/90 backdrop-blur-md rounded-3xl border border-white/20 overflow-hidden w-full shadow-glass hover:shadow-xl transition-all duration-500">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center bg-slate-50/30 sticky top-0 z-40 gap-4">
                <div className="flex items-center gap-4">
                    <Typography variant="label" className="bg-white text-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">{t('db_inventory_grid')}</Typography>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                        <i className="fas fa-arrow-down-wide-short text-slate-400 text-xs"></i>
                        <select
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer tracking-tight"
                        >
                            <option value="priority">Sắp xếp: Ưu tiên</option>
                            <option value="mos_asc">MOS (Thấp → Cao)</option>
                            <option value="mos_desc">MOS (Cao → Thấp)</option>
                            <option value="fc_desc">Dự báo (FC) Cao</option>
                            <option value="stock_desc">Tồn kho Cao</option>
                            <option value="val_desc">Giá trị Cao</option>
                            <option value="bo_desc">Nợ BO Cao</option>
                            <option value="price_desc">Đơn giá Cao</option>
                        </select>
                    </div>

                    {!isMobile && (
                        <button onClick={() => exportToCSV(sortedList, 'export.csv', exportOptions)} className="bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 transition-all flex items-center gap-2 shadow-sm">
                            <i className="fas fa-file-export"></i> {t('common_export')}
                        </button>
                    )}

                    <div className="relative group w-full md:w-72">
                        <i className="fas fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-blue-500 transition-colors"></i>
                        <input 
                            type="text" 
                            placeholder={t('filter_search')} 
                            value={filters.search} 
                            onChange={e => onFiltersChange({ ...filters, search: e.target.value })} 
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm" 
                        />
                    </div>
                </div>
            </div>

            {isMobile ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 stagger-children">
                    {paginatedData.map((item) => {
                        const m1Actual = item.SalesHistory ? item.SalesHistory[item.SalesHistory.length - 1] : 0;
                        const incomingThisMonth = item.computed?.incomingCurrentMonth || 0;
                        const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                        const draftQty = draftData?.quantities?.[item.ItemCode] ? (draftData.quantities[item.ItemCode].air + draftData.quantities[item.ItemCode].sea) : 0;
                        const chain = graph?.getChain(item.ItemCode);
                        const hasSupersession = chain && chain.allParts.length > 1;

                        return (
                            <div 
                                key={item.ItemCode} 
                                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md relative overflow-hidden focus:outline-none focus:ring-4 focus:ring-blue-50"
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Typography 
                                                variant="mono" 
                                                className="text-slate-900 text-lg !font-bold leading-none tabular-nums cursor-pointer hover:text-blue-600 transition-colors"
                                                onClick={(e) => { e.stopPropagation(); onItemSelect(item); }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(item); } }}
                                            >
                                                {item.ItemCode}
                                            </Typography>
                                            {(() => {
                                                const p = calculatePickingPriority(item, draftQty);
                                                return <span className={`badge-p${Math.min(p, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}>P{p}</span>;
                                            })()}
                                            <SupersessionIndicator
                                                partNumber={item.ItemCode}
                                                graph={graph}
                                                onClick={(e) => { e.stopPropagation(); onItemSelect(item); }}
                                            />
                                        </div>
                                        <div className="text-xs text-slate-500 font-bold truncate mt-1 flex items-center gap-2">
                                            <span className="truncate">{item.ItemName}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <DebtStatusBadge item={item} />
                                            {item.SourceId && (
                                                <Typography variant="label" className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                                                    {item.SourceId}
                                                </Typography>
                                            )}
                                            {item.TypeCar && (
                                                <Typography variant="label" className="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                                    {item.TypeCar}
                                                </Typography>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Demand & Pipeline Summary for Cards */}
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <Typography variant="label" className="text-slate-400 block mb-1 uppercase tracking-tighter">DEMAND</Typography>
                                        <div className="flex items-center gap-2 tabular-nums">
                                            <span className="font-black text-slate-700">{(m1Actual || 0).toLocaleString()}</span>
                                            <div className="h-3 w-px bg-slate-300"></div>
                                            <span className="font-black text-emerald-600">{item.BaseForecast ? Math.round(item.BaseForecast).toLocaleString() : '-'}</span>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100">
                                        <Typography variant="label" className="text-blue-400 block mb-1 uppercase tracking-tighter">Pipeline (In/PO)</Typography>
                                        <div className="flex items-center gap-2 tabular-nums">
                                            <span className="font-black text-blue-700">+{incomingThisMonth.toLocaleString()}</span>
                                            <div className="h-3 w-px bg-blue-200"></div>
                                            <span className="font-black text-indigo-600">PO: {item.TotalPO.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <StockProgressBar
                                        current={item.computed?.available || 0} rop={item.computed?.rop || 0}
                                        max={item.computed?.isStopBiz ? 0 : (item.computed?.stockMax || 1)} ss={item.computed?.safetyStock}
                                        onOrder={item.TotalPO} incoming={incomingThisMonth}
                                        backorder={item.Backorder} breakdown={item.BackorderBreakdown}
                                        draftAdd={draftQty} baseFc={item.BaseForecast}
                                    />

                                    <div className="flex justify-between items-end pt-2 border-t border-slate-50">
                                        <div className="flex flex-col">
                                            <Typography variant="label" className="text-slate-400">Runway (MOS)</Typography>
                                            <Typography variant="h3" className={`tabular-nums ${(item.computed?.mos || 0) < 1 ? 'text-rose-600' : 'text-slate-900'}`}>
                                                {demandMonthly <= 0 ? '∞' : `${(item.computed?.mos || 0).toFixed(1)} M`}
                                            </Typography>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <Typography variant="label" className="text-slate-400">Stock Value</Typography>
                                            <Typography variant="body" className="font-bold text-slate-800 tabular-nums">{currencyFormatter.format(item.computed?.stockValue || 0)}</Typography>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {paginatedData.length === 0 && (
                        <div className="text-center py-20 text-slate-400 font-bold uppercase text-xs">No items match your filters</div>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto relative custom-scrollbar">
                    <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1600px] table-zebra">
                        <thead className="bg-gradient-header text-slate-500 sticky top-0 z-30 font-black uppercase text-xs tracking-wider border-b-2 border-slate-200 backdrop-blur-sm shadow-sm transition-all">
                            <tr>
                                <th className="px-4 py-4 w-12 text-center border-b border-slate-200/60 sticky left-0 z-40 bg-white">#</th>
                                <th className="px-6 py-4 min-w-[220px] sticky left-12 z-40 bg-white border-b border-slate-200/60 sticky-column-shadow">SKU IDENTITY</th>
                                <th className="px-4 py-4 border-b border-slate-200/60 text-center min-w-[110px]">DEMAND</th>
                                <th className="px-4 py-4 border-b border-slate-200/60 text-right min-w-[145px]">STOCK HEALTH</th>
                                <th className="px-4 py-4 border-b border-slate-200/60 text-center min-w-[110px]">SUPPLY PIPELINE</th>
                                <th className="px-4 py-4 text-center border-b border-slate-200/60 min-w-[120px]">{t('ord_th_momentum')}</th>
                                <th className="px-4 py-4 text-center border-b border-slate-200/60 min-w-[80px]">RUNWAY</th>
                                <th className="px-4 py-4 text-center border-b border-slate-200/60">{t('ord_th_dealer_cst')}</th>
                                <th className="px-4 py-4 text-right border-b border-slate-200/60">{t('th_stock_val')}</th>
                                <th className="px-4 py-4 text-center sticky right-0 z-40 bg-white border-b border-slate-200/60 border-l border-slate-200"><i className="fas fa-gear"></i></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white stagger-children">
                            {paginatedData.map((item, idx) => {
                                const m1Actual = item.SalesHistory ? item.SalesHistory[item.SalesHistory.length - 1] : 0;
                                const incomingThisMonth = item.computed?.incomingCurrentMonth || 0;
                                const demandMonthly = (item.computed?.demandRateDaily || 0) * 30;
                                const currentCst = demandMonthly > 0 ? (item.NetDemand + item.DealerInventory) / demandMonthly : 99.9;
                                const draftQty = draftData?.quantities?.[item.ItemCode] ? (draftData.quantities[item.ItemCode].air + draftData.quantities[item.ItemCode].sea) : 0;

                                // Logic for Supersession Display
                                const chain = graph?.getChain(item.ItemCode);
                                const hasSupersession = chain && chain.allParts.length > 1;

                                return (
                                    <tr 
                                        key={item.ItemCode} 
                                        className="hover:bg-slate-50/80 transition-all group focus:outline-none focus:bg-blue-50"
                                    >
                                        <td className="px-4 py-3 text-center text-xs font-black text-slate-400 font-mono border-b border-slate-50 sticky left-0 z-10 bg-white group-hover:bg-slate-50/80">{(currentPage - 1) * itemsPerPage + idx + 1}</td>

                                        <td className="px-6 py-3 sticky left-12 z-10 bg-white group-hover:bg-slate-50/80 transition-colors sticky-column-shadow border-b border-slate-50 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="text-lg font-black text-slate-900 hover:text-blue-600 transition-colors tracking-tight leading-none tabular-nums cursor-pointer underline-offset-4 hover:underline"
                                                    onClick={(e) => { e.stopPropagation(); onItemSelect(item); }}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onItemSelect(item); } }}
                                                    title={t('common_view_detail')}
                                                >
                                                    {item.ItemCode}
                                                </div>
                                                {(() => {
                                                    const p = calculatePickingPriority(item, draftQty);
                                                    return <span className={`badge-p${Math.min(p, 5)} px-1.5 py-0.5 rounded font-black text-[10px] leading-none shrink-0`}>P{p}</span>;
                                                })()}
                                                <SupersessionIndicator partNumber={item.ItemCode} graph={graph} onClick={(e) => { e.stopPropagation(); onItemSelect(item); }} />
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold truncate max-w-[200px]">{item.ItemName}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <DebtStatusBadge item={item} />
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

                                        {/* DEMAND SIGNAL */}
                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80 shadow-sm tabular-nums" title="Bán M-1 thực tế / Dự báo FC">
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

                                        <td className="px-4 py-3 border-b border-slate-50">
                                            <div className="flex flex-col items-end">
                                                <ConsolidatedStockCell item={item} allItems={inventorySource} graph={graph} />
                                                <StockProgressBar current={item.computed?.available || 0} rop={item.computed?.rop || 0} max={item.computed?.isStopBiz ? 0 : (item.computed?.stockMax || 1)} ss={item.computed?.safetyStock} onOrder={item.TotalPO} incoming={incomingThisMonth} backorder={item.Backorder} breakdown={item.BackorderBreakdown} draftAdd={draftQty} baseFc={item.BaseForecast} />
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            <div className="flex flex-col items-center gap-1">
                                                {incomingThisMonth > 0 ? (
                                                    <div className="flex flex-col items-center tabular-nums">
                                                        <Typography variant="body" className="font-bold text-blue-700">+{incomingThisMonth.toLocaleString()}</Typography>
                                                        <Typography variant="label" className="text-blue-400 !font-semibold normal-case leading-tight">Về tháng này</Typography>
                                                    </div>
                                                ) : (
                                                    <Typography variant="body" className="font-bold text-slate-300">-</Typography>
                                                )}
                                                {item.TotalPO > 0 && (
                                                    <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 tabular-nums">
                                                        <i className="fas fa-ship text-indigo-400 text-[9px]"></i>
                                                        <span className="text-[10px] font-black text-indigo-600">PO: {item.TotalPO.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50"><SalesMomentum values={[item.AvgQty24M, item.AvgQty12M, item.AvgQty6M, item.AvgQty3M]} history={item.SalesHistory} forecast={item.BaseForecast} /></td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            {demandMonthly <= 0 ? (
                                                <div className="flex flex-col items-center">
                                                    <Typography variant="body" className="font-bold text-slate-300">∞</Typography>
                                                    <Typography variant="label" className="text-slate-400 !font-semibold normal-case">No demand</Typography>
                                                </div>
                                            ) : (
                                                <StockOutCountdown current={item.computed?.available || 0} onOrder={item.TotalPO} dailyDemand={item.computed?.demandRateDaily || 0} backorder={item.Backorder} />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center border-b border-slate-50">
                                            <Typography variant="body" className="font-bold text-slate-800 tabular-nums">{(item.DealerInventory || 0).toLocaleString()}</Typography>
                                            <div className="mt-1 flex flex-col items-center">
                                                <div className={`text-sm font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 tabular-nums`}>
                                                    {demandMonthly <= 0 ? 'CST: ∞' : `CST: ${currentCst.toFixed(1)}`}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right border-b border-slate-50">
                                            <Typography variant="body" className="font-bold text-slate-900 tabular-nums">{currencyFormatter.format(item.computed?.stockValue || 0)}</Typography>
                                        </td>
                                        <td className="px-4 py-3 text-center sticky right-0 z-40 bg-white group-hover:bg-slate-50/80 border-b border-slate-50 border-l border-slate-200"><i className="fas fa-chevron-right text-slate-300 group-hover:text-blue-500 transition-colors"></i></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="px-4 sm:px-8 py-4 border-t-2 border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center justify-between w-full sm:w-auto gap-4 text-slate-600">
                    <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 outline-none cursor-pointer text-slate-700 font-bold text-xs sm:text-sm">
                        <option value={20}>20 {t('common_rows')}</option>
                        <option value={50}>50 {t('common_rows')}</option>
                        <option value={100}>100 {t('common_rows')}</option>
                        <option value={200}>200 {t('common_rows')}</option>
                    </select>
                    <Typography variant="label" className="text-slate-400 whitespace-nowrap">
                        {t('common_total')}: <Typography as="span" variant="label" className="text-slate-700 tabular-nums">{sortedList.length}</Typography>
                    </Typography>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full pb-1 sm:pb-0">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="pagination-pill text-slate-600 shrink-0"><i className="fas fa-chevron-left text-[10px]"></i></button>
                    {[...Array(totalPages)].map((_, i) => { 
                        const page = i + 1; 
                        if (totalPages > 5 && Math.abs(currentPage - page) > 1 && page !== 1 && page !== totalPages) { 
                            if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>; 
                            return null; 
                        } 
                        return <button key={i} onClick={() => setCurrentPage(page)} className={`pagination-pill shrink-0 tabular-nums ${currentPage === page ? 'active' : 'text-slate-600'}`}>{page}</button>; 
                    })}
                    <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="pagination-pill text-slate-600 shrink-0"><i className="fas fa-chevron-right text-[10px]"></i></button>
                </div>
            </div>
        </div>
    );
});
