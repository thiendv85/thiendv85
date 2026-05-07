import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import * as XLSX from 'xlsx';
import { Typography } from '../components/Typography';
import { useLanguage } from '../utils/i18n';
import { useInventoryWorker } from '../hooks/useInventoryWorker';
import { InventoryItem, BackorderDetail, SourceProfile } from '../types/inventory';
import { StatusBadge } from '../components/StatusBadge';
import { DebtStatusBadge } from '../components/DebtStatusBadge';
import { BackorderPopup } from '../components/BackorderPopup';
import { PipelinePopup } from '../components/PipelinePopup';
import { DealerInventoryPopup } from '../components/DealerInventoryPopup';
import { parseInventorySearch, SearchResult, matchSearch, prepareSearchCache } from '../utils/searchLogic';

const AgingBadge = ({ days, qty }: { days: string, qty: number }) => {
    const getColor = (d: string) => {
        if (d === '>90') return 'bg-rose-50 text-[#df1b41] border-rose-200';
        if (d === '90') return 'bg-rose-50 text-[#df1b41] border-rose-100';
        if (d === '60') return 'bg-amber-50 text-[#ff8c00] border-amber-100';
        return 'bg-slate-50 text-[#635bff] border-slate-100';
    };

    return (
        <div className="flex flex-col items-center gap-0.5 group/aging">
            <span className="text-[9px] font-bold text-slate-600 group-hover/aging:text-slate-900 transition-colors uppercase tracking-wider">{days === '>90' ? '> 90D' : `${days}D`}</span>
            <div className={`px-2 py-1 rounded-md text-[11px] font-bold min-w-[42px] text-center border shadow-sm transition-all group-hover/aging:scale-110 ${getColor(days)} tabular-nums`}>
                {qty > 0 ? qty.toLocaleString() : '-'}
            </div>
        </div>
    );
};

const MetricCard = ({ label, value, sub, icon, colorTheme, onClick, isActive }: any) => {
    const themes: Record<string, string> = {
        slate: 'from-[#1a1f36] to-[#2d334d] shadow-slate-200',
        emerald: 'from-[#064e3b] to-[#0d9488] shadow-emerald-100',
        navy: 'from-[#1e3a8a] to-[#3b82f6] shadow-blue-100',
        crimson: 'from-[#881337] to-[#be123c] shadow-rose-100'
    };

    const activeTheme = themes[colorTheme] || themes.slate;

    return (
        <div 
            onClick={onClick}
            className={`p-6 rounded-2xl transition-all duration-500 cursor-pointer relative overflow-hidden flex items-center gap-5 group shadow-2xl bg-gradient-to-br ${activeTheme} ${isActive ? 'ring-4 ring-white/30 -translate-y-2 scale-[1.02]' : 'hover:-translate-y-3 hover:scale-[1.05]'}`}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 blur-2xl"></div>
            <div className="w-14 h-14 rounded-xl bg-white/10 text-white flex items-center justify-center text-2xl transition-all group-hover:rotate-12 group-hover:bg-white/20 shadow-inner border border-white/10">
                <i className={`fas ${icon}`}></i>
            </div>
            <div className="relative z-10 flex-1">
                <Typography variant="label" className="text-white/70 font-black uppercase tracking-[0.2em] !text-[9px] mb-1 block group-hover:text-white transition-colors">{label}</Typography>
                <div className="flex items-baseline gap-1">
                    <Typography variant="h2" className="text-white !font-black !text-2xl tracking-tight group-hover:scale-110 origin-left transition-transform duration-500">{value}</Typography>
                    <Typography variant="label" className="text-white/50 !text-[10px] font-bold">tr</Typography>
                </div>
                {sub && <Typography variant="label" className="text-white/40 block mt-1 !text-[10px] font-medium normal-case group-hover:text-white/70 transition-colors">{sub}</Typography>}
            </div>
            {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/50 animate-pulse"></div>
            )}
        </div>
    );
};

const FilterDropdown = ({ label, options, selected, onChange, icon }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm ${selected.length > 0 ? 'bg-[#635bff] border-[#635bff] text-white' : 'bg-white border-slate-200 text-[#4f566b] hover:border-slate-300'}`}
            >
                <i className={`fas ${icon}`}></i>
                {label} {selected.length > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded text-white ml-1 tabular-nums">{selected.length}</span>}
                <i className={`fas fa-chevron-down text-[8px] ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 animate-in fade-in zoom-in-95 origin-top-left">
                        <div className="p-2 border-b border-slate-50 mb-1">
                            <Typography variant="label" className="text-slate-400 !text-[9px] uppercase font-black">Lọc theo {label}</Typography>
                        </div>
                        <div className="max-h-60 overflow-auto custom-scrollbar p-1">
                            {options.length > 0 && (
                                <label className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50/50 rounded-lg cursor-pointer transition-colors group border-b border-slate-50 mb-1 sticky top-0 bg-white z-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selected.length === options.length && options.length > 0}
                                        onChange={() => {
                                            if (selected.length === options.length) onChange([]);
                                            else onChange([...options]);
                                        }}
                                        className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-black text-blue-600 uppercase group-hover:text-blue-700 truncate">Chọn tất cả</span>
                                </label>
                            )}
                            {options.map((opt: string) => (
                                <label key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                                    <input 
                                        type="checkbox" 
                                        checked={selected.includes(opt)}
                                        onChange={() => {
                                            const next = selected.includes(opt) 
                                                ? selected.filter((s: string) => s !== opt) 
                                                : [...selected, opt];
                                            onChange(next);
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 truncate">{opt}</span>
                                </label>
                            ))}
                        </div>
                        <div className="p-2 border-t border-slate-50 mt-1 flex justify-between">
                            <button onClick={() => onChange([])} className="text-[9px] font-black text-rose-500 uppercase hover:underline">Xóa</button>
                            <button onClick={() => setIsOpen(false)} className="text-[9px] font-black text-blue-600 uppercase hover:underline">Hoàn tất</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const BackorderAnalytics = ({ enrichedData, isProcessing, onSkuSelect, graph, sourceProfiles }: { 
    enrichedData?: InventoryItem[], 
    isProcessing?: boolean,
    onSkuSelect: (item: InventoryItem) => void,
    graph?: any,
    sourceProfiles?: SourceProfile[]
}) => {
    const { t } = useLanguage();
    const handleExport = () => {
        if (!enrichedData) return;
        const data = filteredData.map(item => ({
            'Mã hàng': item.ItemCode,
            'Tên hàng': item.ItemName,
            'Nguồn': item.SourceId,
            'Nhóm mẹ': resolveMotherGroup(item),
            'Tổng nợ': item.Backorder,
            'Giá trị nợ': item.Backorder * (item.computed?.unitCost || 0),
            'Tồn NB': item.QuantityInventory_NB,
            'Tồn BB': item.QuantityInventory_BB,
            'Tồn đại lý': item.DealerInventory,
            'Nợ lâu nhất (ngày)': getOldestDebtDays(item),
            'Hàng về (PO)': item.TotalPO,
            'Ưu tiên': item.computed?.boAging?.qtyOver90 > 0 ? 'CRITICAL' : (item.computed?.boAging?.qty60 > 0 ? 'HIGH' : 'NORMAL')
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Backorder');
        XLSX.writeFile(wb, `Backorder_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
    const [search, setSearch] = useState('');
    const [agingFilter, setAgingFilter] = useState<'all' | '30' | '60' | '90' | 'over90'>('all');
    const [sourceFilters, setSourceFilters] = useState<string[]>([]);
    const [orderTypeFilters, setOrderTypeFilters] = useState<string[]>([]);
    const [branchFilters, setBranchFilters] = useState<string[]>([]);
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);
    const [matrixMetric, setMatrixMetric] = useState<'sku' | 'qty' | 'val'>('sku');
    const [motherGroupFilters, setMotherGroupFilters] = useState<string[]>([]);
    const [specialFilter, setSpecialFilter] = useState<'all' | 'critical' | 'transfer' | 'po'>('all');
    const [masterFilter, setMasterFilter] = useState<'all' | 'stock_ok' | 'po_ok' | 'fail'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'totalValue', direction: 'desc' });

    // Deferred filters for performance
    const deferredSearch = useDeferredValue(search);
    const deferredAgingFilter = useDeferredValue(agingFilter);
    const deferredSourceFilters = useDeferredValue(sourceFilters);
    const deferredMotherGroupFilters = useDeferredValue(motherGroupFilters);
    const deferredOrderTypeFilters = useDeferredValue(orderTypeFilters);
    const deferredBranchFilters = useDeferredValue(branchFilters);
    const deferredSpecialFilter = useDeferredValue(specialFilter);
    const deferredMasterFilter = useDeferredValue(masterFilter);

    const searchResult = useMemo(() => parseInventorySearch(deferredSearch), [deferredSearch]);

    // ── Persistence ──────────────────────────────────────────────────────────
    React.useEffect(() => {
        try {
            const saved = localStorage.getItem('backorder_filters');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.search) setSearch(parsed.search);
                if (parsed.agingFilter) setAgingFilter(parsed.agingFilter);
                // Sanitize array filters to remove potential stale "All" or null values
                if (parsed.sourceFilters) setSourceFilters(parsed.sourceFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.motherGroupFilters) setMotherGroupFilters(parsed.motherGroupFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.orderTypeFilters) setOrderTypeFilters(parsed.orderTypeFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.branchFilters) setBranchFilters(parsed.branchFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.pageSize) setPageSize(Math.max(1, parsed.pageSize));
                if (parsed.matrixMetric) setMatrixMetric(parsed.matrixMetric);
                if (parsed.masterFilter) setMasterFilter(parsed.masterFilter);
            }
        } catch (e) { console.error('Error loading filters:', e); }
    }, []);

    React.useEffect(() => {
        const state = { search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, pageSize, matrixMetric, sortConfig, specialFilter, masterFilter };
        localStorage.setItem('backorder_filters', JSON.stringify(state));
    }, [search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, pageSize, matrixMetric, sortConfig, specialFilter, masterFilter]);

    // ═══ O11/O12 FIX: EnrichedData now comes with _searchCache from Worker ═══
    const cachedData = enrichedData || [];

    const resolveMotherGroup = (item: InventoryItem): string => {
        const sid = (item.SourceId || '').toUpperCase().trim();
        const brand = (item.BrandName || '').toUpperCase().trim();
        if (sourceProfiles) {
            const profile = sourceProfiles.find(p => p.id === sid && p.brand.toUpperCase() === brand);
            if (profile?.motherGroup) return profile.motherGroup;
        }
        if (sid.startsWith('HQ') || sid === 'KOR' || sid === 'MOBIS') return 'HÀN QUỐC';
        if (sid.startsWith('THA') || sid === 'THAI') return 'THÁI LAN';
        if (sid.startsWith('CHI') || sid === 'CN' || sid === 'CHINA') return 'TRUNG QUỐC';
        if (sid === 'GEN' || sid === 'LOC' || sid === 'VN' || sid === 'CKD') return 'TRONG NƯỚC';
        if (sid === 'MAS' || sid === 'MAZDA') return 'MAZDA';
        if (sid === 'KIA') return 'KIA';
        if (sid === 'PEU' || sid === 'PEUGEOT') return 'PEUGEOT';
        if (brand.includes('KIA')) return 'KIA';
        if (brand.includes('MAZDA')) return 'MAZDA';
        if (brand.includes('PEUGEOT')) return 'PEUGEOT';
        if (brand.includes('BMW')) return 'BMW';
        return brand || sid || 'KHÁC';
    };

    const getOrderTypeName = (bo: BackorderDetail): string => {
        const doc = (bo.DocNo || '').trim().toUpperCase();
        const type = (bo.OrderType || '').toUpperCase();
        const prefix = doc.charAt(0);
        if (prefix === 'V' || type.includes('VOR')) return '1. VOR (Xe nằm đường)';
        if (prefix === 'F' || type.includes('BẢO HÀNH') || type.includes('WARRANTY') || type.includes('BH')) return '2. Bảo Hành';
        if (prefix === 'E' || ['KHẨN', 'URGENT', 'EO', 'NHANH'].some(k => type.includes(k))) return '3. Khẩn (EO/Emergency)';
        if (type.includes('CHIẾN DỊCH') || type.includes('CAMPAIGN')) return '4. Chiến dịch';
        if (prefix === 'S' || doc.startsWith('RO') || ['DỰ TRỮ', 'STOCK'].some(k => type.includes(k))) return '5. Dự trữ (Stock)';
        return '6. Khác';
    };

    const formatCurrency = (val: number) => {
        const millions = Math.round(val / 1000000);
        return millions.toLocaleString('vi-VN') + ' Tr';
    };

    const getOldestDebtDays = (item: InventoryItem) => {
        if (!item.BackorderBreakdown || item.BackorderBreakdown.length === 0) return 0;
        let oldestDate: Date | null = null;
        item.BackorderBreakdown.forEach(bo => {
            if (!bo.DocDate) return;
            const parts = bo.DocDate.split('/');
            if (parts.length !== 3) return;
            const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            if (isNaN(date.getTime())) return;
            if (!oldestDate || date < oldestDate) oldestDate = date;
        });
        if (!oldestDate) return 0;
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - oldestDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const formatMatrixVal = (val: number) => {
        if (matrixMetric === 'val') {
            return Math.round(val / 1000000).toLocaleString('vi-VN');
        }
        return val.toLocaleString('vi-VN');
    };

    const filteredData = useMemo(() => {
        if (!cachedData) return [];
        let list = cachedData.filter(item => {
            const matchesSearch = matchSearch(item, searchResult);
            // Enhanced robustness for multi-select filters
            const matchesSource = deferredSourceFilters.length === 0 || deferredSourceFilters.includes(item.SourceId);
            const matchesMother = deferredMotherGroupFilters.length === 0 || deferredMotherGroupFilters.includes(resolveMotherGroup(item));
            
            const b = item.computed?.boAging;
            let matchesAging = true;
            if (deferredAgingFilter === '30') matchesAging = (b?.qty30 || 0) > 0;
            else if (deferredAgingFilter === '60') matchesAging = (b?.qty60 || 0) > 0;
            else if (deferredAgingFilter === '90') matchesAging = (b?.qty90 || 0) > 0;
            else if (deferredAgingFilter === 'over90') matchesAging = (b?.qtyOver90 || 0) > 0;

            const matchesType = deferredOrderTypeFilters.length === 0 || item.BackorderBreakdown?.some(bo => deferredOrderTypeFilters.includes(getOrderTypeName(bo)));
            const matchesBranch = deferredBranchFilters.length === 0 || item.BackorderBreakdown?.some(bo => deferredBranchFilters.includes(bo.Showroom || bo.BranchName || 'Khác'));

            let matchesSpecial = true;
            if (deferredSpecialFilter === 'critical') matchesSpecial = (b?.qtyOver90 || 0) > 0 || (b?.qty90 || 0) > 0;
            else if (deferredSpecialFilter === 'transfer') {
                const nbStock = item.QuantityInventory_NB + item.QuantityDC_NB;
                const bbStock = item.QuantityInventory_BB + item.QuantityDC_BB;
                matchesSpecial = (item.Backorder_BB > 0 && nbStock > 0) || (item.Backorder_NB > 0 && bbStock > 0);
            }
            else if (deferredSpecialFilter === 'po') matchesSpecial = (item.TotalPO || 0) > 0;

            let matchesMaster = true;
            const totalStock = (item.QuantityInventory_NB + item.QuantityInventory_BB + item.QuantityDC_NB + item.QuantityDC_BB);
            const poThisMonth = item.computed?.incomingCurrentMonth || 0;
            
            // Backorder fallback: use computed aging total if main Backorder field is missing/zero
            const boQty = Math.max(item.Backorder || 0, b?.totalQty || 0);

            if (deferredMasterFilter === 'stock_ok') matchesMaster = boQty <= totalStock;
            else if (deferredMasterFilter === 'po_ok') matchesMaster = boQty > totalStock && boQty <= (totalStock + poThisMonth);
            else if (deferredMasterFilter === 'fail') matchesMaster = boQty > (totalStock + poThisMonth);

            const hasBO = boQty > 0;
            return hasBO && matchesSearch && matchesSource && matchesMother && matchesAging && matchesType && matchesBranch && matchesSpecial && matchesMaster;
        });

        if (sortConfig) {
            list.sort((a, b) => {
                let aVal: any = 0;
                let bVal: any = 0;
                switch (sortConfig.key) {
                    case 'ItemCode': aVal = a.ItemCode; bVal = b.ItemCode; break;
                    case 'Backorder': aVal = a.Backorder; bVal = b.Backorder; break;
                    case 'totalValue': aVal = a.computed?.boAging?.totalValue || 0; bVal = b.computed?.boAging?.totalValue || 0; break;
                    case 'TotalPO': aVal = a.TotalPO; bVal = b.TotalPO; break;
                    case 'Stock':
                        aVal = (a.QuantityInventory_NB + a.QuantityDC_NB) + (a.QuantityInventory_BB + a.QuantityDC_BB);
                        bVal = (b.QuantityInventory_NB + b.QuantityDC_NB) + (b.QuantityInventory_BB + b.QuantityDC_BB);
                        break;
                    case 'Aging':
                        aVal = Math.max(a.computed?.boAging?.qtyOver90 || 0, a.computed?.boAging?.qty90 || 0);
                        bVal = Math.max(b.computed?.boAging?.qtyOver90 || 0, b.computed?.boAging?.qty90 || 0);
                        break;
                    case 'OldestDebt':
                        aVal = getOldestDebtDays(a);
                        bVal = getOldestDebtDays(b);
                        break;
                }
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return list;
    }, [cachedData, searchResult, deferredSourceFilters, deferredMotherGroupFilters, deferredAgingFilter, deferredOrderTypeFilters, deferredBranchFilters, sortConfig, deferredSpecialFilter, deferredMasterFilter]);

    const stats = useMemo(() => {
        if (!filteredData) return { totalValue: 0, totalQty: 0, criticalCount: 0, aging: { q30: 0, q60: 0, q90: 0, qO90: 0 }, totalPOVal: 0, poCoverage: 0 };
        let totalValue = 0;
        let totalQty = 0;
        let criticalCount = 0;
        let poCoverageCount = 0;
        let totalPOVal = 0;
        const aging = { q30: 0, q60: 0, q90: 0, qO90: 0 };

        filteredData.forEach(item => {
            const b = item.computed?.boAging;
            const boQty = Math.max(item.Backorder || 0, b?.totalQty || 0);
            const cost = item.computed?.unitCost || 0;
            const val = boQty * cost;

            totalQty += boQty;
            totalValue += val;
            if (item.TotalPO > 0) poCoverageCount += boQty;
            totalPOVal += item.TotalPO * cost;

            if (b) {
                aging.q30 += b.qty30;
                aging.q60 += b.qty60;
                aging.q90 += b.qty90;
                aging.qO90 += b.qtyOver90;
                if (b.qtyOver90 > 0 || b.qty90 > 0) criticalCount++;
            }
        });

        return { totalValue, totalQty, criticalCount, aging, totalPOVal, poCoverage: totalQty > 0 ? (poCoverageCount / totalQty) * 100 : 0 };
    }, [filteredData]);


    const matrixData = useMemo(() => {
        const matrix: Record<string, any> = {};
        
        filteredData?.forEach(item => {
            const source = resolveMotherGroup(item);
            const b = item.computed?.boAging;
            if (!b) return;

            if (!matrix[source]) {
                matrix[source] = {
                    source,
                    total: 0,
                    aging: {
                        q30: { skus: new Set(), qty: 0, val: 0 },
                        q60: { skus: new Set(), qty: 0, val: 0 },
                        q90: { skus: new Set(), qty: 0, val: 0 },
                        qO90: { skus: new Set(), qty: 0, val: 0 },
                    },
                    types: {}
                };
            }

            const cost = item.computed?.unitCost || 0;
            const boQty = Math.max(item.Backorder || 0, b.totalQty || 0);

            // Add to aging buckets
            const add = (bucket: any, q: number) => {
                if (q <= 0) return;
                bucket.skus.add(item.ItemCode);
                bucket.qty += q;
                bucket.val += q * cost;
            };

            add(matrix[source].aging.q30, b.qty30);
            add(matrix[source].aging.q60, b.qty60);
            add(matrix[source].aging.q90, b.qty90);
            add(matrix[source].aging.qO90, b.qtyOver90);

            // Types breakdown
            item.BackorderBreakdown?.forEach(bo => {
                const t = getOrderTypeName(bo);
                if (!matrix[source].types[t]) matrix[source].types[t] = { skus: new Set(), qty: 0, val: 0 };
                matrix[source].types[t].skus.add(item.ItemCode);
                matrix[source].types[t].qty += bo.Qty;
                matrix[source].types[t].val += bo.Qty * cost;
            });
        });

        const getVal = (bucket: any) => {
            if (!bucket) return 0;
            if (matrixMetric === 'sku') return bucket.skus.size;
            if (matrixMetric === 'qty') return bucket.qty;
            return bucket.val;
        };

        return Object.values(matrix).map((data: any) => {
            const row: any = { source: data.source };
            row.q30 = getVal(data.aging.q30);
            row.q60 = getVal(data.aging.q60);
            row.q90 = getVal(data.aging.q90);
            row.qO90 = getVal(data.aging.qO90);
            
            const typeLabels = ['1. VOR (Xe nằm đường)', '2. Bảo Hành', '3. Khẩn (EO/Emergency)', '4. Chiến dịch', '5. Dự trữ (Stock)', '6. Khác'];
            typeLabels.forEach(t => { row[`type_${t}`] = getVal(data.types[t]); });
            
            row.total = matrixMetric === 'sku' 
                ? new Set([...data.aging.q30.skus, ...data.aging.q60.skus, ...data.aging.q90.skus, ...data.aging.qO90.skus]).size
                : (data.aging.q30[matrixMetric] + data.aging.q60[matrixMetric] + data.aging.q90[matrixMetric] + data.aging.qO90[matrixMetric]);
            
            return row;
        }).sort((a, b) => b.total - a.total);
    }, [filteredData, matrixMetric]);

    const loisList = useMemo(() => {
        const rawList = Array.from(new Set(filteredData?.map(i => i.LOISGroup).filter(Boolean)));
        const processed = new Set<string>();
        rawList.forEach(code => {
            if (code.startsWith('L')) processed.add(code);
            else processed.add(code[0]);
        });
        
        return Array.from(processed).sort((a, b) => {
            if (a.startsWith('L') && !b.startsWith('L')) return -1;
            if (!a.startsWith('L') && b.startsWith('L')) return 1;
            if (a === 'C' && b !== 'C' && !b.startsWith('L')) return -1;
            if (b === 'C' && a !== 'C' && !a.startsWith('L')) return 1;
            return a.localeCompare(b);
        });
    }, [filteredData]);

    const loisMatrixData = useMemo(() => {
        const sourceMap: Record<string, Record<string, { skus: Set<string>, qty: number, val: number }>> = {};

        filteredData?.forEach(item => {
            const source = resolveMotherGroup(item);
            const rawLois = item.LOISGroup || 'N/A';
            const lois = rawLois.startsWith('L') ? rawLois : rawLois[0];

            if (!sourceMap[source]) sourceMap[source] = {};
            if (!sourceMap[source][lois]) {
                sourceMap[source][lois] = { skus: new Set<string>(), qty: 0, val: 0 };
            }

            const sid = item.ItemCode;
            const cost = item.computed?.unitCost || 0;
            const boQty = item.Backorder;

            sourceMap[source][lois].skus.add(sid);
            sourceMap[source][lois].qty += boQty;
            sourceMap[source][lois].val += boQty * cost;
        });

        return Object.entries(sourceMap).map(([source, loisData]) => {
            const row: any = { source };
            let rowSkus = new Set<string>();
            let rowQty = 0;
            let rowVal = 0;

            loisList.forEach(l => {
                const bucket = loisData[l];
                if (bucket) {
                    if (matrixMetric === 'sku') row[`lois_${l}`] = bucket.skus.size;
                    else if (matrixMetric === 'qty') row[`lois_${l}`] = bucket.qty;
                    else row[`lois_${l}`] = bucket.val;

                    rowQty += bucket.qty;
                    rowVal += bucket.val;
                    bucket.skus.forEach(s => rowSkus.add(s));
                } else {
                    row[`lois_${l}`] = 0;
                }
            });

            if (matrixMetric === 'sku') row.total = rowSkus.size;
            else if (matrixMetric === 'qty') row.total = rowQty;
            else row.total = rowVal;

            return row;
        }).sort((a, b) => b.total - a.total);
    }, [filteredData, loisList, matrixMetric]);

    const branchData = useMemo(() => {
        const branchMap: Record<string, number> = {};
        filteredData?.forEach(item => {
            item.BackorderBreakdown?.forEach(bo => {
                const bName = bo.Showroom || bo.BranchName || 'Khác';
                branchMap[bName] = (branchMap[bName] || 0) + bo.Qty;
            });
        });
        
        return Object.entries(branchMap)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [filteredData]);

    const orderTypeData = useMemo(() => {
        const typeMap: Record<string, number> = {};
        filteredData?.forEach(item => {
            item.BackorderBreakdown?.forEach(bo => {
                const type = getOrderTypeName(bo);
                typeMap[type] = (typeMap[type] || 0) + bo.Qty;
            });
        });
        return Object.entries(typeMap)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);
    }, [filteredData]);

    const filterOptions = useMemo(() => {
        const sources = new Set<string>();
        const types = new Set<string>();
        const branches = new Set<string>();
        const motherGroups = new Set<string>();
        
        enrichedData?.forEach(item => {
            sources.add(item.SourceId);
            motherGroups.add(resolveMotherGroup(item));
            item.BackorderBreakdown?.forEach(bo => {
                types.add(getOrderTypeName(bo));
                branches.add(bo.Showroom || bo.BranchName || 'Khác');
            });
        });

        return {
            sources: Array.from(sources).sort(),
            motherGroups: Array.from(motherGroups).sort(),
            types: Array.from(types).sort(),
            branches: Array.from(branches).sort()
        };
    }, [enrichedData, sourceProfiles]);

    const pagedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredData.slice(start, start + pageSize);
    }, [filteredData, currentPage, pageSize]);

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 font-sans selection:bg-blue-100 selection:text-blue-900">
            <div className="p-8 pb-4 shrink-0">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="px-2.5 py-1 bg-[#635bff] text-white rounded-md text-[10px] font-bold uppercase tracking-widest shadow-sm">BETA v2.1</div>
                            <Typography variant="label" className="text-[#4f566b] font-bold uppercase tracking-[0.2em] !text-[10px]">Supply Chain Intelligence</Typography>
                        </div>
                        <Typography variant="h1" className="text-[#1a1f36] !text-4xl !font-bold tracking-tight">Phân tích Nợ hàng <span className="text-[#635bff]">Backorder</span></Typography>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleExport}
                            className="flex items-center gap-2 px-6 py-3 bg-[#635bff] text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-[#5851ff] hover:shadow-lg transition-all duration-300 group shadow-sm shadow-indigo-200"
                        >
                            <i className="fas fa-file-excel group-hover:animate-bounce"></i> Xuất Excel
                        </button>
                        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-200 hover:scale-110 transition-transform cursor-pointer">
                            <i className="fas fa-ellipsis-v"></i>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                    <MetricCard 
                        label="Tổng nợ (SL)" 
                        value={stats.totalQty.toLocaleString('vi-VN')} 
                        sub="Số lượng phụ tùng đang nợ" 
                        icon="fa-boxes-stacked" 
                        colorTheme="slate"
                        isActive={masterFilter === 'all'}
                        onClick={() => setMasterFilter('all')}
                    />
                    <MetricCard 
                        label="Giá trị nợ" 
                        value={Math.round(stats.totalValue / 1000000).toLocaleString('vi-VN')} 
                        sub="Tổng giá trị tồn kho nợ (Tr)" 
                        icon="fa-hand-holding-dollar" 
                        colorTheme="emerald"
                        isActive={matrixMetric === 'val'}
                        onClick={() => setMatrixMetric('val')}
                    />
                    <MetricCard 
                        label="Cung ứng PO" 
                        value={`${stats.poCoverage.toFixed(1)}%`} 
                        sub={`${formatCurrency(stats.totalPOVal)} đang về`} 
                        icon="fa-truck-fast" 
                        colorTheme="navy"
                        onClick={() => setSpecialFilter(p => p === 'po' ? 'all' : 'po')}
                        isActive={specialFilter === 'po'}
                    />
                    <MetricCard 
                        label="ĐIỀU CHUYỂN" 
                        value={enrichedData?.filter(i => {
                            const nb = i.QuantityInventory_NB + i.QuantityDC_NB;
                            const bb = i.QuantityInventory_BB + i.QuantityDC_BB;
                            return (i.Backorder_NB > 0 && bb > 0) || (i.Backorder_BB > 0 && nb > 0);
                        }).length.toLocaleString('vi-VN') || '0'} 
                        sub="Cơ hội xử lý nội bộ" 
                        icon="fa-right-left" 
                        colorTheme="crimson"
                        onClick={() => setSpecialFilter(p => p === 'transfer' ? 'all' : 'transfer')}
                        isActive={specialFilter === 'transfer'}
                    />
                </div>

                <div className="mb-12 bg-white/40 backdrop-blur-3xl p-3 rounded-[3rem] border border-white/60 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.1)] flex gap-3 relative z-20 group/filter-bar">
                    {[
                        { id: 'all', label: 'TỔNG NỢ', icon: 'fa-layer-group', color: 'indigo', sub: 'Toàn bộ danh mục', indicator: 'bg-indigo-500' },
                        { id: 'stock_ok', label: 'TỒN ĐỦ TRẢ', icon: 'fa-check-double', color: 'emerald', sub: 'Hàng có sẵn giao ngay', indicator: 'bg-emerald-500' },
                        { id: 'po_ok', label: 'PO ĐỦ TRẢ', icon: 'fa-truck-loading', color: 'amber', sub: 'Hàng về trong tháng', indicator: 'bg-amber-500' },
                        { id: 'fail', label: 'KHÔNG ĐỦ TRẢ', icon: 'fa-circle-exclamation', color: 'rose', sub: 'Thiếu hụt nguồn cung', indicator: 'bg-rose-500' },
                    ].map(f => {
                        const isActive = masterFilter === f.id;
                        const count = (enrichedData || []).filter(i => {
                            const totalStock = (i.QuantityInventory_NB + i.QuantityInventory_BB + i.QuantityDC_NB + i.QuantityDC_BB);
                            const po = i.computed?.incomingCurrentMonth || 0;
                            if (f.id === 'stock_ok') return i.Backorder <= totalStock;
                            if (f.id === 'po_ok') return i.Backorder > totalStock && i.Backorder <= (totalStock + po);
                            if (f.id === 'fail') return i.Backorder > (totalStock + po);
                            return true;
                        }).length;

                        const colorClasses: any = {
                            indigo: 'text-indigo-600 bg-indigo-50',
                            emerald: 'text-emerald-600 bg-emerald-50',
                            amber: 'text-amber-600 bg-amber-50',
                            rose: 'text-rose-600 bg-rose-50'
                        };

                        return (
                            <button 
                                key={f.id}
                                onClick={() => {
                                    setMasterFilter(f.id as any);
                                    setCurrentPage(1);
                                }}
                                className={`flex-1 flex items-center gap-5 p-5 rounded-[2.25rem] transition-all duration-700 relative group cursor-pointer ${isActive ? 'bg-gradient-to-br from-blue-50 to-indigo-50 ring-2 ring-blue-500/20 shadow-[0_15px_35px_-10px_rgba(59,130,246,0.15)] -translate-y-1' : 'hover:bg-white/60 text-slate-500'}`}
                            >
                                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl transition-all duration-500 shadow-inner ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105 rotate-3' : `${colorClasses[f.color]} group-hover:scale-110 group-hover:rotate-3`}`}>
                                    <i className={`fas ${f.icon}`}></i>
                                </div>
                                <div className="text-left flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${f.indicator} animate-pulse`}></span>
                                            <Typography variant="label" className={`font-black uppercase tracking-[0.25em] !text-[10px] ${isActive ? 'text-blue-700' : 'text-[#1a1f36]'}`}>{f.label}</Typography>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black shadow-sm ${isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-[#1a1f36] text-white'}`}>
                                            {count.toLocaleString('vi-VN')}
                                        </div>
                                    </div>
                                    <Typography variant="label" className={`block !text-[10px] normal-case ${isActive ? 'text-blue-600/70' : 'opacity-60'} font-medium tracking-tight truncate max-w-[140px]`}>{f.sub}</Typography>
                                </div>
                                {isActive && (
                                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-blue-500 rounded-full blur-[1px] shadow-[0_0_15px_rgba(59,130,246,0.6)]"></div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-12 mb-20">
                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition-all duration-700 flex flex-col relative overflow-hidden group/m1">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-32 -mt-32 blur-3xl group-hover/m1:bg-indigo-100/40 transition-colors duration-1000"></div>
                        <div className="flex justify-between items-center mb-8 relative z-10">
                            <div>
                                <Typography variant="label" className="text-[#635bff] font-black uppercase tracking-[0.3em] !text-[11px] mb-1 block">Aging Distribution</Typography>
                                <Typography variant="h2" className="text-[#1a1f36] !font-bold tracking-tight !text-2xl">Phân bổ theo Tuổi nợ (Aging)</Typography>
                            </div>
                            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 shadow-inner">
                                {[
                                    { id: 'sku', label: 'SKU' },
                                    { id: 'qty', label: 'SL' },
                                    { id: 'val', label: 'Giá trị' }
                                ].map(m => (
                                    <button 
                                        key={m.id}
                                        onClick={() => setMatrixMetric(m.id as any)}
                                        className={`px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase transition-all ${matrixMetric === m.id ? 'bg-white text-[#635bff] shadow-lg shadow-indigo-100 ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar relative z-10">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-white">
                                        <th rowSpan={2} className="py-6 px-5 text-left border-b border-slate-200 min-w-[200px]"><Typography variant="label" className="text-[#4f566b] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography></th>
                                        <th rowSpan={2} className="py-6 px-4 text-right border-b border-r border-slate-200 bg-slate-50/50"><Typography variant="label" className="text-[#1a1f36] !text-[11px] font-black uppercase tracking-wider">1. TỔNG NỢ {matrixMetric === 'val' ? '(TR)' : ''}</Typography></th>
                                        <th colSpan={6} className="py-3 text-center border-b border-r border-slate-200 bg-slate-50/30"><Typography variant="label" className="text-[#4f566b] !text-[10px] font-black uppercase tracking-[0.2em]">2. PHÂN RÃ THEO LOẠI ĐƠN</Typography></th>
                                        <th colSpan={4} className="py-3 text-center border-b border-slate-200 bg-slate-50/20"><Typography variant="label" className="text-[#4f566b] !text-[10px] font-black uppercase tracking-[0.2em]">3. PHÂN RÃ THEO TUỔI NỢ (AGING)</Typography></th>
                                    </tr>
                                    <tr className="border-b border-slate-200">
                                        {/* Group 2: Types */}
                                        <th className="py-3 text-center px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">VOR {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">BH {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">KHẨN {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">C/DỊCH {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">STOCK {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-r border-slate-200 px-2 min-w-[80px] bg-slate-100/5"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">KHÁC {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        
                                        {/* Group 3: Aging */}
                                        <th className="py-3 text-center px-2 min-w-[90px] bg-slate-100/10"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">&lt; 30D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[90px] bg-slate-100/10"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">30-60D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[90px] bg-slate-100/10"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">60-90D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center px-2 min-w-[90px] bg-slate-100/10"><Typography variant="label" className="text-slate-800 !text-[10px] font-bold">&gt; 90D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {matrixData.map(row => (
                                        <tr key={row.source} className="hover:bg-blue-50/40 transition-all group/row border-b border-slate-100 last:border-0">
                                            <td className="py-4 px-5">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[13px] group-hover/row:text-blue-700 transition-colors tracking-tight">{row.source}</Typography>
                                            </td>
                                            <td className="py-4 text-right px-4 bg-slate-50/30 border-r border-slate-200">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900">
                                                    {matrixMetric === 'val' ? formatCurrency(row.total) : row.total.toLocaleString()}
                                                </Typography>
                                            </td>
                                            
                                            {/* Types breakdown */}
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_1. VOR (Xe nằm đường)'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_1. VOR (Xe nằm đường)'] > 0 ? formatMatrixVal(row['type_1. VOR (Xe nằm đường)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_2. Bảo Hành'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_2. Bảo Hành'] > 0 ? formatMatrixVal(row['type_2. Bảo Hành']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_3. Khẩn (EO/Emergency)'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_3. Khẩn (EO/Emergency)'] > 0 ? formatMatrixVal(row['type_3. Khẩn (EO/Emergency)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_4. Chiến dịch'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_4. Chiến dịch'] > 0 ? formatMatrixVal(row['type_4. Chiến dịch']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_5. Dự trữ (Stock)'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_5. Dự trữ (Stock)'] > 0 ? formatMatrixVal(row['type_5. Dự trữ (Stock)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5 border-r border-slate-200"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_6. Khác'] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row['type_6. Khác'] > 0 ? formatMatrixVal(row['type_6. Khác']) : '-'}</Typography></td>

                                            {/* Aging breakdown */}
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q30 > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row.q30 > 0 ? formatMatrixVal(row.q30) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q60 > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{row.q60 > 0 ? formatMatrixVal(row.q60) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q90 > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{row.q90 > 0 ? formatMatrixVal(row.q90) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-slate-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.qO90 > 0 ? 'text-rose-700' : 'text-slate-300'}`}>{row.qO90 > 0 ? formatMatrixVal(row.qO90) : '-'}</Typography></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-900/5 backdrop-blur-sm border-t-2 border-slate-300 font-bold">
                                    <tr className="divide-x divide-slate-200">
                                        <td className="py-6 px-5 text-slate-700 !text-[12px] uppercase font-bold tracking-[0.15em]">Tổng cộng</td>
                                        <td className="py-5 text-right px-4 bg-slate-900/10 border-r border-slate-200">
                                            <Typography variant="mono" className="!text-[15px] font-black text-slate-900">
                                                {formatMatrixVal(matrixData.reduce((a, b) => a + (b.total || 0), 0))}
                                            </Typography>
                                        </td>
                                        
                                        {/* Type Totals */}
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_1. VOR (Xe nằm đường)'] || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_2. Bảo Hành'] || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_3. Khẩn (EO/Emergency)'] || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_4. Chiến dịch'] || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_5. Dự trữ (Stock)'] || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/10 border-r border-slate-300"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b['type_6. Khác'] || 0), 0))}</Typography></td>

                                        {/* Aging Totals */}
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q30 || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q60 || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q90 || 0), 0))}</Typography></td>
                                        <td className="py-4 text-center px-2 bg-slate-900/5"><Typography variant="mono" className="!text-[11px] font-black text-slate-900">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.qO90 || 0), 0))}</Typography></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition-all duration-700 flex flex-col relative overflow-hidden group/m2">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-32 -mt-32 blur-3xl group-hover/m2:bg-indigo-100/40 transition-colors duration-1000"></div>
                        <div className="mb-8 relative z-10">
                            <Typography variant="label" className="text-[#635bff] font-black uppercase tracking-[0.3em] !text-[11px] mb-1 block">Line of Interest Matrix</Typography>
                            <Typography variant="h2" className="text-[#1a1f36] !font-bold tracking-tight !text-2xl">Phân bổ nợ hàng theo LOIS</Typography>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar relative z-10">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-white border-b border-slate-200">
                                        <th className="py-6 px-5 text-left min-w-[200px]"><Typography variant="label" className="text-[#4f566b] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography></th>
                                        <th className="py-6 px-4 text-right border-r border-slate-200 bg-slate-50/50"><Typography variant="label" className="text-[#1a1f36] !text-[11px] font-black uppercase tracking-wider">TỔNG NỢ {matrixMetric === 'val' ? '(TR)' : ''}</Typography></th>
                                        {loisList.map(lois => (
                                            <th key={lois} className="py-6 text-center px-2 min-w-[80px] bg-slate-50/30 border-b border-slate-200"><Typography variant="label" className="text-slate-800 !text-[10px] font-black">{lois}</Typography></th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loisMatrixData.map(row => (
                                        <tr key={row.source} className="hover:bg-blue-50/40 transition-all group/row border-b border-slate-100 last:border-0">
                                            <td className="py-4 px-5">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[13px] group-hover/row:text-blue-700 transition-colors tracking-tight">{row.source}</Typography>
                                            </td>
                                            <td className="py-4 text-right px-4 bg-slate-50/30 border-r border-slate-200">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900">
                                                    {matrixMetric === 'val' ? formatCurrency(row.total) : row.total.toLocaleString()}
                                                </Typography>
                                            </td>
                                            {loisList.map(lois => (
                                                <td key={lois} className="py-4 text-center px-2 bg-slate-50/5">
                                                    <Typography variant="mono" className={`!text-[12px] font-bold ${row[`lois_${lois}`] > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                                                        {row[`lois_${lois}`] > 0 ? formatMatrixVal(row[`lois_${lois}`]) : '-'}
                                                    </Typography>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-900/5 backdrop-blur-sm border-t-2 border-slate-300 font-bold">
                                    <tr className="divide-x divide-slate-200">
                                        <td className="py-6 px-5 text-slate-700 !text-[12px] uppercase font-bold tracking-[0.15em]">Tổng cộng</td>
                                        <td className="py-5 text-right px-4 bg-slate-900/10 border-r border-slate-200">
                                            <Typography variant="mono" className="!text-[15px] font-black text-slate-900">
                                                {formatMatrixVal(loisMatrixData.reduce((a, b) => a + (b.total || 0), 0))}
                                            </Typography>
                                        </td>
                                        {loisList.map(lois => (
                                            <td key={lois} className="py-4 text-center px-2 bg-slate-900/5">
                                                <Typography variant="mono" className="!text-[11px] font-black text-slate-900">
                                                    {formatMatrixVal(loisMatrixData.reduce((a, b) => a + (b[`lois_${lois}`] || 0), 0))}
                                                </Typography>
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition-all duration-700 flex flex-col group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-400 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Cơ cấu nợ theo loại đơn</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Phân tách nợ đại lý</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shadow-inner">
                                    <i className="fas fa-chart-pie text-sm"></i>
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {orderTypeData.map((d, i) => {
                                    const max = orderTypeData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-purple-600', 'bg-fuchsia-600', 'bg-rose-600'];
                                    const colorClass = colors[i % colors.length];
                                    
                                    return (
                                        <div key={d.name} className="flex flex-col gap-2 group/item">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <Typography variant="label" className="text-slate-700 font-black truncate max-w-[180px] uppercase !text-[10px] group-hover/item:text-slate-900 transition-colors tracking-wide">{d.name}</Typography>
                                                </div>
                                                <Typography variant="mono-sm" className="text-slate-900 font-black !text-[11px]">{d.qty.toLocaleString()}</Typography>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                <div 
                                                    className={`h-full ${colorClass} rounded-full transition-all duration-1000 ease-out shadow-sm group-hover/item:brightness-110`}
                                                    style={{ width: `${width}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition-all duration-700 flex flex-col group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-400 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Top 5 đơn vị nợ hàng</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Hiệu suất chi nhánh</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shadow-inner">
                                    <i className="fas fa-building text-sm"></i>
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {branchData.map((d, i) => {
                                    const max = branchData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    const colors = ['bg-amber-500', 'bg-orange-500', 'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500'];
                                    const colorClass = colors[i % colors.length];

                                    return (
                                        <div key={d.name} className="flex flex-col gap-2 group/item">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-3 h-3 rounded-full ${colorClass} shadow-lg shadow-${colorClass.split('-')[1]}-200 group-hover/item:scale-125 transition-transform`} />
                                                    <Typography variant="label" className="text-slate-700 font-black truncate max-w-[220px] uppercase !text-[10px] group-hover/item:text-slate-900 transition-colors tracking-wide">{d.name}</Typography>
                                                </div>
                                                <Typography variant="mono-sm" className="text-slate-900 font-black !text-[11px]">{d.qty.toLocaleString()}</Typography>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                <div 
                                                    className={`h-full ${colorClass} rounded-full transition-all duration-1000 ease-out shadow-sm group-hover/item:brightness-110`}
                                                    style={{ width: `${width}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-6 pt-0">
                <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.1)] flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative w-64">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                <input 
                                    type="text" 
                                    placeholder="Tìm mã, tên hàng (hỗ trợ dán list từ Excel)..." 
                                    value={search}
                                    onChange={e => {
                                        setSearch(e.target.value);
                                        setSearchResult(parseInventorySearch(e.target.value));
                                    }}
                                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                                />
                                {searchResult.type !== 'EMPTY' && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 text-white p-2 rounded-lg text-[9px] font-black z-20 shadow-xl border border-slate-700 animate-fadeIn flex justify-between items-center">
                                        <span><i className="fas fa-microchip mr-2 text-blue-400"></i>{searchResult.modeDescription}</span>
                                        <button onClick={() => { setSearch(''); setSearchResult({ type: 'EMPTY', tokens: [], displayTokens: [], raw: '' }); }} className="hover:text-rose-400"><i className="fas fa-times"></i></button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="h-8 w-px bg-slate-200 mx-1"></div>

                            <FilterDropdown 
                                label="Nhóm mẹ" 
                                options={filterOptions.motherGroups} 
                                selected={motherGroupFilters} 
                                onChange={setMotherGroupFilters} 
                                icon="fa-layer-group" 
                            />

                            <FilterDropdown 
                                label="Nguồn hàng" 
                                options={filterOptions.sources} 
                                selected={sourceFilters} 
                                onChange={setSourceFilters} 
                                icon="fa-boxes-stacked" 
                            />
                            
                            <FilterDropdown 
                                label="Loại đơn" 
                                options={filterOptions.types} 
                                selected={orderTypeFilters} 
                                onChange={setOrderTypeFilters} 
                                icon="fa-file-invoice" 
                            />

                            <FilterDropdown 
                                label="Đơn vị" 
                                options={filterOptions.branches} 
                                selected={branchFilters} 
                                onChange={setBranchFilters} 
                                icon="fa-building" 
                            />

                            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                {['all', '30', '60', '90', 'over90'].map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => setAgingFilter(val as any)}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${agingFilter === val ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {val === 'all' ? 'Tất cả' : val === 'over90' ? '> 90D' : `${val}D`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Typography variant="label" className="text-slate-400 !text-[10px] mr-2">HIỂN THỊ:</Typography>
                            <select 
                                value={pageSize}
                                onChange={e => setPageSize(Number(e.target.value))}
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:ring-4 focus:ring-blue-100 shadow-sm"
                            >
                                <option value={10}>10 dòng</option>
                                <option value={25}>25 dòng</option>
                                <option value={50}>50 dòng</option>
                                <option value={100}>100 dòng</option>
                            </select>
                        </div>
                    </div>


                    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] overflow-hidden relative group/table hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] transition-all duration-700 flex-1 flex flex-col">
                        <div className="p-8 pb-4 shrink-0 flex justify-between items-center bg-slate-50/30">
                            <div className="flex items-center gap-6">
                                <div>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Chi tiết danh sách SKU</Typography>
                                    <Typography variant="label" className="text-slate-400 !text-[10px] uppercase font-bold tracking-widest">Hiển thị {filteredData.length} kết quả phù hợp</Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-slate-100">
                                {(() => {
                                    const SortableHeader = ({ label, sortKey, align = 'center' }: any) => {
                                        const isActive = sortConfig?.key === sortKey;
                                        return (
                                            <th 
                                                className={`px-4 py-4 cursor-pointer hover:bg-slate-50 transition-colors group/th ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right px-6' : 'px-6'}`}
                                                onClick={() => setSortConfig(p => ({ key: sortKey, direction: p?.key === sortKey && p.direction === 'desc' ? 'asc' : 'desc' }))}
                                            >
                                                <div className={`flex items-center gap-2 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : ''}`}>
                                                    <Typography variant="label" className={`${isActive ? 'text-[#635bff]' : 'text-[#4f566b]'} group-hover/th:text-[#635bff] transition-colors font-bold uppercase tracking-wider`}>{label}</Typography>
                                                    <div className={`flex flex-col text-[8px] ${isActive ? 'text-[#635bff]' : 'text-slate-300 opacity-0 group-hover/th:opacity-100'}`}>
                                                        <i className={`fas fa-caret-up ${isActive && sortConfig.direction === 'asc' ? 'opacity-100' : 'opacity-30'}`}></i>
                                                        <i className={`fas fa-caret-down ${isActive && sortConfig.direction === 'desc' ? 'opacity-100' : 'opacity-30'}`}></i>
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    };

                                    return (
                                        <tr>
                                            <SortableHeader label="SKU & CHI TIẾT NỢ" sortKey="ItemCode" align="left" />
                                            <SortableHeader label="TỔNG NỢ" sortKey="Backorder" />
                                            <SortableHeader label="NỢ LÂU NHẤT" sortKey="OldestDebt" />
                                            <th className="px-4 py-4 text-center"><Typography variant="label" className="text-slate-400 font-black uppercase tracking-widest">LOẠI ĐƠN</Typography></th>
                                            <SortableHeader label="TUỔI NỢ (AGING)" sortKey="Aging" />
                                            <SortableHeader label="TỒN KHO" sortKey="Stock" />
                                            <SortableHeader label="TỒN ĐẠI LÝ" sortKey="DealerInventory" />
                                            <SortableHeader label="HÀNG ĐANG VỀ" sortKey="TotalPO" />
                                            <SortableHeader label="GIÁ TRỊ NỢ (TR)" sortKey="totalValue" align="right" />
                                        </tr>
                                    );
                                })()}
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {pagedData.map(item => {
                                    const nbStock = item.QuantityInventory_NB + item.QuantityDC_NB;
                                    const bbStock = item.QuantityInventory_BB + item.QuantityDC_BB;
                                    const aging = item.computed?.boAging;
                                    
                                    const boTypes: Record<string, number> = {};
                                    item.BackorderBreakdown?.forEach(b => {
                                        const t = getOrderTypeName(b);
                                        boTypes[t] = (boTypes[t] || 0) + b.Qty;
                                    });

                                    const poM0 = item.computed?.incomingCurrentMonth || 0;
                                    const poM1 = item.computed?.incomingNextMonth || 0;

                                    const hasNB_BO = item.Backorder_NB > 0;
                                    const hasBB_BO = item.Backorder_BB > 0;
                                    const canTransferToBB = hasBB_BO && nbStock > 0;
                                    const canTransferToNB = hasNB_BO && bbStock > 0;

                                    let priority = 'NORMAL';
                                    if (aging && (aging.qtyOver90 > 0 || aging.qty90 > 0)) priority = 'CRITICAL';
                                    else if (aging && aging.qty60 > 0) priority = 'HIGH';

                                    return (
                                        <tr key={item.ItemCode} className="hover:bg-blue-50/40 transition-all group cursor-pointer border-b border-slate-50 last:border-0 relative" onClick={() => onSkuSelect(item)}>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="relative">
                                                        <div className={`w-14 h-14 rounded-2xl bg-white border-2 ${priority === 'CRITICAL' ? 'border-rose-200 text-rose-600' : 'border-slate-100 text-slate-500'} flex items-center justify-center font-black text-lg shrink-0 group-hover:border-blue-300 group-hover:text-blue-700 transition-all shadow-md group-hover:shadow-lg group-hover:rotate-3`}>
                                                            {item.ItemCode.charAt(0)}
                                                        </div>
                                                        {priority === 'CRITICAL' && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 rounded-full border-[3px] border-white animate-pulse shadow-xl"></span>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Typography variant="mono" className="font-bold text-[#1a1f36] group-hover:text-[#635bff] transition-colors text-[17px] tracking-tight tabular-nums">{item.ItemCode}</Typography>
                                                            {priority !== 'NORMAL' && (
                                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${priority === 'CRITICAL' ? 'bg-[#df1b41] text-white' : 'bg-[#ff8c00] text-white'}`}>
                                                                    {priority}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Typography variant="label" className="text-[#4f566b] block mt-1 truncate max-w-[240px] normal-case font-medium !text-[12px] group-hover:text-[#1a1f36] transition-colors">{item.ItemName}</Typography>
                                                        <div className="flex gap-2 mt-2">
                                                            <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded-lg font-black tracking-widest shadow-sm">{item.BrandName}</span>
                                                            {item.TypeCar && <span className="text-[9px] bg-white text-slate-500 px-2 py-0.5 rounded-lg font-black border border-slate-200 shadow-sm">{item.TypeCar}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <BackorderPopup items={item.BackorderBreakdown || []}>
                                                    <div className="px-4 py-2 bg-[#635bff] text-white rounded-lg font-mono font-bold text-base shadow-sm hover:bg-[#5851ff] hover:scale-110 transition-all inline-block tabular-nums">
                                                        {Math.max(item.Backorder || 0, item.computed?.boAging?.totalQty || 0).toLocaleString('vi-VN')}
                                                    </div>
                                                </BackorderPopup>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <div className="flex flex-col items-center">
                                                    <Typography variant="mono" className="font-bold text-[#df1b41] text-[15px] tabular-nums">{getOldestDebtDays(item)}</Typography>
                                                    <Typography variant="label" className="text-[#4f566b] !text-[8px] font-bold uppercase">NGÀY</Typography>
                                                </div>
                                            </td>
                                            <td className="px-4 py-5">
                                                <div className="flex flex-wrap justify-center gap-1.5 max-w-[200px] mx-auto">
                                                    {Object.entries(boTypes).map(([type, qty]) => (
                                                        <span key={type} className="text-[10px] bg-slate-50 text-[#4f566b] px-2 py-1 rounded-md border border-slate-100 font-bold whitespace-nowrap tabular-nums">
                                                            {type}: {qty}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5">
                                                 <div className="flex justify-center gap-1">
                                                     <AgingBadge days="30" qty={aging?.qty30 || 0} />
                                                     <AgingBadge days="60" qty={aging?.qty60 || 0} />
                                                     <AgingBadge days="90" qty={aging?.qty90 || 0} />
                                                     <AgingBadge days=">90" qty={aging?.qtyOver90 || 0} />
                                                 </div>
                                             </td>
                                            <td className="px-4 py-5 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-center">
                                                            <Typography variant="mono-sm" className={`font-bold tabular-nums ${item.Backorder_NB > 0 ? 'text-[#df1b41] underline decoration-[#df1b41]/30 decoration-2 underline-offset-4' : 'text-[#1a1f36]'}`}>{nbStock}</Typography>
                                                            <Typography variant="label" className="text-[#4f566b] !text-[8px] font-bold uppercase">NAM</Typography>
                                                        </div>
                                                        <div className="w-px h-6 bg-slate-200"></div>
                                                        <div className="text-center">
                                                            <Typography variant="mono-sm" className={`font-bold tabular-nums ${item.Backorder_BB > 0 ? 'text-[#df1b41] underline decoration-[#df1b41]/30 decoration-2 underline-offset-4' : 'text-[#1a1f36]'}`}>{bbStock}</Typography>
                                                            <Typography variant="label" className="text-[#4f566b] !text-[8px] font-bold uppercase">BẮC</Typography>
                                                        </div>
                                                    </div>
                                                    {(canTransferToBB || canTransferToNB) && (
                                                        <div className="px-2 py-0.5 bg-[#00d924] text-white rounded font-bold text-[8px] uppercase flex items-center gap-1 shadow-sm">
                                                            <i className="fas fa-right-left"></i> Điều chuyển
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <DealerInventoryPopup items={item.DealerBreakdown || []}>
                                                    <div className="flex flex-col items-center group/dl">
                                                        <Typography variant="mono" className="font-black text-blue-600 text-[15px] group-hover/dl:scale-110 transition-transform">{item.DealerInventory.toLocaleString()}</Typography>
                                                        <Typography variant="label" className="text-slate-400 !text-[8px] font-black uppercase group-hover/dl:text-blue-500 transition-colors">TỒN ĐL</Typography>
                                                    </div>
                                                </DealerInventoryPopup>
                                            </td>
                                            <td className="px-4 py-5">
                                                <PipelinePopup 
                                                    pipeline={item.Pipeline} 
                                                    pipelineNB={item.Pipeline_NB} 
                                                    pipelineBB={item.Pipeline_BB}
                                                >
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="grid grid-cols-2 gap-2 w-full max-w-[120px]">
                                                            <div className="bg-blue-50 border border-blue-100 p-1 rounded text-center hover:bg-blue-100 transition-colors">
                                                                <Typography variant="mono" className="text-blue-700 font-black !text-[10px] leading-none">{poM0}</Typography>
                                                                <Typography variant="label" className="text-blue-400 !text-[7px] uppercase font-black block mt-0.5">T.NÀY</Typography>
                                                            </div>
                                                            <div className="bg-indigo-50 border border-indigo-100 p-1 rounded text-center hover:bg-indigo-100 transition-colors">
                                                                <Typography variant="mono" className="text-indigo-700 font-black !text-[10px] leading-none">{poM1}</Typography>
                                                                <Typography variant="label" className="text-indigo-400 !text-[7px] uppercase font-black block mt-0.5">T.SAU</Typography>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center w-full max-w-[120px] mt-1 px-1">
                                                            <Typography variant="label" className="text-slate-400 font-black !text-[8px] uppercase">TỔNG PO:</Typography>
                                                            <Typography variant="mono" className="text-slate-900 font-black !text-[10px]">{item.TotalPO}</Typography>
                                                        </div>
                                                    </div>
                                                </PipelinePopup>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <Typography variant="mono" className="font-bold text-[#1a1f36] !text-[16px] tabular-nums">{formatCurrency(item.computed?.boAging?.totalValue || 0)}</Typography>
                                                <Typography variant="label" className="text-[#4f566b] !text-[10px] font-bold block mt-1 uppercase tracking-wider">GIÁ TRỊ TỔNG NỢ</Typography>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-slate-900 text-white z-10 shadow-2xl">
                                <tr>
                                    <td className="px-6 py-4">
                                        <Typography variant="label" className="text-white/70 font-black uppercase tracking-widest !text-[11px]">TỔNG CỘNG TRANG</Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <Typography variant="mono" className="font-black text-white text-base tabular-nums">
                                            {pagedData.reduce((a, b) => a + b.Backorder, 0).toLocaleString()}
                                        </Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <Typography variant="label" className="text-white/40 !text-[8px] uppercase font-black">---</Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <Typography variant="label" className="text-white/40 !text-[8px] uppercase font-black">---</Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <Typography variant="label" className="text-white/40 !text-[8px] uppercase font-black">---</Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center border-x border-white/10">
                                        <div className="flex items-center justify-center gap-4">
                                            <div className="text-center">
                                                <Typography variant="mono-sm" className="font-black text-white tabular-nums">
                                                    {pagedData.reduce((a, b) => a + (b.QuantityInventory_NB + b.QuantityDC_NB), 0).toLocaleString()}
                                                </Typography>
                                                <Typography variant="label" className="text-white/50 !text-[7px] uppercase font-black">NAM</Typography>
                                            </div>
                                            <div className="text-center">
                                                <Typography variant="mono-sm" className="font-black text-white tabular-nums">
                                                    {pagedData.reduce((a, b) => a + (b.QuantityInventory_BB + b.QuantityDC_BB), 0).toLocaleString()}
                                                </Typography>
                                                <Typography variant="label" className="text-white/50 !text-[7px] uppercase font-black">BẮC</Typography>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center border-r border-white/10">
                                        <Typography variant="mono" className="font-black text-white text-[13px] tabular-nums">
                                            {pagedData.reduce((a, b) => a + b.DealerInventory, 0).toLocaleString()}
                                        </Typography>
                                    </td>
                                    <td className="px-4 py-4 text-center border-r border-white/10">
                                        <Typography variant="mono" className="font-black text-white text-[13px] tabular-nums">
                                            {pagedData.reduce((a, b) => a + b.TotalPO, 0).toLocaleString()}
                                        </Typography>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Typography variant="mono" className="font-black text-white !text-[16px] tabular-nums">
                                            {formatCurrency(pagedData.reduce((a, b) => a + (b.computed?.boAging?.totalValue || 0), 0))}
                                        </Typography>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        {filteredData.length === 0 && (
                            <div className="p-20 text-center">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                                    <i className="fas fa-search text-slate-300 text-2xl"></i>
                                </div>
                                <Typography variant="h3" className="text-slate-400 uppercase tracking-widest">Không tìm thấy dữ liệu nợ hàng</Typography>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Typography variant="label" className="text-slate-400 !text-[10px]">
                                Đang hiển thị <span className="text-slate-900 font-black">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)}</span> trong tổng số <span className="text-slate-900 font-black">{filteredData.length.toLocaleString()}</span> SKU nợ hàng
                            </Typography>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <i className="fas fa-chevron-left text-xs"></i>
                            </button>
                            <div className="flex items-center gap-1">
                                {(() => {
                                    const totalPages = Math.ceil(filteredData.length / (pageSize || 25));
                                    const maxVisible = Math.min(5, totalPages);
                                    if (totalPages <= 0) return null;
                                    return Array.from({ length: maxVisible }).map((_, i) => {
                                        const page = i + 1;
                                        return (
                                            <button 
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={`w-10 h-10 rounded-xl text-[11px] font-black transition-all ${currentPage === page ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                {page}
                                            </button>
                                        );
                                    });
                                })()}
                                {Math.ceil(filteredData.length / (pageSize || 25)) > 5 && <span className="text-slate-300 px-2">...</span>}
                            </div>
                            <button 
                                disabled={pageSize <= 0 || currentPage === Math.ceil(filteredData.length / (pageSize || 25))}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <i className="fas fa-chevron-right text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {isProcessing && (
                <div className="fixed bottom-6 right-6 bg-white shadow-2xl rounded-2xl p-4 border border-blue-100 animate-in fade-in slide-in-from-bottom-4 flex items-center gap-4 z-50">
                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <div>
                        <Typography variant="label" className="text-blue-600 font-black block">ĐANG TÍNH TOÁN DỮ LIỆU</Typography>
                        <Typography variant="body-sm" className="text-slate-400">Vui lòng đợi trong giây lát...</Typography>
                    </div>
                </div>
            )}
        </div>
    </div>
    );
};
