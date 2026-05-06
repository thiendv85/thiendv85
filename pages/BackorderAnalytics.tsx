
import React, { useState, useMemo } from 'react';
import { Typography } from '../components/Typography';
import { useLanguage } from '../utils/i18n';
import { useInventoryWorker } from '../hooks/useInventoryWorker';
import { InventoryItem, BackorderDetail, SourceProfile } from '../types/inventory';
import { StatusBadge } from '../components/StatusBadge';
import { DebtStatusBadge } from '../components/DebtStatusBadge';
import { BackorderPopup } from '../components/BackorderPopup';
import { PipelinePopup } from '../components/PipelinePopup';
import { parseInventorySearch, SearchResult, matchSearch, prepareSearchCache } from '../utils/searchLogic';

const AgingBadge = ({ days, qty }: { days: string, qty: number }) => {
    const getColor = (d: string) => {
        if (d === '>90') return 'bg-rose-600 text-white border-rose-700 shadow-lg shadow-rose-200/50';
        if (d === '90') return 'bg-rose-100 text-rose-700 border-rose-200';
        if (d === '60') return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-blue-100 text-blue-700 border-blue-200';
    };

    return (
        <div className="flex flex-col items-center gap-0.5 group/aging">
            <span className="text-[8px] font-black text-slate-500 group-hover/aging:text-slate-900 transition-colors uppercase tracking-tight">{days === '>90' ? '> 90D' : `${days}D`}</span>
            <div className={`px-2 py-0.5 rounded-md text-[11px] font-black min-w-[42px] text-center border shadow-sm transition-all group-hover/aging:scale-110 group-hover/aging:shadow-md ${getColor(days)}`}>
                {qty > 0 ? qty.toLocaleString() : '-'}
            </div>
        </div>
    );
};

const MetricCard = ({ label, value, sub, icon, color, onClick, isActive }: any) => (
    <div 
        onClick={onClick}
        className={`p-6 rounded-[2rem] border transition-all duration-300 cursor-pointer relative overflow-hidden flex items-center gap-5 group shadow-xl ${isActive ? 'bg-slate-900 text-white border-slate-900 shadow-slate-300 ring-4 ring-slate-100' : 'bg-white/70 backdrop-blur-md border-white/50 shadow-slate-200/40 hover:border-blue-300 hover:-translate-y-1.5'}`}
    >
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50/20 to-transparent rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700"></div>
        <div className={`w-14 h-14 rounded-2xl ${isActive ? 'bg-blue-500' : (color || 'bg-slate-900')} text-white flex items-center justify-center text-2xl shadow-xl transition-transform group-hover:rotate-6`}>
            <i className={`fas ${icon}`}></i>
        </div>
        <div className="relative z-10">
            <Typography variant="label" className={`${isActive ? 'text-slate-300' : 'text-slate-400'} uppercase tracking-[0.2em] font-black !text-[9px]`}>{label}</Typography>
            <div className="flex items-baseline gap-1">
                <Typography variant="h1" className={`${isActive ? 'text-white' : 'text-slate-900'} mt-1 !text-3xl !font-black tracking-tight`}>{value}</Typography>
            </div>
            {sub && (
                <div className="flex items-center gap-1.5 mt-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isActive ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
                    <Typography variant="label" className={`${isActive ? 'text-slate-300' : 'text-slate-500'} font-bold !text-[10px] uppercase tracking-wide`}>{sub}</Typography>
                </div>
            )}
        </div>
    </div>
);

const FilterDropdown = ({ label, options, selected, onChange, icon }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all shadow-sm ${selected.length > 0 ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
                <i className={`fas ${icon}`}></i>
                {label} {selected.length > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded text-white ml-1">{selected.length}</span>}
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
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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

import * as XLSX from 'xlsx';

export const BackorderAnalytics = ({ enrichedData, isProcessing, onSkuSelect, graph, sourceProfiles }: { 
    enrichedData?: InventoryItem[], 
    isProcessing?: boolean,
    onSkuSelect: (item: InventoryItem) => void,
    graph?: any,
    sourceProfiles?: SourceProfile[]
}) => {
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
            'Hàng về (PO)': item.TotalPO,
            'Ưu tiên': item.computed?.boAging?.qtyOver90 > 0 ? 'CRITICAL' : (item.computed?.boAging?.qty60 > 0 ? 'HIGH' : 'NORMAL')
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Backorder');
        XLSX.writeFile(wb, `Backorder_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
    const { t } = useLanguage();
    const [search, setSearch] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult>({ type: 'EMPTY', tokens: [], displayTokens: [], raw: '' });
    const [agingFilter, setAgingFilter] = useState<'all' | '30' | '60' | '90' | 'over90'>('all');
    const [sourceFilters, setSourceFilters] = useState<string[]>([]);
    const [orderTypeFilters, setOrderTypeFilters] = useState<string[]>([]);
    const [branchFilters, setBranchFilters] = useState<string[]>([]);
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);
    const [matrixMetric, setMatrixMetric] = useState<'sku' | 'qty' | 'val'>('sku');
    const [motherGroupFilters, setMotherGroupFilters] = useState<string[]>([]);
    const [specialFilter, setSpecialFilter] = useState<'all' | 'critical' | 'transfer' | 'po'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'totalValue', direction: 'desc' });

    // ── Persistence ──────────────────────────────────────────────────────────
    React.useEffect(() => {
        try {
            const saved = localStorage.getItem('backorder_filters');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.search) setSearch(parsed.search);
                if (parsed.agingFilter) setAgingFilter(parsed.agingFilter);
                if (parsed.sourceFilters) setSourceFilters(parsed.sourceFilters);
                if (parsed.motherGroupFilters) setMotherGroupFilters(parsed.motherGroupFilters);
                if (parsed.orderTypeFilters) setOrderTypeFilters(parsed.orderTypeFilters);
                if (parsed.branchFilters) setBranchFilters(parsed.branchFilters);
                if (parsed.pageSize) setPageSize(parsed.pageSize);
                if (parsed.matrixMetric) setMatrixMetric(parsed.matrixMetric);
            }
        } catch (e) { console.error('Error loading filters:', e); }
    }, []);

    React.useEffect(() => {
        const state = { search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, pageSize, matrixMetric, sortConfig, specialFilter };
        localStorage.setItem('backorder_filters', JSON.stringify(state));
    }, [search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, pageSize, matrixMetric, sortConfig, specialFilter]);

    const cachedData = useMemo(() => {
        if (!enrichedData) return [];
        return prepareSearchCache(enrichedData) as InventoryItem[];
    }, [enrichedData]);

    const stats = useMemo(() => {
        if (!enrichedData) return { totalValue: 0, totalQty: 0, criticalCount: 0, aging: { q30: 0, q60: 0, q90: 0, qO90: 0 }, totalPOVal: 0, poCoverage: 0 };
        
        let totalValue = 0;
        let totalQty = 0;
        let criticalCount = 0;
        let coveredQty = 0;
        let totalPOVal = 0;
        const aging = { q30: 0, q60: 0, q90: 0, qO90: 0 };

        enrichedData.forEach(item => {
            const b = item.computed?.boAging;
            if (b) {
                totalValue += b.totalValue;
                totalQty += item.Backorder;
                aging.q30 += b.qty30;
                aging.q60 += b.qty60;
                aging.q90 += b.qty90;
                aging.qO90 += b.qtyOver90;
                
                if (b.qtyOver90 > 0 || b.qty90 > 0) criticalCount++;
                coveredQty += Math.min(item.Backorder, item.TotalPO);
                totalPOVal += item.TotalPO * (item.computed?.unitCost || 0);
            }
        });

        return {
            totalValue,
            totalQty,
            criticalCount,
            aging,
            totalPOVal,
            poCoverage: totalQty > 0 ? (coveredQty / totalQty) * 100 : 0
        };
    }, [enrichedData]);

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
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(val);
    };

    const formatMatrixVal = (val: number) => {
        if (matrixMetric === 'val') {
            return (val / 1000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        }
        return val.toLocaleString();
    };

    const matrixData = useMemo(() => {
        const sourceMap: Record<string, { 
            aging: {
                q30: { skus: Set<string>, qty: number, val: number }, 
                q60: { skus: Set<string>, qty: number, val: number }, 
                q90: { skus: Set<string>, qty: number, val: number }, 
                qO90: { skus: Set<string>, qty: number, val: number } 
            },
            types: Record<string, { skus: Set<string>, qty: number, val: number }>
        }> = {};
        
        const typeLabels = [
            '1. VOR (Xe nằm đường)',
            '2. Bảo Hành',
            '3. Khẩn (EO/Emergency)',
            '4. Chiến dịch',
            '5. Dự trữ (Stock)',
            '6. Khác'
        ];

        enrichedData?.forEach(item => {
            const source = resolveMotherGroup(item);
            if (!sourceMap[source]) {
                const init = () => ({ skus: new Set<string>(), qty: 0, val: 0 });
                sourceMap[source] = { 
                    aging: { q30: init(), q60: init(), q90: init(), qO90: init() },
                    types: {}
                };
                typeLabels.forEach(t => { sourceMap[source].types[t] = init(); });
            }
            
            const b = item.computed?.boAging;
            const cost = item.computed?.unitCost || 0;
            const sid = item.ItemCode;

            // 1. Aging data
            if (b) {
                if (b.qty30 > 0) { 
                    sourceMap[source].aging.q30.skus.add(sid);
                    sourceMap[source].aging.q30.qty += b.qty30;
                    sourceMap[source].aging.q30.val += b.qty30 * cost;
                }
                if (b.qty60 > 0) {
                    sourceMap[source].aging.q60.skus.add(sid);
                    sourceMap[source].aging.q60.qty += b.qty60;
                    sourceMap[source].aging.q60.val += b.qty60 * cost;
                }
                if (b.qty90 > 0) {
                    sourceMap[source].aging.q90.skus.add(sid);
                    sourceMap[source].aging.q90.qty += b.qty90;
                    sourceMap[source].aging.q90.val += b.qty90 * cost;
                }
                if (b.qtyOver90 > 0) {
                    sourceMap[source].aging.qO90.skus.add(sid);
                    sourceMap[source].aging.qO90.qty += b.qtyOver90;
                    sourceMap[source].aging.qO90.val += b.qtyOver90 * cost;
                }
            }

            // 2. Type data
            item.BackorderBreakdown?.forEach(bo => {
                const typeName = getOrderTypeName(bo);
                if (sourceMap[source].types[typeName]) {
                    sourceMap[source].types[typeName].skus.add(sid);
                    sourceMap[source].types[typeName].qty += bo.Qty;
                    sourceMap[source].types[typeName].val += bo.Qty * cost;
                }
            });
        });

        const getVal = (bucket: any) => {
            if (!bucket) return 0;
            if (matrixMetric === 'sku') return bucket.skus.size;
            if (matrixMetric === 'qty') return bucket.qty;
            return bucket.val;
        };

        return Object.entries(sourceMap).map(([source, data]) => {
            const row: any = { source };
            row.q30 = getVal(data.aging.q30);
            row.q60 = getVal(data.aging.q60);
            row.q90 = getVal(data.aging.q90);
            row.qO90 = getVal(data.aging.qO90);
            
            typeLabels.forEach(t => {
                row[`type_${t}`] = getVal(data.types[t]);
            });

            const allSkus = new Set([
                ...data.aging.q30.skus, ...data.aging.q60.skus, ...data.aging.q90.skus, ...data.aging.qO90.skus
            ]);
            
            row.total = matrixMetric === 'sku' 
                ? allSkus.size
                : (data.aging.q30[matrixMetric] + data.aging.q60[matrixMetric] + data.aging.q90[matrixMetric] + data.aging.qO90[matrixMetric]);
            
            return row;
        }).sort((a, b) => b.total - a.total);
    }, [enrichedData, matrixMetric]);

    const branchData = useMemo(() => {
        const branchMap: Record<string, number> = {};
        enrichedData?.forEach(item => {
            item.BackorderBreakdown?.forEach(bo => {
                const bName = bo.Showroom || bo.BranchName || 'Khác';
                branchMap[bName] = (branchMap[bName] || 0) + bo.Qty;
            });
        });
        
        return Object.entries(branchMap)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [enrichedData]);


    const orderTypeData = useMemo(() => {
        const typeMap: Record<string, number> = {};
        enrichedData?.forEach(item => {
            item.BackorderBreakdown?.forEach(bo => {
                const type = getOrderTypeName(bo);
                typeMap[type] = (typeMap[type] || 0) + bo.Qty;
            });
        });
        return Object.entries(typeMap)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);
    }, [enrichedData]);

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


    const filteredData = useMemo(() => {
        if (!cachedData) return [];
        let list = cachedData.filter(item => {
            const matchesSearch = matchSearch(item, searchResult);
            const matchesSource = sourceFilters.length === 0 || sourceFilters.includes(item.SourceId);
            const matchesMother = motherGroupFilters.length === 0 || motherGroupFilters.includes(resolveMotherGroup(item));
            
            const b = item.computed?.boAging;
            let matchesAging = true;
            if (agingFilter === '30') matchesAging = (b?.qty30 || 0) > 0;
            else if (agingFilter === '60') matchesAging = (b?.qty60 || 0) > 0;
            else if (agingFilter === '90') matchesAging = (b?.qty90 || 0) > 0;
            else if (agingFilter === 'over90') matchesAging = (b?.qtyOver90 || 0) > 0;

            const matchesType = orderTypeFilters.length === 0 || item.BackorderBreakdown?.some(bo => orderTypeFilters.includes(getOrderTypeName(bo)));
            const matchesBranch = branchFilters.length === 0 || item.BackorderBreakdown?.some(bo => branchFilters.includes(bo.Showroom || bo.BranchName || 'Khác'));

            let matchesSpecial = true;
            if (specialFilter === 'critical') matchesSpecial = (b?.qtyOver90 || 0) > 0 || (b?.qty90 || 0) > 0;
            else if (specialFilter === 'transfer') {
                const nbStock = item.QuantityInventory_NB + item.QuantityDC_NB;
                const bbStock = item.QuantityInventory_BB + item.QuantityDC_BB;
                matchesSpecial = (item.Backorder_BB > 0 && nbStock > 0) || (item.Backorder_NB > 0 && bbStock > 0);
            }
            else if (specialFilter === 'po') matchesSpecial = item.TotalPO > 0;

            const hasBO = (item.Backorder || 0) > 0;
            return hasBO && matchesSearch && matchesSource && matchesMother && matchesAging && matchesType && matchesBranch && matchesSpecial;
        });

        if (sortConfig) {
            list.sort((a, b) => {
                let aVal: any = 0;
                let bVal: any = 0;
                
                switch (sortConfig.key) {
                    case 'ItemCode': 
                        aVal = a.ItemCode; bVal = b.ItemCode; break;
                    case 'Backorder':
                        aVal = a.Backorder; bVal = b.Backorder; break;
                    case 'totalValue':
                        aVal = a.computed?.boAging?.totalValue || 0;
                        bVal = b.computed?.boAging?.totalValue || 0;
                        break;
                    case 'TotalPO':
                        aVal = a.TotalPO; bVal = b.TotalPO; break;
                    case 'Stock':
                        aVal = (a.QuantityInventory_NB + a.QuantityDC_NB) + (a.QuantityInventory_BB + a.QuantityDC_BB);
                        bVal = (b.QuantityInventory_NB + b.QuantityDC_NB) + (b.QuantityInventory_BB + b.QuantityDC_BB);
                        break;
                    case 'Aging':
                        aVal = Math.max(a.computed?.boAging?.qtyOver90 || 0, a.computed?.boAging?.qty90 || 0);
                        bVal = Math.max(b.computed?.boAging?.qtyOver90 || 0, b.computed?.boAging?.qty90 || 0);
                        break;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return list;
    }, [cachedData, searchResult, sourceFilters, motherGroupFilters, agingFilter, orderTypeFilters, branchFilters, sortConfig]);

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
                            <div className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-200">BETA v2.1</div>
                            <Typography variant="label" className="text-slate-400 font-black uppercase tracking-[0.3em] !text-[9px]">Supply Chain Intelligence</Typography>
                        </div>
                        <Typography variant="h1" className="text-slate-900 !text-4xl !font-black tracking-tighter">Phân tích Nợ hàng <span className="text-blue-600">Backorder</span></Typography>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleExport}
                            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-200 transition-all duration-300 shadow-sm group"
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
                        label="TỔNG NỢ (SL)" 
                        value={stats.totalQty.toLocaleString()} 
                        sub={`${stats.criticalCount} SKU khẩn cấp`} 
                        icon="fa-clock-rotate-left" 
                        color="bg-rose-600 shadow-rose-200"
                        onClick={() => setSpecialFilter(p => p === 'critical' ? 'all' : 'critical')}
                        isActive={specialFilter === 'critical'}
                    />
                    <MetricCard 
                        label="GIÁ TRỊ NỢ" 
                        value={formatCurrency(stats.totalValue)} 
                        sub="Tổng vốn tồn đọng" 
                        icon="fa-money-bill-trend-up" 
                        color="bg-slate-900 shadow-slate-300" 
                    />
                    <MetricCard 
                        label="CUNG ỨNG PO" 
                        value={`${stats.poCoverage.toFixed(1)}%`} 
                        sub={`${formatCurrency(stats.totalPOVal)} đang về`} 
                        icon="fa-truck-fast" 
                        color="bg-blue-600 shadow-blue-200"
                        onClick={() => setSpecialFilter(p => p === 'po' ? 'all' : 'po')}
                        isActive={specialFilter === 'po'}
                    />
                    <MetricCard 
                        label="ĐIỀU CHUYỂN" 
                        value={enrichedData?.filter(i => {
                            const nb = i.QuantityInventory_NB + i.QuantityDC_NB;
                            const bb = i.QuantityInventory_BB + i.QuantityDC_BB;
                            return (i.Backorder_NB > 0 && bb > 0) || (i.Backorder_BB > 0 && nb > 0);
                        }).length.toString() || '0'} 
                        sub="Cơ hội xử lý nội bộ" 
                        icon="fa-right-left" 
                        color="bg-emerald-500 shadow-emerald-200"
                        onClick={() => setSpecialFilter(p => p === 'transfer' ? 'all' : 'transfer')}
                        isActive={specialFilter === 'transfer'}
                    />
                </div>
                <div className="flex flex-col gap-6 mb-8">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="label" className="text-slate-400 font-black uppercase tracking-widest !text-[10px]">Phân bổ tuổi nợ (Aging)</Typography>
                            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                                {[
                                    { id: 'sku', label: 'SKU' },
                                    { id: 'qty', label: 'SL' },
                                    { id: 'val', label: 'Giá trị' }
                                ].map(m => (
                                    <button 
                                        key={m.id}
                                        onClick={() => setMatrixMetric(m.id as any)}
                                        className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${matrixMetric === m.id ? 'bg-white text-blue-700 shadow-md ring-1 ring-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th rowSpan={2} className="py-6 px-5 text-left border-b border-slate-200 min-w-[200px]"><Typography variant="label" className="text-slate-400 !text-[12px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography></th>
                                        <th rowSpan={2} className="py-6 px-4 text-right border-b border-r border-slate-200 bg-slate-100/30"><Typography variant="label" className="text-slate-900 !text-[12px] font-black uppercase tracking-wider">1. TỔNG NỢ</Typography></th>
                                        <th colSpan={6} className="py-3 text-center border-b border-r border-slate-200 bg-blue-50/30"><Typography variant="label" className="text-blue-700 !text-[11px] font-black uppercase tracking-widest">2. PHÂN RÃ THEO LOẠI ĐƠN</Typography></th>
                                        <th colSpan={4} className="py-3 text-center border-b border-slate-200 bg-amber-50/30"><Typography variant="label" className="text-amber-700 !text-[11px] font-black uppercase tracking-widest">3. PHÂN RÃ THEO TUỔI NỢ (AGING)</Typography></th>
                                    </tr>
                                    <tr>
                                        {/* Group 2: Types */}
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">VOR {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">BH {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">KHẨN {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">C/DỊCH {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">STOCK {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-r border-slate-100 px-2 min-w-[80px] bg-blue-50/10"><Typography variant="label" className="text-blue-600 !text-[10px] font-bold">KHÁC {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        
                                        {/* Group 3: Aging */}
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[90px] bg-amber-50/10"><Typography variant="label" className="text-amber-600 !text-[10px] font-bold">&lt; 30D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[90px] bg-amber-50/10"><Typography variant="label" className="text-amber-600 !text-[10px] font-bold">30-60D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[90px] bg-rose-50/10"><Typography variant="label" className="text-rose-600 !text-[10px] font-bold">60-90D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                        <th className="py-3 text-center border-b border-slate-100 px-2 min-w-[90px] bg-rose-100/10"><Typography variant="label" className="text-rose-900 !text-[10px] font-bold">&gt; 90D {matrixMetric === 'val' ? '(Tr)' : ''}</Typography></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {matrixData.map(row => (
                                        <tr key={row.source} className="hover:bg-blue-50/40 transition-all group/row border-b border-slate-50 last:border-0">
                                            <td className="py-4 px-5">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[13px] group-hover/row:text-blue-700 transition-colors tracking-tight">{row.source}</Typography>
                                            </td>
                                            <td className="py-4 text-right px-4 bg-slate-50/30 border-r border-slate-100">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900">
                                                    {matrixMetric === 'val' ? formatCurrency(row.total) : row.total.toLocaleString()}
                                                </Typography>
                                            </td>
                                            
                                            {/* Types breakdown */}
                                            <td className="py-4 text-center px-2 bg-blue-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_1. VOR (Xe nằm đường)'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_1. VOR (Xe nằm đường)'] > 0 ? formatMatrixVal(row['type_1. VOR (Xe nằm đường)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-blue-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_2. Bảo Hành'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_2. Bảo Hành'] > 0 ? formatMatrixVal(row['type_2. Bảo Hành']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-blue-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_3. Khẩn (EO/Emergency)'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_3. Khẩn (EO/Emergency)'] > 0 ? formatMatrixVal(row['type_3. Khẩn (EO/Emergency)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-blue-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_4. Chiến dịch'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_4. Chiến dịch'] > 0 ? formatMatrixVal(row['type_4. Chiến dịch']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-blue-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_5. Dự trữ (Stock)'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_5. Dự trữ (Stock)'] > 0 ? formatMatrixVal(row['type_5. Dự trữ (Stock)']) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-blue-50/5 border-r border-slate-100"><Typography variant="mono" className={`!text-[12px] font-bold ${row['type_6. Khác'] > 0 ? 'text-blue-700' : 'text-slate-300'}`}>{row['type_6. Khác'] > 0 ? formatMatrixVal(row['type_6. Khác']) : '-'}</Typography></td>

                                            {/* Aging breakdown */}
                                            <td className="py-4 text-center px-2 bg-amber-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q30 > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{row.q30 > 0 ? formatMatrixVal(row.q30) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-amber-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q60 > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{row.q60 > 0 ? formatMatrixVal(row.q60) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-rose-50/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.q90 > 0 ? 'text-rose-700' : 'text-slate-300'}`}>{row.q90 > 0 ? formatMatrixVal(row.q90) : '-'}</Typography></td>
                                            <td className="py-4 text-center px-2 bg-rose-100/5"><Typography variant="mono" className={`!text-[12px] font-bold ${row.qO90 > 0 ? 'text-rose-900' : 'text-slate-300'}`}>{row.qO90 > 0 ? formatMatrixVal(row.qO90) : '-'}</Typography></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-900/5 backdrop-blur-sm border-t-2 border-slate-200 font-black">
                                    <tr>
                                        <td className="py-6 px-5 text-slate-500 !text-[12px] uppercase font-black tracking-[0.2em]">Tổng cộng</td>
                                        <td className="py-5 text-right px-4 bg-slate-900/10 border-r border-slate-200">
                                            <Typography variant="mono" className="!text-[15px] font-black text-slate-900">
                                                {formatMatrixVal(matrixData.reduce((a, b) => a + (b.total || 0), 0))}
                                            </Typography>
                                        </td>
                                        <td colSpan={6} className="py-5 text-center bg-blue-50/10 border-r border-slate-200">
                                            <Typography variant="label" className="text-blue-700 !text-[11px] font-black">CHI TIẾT THEO LOẠI ĐƠN</Typography>
                                        </td>
                                        <td colSpan={4} className="py-5 text-center bg-amber-50/10">
                                            <Typography variant="label" className="text-amber-700 !text-[11px] font-black">CHI TIẾT THEO TUỔI NỢ</Typography>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white/70 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/50 shadow-2xl shadow-slate-200/40 flex flex-col group hover:border-blue-200 transition-all duration-500">
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

                        <div className="bg-white/70 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/50 shadow-2xl shadow-slate-200/40 flex flex-col group hover:border-blue-200 transition-all duration-500">
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
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col flex-1 overflow-hidden">
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
                                                    <Typography variant="label" className={`${isActive ? 'text-blue-600' : 'text-slate-400'} group-hover/th:text-blue-500 transition-colors font-black uppercase tracking-widest`}>{label}</Typography>
                                                    <div className={`flex flex-col text-[8px] ${isActive ? 'text-blue-600' : 'text-slate-300 opacity-0 group-hover/th:opacity-100'}`}>
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
                                            <th className="px-4 py-4 text-center"><Typography variant="label" className="text-slate-400 font-black uppercase tracking-widest">LOẠI ĐƠN</Typography></th>
                                            <SortableHeader label="TUỔI NỢ (AGING)" sortKey="Aging" />
                                            <SortableHeader label="TỒN KHO" sortKey="Stock" />
                                            <SortableHeader label="HÀNG ĐANG VỀ" sortKey="TotalPO" />
                                            <SortableHeader label="GIÁ TRỊ NỢ" sortKey="totalValue" align="right" />
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
                                                            <Typography variant="mono" className="font-black text-slate-900 group-hover:text-blue-800 transition-colors text-[17px] tracking-tight">{item.ItemCode}</Typography>
                                                            {priority !== 'NORMAL' && (
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${priority === 'CRITICAL' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>
                                                                    {priority}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Typography variant="label" className="text-slate-400 block mt-1 truncate max-w-[240px] normal-case font-bold !text-[11px] group-hover:text-slate-600 transition-colors">{item.ItemName}</Typography>
                                                        <div className="flex gap-2 mt-2">
                                                            <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded-lg font-black tracking-widest shadow-sm">{item.BrandName}</span>
                                                            {item.TypeCar && <span className="text-[9px] bg-white text-slate-500 px-2 py-0.5 rounded-lg font-black border border-slate-200 shadow-sm">{item.TypeCar}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <BackorderPopup items={item.BackorderBreakdown || []}>
                                                    <div className="px-4 py-2 bg-slate-900 text-white rounded-xl font-mono font-black text-base shadow-lg hover:scale-110 transition-transform inline-block ring-2 ring-slate-900 ring-offset-2 ring-offset-white">
                                                        {item.Backorder.toLocaleString()}
                                                    </div>
                                                </BackorderPopup>
                                            </td>
                                            <td className="px-4 py-5">
                                                <div className="flex flex-wrap justify-center gap-1.5 max-w-[200px] mx-auto">
                                                    {Object.entries(boTypes).map(([type, qty]) => (
                                                        <span key={type} className="text-[9px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 font-black whitespace-nowrap shadow-sm">
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
                                                            <Typography variant="mono-sm" className={`font-black ${item.Backorder_NB > 0 ? 'text-rose-600 underline decoration-rose-200 decoration-2 underline-offset-4' : 'text-slate-700'}`}>{nbStock}</Typography>
                                                            <Typography variant="label" className="text-blue-500 !text-[8px] font-black uppercase">NAM</Typography>
                                                        </div>
                                                        <div className="w-px h-6 bg-slate-100"></div>
                                                        <div className="text-center">
                                                            <Typography variant="mono-sm" className={`font-black ${item.Backorder_BB > 0 ? 'text-rose-600 underline decoration-rose-200 decoration-2 underline-offset-4' : 'text-slate-700'}`}>{bbStock}</Typography>
                                                            <Typography variant="label" className="text-indigo-500 !text-[8px] font-black uppercase">BẮC</Typography>
                                                        </div>
                                                    </div>
                                                    {(canTransferToBB || canTransferToNB) && (
                                                        <div className="px-2 py-0.5 bg-emerald-500 text-white rounded font-black text-[8px] uppercase animate-pulse flex items-center gap-1">
                                                            <i className="fas fa-right-left"></i> Điều chuyển khả thi
                                                        </div>
                                                    )}
                                                </div>
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
                                                <Typography variant="mono" className="font-black text-slate-900 !text-[16px]">{formatCurrency(item.computed?.boAging?.totalValue || 0)}</Typography>
                                                <Typography variant="label" className="text-slate-500 !text-[10px] font-black block mt-1 uppercase tracking-wider">GIÁ TRỊ TỔNG NỢ</Typography>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
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
                                {Array.from({ length: Math.min(5, Math.ceil(filteredData.length / pageSize)) }).map((_, i) => {
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
                                })}
                                {Math.ceil(filteredData.length / pageSize) > 5 && <span className="text-slate-300 px-2">...</span>}
                            </div>
                            <button 
                                disabled={currentPage === Math.ceil(filteredData.length / pageSize)}
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
    );
};
