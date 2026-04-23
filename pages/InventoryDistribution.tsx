import React, { useMemo, useState } from 'react';
import { InventoryItem, SourceProfile } from '../types/inventory';
import { useLanguage } from '../utils/i18n';
import { Typography } from '../components/Typography';
import { computeInventoryBatch, makeComputeParams } from '../utils/inventoryEngine';
import { enrichItemWithCostTransfer, TransferEnrichment } from '../utils/transferEngine';
import { useDevice } from '../hooks/useDevice';

interface InventoryDistributionProps {
    data: InventoryItem[];
    enrichedData?: InventoryItem[];
    isEngineProcessing?: boolean;
    onItemSelect: (item: InventoryItem) => void;
    appSettings: {
        sourceProfiles: SourceProfile[];
    };
}

export const InventoryDistribution: React.FC<InventoryDistributionProps> = ({ data, enrichedData, isEngineProcessing, onItemSelect, appSettings }) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'rebalance' | 'allocation'>('rebalance');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<string>('mos_asc');
    const [necessityFilter, setNecessityFilter] = useState<'All' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'>('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    // Enrich data with base engine + cost-aware transfer
    const { enrichedList, transferMap } = useMemo(() => {
        const fallbackData = data;
        const baseList = enrichedData || fallbackData;

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
            {/* ─── Compact/Flat Header ─── */}
            <div className={`bg-gradient-to-r ${activeTab === 'rebalance' ? 'from-blue-900 to-indigo-900' : 'from-slate-900 to-slate-800'} rounded-2xl text-white relative overflow-hidden shadow-sm transition-colors duration-500`}>
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-[80px] -mr-40 -mt-40 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between px-4 py-3 gap-3 md:gap-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                            <i className="fas fa-right-left text-blue-300 text-sm"></i>
                        </div>
                        <div>
                            <Typography variant="h2" className="text-white !text-lg md:!text-xl tracking-tight leading-none">
                                {isMobile ? 'Phân Bổ & Điều Chuyển' : t('transfer_title')}
                            </Typography>
                            <Typography variant="label" className="text-white/60 !text-[10px] font-medium block mt-0.5">
                                {activeTab === 'rebalance' ? 'Cân đối tồn kho giữa các miền (Rebalance)' : 'Phân bổ lô hàng đang về (Allocation)'}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end bg-black/20 px-3 py-1.5 rounded-lg border border-white/10">
                            <span className="text-[9px] font-black text-white/50 uppercase">Tổng Giá Trị</span>
                            <span className="text-sm font-black tracking-tight text-emerald-400">${stats.totalValue.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end bg-black/20 px-3 py-1.5 rounded-lg border border-white/10">
                            <span className="text-[9px] font-black text-white/50 uppercase break-keep">Kế Hoạch</span>
                            <span className="text-sm font-black text-white">{(stats.rebalanceCount + stats.allocationCount).toLocaleString()} <span className="text-[10px] font-normal opacity-60">Mã</span></span>
                        </div>
                    </div>
                </div>

                {/* Flat Tabs Row */}
                <div className="relative z-10 border-t border-white/10 px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('rebalance')}
                        className={`px-3 py-1.5 md:py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap shrink-0
                            ${activeTab === 'rebalance' ? 'bg-white text-blue-900 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                    >
                        <i className={`fas fa-right-left text-[10px] ${activeTab === 'rebalance' ? 'text-blue-600' : ''}`}></i>
                        Điều phối tồn kho
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${activeTab === 'rebalance' ? 'bg-blue-100 text-blue-800' : 'bg-white/20 text-white'}`}>{stats.rebalanceCount}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('allocation')}
                        className={`px-3 py-1.5 md:py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap shrink-0
                            ${activeTab === 'allocation' ? 'bg-white text-indigo-900 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                    >
                        <i className={`fas fa-cart-plus text-[10px] ${activeTab === 'allocation' ? 'text-indigo-600' : ''}`}></i>
                        Phân bổ đặt hàng
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${activeTab === 'allocation' ? 'bg-indigo-100 text-indigo-800' : 'bg-white/20 text-white'}`}>{stats.allocationCount}</span>
                    </button>
                </div>
            </div>

            {/* ─── Flat Contol & Search Row ─── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 px-1">
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative group w-full md:w-80">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-blue-600 transition-colors"></i>
                        <input type="text" placeholder="Tìm mã hoặc tên..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-3 py-2 bg-slate-50 md:bg-white border border-slate-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium" />
                    </div>

                    {/* Filter & Sort Row (Mobile flat grid) */}
                    <div className="grid grid-cols-2 md:flex md:items-center gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 md:bg-white border border-slate-200 rounded-xl shadow-sm relative shrink-0">
                            <i className="fas fa-filter text-slate-400 text-xs shrink-0"></i>
                            <select value={necessityFilter} onChange={(e) => { setNecessityFilter(e.target.value as any); setCurrentPage(1); }} className="bg-transparent text-[10px] md:text-xs font-black text-slate-700 outline-none cursor-pointer uppercase absolute inset-0 opacity-0 md:opacity-100 md:relative w-full">
                                <option value="All">Lọc: Tất cả</option>
                                <option value="P1">Khẩn (MOS &lt; 0.5)</option>
                                <option value="P2">Cảnh báo (MOS &lt; 1.5)</option>
                                <option value="P3">Cần bù (MOS &lt; 3)</option>
                                <option value="P4">An toàn</option>
                                <option value="P5">Tồn nhiều</option>
                            </select>
                            <span className="md:hidden text-[10px] font-black text-slate-700 uppercase pointer-events-none truncate">{necessityFilter === 'All' ? 'Lọc: Tất cả' : necessityFilter}</span>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 md:bg-white border border-slate-200 rounded-xl shadow-sm relative shrink-0">
                            <i className="fas fa-sort-amount-down text-slate-400 text-xs shrink-0"></i>
                            <select value={sortKey} onChange={(e) => { setSortKey(e.target.value); setCurrentPage(1); }} className="bg-transparent text-[10px] md:text-xs font-black text-slate-700 outline-none cursor-pointer uppercase absolute inset-0 opacity-0 md:opacity-100 md:relative w-full">
                                <option value="mos_asc">Sắp xếp: MOS</option>
                                <option value="val_desc">Giá trị giảm dần</option>
                                <option value="qty_desc">Lượng giảm dần</option>
                                <option value="code">Mã hàng (A-Z)</option>
                            </select>
                            <span className="md:hidden text-[10px] font-black text-slate-700 uppercase pointer-events-none truncate">{sortKey === 'mos_asc' ? 'Xếp: MOS' : sortKey === 'val_desc' ? 'Xếp: Giá trị' : sortKey === 'qty_desc' ? 'Xếp: Số lượng' : 'Xếp: Tên'}</span>
                        </div>
                    </div>
                </div>

                <button onClick={handleExportCSV} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 shrink-0 md:w-auto w-full mt-2 md:mt-0">
                    <i className="fas fa-file-csv"></i>
                    {selectedItems.size > 0 ? `Xuất ${selectedItems.size} mã` : (isMobile ? 'Xuất Data' : t('transfer_export'))}
                </button>
            </div>

            {/* ─── Main Content ─── */}
            {isMobile ? (
                /* === MOBILE CARD VIEW === */
                <div className="mobile-card-grid pb-4">
                    {paginatedData.length === 0 ? (
                        <div className="text-center py-16 text-slate-300">
                            <i className={`fas ${activeTab === 'rebalance' ? 'fa-shuffle' : 'fa-cart-flatbed'} text-5xl mb-4 block opacity-50`}></i>
                            <Typography variant="h3" className="text-slate-400 font-bold">{searchTerm ? 'Không tìm thấy' : 'Không có kế hoạch'}</Typography>
                        </div>
                    ) : paginatedData.map((item) => {
                        const tr = item.computed!.transfer!;
                        const cost = item.computed?.unitCost || 0;
                        const isRebalance = activeTab === 'rebalance';
                        const isSelected = selectedItems.has(item.ItemCode);
                        const tInfo = transferMap.get(item.ItemCode);
                        
                        const lines: Array<{from: string, to: string, qty: number, type: string}> = [];
                        if (isRebalance) {
                            if (tr.transferNBtoBB > 0) lines.push({ from: 'NB', to: 'BB', qty: tr.transferNBtoBB, type: 'Rebalance' });
                            if (tr.transferBBtoNB > 0) lines.push({ from: 'BB', to: 'NB', qty: tr.transferBBtoNB, type: 'Rebalance' });
                        } else {
                            if (tr.suggestedOrderNB > 0) lines.push({ from: 'SEA', to: 'NB', qty: tr.suggestedOrderNB, type: 'Allocation' });
                            if (tr.suggestedOrderBB > 0) lines.push({ from: 'SEA', to: 'BB', qty: tr.suggestedOrderBB, type: 'Allocation' });
                        }

                        return lines.map((line, lIdx) => (
                            <div key={`${item.ItemCode}-${lIdx}`} className={`mobile-item-card overflow-hidden ring-1 shadow-sm ${isSelected ? 'ring-blue-400 bg-blue-50/10' : 'ring-slate-200'}`} onClick={() => onItemSelect(item)}>
                                {/* Card Header */}
                                <div className="flex items-start justify-between p-3 border-b border-slate-100 bg-slate-50/50">
                                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                        <div onClick={(e) => { e.stopPropagation(); toggleSelection(item.ItemCode); }} className="shrink-0 p-1 -ml-1">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                                                {isSelected && <i className="fas fa-check text-[10px]"></i>}
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-black text-slate-900 text-sm tracking-tight">{item.ItemCode}</div>
                                            <div className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{item.ItemName}</div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-bold text-slate-900">${(line.qty * cost).toLocaleString()}</div>
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{line.type}</div>
                                    </div>
                                </div>
                                
                                {/* Movement Graphic */}
                                <div className="p-4 bg-white">
                                    <div className="flex items-center justify-between mt-1 mb-2">
                                        {/* FROM Node */}
                                        <div className="flex flex-col items-center w-20">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">{line.from === 'NB' ? 'Miền Nam' : line.from === 'BB' ? 'Miền Bắc' : 'Hàng Về'}</span>
                                            <div className="text-sm font-black text-slate-800 mt-0.5">{line.from}</div>
                                        </div>
                                        {/* Line */}
                                        <div className="flex-1 flex flex-col items-center px-2 relative -mt-3">
                                            <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">{isRebalance ? 'Điều Chuyển' : 'Phân Bổ'}</div>
                                            <div className={`px-4 py-1.5 rounded-full font-black text-sm shadow-sm z-10 ${isRebalance ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' : 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white'}`}>
                                                {line.qty.toLocaleString()}
                                            </div>
                                            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-200 -z-0 mt-2"></div>
                                            <div className="absolute top-1/2 right-0 -mt-0.5 text-slate-300"><i className="fas fa-chevron-right text-[10px]"></i></div>
                                        </div>
                                        {/* TO Node */}
                                        <div className="flex flex-col items-center w-20">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">{line.to === 'NB' ? 'Miền Nam' : 'Miền Bắc'}</span>
                                            <div className="text-sm font-black text-slate-800 mt-0.5">{line.to}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Impact Section */}
                                {tInfo && tInfo.transferDirection !== 'NONE' && isRebalance && (
                                    <div className="bg-slate-50 border-t border-slate-100 p-2.5 flex items-center justify-between text-[10px]">
                                        <span className="font-bold text-slate-500">Net Benefit:</span>
                                        <span className={`font-black uppercase px-2 py-0.5 rounded ${tInfo.transferNetBenefit > 0 ? 'text-emerald-700 bg-emerald-100' : 'text-slate-600 bg-slate-200'}`}>
                                            {Math.round(tInfo.transferNetBenefit).toLocaleString()} VND
                                        </span>
                                    </div>
                                )}
                            </div>
                        ));
                    })}
                </div>
            ) : (
                /* === DESKTOP TABLE VIEW === */
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
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
                                            <td className="px-6 py-2 bg-emerald-50/10">
                                                <div className="flex flex-col items-center grayscale-[0.5] opacity-80 group-hover/row:grayscale-0 group-hover/row:opacity-100 transition-all">
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
                                            <td className="px-6 py-2 bg-blue-50/10">
                                                <div className="flex flex-col items-center grayscale-[0.5] opacity-80 group-hover/row:grayscale-0 group-hover/row:opacity-100 transition-all">
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
                                                        <div className="flex items-center justify-end gap-2 mt-1">
                                                            <span
                                                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tInfo.transferNetBenefit > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-50 border-slate-200'}`}
                                                                title={`Lợi ích: ${Math.round(tInfo.transferBenefit).toLocaleString()}đ — Chi phí: ${Math.round(tInfo.transferCost).toLocaleString()}đ`}
                                                            >
                                                                <i className="fas fa-chart-line text-[7px] mr-1"></i>
                                                                Net: {Math.round(tInfo.transferNetBenefit).toLocaleString()}đ
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    ));
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="py-24 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-20">
                                                <i className={`fas ${activeTab === 'rebalance' ? 'fa-shuffle' : 'fa-cart-flatbed'} text-6xl`}></i>
                                                <Typography variant="h3" className="italic">{searchTerm ? 'Không tìm thấy mã phù hợp' : 'Hiện chưa có đề xuất nào'}</Typography>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pagination Footer */}
            <div className="p-4 md:p-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between text-xs font-black uppercase tracking-widest text-slate-600 bg-white/50 gap-4 mt-2 rounded-2xl">
                <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto no-scrollbar">
                    <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 font-bold text-sm shadow-sm shrink-0">
                        <option value={10}>10 dòng</option>
                        <option value={20}>20 dòng</option>
                        <option value={50}>50 dòng</option>
                    </select>
                    <span className="text-slate-400 whitespace-nowrap">Tổng: <span className="text-slate-700">{suggestions.length}</span></span>
                </div>
                
                <div className="flex items-center gap-1 w-full md:w-auto justify-center md:justify-end">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl transition-all ${currentPage === 1 ? 'text-slate-300' : 'text-slate-600 bg-white shadow-sm'}`}>
                        <i className="fas fa-chevron-left text-xs"></i>
                    </button>
                    
                    {[...Array(totalPages)].map((_, i) => {
                        const page = i + 1;
                        if (totalPages > 5 && Math.abs(currentPage - page) > 1 && page !== 1 && page !== totalPages) {
                            if (page === 2 || page === totalPages - 1) return <span key={i} className="px-1 text-slate-300">…</span>;
                            return null;
                        }
                        return (
                            <button key={i} onClick={() => setCurrentPage(page)} className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl font-black transition-all ${currentPage === page ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}>
                                {page}
                            </button>
                        );
                    })}
                    
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl transition-all ${currentPage === totalPages || totalPages === 0 ? 'text-slate-300' : 'text-slate-600 bg-white shadow-sm'}`}>
                        <i className="fas fa-chevron-right text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};
