
import React, { useMemo, useState } from 'react';
import { InventoryItem, SourceProfile } from '../types/inventory';
import { useLanguage } from '../utils/i18n';
import { Typography } from '../components/Typography';
import { computeInventoryBatch, makeComputeParams } from '../utils/inventoryEngine';
import { enrichItemWithCostTransfer, TransferEnrichment } from '../utils/transferEngine';

interface InventoryDistributionProps {
    data: InventoryItem[];
    onItemSelect: (item: InventoryItem) => void;
    appSettings: {
        sourceProfiles: SourceProfile[];
    };
}

export const InventoryDistribution: React.FC<InventoryDistributionProps> = ({ data, onItemSelect, appSettings }) => {
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'rebalance' | 'allocation'>('rebalance');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<string>('mos_asc');
    const [necessityFilter, setNecessityFilter] = useState<'All' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'>('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    // Enrich data with base engine + cost-aware transfer
    const { enrichedList, transferMap } = useMemo(() => {
        const computeParams = makeComputeParams({
            snapshotDate: new Date().toISOString().split('T')[0],
            warehouseScope: 'All',
            costBasis: 'PP',
            demandSource: '3M',
            params: { lt: 90, sp: 30, ssp: 15 },
            sourceProfiles: appSettings.sourceProfiles
        });
        const baseList = computeInventoryBatch(data, computeParams, {});

        // Run cost-aware transfer engine on each item
        const tMap = new Map<string, TransferEnrichment>();
        for (const item of baseList) {
            const enrichment = enrichItemWithCostTransfer(item);
            tMap.set(item.ItemCode, enrichment);
            // Override base engine transfer values with cost-aware values
            if (item.computed?.transfer) {
                item.computed.transfer.transferNBtoBB = enrichment.transferNBtoBB;
                item.computed.transfer.transferBBtoNB = enrichment.transferBBtoNB;
            }
        }
        return { enrichedList: baseList, transferMap: tMap };
    }, [data, appSettings.sourceProfiles]);

    const suggestions = useMemo(() => {
        let list = enrichedList.filter(item => {
            if (!item.computed?.transfer) return false;
            const tRec = item.computed.transfer;
            
            const hasTransfer = (tRec.transferNBtoBB || 0) > 0 || (tRec.transferBBtoNB || 0) > 0;
            const hasOrderSplit = (tRec.suggestedOrderNB || 0) > 0 || (tRec.suggestedOrderBB || 0) > 0;

            if (activeTab === 'rebalance' && !hasTransfer) return false;
            if (activeTab === 'allocation' && !hasOrderSplit) return false;

            // Necessity Filter
            if (necessityFilter !== 'All') {
                const mos = Math.min(tRec.mosNB, tRec.mosBB);
                if (necessityFilter === 'P1' && mos >= 0.5) return false;
                if (necessityFilter === 'P2' && (mos < 0.5 || mos >= 1.5)) return false;
                if (necessityFilter === 'P3' && (mos < 1.5 || mos >= 3)) return false;
                if (necessityFilter === 'P4' && (mos < 3 || mos >= 6)) return false;
                if (necessityFilter === 'P5' && mos < 6) return false;
            }

            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                return item.ItemCode.toLowerCase().includes(searchLower) || 
                       (item.ItemName && item.ItemName.toLowerCase().includes(searchLower));
            }
            return true;
        });

        // Sorting
        return list.sort((a, b) => {
            const trA = a.computed!.transfer!;
            const trB = b.computed!.transfer!;
            const costA = a.computed?.unitCost || 0;
            const costB = b.computed?.unitCost || 0;

            switch (sortKey) {
                case 'mos_asc': 
                    return Math.min(trA.mosNB, trA.mosBB) - Math.min(trB.mosNB, trB.mosBB);
                case 'val_desc':
                    const valA = (trA.transferNBtoBB + trA.transferBBtoNB + trA.suggestedOrderNB + trA.suggestedOrderBB) * costA;
                    const valB = (trB.transferNBtoBB + trB.transferBBtoNB + trB.suggestedOrderNB + trB.suggestedOrderBB) * costB;
                    return valB - valA;
                case 'qty_desc':
                    const qtyA = trA.transferNBtoBB + trA.transferBBtoNB + trA.suggestedOrderNB + trA.suggestedOrderBB;
                    const qtyB = trB.transferNBtoBB + trB.transferBBtoNB + trB.suggestedOrderNB + trB.suggestedOrderBB;
                    return qtyB - qtyA;
                case 'code':
                    return a.ItemCode.localeCompare(b.ItemCode);
                default:
                    return 0;
            }
        });
    }, [enrichedList, searchTerm, activeTab, necessityFilter, sortKey]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return suggestions.slice(startIndex, startIndex + itemsPerPage);
    }, [suggestions, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(suggestions.length / itemsPerPage);

    const stats = useMemo(() => {
        let rebalanceCount = 0;
        let allocationCount = 0;
        let totalValue = 0;

        enrichedList.forEach(item => {
            const tr = item.computed?.transfer;
            if (!tr) return;
            const cost = item.computed?.unitCost || 0;
            
            if (tr.transferNBtoBB > 0 || tr.transferBBtoNB > 0) {
                rebalanceCount++;
                totalValue += (tr.transferNBtoBB + tr.transferBBtoNB) * cost;
            }
            if (tr.suggestedOrderNB > 0 || tr.suggestedOrderBB > 0) {
                allocationCount++;
                totalValue += (tr.suggestedOrderNB + tr.suggestedOrderBB) * cost;
            }
        });

        return { rebalanceCount, allocationCount, totalValue };
    }, [enrichedList]);

    const toggleSelection = (code: string) => {
        const next = new Set(selectedItems);
        if (next.has(code)) next.delete(code);
        else next.add(code);
        setSelectedItems(next);
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === suggestions.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(suggestions.map(s => s.ItemCode)));
        }
    };

    const handleExportCSV = () => {
        const headers = ['SKU', 'Tên hàng', 'Loại hình', 'Hướng đi', 'Số lượng', 'Giá trị', 'Tồn NB', 'MOS NB', 'Hàng về NB', 'Tồn BB', 'MOS BB', 'Hàng về BB'];
        const rows: string[] = [];
        
        const exportSet = selectedItems.size > 0 
            ? enrichedList.filter(i => selectedItems.has(i.ItemCode)) 
            : suggestions;

        exportSet.forEach(item => {
            const tr = item.computed?.transfer;
            if (!tr) return;
            const cost = item.computed?.unitCost || 0;
            const baseData = [
                item.ItemCode, 
                item.ItemName || '', 
                '', '', '', '', 
                tr.physicalNB, tr.mosNB.toFixed(1), `${tr.incomingNB} (${tr.incomingNB_Month})`,
                tr.physicalBB, tr.mosBB.toFixed(1), `${tr.incomingBB} (${tr.incomingBB_Month})`
            ];

            if (tr.transferNBtoBB > 0) {
                const r = [...baseData]; r[2] = 'Rebalance'; r[3] = 'NB->BB'; r[4] = tr.transferNBtoBB.toString(); r[5] = (tr.transferNBtoBB * cost).toFixed(0);
                rows.push(r.join(','));
            }
            if (tr.transferBBtoNB > 0) {
                const r = [...baseData]; r[2] = 'Rebalance'; r[3] = 'BB->NB'; r[4] = tr.transferBBtoNB.toString(); r[5] = (tr.transferBBtoNB * cost).toFixed(0);
                rows.push(r.join(','));
            }
            if (activeTab === 'allocation') {
                if (tr.suggestedOrderNB > 0) {
                     const r = [...baseData]; r[2] = 'Allocation'; r[3] = 'SEA->NB'; r[4] = tr.suggestedOrderNB.toString(); r[5] = (tr.suggestedOrderNB * cost).toFixed(0);
                     rows.push(r.join(','));
                }
                if (tr.suggestedOrderBB > 0) {
                     const r = [...baseData]; r[2] = 'Allocation'; r[3] = 'SEA->BB'; r[4] = tr.suggestedOrderBB.toString(); r[5] = (tr.suggestedOrderBB * cost).toFixed(0);
                     rows.push(r.join(','));
                }
            }
        });

        const csvContent = "\ufeff" + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ke_hoach_dieu_phoi_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div className="space-y-4 animate-fadeIn pb-12">
            {/* Compact Header */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl text-white relative overflow-hidden border border-white/10 shadow-glass">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[80px] -mr-40 -mt-40 pointer-events-none"></div>

                {/* Top row: title + stats */}
                <div className="relative z-10 flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                            <i className="fas fa-right-left text-blue-400 text-sm"></i>
                        </div>
                        <div>
                            <Typography variant="h2" className="text-white !text-xl tracking-tight leading-none">{t('transfer_title')}</Typography>
                            <Typography variant="label" className="text-slate-400 !text-[10px] font-medium">
                                {activeTab === 'rebalance' ? 'Cân đối tồn kho giữa các miền dựa trên MOS và hàng đang về' : 'Phân bổ tối ưu lượng hàng mới đặt về cho từng trung tâm'}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Giá trị</span>
                            <span className="text-sm font-black text-white">${stats.totalValue.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-400/20 px-3 py-1.5 rounded-lg">
                            <i className="fas fa-cubes text-blue-300 text-[10px]"></i>
                            <span className="text-[10px] font-black text-blue-300 uppercase">Mã</span>
                            <span className="text-sm font-black text-white">{(stats.rebalanceCount + stats.allocationCount).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom row: tabs */}
                <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('rebalance')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                            ${activeTab === 'rebalance' ? 'bg-white/15 text-white border border-white/25 shadow-inner' : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                    >
                        <i className={`fas fa-right-left text-[10px] ${activeTab === 'rebalance' ? 'text-blue-300' : ''}`}></i>
                        Điều phối tồn kho
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab === 'rebalance' ? 'bg-blue-500/40 text-blue-200' : 'bg-white/10 text-white/40'}`}>{stats.rebalanceCount}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('allocation')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                            ${activeTab === 'allocation' ? 'bg-white/15 text-white border border-white/25 shadow-inner' : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                    >
                        <i className={`fas fa-cart-plus text-[10px] ${activeTab === 'allocation' ? 'text-indigo-300' : ''}`}></i>
                        Phân bổ đặt hàng
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab === 'allocation' ? 'bg-indigo-500/40 text-indigo-200' : 'bg-white/10 text-white/40'}`}>{stats.allocationCount}</span>
                    </button>
                </div>
            </div>

            {/* Filter & Search row */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 px-1">

                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative group">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors"></i>
                        <input type="text" placeholder="Tìm mã hoặc tên..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm w-80 shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium" />
                    </div>

                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-[20px] shadow-sm">
                        <i className="fas fa-filter text-slate-400 text-xs"></i>
                        <select value={necessityFilter} onChange={(e) => { setNecessityFilter(e.target.value as any); setCurrentPage(1); }} className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer uppercase">
                            <option value="All">Phân nhóm: Tất cả</option>
                            <option value="P1">Khẩn cấp (P1 - MOS &lt; 0.5)</option>
                            <option value="P2">Cảnh báo (P2 - 0.5 &le; MOS &lt; 1.5)</option>
                            <option value="P3">Cần bổ sung (P3 - 1.5 &le; MOS &lt; 3)</option>
                            <option value="P4">An toàn (P4 - 3 &le; MOS &lt; 6)</option>
                            <option value="P5">Tồn nhiều (P5 - MOS &ge; 6)</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-[20px] shadow-sm">
                        <i className="fas fa-sort-amount-down text-slate-400 text-xs"></i>
                        <select value={sortKey} onChange={(e) => { setSortKey(e.target.value); setCurrentPage(1); }} className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer uppercase">
                            <option value="mos_asc">Sắp xếp: MOS Thấp nhất</option>
                            <option value="val_desc">Giá trị cao nhất</option>
                            <option value="qty_desc">Số lượng cao nhất</option>
                            <option value="code">Mã hàng (A-Z)</option>
                        </select>
                    </div>

                    <button onClick={handleExportCSV} className="bg-slate-900 text-white px-8 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center gap-3">
                        <i className="fas fa-file-csv text-lg"></i>
                        {selectedItems.size > 0 ? `Xuất ${selectedItems.size} mã đã chọn` : t('transfer_export')}
                    </button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 w-12 text-center">
                                    <input type="checkbox" checked={selectedItems.size === suggestions.length && suggestions.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                </th>
                                <th className="px-6 py-4 text-left"><Typography variant="label" className="text-slate-400 uppercase tracking-widest">Chi tiết Mã hàng</Typography></th>
                                <th className="px-6 py-4 text-center"><Typography variant="label" className="text-slate-400 uppercase tracking-widest">Số lượng Cân đối</Typography></th>
                                <th className="px-6 py-4 text-center bg-emerald-50/50"><Typography variant="label" className="text-emerald-700 uppercase tracking-widest">Cơ sở quyết định (Miền Nam — NB)</Typography></th>
                                <th className="px-6 py-4 text-center bg-blue-50/50"><Typography variant="label" className="text-blue-700 uppercase tracking-widest">Cơ sở quyết định (Miền Bắc — BB)</Typography></th>
                                <th className="px-6 py-4 text-right"><Typography variant="label" className="text-slate-400 uppercase tracking-widest">Giá trị dự kiến</Typography></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedData.length > 0 ? paginatedData.map((item, idx) => {
                                const tr = item.computed!.transfer!;
                                const cost = item.computed?.unitCost || 0;
                                const isRebalance = activeTab === 'rebalance';
                                const isSelected = selectedItems.has(item.ItemCode);
                                
                                const lines: Array<{from: string, to: string, qty: number, type: string}> = [];
                                if (isRebalance) {
                                    if (tr.transferNBtoBB > 0) lines.push({ from: 'NB', to: 'BB', qty: tr.transferNBtoBB, type: t('rebalance') });
                                    if (tr.transferBBtoNB > 0) lines.push({ from: 'BB', to: 'NB', qty: tr.transferBBtoNB, type: t('rebalance') });
                                } else {
                                    if (tr.suggestedOrderNB > 0) lines.push({ from: 'SEA', to: 'NB', qty: tr.suggestedOrderNB, type: t('allocation') });
                                    if (tr.suggestedOrderBB > 0) lines.push({ from: 'SEA', to: 'BB', qty: tr.suggestedOrderBB, type: t('allocation') });
                                }

                                return lines.map((line, lIdx) => (
                                    <tr key={`${item.ItemCode}-${lIdx}`} className={`hover:bg-slate-50 transition-all group/row cursor-pointer ${isSelected ? 'bg-blue-50/30' : ''}`} onClick={() => onItemSelect(item)}>
                                        <td className="px-6 py-2 text-center" onClick={(e) => { e.stopPropagation(); toggleSelection(item.ItemCode); }}>
                                            <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSelection(item.ItemCode); }} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                        </td>
                                        <td className="px-6 py-2">
                                            <div className="flex flex-col">
                                                <Typography variant="body" className="font-bold text-slate-800 group-hover/row:text-blue-600 transition-colors">{item.ItemCode}</Typography>
                                                <Typography variant="label" className="text-slate-400 font-medium block truncate max-w-[200px] !text-[10px]">{item.ItemName}</Typography>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2">
                                            <div className="flex items-center justify-center gap-3">
                                                <span className="text-xs font-black text-slate-500 w-8">{line.from}</span>
                                                <div className="flex flex-col items-center">
                                                    <div className={`px-4 py-1 rounded-xl font-black text-xs border ${isRebalance ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                                                        {line.qty.toLocaleString()}
                                                    </div>
                                                    <i className="fas fa-caret-right text-slate-300 -mt-1 scale-x-150"></i>
                                                </div>
                                                <span className="text-xs font-black text-slate-900 w-8">{line.to}</span>
                                            </div>
                                        </td>
                                        {/* NB = Miền Nam */}
                                        <td className="px-6 py-2 bg-emerald-50/30">
                                            <div className="flex flex-col items-center grayscale opacity-80 group-hover/row:grayscale-0 group-hover/row:opacity-100 transition-all">
                                                <div className="grid grid-cols-6 gap-x-1 w-full text-center">
                                                    <div className="w-10">
                                                        <div className="text-[10px] font-black text-slate-500">OH</div>
                                                        <div className="text-[12px] font-black text-slate-900">{tr.physicalNB}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-emerald-100">
                                                        <div className="text-[10px] font-black text-blue-500">DC</div>
                                                        <div className="text-[12px] font-black text-blue-800">{item.QuantityDC_NB}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-emerald-100">
                                                        <div className="text-[10px] font-black text-rose-500">BO</div>
                                                        <div className={`text-[12px] font-black ${item.Backorder_NB > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{item.Backorder_NB}</div>
                                                    </div>
                                                    <div className="w-20 border-l border-emerald-100">
                                                        <div className="text-[10px] font-black text-indigo-500" title="Tổng PO (Hàng về tháng)">PO (T/M)</div>
                                                        <div className="text-[12px] font-black text-indigo-700">{tr.incomingNB} <span className="text-[10px] opacity-60">({tr.incomingNB_Month})</span></div>
                                                    </div>
                                                    <div className="w-12 border-l border-emerald-100">
                                                        <div className="text-[10px] font-black text-amber-600">FC</div>
                                                        <div className="text-[12px] font-black text-amber-700">{item.Forecast_NB || 0}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-emerald-100">
                                                        <div className="text-[10px] font-black text-emerald-600">MOS</div>
                                                        <div className={`text-[12px] font-black ${tr.mosNB < 3 ? 'text-rose-600' : 'text-emerald-700'}`}>{tr.mosNB.toFixed(1)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {/* BB = Miền Bắc */}
                                        <td className="px-6 py-2 bg-blue-50/30">
                                            <div className="flex flex-col items-center grayscale opacity-80 group-hover/row:grayscale-0 group-hover/row:opacity-100 transition-all">
                                                <div className="grid grid-cols-6 gap-x-1 w-full text-center">
                                                    <div className="w-10">
                                                        <div className="text-[10px] font-black text-slate-500">OH</div>
                                                        <div className="text-[12px] font-black text-slate-900">{tr.physicalBB}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-blue-100">
                                                        <div className="text-[10px] font-black text-blue-500">DC</div>
                                                        <div className="text-[12px] font-black text-blue-800">{item.QuantityDC_BB}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-blue-100">
                                                        <div className="text-[10px] font-black text-rose-500">BO</div>
                                                        <div className={`text-[12px] font-black ${item.Backorder_BB > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{item.Backorder_BB}</div>
                                                    </div>
                                                    <div className="w-20 border-l border-blue-100">
                                                        <div className="text-[10px] font-black text-indigo-500" title="Tổng PO (Hàng về tháng)">PO (T/M)</div>
                                                        <div className="text-[12px] font-black text-indigo-700">{tr.incomingBB} <span className="text-[10px] opacity-60">({tr.incomingBB_Month})</span></div>
                                                    </div>
                                                    <div className="w-12 border-l border-blue-100">
                                                        <div className="text-[10px] font-black text-amber-600">FC</div>
                                                        <div className="text-[12px] font-black text-amber-700">{item.Forecast_BB || 0}</div>
                                                    </div>
                                                    <div className="w-10 border-l border-blue-100">
                                                        <div className="text-[10px] font-black text-emerald-600">MOS</div>
                                                        <div className={`text-[12px] font-black ${tr.mosBB < 3 ? 'text-rose-600' : 'text-emerald-700'}`}>{tr.mosBB.toFixed(1)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 text-right">
                                            <Typography variant="mono" className="text-slate-900 font-bold text-xs">${(line.qty * cost).toLocaleString()}</Typography>
                                            <Typography variant="label" className="text-slate-400 font-black block mt-0.5 uppercase !text-[9px] tracking-widest leading-none">{line.type}</Typography>
                                            {(() => {
                                                const tInfo = transferMap.get(item.ItemCode);
                                                if (!tInfo || tInfo.transferDirection === 'NONE' || !isRebalance) return null;
                                                return (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span
                                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tInfo.transferNetBenefit > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-50 border-slate-200'}`}
                                                            title={`Lợi ích: ${Math.round(tInfo.transferBenefit).toLocaleString()}đ — Chi phí: ${Math.round(tInfo.transferCost).toLocaleString()}đ`}
                                                        >
                                                            <i className="fas fa-chart-line text-[7px] mr-0.5"></i>
                                                            Net: {Math.round(tInfo.transferNetBenefit).toLocaleString()}đ
                                                        </span>
                                                        {tInfo.donorMOSAfterGive !== null && (
                                                            <span className="text-[9px] font-bold text-slate-500" title="MOS kho cho sau khi điều chuyển">
                                                                Donor: {tInfo.donorMOSAfterGive.toFixed(1)}M
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ));
                            }) : (
                                <tr>
                                    <td colSpan={7} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-6 opacity-20">
                                            <i className={`fas ${activeTab === 'rebalance' ? 'fa-shuffle' : 'fa-cart-flatbed'} text-8xl`}></i>
                                            <Typography variant="h2" className="italic">{searchTerm ? 'Không tìm thấy mã phù hợp' : 'Hiện chưa có đề xuất nào'}</Typography>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-6 border-t border-slate-100 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-600 bg-slate-50/30">
                    <div className="flex items-center gap-4">
                        <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 font-bold text-sm shadow-sm">
                            <option value={10}>10 dòng</option>
                            <option value={20}>20 dòng</option>
                            <option value={50}>50 dòng</option>
                            <option value={100}>100 dòng</option>
                        </select>
                        <span className="text-slate-400">Tổng cộng: <span className="text-slate-700">{suggestions.length}</span> mã hàng</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${currentPage === 1 ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-md'}`}>
                            <i className="fas fa-chevron-left text-xs"></i>
                        </button>
                        
                        {[...Array(totalPages)].map((_, i) => {
                            const page = i + 1;
                            if (totalPages > 7 && Math.abs(currentPage - page) > 2 && page !== 1 && page !== totalPages) {
                                if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>;
                                return null;
                            }
                            return (
                                <button key={i} onClick={() => setCurrentPage(page)} className={`w-10 h-10 flex items-center justify-center rounded-xl font-black transition-all ${currentPage === page ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-white hover:shadow-md'}`}>
                                    {page}
                                </button>
                            );
                        })}
                        
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${currentPage === totalPages || totalPages === 0 ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-md'}`}>
                            <i className="fas fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
