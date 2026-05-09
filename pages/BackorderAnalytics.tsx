import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { FaIcon } from '../components/Icon';
// exceljs is dynamically imported inside handleExport (user-triggered) to keep
// the vendor chunk out of the initial bundle.
import { exportObjectsToExcel } from '../utils/excelExport';
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
import { classifyItemAnomalies, classifyOrderAnomaly, ANOMALY_META, buildCohortStats, stockoutDaysRemaining, type OrderAnomaly } from '../utils/supplierAnomaly';

const AgingBadge = ({ days, qty }: { days: string, qty: number }) => {
    const getColor = (d: string) => {
        if (d === '>90') return 'bg-rose-50 text-[#df1b41] border-rose-200';
        if (d === '90') return 'bg-rose-50 text-[#df1b41] border-rose-100';
        if (d === '60') return 'bg-amber-50 text-[#ff8c00] border-amber-100';
        return 'bg-slate-50 text-[#635bff] border-slate-100';
    };

    return (
        <div className="flex flex-col items-center gap-0.5 group/aging">
            <span className="text-[11px] font-bold text-slate-600 group-hover/aging:text-slate-900 transition-colors uppercase tracking-wider">{days === '>90' ? '> 90D' : `${days}D`}</span>
            <div className={`px-2 py-1 rounded-md text-[11px] font-bold min-w-[42px] text-center border shadow-sm transition group-hover/aging:scale-110 ${getColor(days)} tabular-nums`}>
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
            className={`p-6 rounded-2xl transition duration-500 cursor-pointer relative overflow-hidden flex items-center gap-5 group shadow-2xl bg-gradient-to-br ${activeTheme} ${isActive ? 'ring-4 ring-white/30 -translate-y-2 scale-[1.02]' : 'hover:-translate-y-3 hover:scale-[1.05]'}`}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 blur-2xl"></div>
            <div className="w-14 h-14 rounded-xl bg-white/10 text-white flex items-center justify-center text-2xl transition group-hover:rotate-12 group-hover:bg-white/20 shadow-inner border border-white/10">
                <FaIcon className={`fas ${icon}`} />
            </div>
            <div className="relative z-10 flex-1">
                <Typography variant="label" className="text-white/85 font-black uppercase tracking-[0.2em] !text-[11px] mb-1 block group-hover:text-white transition-colors">{label}</Typography>
                <div className="flex items-baseline gap-1">
                    <Typography variant="h2" className="text-white !font-black !text-2xl tracking-tight group-hover:scale-110 origin-left transition-transform duration-500">{value}</Typography>
                    <Typography variant="label" className="text-white/80 !text-[10px] font-bold">tr</Typography>
                </div>
                {sub && <Typography variant="label" className="text-white/75 block mt-1 !text-[10px] font-medium normal-case group-hover:text-white transition-colors">{sub}</Typography>}
            </div>
            {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/50 animate-pulse"></div>
            )}
        </div>
    );
};

const FilterDropdown = ({ label, options, selected, onChange, icon }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    // Synced with the segmented controls in the filter panel: h-8, rounded-lg,
    // text-[10px] uppercase font-black tracking-wider. Active state uses
    // blue-600 to mark "this dimension has an applied filter" (distinct from
    // the slate "selected segment" of the segmented controls, since dropdowns
    // are multi-select and need a clearer "I am narrowing the data" signal).
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-400 ${selected.length > 0 ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white'}`}
            >
                <FaIcon className={`fas ${icon} text-[10px]`} aria-hidden="true" />
                <span>{label}</span>
                {selected.length > 0 && (
                    <span className="bg-white/25 px-1.5 rounded text-white tabular-nums text-[9px]" aria-label={`${selected.length} đã chọn`}>{selected.length}</span>
                )}
                <FaIcon className={`fas fa-chevron-down text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true"></div>
                    <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-lg shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 origin-top-left">
                        <div className="p-2 border-b border-slate-100 mb-1">
                            <Typography variant="label" className="text-slate-600 !text-[10px] uppercase font-black tracking-wider">Lọc theo {label}</Typography>
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
                        <div className="p-2 border-t border-slate-100 mt-1 flex justify-between items-center">
                            <button type="button" onClick={() => onChange([])} className="text-[10px] font-black text-rose-500 uppercase tracking-wider hover:underline focus-visible:ring-2 focus-visible:ring-rose-300 rounded px-1">Xóa</button>
                            <button type="button" onClick={() => setIsOpen(false)} className="text-[10px] font-black text-blue-600 uppercase tracking-wider hover:underline focus-visible:ring-2 focus-visible:ring-blue-300 rounded px-1">Hoàn tất</button>
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
    const handleExport = async () => {
        if (!enrichedData) return;
        // Flatten to ONE ROW PER BO ENTRY so the export includes order-level
        // detail (DocNo, DocDate, OrderType, Note, ETA, Region, anomaly tier, ...)
        // plus the SKU-level context an operator needs alongside each entry.
        // SKUs without BackorderBreakdown emit a single context-only row.
        const dayMs = 24 * 60 * 60 * 1000;
        const rows: Record<string, any>[] = [];
        for (const item of filteredData) {
            const breakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
            const lt = item.computed?.effectiveLT;
            const supplierStatus = getSupplierStatus(item);
            const supplierLabel = supplierStatus === 'none' ? '' : SUPPLIER_STATUS_META[supplierStatus].label;
            const agg = getItemAnomaly(item).aggregate;
            const skuCtx = {
                'Mã hàng': item.ItemCode,
                'Tên hàng': item.ItemName,
                'Nguồn': item.SourceId,
                'Thương hiệu': item.BrandName,
                'Nhóm mẹ': resolveMotherGroup(item),
                'Loại xe': item.TypeCar || '',
                'LOIS': item.LOISGroup || '',
                'LT (ngày)': lt || '',
                'Tổng nợ': item.Backorder,
                'Tồn NB': item.QuantityInventory_NB,
                'Tồn BB': item.QuantityInventory_BB,
                'DC NB': item.QuantityDC_NB,
                'DC BB': item.QuantityDC_BB,
                'Tồn đại lý': item.DealerInventory,
                'Hàng về (PO)': item.TotalPO,
                'PO về tháng này': item.computed?.incomingCurrentMonth || 0,
                'PO về tháng sau': item.computed?.incomingNextMonth || 0,
                'Nợ lâu nhất (ngày)': item.computed?.boAging?.oldestDebtDays || 0,
                'Cảnh báo NCC (SKU)': supplierLabel,
                'Bất thường nhất (SKU)': agg.abnormalCount > 0 ? ANOMALY_META[agg.worst].label : '',
                'Score bất thường tối đa': Math.round(agg.maxScore),
                'Số đơn bất thường (SKU)': agg.abnormalCount,
            };

            if (breakdown.length === 0) {
                rows.push({
                    ...skuCtx,
                    'Số đơn (DocNo)': '', 'Ngày đặt': '', 'Loại đơn': '',
                    'SL đơn': item.Backorder || 0, 'Kho': '', 'BranchCode': '',
                    'BranchCodeReceipt': '', 'Khu vực (NB/BB)': '', 'Chi nhánh': '',
                    'Showroom': '', 'KhoNo': '', 'Loại xe đơn': '', 'ETA': '',
                    'Ghi chú': '', 'Tuổi đơn (ngày)': '', 'Trễ so với LT (ngày)': '',
                    'Mức bất thường (đơn)': '', 'Score đơn': '', 'Lý do': '',
                });
                continue;
            }

            for (const bo of breakdown) {
                const cls = lt && lt > 0 ? classifyOrderAnomaly(bo, lt) : null;
                const ts = bo.RawDate || 0;
                const daysOpen = ts > 0 ? Math.max(0, Math.floor((Date.now() - ts) / dayMs)) : '';
                rows.push({
                    ...skuCtx,
                    'Số đơn (DocNo)': bo.DocNo || '',
                    'Ngày đặt': bo.DocDate || '',
                    'Loại đơn': getOrderTypeName(bo).replace(/^\d+\.\s*/, ''),
                    'SL đơn': bo.Qty,
                    'Kho': bo.Warehouse || '',
                    'BranchCode': bo.BranchCode || '',
                    'BranchCodeReceipt': bo.BranchCodeReceipt || '',
                    'Khu vực (NB/BB)': classifyBORegion(bo) === 'unknown' ? '' : classifyBORegion(bo),
                    'Chi nhánh': bo.BranchName || '',
                    'Showroom': bo.Showroom || '',
                    'KhoNo': bo.KhoNo || '',
                    'Loại xe đơn': bo.TypeCar || '',
                    'ETA': bo.ETA || '',
                    'Ghi chú': bo.Note || '',
                    'Tuổi đơn (ngày)': daysOpen,
                    'Trễ so với LT (ngày)': cls ? Math.round(cls.daysOverdue) : '',
                    'Mức bất thường (đơn)': cls ? ANOMALY_META[cls.anomaly].label : '',
                    'Score đơn': cls ? Math.round(cls.score) : '',
                    'Lý do': cls ? cls.reasons.join(' | ') : '',
                });
            }
        }

        await exportObjectsToExcel(
            rows,
            'Backorder_Detail',
            `Backorder_Detail_${new Date().toISOString().slice(0, 10)}.xlsx`,
        );
    };
    const [search, setSearch] = useState('');
    const [agingFilter, setAgingFilter] = useState<'all' | '30' | '60' | '90' | 'over90'>('all');
    const [sourceFilters, setSourceFilters] = useState<string[]>([]);
    const [orderTypeFilters, setOrderTypeFilters] = useState<string[]>([]);
    const [branchFilters, setBranchFilters] = useState<string[]>([]);
    const [supplierStatusFilters, setSupplierStatusFilters] = useState<string[]>([]);
    const [anomalyFilters, setAnomalyFilters] = useState<OrderAnomaly[]>([]);
    // Warehouse scope filter: 'all' shows everything (current behavior).
    // 'NB' / 'BB' filters the SKU list to that warehouse and switches all
    // displayed BO/stock/aging/anomaly aggregates to use only that warehouse's
    // entries. DealerInventory stays as-is — it cannot be split per warehouse.
    const [warehouseScope, setWarehouseScope] = useState<'all' | 'NB' | 'BB'>('all');
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
    const deferredSupplierStatusFilters = useDeferredValue(supplierStatusFilters);
    const deferredAnomalyFilters = useDeferredValue(anomalyFilters);
    const deferredWarehouseScope = useDeferredValue(warehouseScope);
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
                if (Array.isArray(parsed.supplierStatusFilters)) setSupplierStatusFilters(parsed.supplierStatusFilters.filter((f: any) => f && ['overdue','due_this_month','due_next_month'].includes(f)));
                if (Array.isArray(parsed.anomalyFilters)) setAnomalyFilters(parsed.anomalyFilters.filter((f: any) => f && ['CRITICAL','HIGH','WARNING','DUE_SOON'].includes(f)));
                if (parsed.warehouseScope && ['all','NB','BB'].includes(parsed.warehouseScope)) setWarehouseScope(parsed.warehouseScope);
                if (parsed.pageSize) setPageSize(Math.max(1, parsed.pageSize));
                if (parsed.matrixMetric) setMatrixMetric(parsed.matrixMetric);
                if (parsed.masterFilter) setMasterFilter(parsed.masterFilter);
            }
        } catch (e) { console.error('Error loading filters:', e); }
    }, []);

    React.useEffect(() => {
        const state = { search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, supplierStatusFilters, anomalyFilters, warehouseScope, pageSize, matrixMetric, sortConfig, specialFilter, masterFilter };
        localStorage.setItem('backorder_filters', JSON.stringify(state));
    }, [search, agingFilter, sourceFilters, motherGroupFilters, orderTypeFilters, branchFilters, supplierStatusFilters, anomalyFilters, warehouseScope, pageSize, matrixMetric, sortConfig, specialFilter, masterFilter]);

    // ── Auto-Sync Filters when Data Changes ──────────────────────────────────
    // Ensures that when switching snapshots, filters don't "stick" to values that no longer exist
    React.useEffect(() => {
        if (!enrichedData || enrichedData.length === 0) return;
        
        const availableSources = new Set(enrichedData.map(i => i.SourceId));
        const availableMothers = new Set(enrichedData.map(i => resolveMotherGroup(i)));

        // If current filters are entirely invalid for the new data, clear them
        setSourceFilters(prev => {
            const valid = prev.filter(f => availableSources.has(f));
            return valid.length === prev.length ? prev : valid;
        });
        
        setMotherGroupFilters(prev => {
            const valid = prev.filter(f => availableMothers.has(f));
            return valid.length === prev.length ? prev : valid;
        });
    }, [enrichedData]);

    // ═══ O11/O12 FIX: EnrichedData now comes with _searchCache from Worker ═══
    const cachedData = enrichedData || [];

    const resolveMotherGroup = (item: InventoryItem): string => {
        const sid = (item.SourceId || '').toUpperCase().trim();
        const brand = (item.BrandName || '').toUpperCase().trim();
        const code = (item.ItemCode || '').toUpperCase().trim();

        // 1. Precise Match from Source Profiles
        if (sourceProfiles) {
            const profile = sourceProfiles.find(p => p.id === sid && p.brand.toUpperCase() === brand);
            if (profile?.motherGroup) return profile.motherGroup;
        }

        // 2. Brand-First Detection (Prioritize major brands)
        if (brand.includes('KIA')) return 'KIA';
        if (brand.includes('MAZDA') || sid === 'MAS' || sid === 'MAZDA' || code.startsWith('MAZ')) return 'MAZDA';
        if (brand.includes('PEUGEOT') || sid === 'PEU' || sid === 'PEUGEOT' || code.startsWith('PEU')) return 'PEUGEOT';
        if (brand.includes('BMW')) return 'BMW';

        // 3. Source-Based Fallbacks
        if (sid.startsWith('HQ') || sid === 'KOR' || sid === 'MOBIS') return 'HÀN QUỐC';
        if (sid.startsWith('THA') || sid === 'THAI') return 'THÁI LAN';
        if (sid.startsWith('CHI') || sid === 'CN' || sid === 'CHINA') return 'TRUNG QUỐC';
        if (sid === 'GEN' || sid === 'LOC' || sid === 'VN' || sid === 'CKD') return 'TRONG NƯỚC';
        if (sid === 'KIA') return 'KIA';
        
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

    // Compact one-letter symbol for table display (V/F/E/C/S/X). Title attr exposes full name.
    const ORDER_TYPE_SYMBOL: Record<string, { sym: string; full: string; color: string }> = {
        '1. VOR (Xe nằm đường)':  { sym: 'V', full: 'VOR — Xe nằm đường',  color: 'text-rose-700' },
        '2. Bảo Hành':            { sym: 'F', full: 'Bảo Hành',            color: 'text-blue-700' },
        '3. Khẩn (EO/Emergency)': { sym: 'E', full: 'Khẩn (EO/Emergency)', color: 'text-amber-700' },
        '4. Chiến dịch':          { sym: 'C', full: 'Chiến dịch',          color: 'text-indigo-700' },
        '5. Dự trữ (Stock)':      { sym: 'S', full: 'Dự trữ (Stock)',      color: 'text-emerald-700' },
        '6. Khác':                { sym: 'X', full: 'Khác',                color: 'text-slate-600' },
    };

    // Coverage status — same logic as the master filter cards above the table.
    // STOCK: backorder ≤ on-hand. PO: incoming-this-month closes the gap. GAP: still short.
    type CoverageStatus = 'STOCK' | 'PO' | 'GAP';
    const COVERAGE_META: Record<CoverageStatus, { label: string; full: string; cls: string }> = {
        STOCK: { label: 'STOCK', full: 'Tồn đủ trả',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
        PO:    { label: 'PO',    full: 'PO đủ trả',      cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
        GAP:   { label: 'GAP',   full: 'Không đủ trả',   cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    };
    // ── Warehouse scope helpers ───────────────────────────────────────────────
    // Region mapping rule (per user): the BO file's BranchCodeReceipt column
    // carries the receiving-branch code, and its prefix encodes the region:
    //   A6A  → NB (Nam Bộ — Southern region)
    //   A6C  → BB (Bắc Bộ — Northern region)
    // Fall back to KhoNo / Warehouse string matching for older uploads or
    // entries where BranchCodeReceipt is missing.
    type BORegion = 'NB' | 'BB' | 'unknown';
    const classifyBORegion = (bo: BackorderDetail): BORegion => {
        const bcr = (bo.BranchCodeReceipt || '').toUpperCase().trim();
        if (bcr.startsWith('A6A')) return 'NB';
        if (bcr.startsWith('A6C')) return 'BB';
        // Fallback for entries without BranchCodeReceipt: scan KhoNo + Warehouse
        // for the region keywords we used before introducing the explicit prefix.
        const signal = `${bo.KhoNo || ''} ${bo.Warehouse || ''}`.toUpperCase();
        if (/MB|BB|BAC|BẮC/.test(signal)) return 'BB';
        if (/NB|NAM/.test(signal)) return 'NB';
        return 'unknown';
    };
    const isNBEntry = (bo: BackorderDetail): boolean => classifyBORegion(bo) === 'NB';
    const isBBEntry = (bo: BackorderDetail): boolean => classifyBORegion(bo) === 'BB';
    const filterBreakdownByScope = (
        breakdown: BackorderDetail[] | undefined,
        scope: 'all' | 'NB' | 'BB',
    ): BackorderDetail[] => {
        if (!breakdown || breakdown.length === 0) return [];
        if (scope === 'all') return breakdown;
        if (scope === 'NB') return breakdown.filter(isNBEntry);
        return breakdown.filter(isBBEntry);
    };
    const getScopedBOQty = (item: InventoryItem, scope: 'all' | 'NB' | 'BB'): number => {
        if (scope === 'NB') {
            // Prefer pre-aggregated Backorder_NB. Fall back to summing the scoped
            // breakdown — Backorder_NB only gets populated when the inventory CSV
            // includes a BookTotalNB column; many real uploads only carry the
            // breakdown rows and rely on per-entry Warehouse classification.
            const agg = item.Backorder_NB || 0;
            if (agg > 0) return agg;
            return (item.BackorderBreakdown ?? []).filter(isNBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
        }
        if (scope === 'BB') {
            const agg = item.Backorder_BB || 0;
            if (agg > 0) return agg;
            return (item.BackorderBreakdown ?? []).filter(isBBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
        }
        return Math.max(item.Backorder || 0, item.computed?.boAging?.totalQty || 0);
    };
    const getScopedStock = (item: InventoryItem, scope: 'all' | 'NB' | 'BB'): number => {
        if (scope === 'NB') return (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
        if (scope === 'BB') return (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
        return (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0)
             + (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0);
    };

    const getCoverageStatus = (item: InventoryItem, scope: 'all' | 'NB' | 'BB' = 'all'): CoverageStatus => {
        const totalStock = getScopedStock(item, scope);
        const poThisMonth = item.computed?.incomingCurrentMonth || 0;
        const boQty = getScopedBOQty(item, scope);
        if (boQty <= totalStock) return 'STOCK';
        if (boQty <= totalStock + poThisMonth) return 'PO';
        return 'GAP';
    };

    const formatCurrency = (val: number) => {
        const millions = Math.round(val / 1000000);
        return millions.toLocaleString('vi-VN') + ' Tr';
    };

    // Read from engine-computed aging so display matches bucket assignment.
    // Engine uses snapshotDate as reference; both must agree to avoid the case where
    // a 141d debt shows here but lands in a lower bucket because of date mismatch.
    const getOldestDebtDays = (item: InventoryItem) => item.computed?.boAging?.oldestDebtDays || 0;

    // ── Supplier delivery warning ─────────────────────────────────────────────
    // Pipeline is the source of truth for "TRONG THÁNG" / "THÁNG SAU" labels.
    // RawDate + effectiveLT only used to detect overdue suppliers.
    type SupplierStatus = 'overdue' | 'due_this_month' | 'due_next_month' | 'none';
    const SUPPLIER_STATUS_META: Record<Exclude<SupplierStatus, 'none'>, { label: string; full: string; cls: string }> = {
        overdue:        { label: 'TRỄ HẸN',     full: 'NCC quá hạn — RawDate+LT đã qua, không có PO confirm tháng này',  cls: 'bg-rose-100 text-rose-700 ring-rose-300' },
        due_this_month: { label: 'TRONG THÁNG', full: 'Có PO confirm về tháng này (Pipeline)',                            cls: 'bg-amber-100 text-amber-700 ring-amber-300' },
        due_next_month: { label: 'THÁNG SAU',   full: 'Có PO confirm về tháng sau (Pipeline)',                              cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
    };
    const SUPPLIER_DAY_MS = 24 * 60 * 60 * 1000;
    const startOfThisMonth = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }, []);
    const getSupplierStatus = (item: InventoryItem): SupplierStatus => {
        const totalBO = Math.max(item.Backorder || 0, item.computed?.boAging?.totalQty || 0);
        const incomingM0 = item.computed?.incomingCurrentMonth || 0;
        const incomingM1 = item.computed?.incomingNextMonth || 0;
        // OVERDUE: BO + LT-based estimate has passed + no PO confirm this month
        if (totalBO > 0 && incomingM0 === 0) {
            const breakdown = item.BackorderBreakdown;
            const ltDays = item.computed?.effectiveLT;
            if (breakdown && breakdown.length > 0 && ltDays && ltDays > 0) {
                for (const bo of breakdown) {
                    const ts = bo.RawDate;
                    if (ts && ts + ltDays * SUPPLIER_DAY_MS < startOfThisMonth) return 'overdue';
                }
            }
        }
        if (incomingM0 > 0) return 'due_this_month';
        if (incomingM1 > 0) return 'due_next_month';
        return 'none';
    };
    // Display labels for the filter dropdown — keep keys stable; we map to internal codes on change.
    const SUPPLIER_FILTER_OPTIONS: ReadonlyArray<readonly [string, Exclude<SupplierStatus, 'none'>]> = [
        ['Trễ hẹn — cần đôn đốc', 'overdue'],
        ['Về trong tháng',         'due_this_month'],
        ['Về tháng sau',           'due_next_month'],
    ];

    // ── Per-order anomaly aggregate (memoized per SKU code+breakdown len+LT) ─
    // Stable now reference so all rows are classified against the same instant
    // (prevents drift when many items are processed in sequence).
    const anomalyNow = useMemo(() => Date.now(), []);
    // Build per-source cohort stats once over all enriched items so each SKU
    // classifier can compare its order daysOpen against its supplier baseline.
    const cohortStats = useMemo(
        () => buildCohortStats(enrichedData ?? [], anomalyNow),
        [enrichedData, anomalyNow],
    );
    const anomalyCache = useMemo(() => new Map<string, ReturnType<typeof classifyItemAnomalies>>(), [anomalyNow, cohortStats, deferredWarehouseScope]);
    const getItemAnomaly = (item: InventoryItem) => {
        const lt = item.computed?.effectiveLT;
        // When a warehouse scope is selected, anomaly is computed only over BO
        // entries belonging to that warehouse. Aging totals match the visible row.
        const breakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
        const key = `${item.ItemCode}__${lt ?? 0}__${breakdown.length}__${deferredWarehouseScope}`;
        let cached = anomalyCache.get(key);
        if (!cached) {
            const sourceKey = (item.SourceId || 'KHÁC').toString().trim().toUpperCase() || 'KHÁC';
            const cohort = cohortStats.get(sourceKey);
            cached = classifyItemAnomalies(breakdown, lt, anomalyNow, {
                cohortP50: cohort?.p50,
                cohortP90: cohort?.p90,
                stockoutDaysRemaining: stockoutDaysRemaining(item),
            });
            anomalyCache.set(key, cached);
        }
        return cached;
    };
    // Display labels for the per-order anomaly filter (Vietnamese).
    const ANOMALY_FILTER_OPTIONS: ReadonlyArray<readonly [string, OrderAnomaly]> = [
        ['Trễ nghiêm trọng', 'CRITICAL'],
        ['Trễ nặng',         'HIGH'],
        ['Trễ nhẹ',          'WARNING'],
        ['Sắp đến hạn',      'DUE_SOON'],
    ];

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

            // Aging predicate: with a warehouse scope, recompute buckets from the
            // scoped breakdown so the aging filter matches what's actually shown.
            // Without scope, fall back to the engine's cached boAging (faster).
            const scopedBreakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
            let matchesAging = true;
            if (deferredAgingFilter !== 'all') {
                if (deferredWarehouseScope === 'all') {
                    const b = item.computed?.boAging;
                    if (deferredAgingFilter === '30') matchesAging = (b?.qty30 || 0) > 0;
                    else if (deferredAgingFilter === '60') matchesAging = (b?.qty60 || 0) > 0;
                    else if (deferredAgingFilter === '90') matchesAging = (b?.qty90 || 0) > 0;
                    else if (deferredAgingFilter === 'over90') matchesAging = (b?.qtyOver90 || 0) > 0;
                } else {
                    // Scoped: check filtered breakdown for entries matching the bucket
                    matchesAging = scopedBreakdown.some(bo => {
                        const ts = bo.RawDate || 0;
                        if (ts <= 0) return false;
                        const days = (anomalyNow - ts) / (24 * 60 * 60 * 1000);
                        if (deferredAgingFilter === '30') return days <= 30;
                        if (deferredAgingFilter === '60') return days > 30 && days <= 60;
                        if (deferredAgingFilter === '90') return days > 60 && days <= 90;
                        if (deferredAgingFilter === 'over90') return days > 90;
                        return false;
                    });
                }
            }

            const matchesType = deferredOrderTypeFilters.length === 0 || scopedBreakdown.some(bo => deferredOrderTypeFilters.includes(getOrderTypeName(bo)));
            const matchesBranch = deferredBranchFilters.length === 0 || scopedBreakdown.some(bo => deferredBranchFilters.includes(bo.Showroom || bo.BranchName || 'Khác'));

            let matchesSpecial = true;
            const b = item.computed?.boAging;
            if (deferredSpecialFilter === 'critical') matchesSpecial = (b?.qtyOver90 || 0) > 0 || (b?.qty90 || 0) > 0;
            else if (deferredSpecialFilter === 'transfer') {
                const nbStock = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
                const bbStock = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
                matchesSpecial = ((item.Backorder_BB || 0) > 0 && nbStock > 0) || ((item.Backorder_NB || 0) > 0 && bbStock > 0);
            }
            else if (deferredSpecialFilter === 'po') matchesSpecial = (item.TotalPO || 0) > 0;

            // Master filter (STOCK/PO/GAP) uses the scoped stock + scoped BO too,
            // so the cards above the table line up with the rendered list.
            let matchesMaster = true;
            const scopedStock = getScopedStock(item, deferredWarehouseScope);
            const poThisMonth = item.computed?.incomingCurrentMonth || 0;
            const boQty = getScopedBOQty(item, deferredWarehouseScope);

            if (deferredMasterFilter === 'stock_ok') matchesMaster = boQty <= scopedStock;
            else if (deferredMasterFilter === 'po_ok') matchesMaster = boQty > scopedStock && boQty <= (scopedStock + poThisMonth);
            else if (deferredMasterFilter === 'fail') matchesMaster = boQty > (scopedStock + poThisMonth);

            const matchesSupplier = deferredSupplierStatusFilters.length === 0 || deferredSupplierStatusFilters.includes(getSupplierStatus(item));
            const matchesAnomaly = deferredAnomalyFilters.length === 0 || (() => {
                const agg = getItemAnomaly(item).aggregate;
                return deferredAnomalyFilters.some(t => agg.counts[t] > 0);
            })();

            // Warehouse scope predicate: when scope ≠ 'all', the SKU only counts
            // if it has BO in that warehouse.
            const hasBO = boQty > 0;
            return hasBO && matchesSearch && matchesSource && matchesMother && matchesAging && matchesType && matchesBranch && matchesSpecial && matchesMaster && matchesSupplier && matchesAnomaly;
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
                    case 'AnomalyScore':
                        aVal = getItemAnomaly(a).aggregate.maxScore;
                        bVal = getItemAnomaly(b).aggregate.maxScore;
                        break;
                }
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return list;
    }, [cachedData, searchResult, deferredSourceFilters, deferredMotherGroupFilters, deferredAgingFilter, deferredOrderTypeFilters, deferredBranchFilters, deferredSupplierStatusFilters, deferredAnomalyFilters, deferredWarehouseScope, sortConfig, deferredSpecialFilter, deferredMasterFilter, startOfThisMonth, anomalyNow]);

    const stats = useMemo(() => {
        if (!filteredData) return { totalValue: 0, totalQty: 0, criticalCount: 0, aging: { q30: 0, q60: 0, q90: 0, qO90: 0 }, totalPOVal: 0, poCoverage: 0 };
        let totalValue = 0;
        let totalQty = 0;
        let criticalCount = 0;
        let poCoverageCount = 0;
        let totalPOVal = 0;
        const aging = { q30: 0, q60: 0, q90: 0, qO90: 0 };
        const dayMs = 24 * 60 * 60 * 1000;
        // Scope-aware totals. With 'all' we use the engine's pre-aggregated
        // boAging; with NB/BB we use the warehouse-filtered helpers and
        // re-bucket aging from the scoped breakdown. Without this scoping,
        // NB total + BB total > Cả 2 total because items that have backorder
        // entries in BOTH warehouses get their full Backorder double-counted
        // in the per-warehouse views — that was the reported bug.

        filteredData.forEach(item => {
            const cost = item.computed?.unitCost || 0;
            const boQty = getScopedBOQty(item, deferredWarehouseScope);
            const val = boQty * cost;

            totalQty += boQty;
            totalValue += val;
            if (item.TotalPO > 0) poCoverageCount += boQty;
            totalPOVal += item.TotalPO * cost;

            if (deferredWarehouseScope === 'all') {
                const b = item.computed?.boAging;
                if (b) {
                    aging.q30 += b.qty30;
                    aging.q60 += b.qty60;
                    aging.q90 += b.qty90;
                    aging.qO90 += b.qtyOver90;
                    if (b.qtyOver90 > 0 || b.qty90 > 0) criticalCount++;
                }
            } else {
                let q30 = 0, q60 = 0, q90 = 0, qO90 = 0;
                const scopedBd = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                for (const bo of scopedBd) {
                    const ts = bo.RawDate || 0;
                    if (ts <= 0) { q30 += bo.Qty; continue; }
                    const d = Math.max(0, Math.floor((anomalyNow - ts) / dayMs));
                    if (d <= 30) q30 += bo.Qty;
                    else if (d <= 60) q60 += bo.Qty;
                    else if (d <= 90) q90 += bo.Qty;
                    else qO90 += bo.Qty;
                }
                aging.q30 += q30;
                aging.q60 += q60;
                aging.q90 += q90;
                aging.qO90 += qO90;
                if (qO90 > 0 || q90 > 0) criticalCount++;
            }
        });

        return { totalValue, totalQty, criticalCount, aging, totalPOVal, poCoverage: totalQty > 0 ? (poCoverageCount / totalQty) * 100 : 0 };
    }, [filteredData, deferredWarehouseScope, anomalyNow]);


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
        const rawList = Array.from(new Set(filteredData?.map(i => i.LOISGroup).filter(Boolean))) as string[];
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

    // ── Page-level aggregates (computed once per render) ────────────────────
    // Pulled out of inline IIFEs so the redesigned header can render them
    // declaratively without nested JSX expression blocks.
    const headerStats = useMemo(() => {
        let totalDaysOpen = 0, countOpen = 0, countOverLT = 0;
        let totalScore = 0, countScored = 0, maxDays = 0;
        let nCritical = 0, nHigh = 0, nWarning = 0, nSupplierLate = 0;
        let nTransfer = 0;
        for (const item of enrichedData || []) {
            const lt = item.computed?.effectiveLT;
            const breakdown = item.BackorderBreakdown;
            if (breakdown && breakdown.length > 0) {
                for (const bo of breakdown) {
                    const ts = bo.RawDate || 0;
                    if (ts > 0) {
                        const days = (Date.now() - ts) / 86400000;
                        totalDaysOpen += days; countOpen++;
                        if (days > maxDays) maxDays = days;
                        if (lt && days > lt) countOverLT++;
                    }
                }
                const agg = getItemAnomaly(item).aggregate;
                if (agg.maxScore > 0) { totalScore += agg.maxScore; countScored++; }
                if (agg.counts.CRITICAL > 0) nCritical++;
                else if (agg.counts.HIGH > 0) nHigh++;
                else if (agg.counts.WARNING > 0) nWarning++;
                if (getSupplierStatus(item) === 'overdue') nSupplierLate++;
            }
            const nb = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
            const bb = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
            if (((item.Backorder_NB || 0) > 0 && bb > 0) || ((item.Backorder_BB || 0) > 0 && nb > 0)) nTransfer++;
        }
        return {
            avgDays: countOpen > 0 ? totalDaysOpen / countOpen : 0,
            pctOverLT: countOpen > 0 ? (countOverLT / countOpen) * 100 : 0,
            avgScore: countScored > 0 ? totalScore / countScored : 0,
            maxDays, countOpen, countOverLT,
            nCritical, nHigh, nWarning, nSupplierLate, nTransfer,
        };
    }, [enrichedData, anomalyNow]);

    // Master filter cohort counts (computed against unfiltered enrichedData so
    // the segmented control reflects the underlying volume per bucket).
    const masterCounts = useMemo(() => {
        const counts = { all: 0, stock_ok: 0, po_ok: 0, fail: 0 };
        for (const i of enrichedData || []) {
            const totalStock = (i.QuantityInventory_NB + i.QuantityInventory_BB + i.QuantityDC_NB + i.QuantityDC_BB);
            const po = i.computed?.incomingCurrentMonth || 0;
            counts.all++;
            if (i.Backorder <= totalStock) counts.stock_ok++;
            else if (i.Backorder <= totalStock + po) counts.po_ok++;
            else counts.fail++;
        }
        return counts;
    }, [enrichedData]);

    const sortByScore = () => setSortConfig({ key: 'AnomalyScore', direction: 'desc' });
    const onCriticalChip = () => { setAnomalyFilters(['CRITICAL']); setSupplierStatusFilters([]); sortByScore(); setCurrentPage(1); };
    const onHighChip     = () => { setAnomalyFilters(['HIGH']);     setSupplierStatusFilters([]); sortByScore(); setCurrentPage(1); };
    const onWarningChip  = () => { setAnomalyFilters(['WARNING']);  setSupplierStatusFilters([]); sortByScore(); setCurrentPage(1); };
    const onSupplierChip = () => { setSupplierStatusFilters(['overdue']); setAnomalyFilters([]); sortByScore(); setCurrentPage(1); };
    // Drill-down from hero "SKU NỢ" — clears every dimension filter (search, aging,
    // dropdowns, anomaly) but keeps coverage band + warehouse scope so operators can
    // re-inspect the full population currently in scope. Pattern: glance hero → click → audit.
    const onResetFilters = () => {
        setSearch(''); setAgingFilter('all'); setSourceFilters([]); setOrderTypeFilters([]);
        setBranchFilters([]); setMotherGroupFilters([]); setSupplierStatusFilters([]); setAnomalyFilters([]);
        setSpecialFilter('all'); setCurrentPage(1);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 font-sans selection:bg-blue-100 selection:text-blue-900">
            {/* ════════════════════════════════════════════════════════════════
                HEADER — 3 rows on a unified dark navy surface (~200px total).
                Replaces the previous 5-row stack (~340px).
                  H1 ~48px : Title + global search + Xuất Excel
                  H2 ~56px : Filter row, 3 zones (Coverage tiles · NB-BB +
                             Aging + 4 dropdowns · NCC/Đơn chips + matrix toggle)
                  H3 ~96px : grid-cols-12 with 3 cards
                             (TỔNG NỢ · TRẠNG THÁI 2x2 · PHÂN LOẠI tag pills)
                Responsive: <1024px H2 wraps; H3 grid stacks vertically. */}

            {/* ─── H1 — IDENTITY (title · Xuất Excel). Search moved down to the
                main filter strip above the matrix tables. */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden border-b border-white/5 shrink-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_30%,rgba(99,102,241,0.18),transparent_55%)] pointer-events-none" aria-hidden="true" />
                <div className="relative px-6 lg:px-8 h-12 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                        <h1 className="text-base md:text-lg font-black tracking-tight leading-none">Phân tích Nợ hàng</h1>
                        <span className="text-[9px] uppercase tracking-[0.3em] font-black text-blue-300 leading-none hidden md:inline">Supply Chain ↳ Backorder</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        aria-label="Xuất Excel danh sách nợ chi tiết theo từng đơn"
                        className="inline-flex items-center gap-2 px-3 h-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm focus-visible:ring-4 focus-visible:ring-emerald-400/40 shrink-0"
                    >
                        <FaIcon className="fas fa-file-excel" aria-hidden="true" />
                        <span className="hidden sm:inline">Xuất Excel</span>
                    </button>
                </div>
            </div>

            {/* ─── H2 — TỔNG QUAN + TRẠNG THÁI (combined into one line)
                Strategic scale (filtered SKU/SL/value) on the left, tactical
                health (Tuổi nợ TB · % trễ LT · Đơn lâu nhất · PO Coverage) on
                the right, separated by a thin divider. Click on TỔNG QUAN
                clears all dimension filters (drilldown to full population). */}
            <div className="bg-slate-900 text-white border-b border-white/5 shrink-0 px-6 lg:px-8 py-2.5 flex items-center gap-4 flex-wrap">
                {/* TỔNG QUAN */}
                <div className="flex items-center gap-3">
                    <span className="text-[9px] uppercase tracking-[0.25em] font-black text-slate-300 inline-flex items-center gap-1.5 shrink-0">
                        <FaIcon className="fas fa-chart-pie text-[9px] text-blue-400" aria-hidden="true" /> Tổng quan
                    </span>
                    <button
                        type="button"
                        onClick={onResetFilters}
                        title="Xóa toàn bộ filter và xem toàn bộ SKU đang nợ"
                        aria-label="Xóa filter và xem toàn bộ danh sách nợ"
                        className="flex items-center divide-x divide-white/10 rounded-md hover:bg-white/5 transition-colors px-1 -mx-1 focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                        <div className="pr-3 flex items-baseline gap-1.5">
                            <span className="text-xl font-black tabular-nums leading-none text-white">{filteredData.length.toLocaleString('vi-VN')}</span>
                            <span className="text-[9px] uppercase tracking-wider font-black text-slate-300 inline-flex items-center gap-0.5">SKU <FaIcon className="fas fa-rotate-left text-[8px] text-slate-400" aria-hidden="true" /></span>
                        </div>
                        <div className="px-3 flex items-baseline gap-1.5">
                            <span className={`text-xl font-black tabular-nums leading-none ${stats.totalQty > 50000 ? 'text-rose-300' : stats.totalQty > 10000 ? 'text-amber-300' : 'text-white'}`}>{stats.totalQty.toLocaleString('vi-VN')}</span>
                            <span className="text-[9px] uppercase tracking-wider font-black text-slate-300">SL</span>
                        </div>
                        <div className="pl-3 flex items-baseline gap-1.5">
                            <span className={`text-xl font-black tabular-nums leading-none ${stats.totalValue > 5_000_000_000 ? 'text-rose-300' : stats.totalValue > 1_000_000_000 ? 'text-amber-300' : 'text-emerald-300'}`}>{Math.round(stats.totalValue / 1e6).toLocaleString('vi-VN')}</span>
                            <span className="text-[9px] uppercase tracking-wider font-black text-slate-300">Tr ₫</span>
                        </div>
                    </button>
                </div>

                <div className="h-8 w-px bg-white/10 hidden md:block" aria-hidden="true" />

                {/* TRẠNG THÁI — tactical health, 4 mini KPIs in line */}
                <div className="flex items-center gap-3 flex-wrap ml-auto">
                    <span className="text-[9px] uppercase tracking-[0.25em] font-black text-slate-300 inline-flex items-center gap-1.5 shrink-0">
                        <FaIcon className="fas fa-heart-pulse text-[9px] text-blue-400" aria-hidden="true" /> Trạng thái
                    </span>
                    <div className="flex items-center divide-x divide-white/10">
                        {[
                            { label: 'TUỔI NỢ TB',   value: `${Math.round(headerStats.avgDays)}d`,  sub: `${headerStats.countOpen.toLocaleString('vi-VN')} đơn`,      tone: headerStats.avgDays > 90 ? 'text-rose-300' : headerStats.avgDays > 60 ? 'text-amber-300' : 'text-white' },
                            { label: '% TRỄ LT',     value: `${headerStats.pctOverLT.toFixed(1)}%`, sub: `${headerStats.countOverLT.toLocaleString('vi-VN')} quá LT`, tone: headerStats.pctOverLT > 50 ? 'text-rose-300' : headerStats.pctOverLT > 25 ? 'text-amber-300' : 'text-white' },
                            { label: 'ĐƠN LÂU NHẤT', value: `${Math.round(headerStats.maxDays)}d`,  sub: 'tối đa',                                                    tone: headerStats.maxDays > 365 ? 'text-rose-300' : headerStats.maxDays > 90 ? 'text-amber-300' : 'text-white' },
                            { label: 'PO COVERAGE',  value: `${stats.poCoverage.toFixed(0)}%`,      sub: 'có hàng về',                                                tone: stats.poCoverage >= 80 ? 'text-emerald-300' : stats.poCoverage >= 50 ? 'text-white' : 'text-rose-300' },
                        ].map(k => (
                            <div key={k.label} className="px-3 first:pl-0 last:pr-0 flex flex-col leading-tight">
                                <div className="text-[9px] uppercase tracking-wider font-black text-slate-300">{k.label}</div>
                                <div className="flex items-baseline gap-1.5 mt-0.5">
                                    <span className={`text-base font-black tabular-nums leading-none ${k.tone}`}>{k.value}</span>
                                    <span className="text-[9px] text-slate-400 font-medium tabular-nums">{k.sub}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── H3 — PHÂN LOẠI tag pills (anomaly tiers + supplier + transfer
                + cần xử lý) on the left, KHO warehouse scope on the right.
                Click handlers reuse onCriticalChip/onHighChip/onWarningChip/
                onSupplierChip — preserves the existing click-filter behavior. */}
            <div className="bg-slate-900/90 text-white border-b border-white/5 shrink-0 px-6 lg:px-8 py-2 flex items-center gap-3 flex-wrap">
                <span className="text-[9px] uppercase tracking-[0.25em] font-black text-slate-300 inline-flex items-center gap-1.5 shrink-0">
                    <FaIcon className="fas fa-tag text-[9px] text-blue-400" aria-hidden="true" /> Phân loại
                </span>
                <button type="button" onClick={onCriticalChip} title="Lọc các SKU có đơn ở mức TRỄ NGHIÊM TRỌNG"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/15 ring-1 ring-rose-400/40 text-rose-200 hover:bg-rose-500/25 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                    Trễ N.trọng <span className="tabular-nums">{headerStats.nCritical.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onHighChip} title="Lọc các SKU có đơn ở mức TRỄ NẶNG"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-orange-500/15 ring-1 ring-orange-400/40 text-orange-200 hover:bg-orange-500/25 transition-colors focus-visible:ring-2 focus-visible:ring-orange-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" aria-hidden="true" />
                    Trễ nặng <span className="tabular-nums">{headerStats.nHigh.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onWarningChip} title="Lọc các SKU có đơn ở mức TRỄ NHẸ"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-400/15 ring-1 ring-amber-300/40 text-amber-200 hover:bg-amber-400/25 transition-colors focus-visible:ring-2 focus-visible:ring-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300" aria-hidden="true" />
                    Trễ nhẹ <span className="tabular-nums">{headerStats.nWarning.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onSupplierChip} title="Lọc các SKU có NCC quá hạn giao"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-500/15 ring-1 ring-blue-400/40 text-blue-200 hover:bg-blue-500/25 transition-colors focus-visible:ring-2 focus-visible:ring-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                    NCC trễ <span className="tabular-nums">{headerStats.nSupplierLate.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button"
                    onClick={() => { setAnomalyFilters(['CRITICAL', 'HIGH', 'WARNING']); setSupplierStatusFilters(['overdue']); sortByScore(); setCurrentPage(1); }}
                    title="Lọc tất cả SKU đang cần xử lý (anomaly + NCC trễ)"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/10 ring-1 ring-white/20 text-white hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80" aria-hidden="true" />
                    Cần xử lý <span className="tabular-nums">{(headerStats.nCritical + headerStats.nHigh + headerStats.nWarning + headerStats.nSupplierLate).toLocaleString('vi-VN')}</span>
                </button>
                <span title="Cơ hội điều chuyển nội bộ giữa NB/BB — xem cột Hành động trong bảng"
                    className="inline-flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 ring-1 ring-emerald-400/40 text-emerald-200 cursor-help">
                    <FaIcon className="fas fa-arrow-right-arrow-left text-[9px]" aria-hidden="true" />
                    Điều chuyển <span className="tabular-nums">{headerStats.nTransfer.toLocaleString('vi-VN')}</span>
                </span>

                {/* KHO — warehouse scope NB/BB. Pushed to the right edge. */}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    <span className="text-[9px] uppercase tracking-[0.25em] font-black text-slate-300 inline-flex items-center gap-1.5">
                        <FaIcon className="fas fa-warehouse text-[9px] text-blue-400" aria-hidden="true" /> Kho
                    </span>
                    <div className="inline-flex items-center bg-white/5 ring-1 ring-white/10 rounded-lg p-0.5 h-8" role="group" aria-label="Phạm vi kho NB / BB">
                        {([
                            { id: 'all', label: 'Cả 2' },
                            { id: 'NB',  label: 'NB'   },
                            { id: 'BB',  label: 'BB'   },
                        ] as const).map(s => {
                            const active = warehouseScope === s.id;
                            return (
                                <button key={s.id} type="button" onClick={() => setWarehouseScope(s.id)} aria-pressed={active}
                                    className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}>
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="p-6 pb-4 shrink-0">

                <div className="flex flex-col gap-12 mb-20">
                    {/* ─── FILTER STRIP — sits above the matrix tables.
                        Holds every control that pivots the data so the operator
                        narrows the slice once, in one place, just before reading
                        the matrices and the SKU detail table further down.
                        Light-themed sticky surface; design tokens match the dark
                        chips above (h-8, rounded-lg, text-[10px] uppercase
                        font-black tracking-wider). */}
                    {(() => {
                        const dimensionCount = (search ? 1 : 0)
                            + (agingFilter !== 'all' ? 1 : 0)
                            + sourceFilters.length + orderTypeFilters.length + branchFilters.length
                            + motherGroupFilters.length + supplierStatusFilters.length + anomalyFilters.length;
                        const segShell = "inline-flex items-center bg-slate-100 rounded-lg p-0.5 h-8 shadow-inner";
                        const segBtn = (active: boolean) =>
                            `inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`;
                        const nAnomaly = headerStats.nCritical + headerStats.nHigh + headerStats.nWarning;
                        const supplierActive = supplierStatusFilters.length > 0;
                        const anomalyActive  = anomalyFilters.length > 0;
                        return (
                        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 border border-slate-200 rounded-2xl shadow-sm px-4 py-2.5 flex items-center gap-2.5 flex-wrap">
                            {/* Search */}
                            <div className="relative w-full md:w-60 shrink-0">
                                <FaIcon className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" aria-hidden="true" />
                                <label htmlFor="bo-search" className="sr-only">Tìm SKU theo mã hoặc tên hàng</label>
                                <input
                                    id="bo-search"
                                    type="text"
                                    placeholder="Tìm mã, tên hàng…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                    inputMode="search"
                                    className="w-full pl-7 pr-7 h-8 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 placeholder:text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:border-blue-300 transition-colors tabular-nums"
                                />
                                {search && (
                                    <button type="button" onClick={() => setSearch('')} aria-label="Xoá tìm kiếm"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 focus-visible:ring-2 focus-visible:ring-rose-300 rounded">
                                        <FaIcon className="fas fa-circle-xmark text-[12px]" aria-hidden="true" />
                                    </button>
                                )}
                                {searchResult.type !== 'EMPTY' && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 text-white p-2 rounded-md text-[10px] font-black z-30 shadow-xl border border-slate-700 animate-fadeIn flex items-center gap-1.5" role="status" aria-live="polite">
                                        <FaIcon className="fas fa-microchip text-blue-400" aria-hidden="true" />{searchResult.modeDescription}
                                    </div>
                                )}
                            </div>

                            {/* Coverage segmented (TỔNG / STOCK / PO / GAP) */}
                            <div className={segShell} role="group" aria-label="Bộ lọc phủ tồn / PO / GAP">
                                {([
                                    { id: 'all',      label: 'TỔNG',  dot: 'bg-slate-700',   count: masterCounts.all,      tip: 'Tổng nợ — toàn bộ' },
                                    { id: 'stock_ok', label: 'STOCK', dot: 'bg-emerald-500', count: masterCounts.stock_ok, tip: 'Tồn đủ trả ngay' },
                                    { id: 'po_ok',    label: 'PO',    dot: 'bg-amber-500',   count: masterCounts.po_ok,    tip: 'PO về tháng này đủ trả' },
                                    { id: 'fail',     label: 'GAP',   dot: 'bg-rose-500',    count: masterCounts.fail,     tip: 'Không đủ trả' },
                                ] as const).map(f => {
                                    const isActive = masterFilter === f.id;
                                    return (
                                        <button key={f.id} type="button"
                                            onClick={() => { setMasterFilter(f.id); setCurrentPage(1); }}
                                            aria-pressed={isActive} title={f.tip}
                                            className={segBtn(isActive)}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} aria-hidden="true" />
                                            {f.label}
                                            <span className={`tabular-nums px-1 rounded text-[9px] ${isActive ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>{f.count.toLocaleString('vi-VN')}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Aging buckets */}
                            <div className={segShell} role="group" aria-label="Tuổi nợ">
                                {(['all', '30', '60', '90', 'over90'] as const).map(val => (
                                    <button key={val} type="button" onClick={() => setAgingFilter(val)}
                                        aria-pressed={agingFilter === val} className={segBtn(agingFilter === val)}>
                                        {val === 'all' ? 'Tất cả' : val === 'over90' ? '>90d' : `${val}d`}
                                    </button>
                                ))}
                            </div>

                            {/* 4 multi-select dropdowns */}
                            <FilterDropdown label="Nhóm mẹ"  options={filterOptions.motherGroups} selected={motherGroupFilters} onChange={setMotherGroupFilters} icon="fa-layer-group" />
                            <FilterDropdown label="Nguồn"    options={filterOptions.sources}      selected={sourceFilters}      onChange={setSourceFilters}      icon="fa-boxes-stacked" />
                            <FilterDropdown label="Loại đơn" options={filterOptions.types}        selected={orderTypeFilters}   onChange={setOrderTypeFilters}   icon="fa-file-invoice" />
                            <FilterDropdown label="Đơn vị"   options={filterOptions.branches}     selected={branchFilters}      onChange={setBranchFilters}      icon="fa-building" />

                            {/* ⚠NCC chip — toggle supplier-overdue filter */}
                            <button type="button"
                                onClick={() => supplierActive ? setSupplierStatusFilters([]) : onSupplierChip()}
                                aria-pressed={supplierActive}
                                title="NCC trễ hẹn — bật/tắt lọc đơn có NCC quá hạn"
                                className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400 ${supplierActive ? 'bg-rose-500 text-white border border-rose-400' : 'bg-white border border-slate-200 text-slate-700 hover:border-rose-300 hover:text-rose-600'}`}>
                                <FaIcon className="fas fa-truck-fast text-[10px]" aria-hidden="true" />
                                NCC <span className="tabular-nums">{headerStats.nSupplierLate.toLocaleString('vi-VN')}</span>
                            </button>

                            {/* ⚠Đơn chip — toggle anomaly CRITICAL filter */}
                            <button type="button"
                                onClick={() => anomalyActive ? setAnomalyFilters([]) : onCriticalChip()}
                                aria-pressed={anomalyActive}
                                title="Đơn bất thường (CRITICAL/HIGH/WARNING) — bật/tắt lọc"
                                className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400 ${anomalyActive ? 'bg-rose-500 text-white border border-rose-400' : 'bg-white border border-slate-200 text-slate-700 hover:border-rose-300 hover:text-rose-600'}`}>
                                <FaIcon className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                                Đơn <span className="tabular-nums">{nAnomaly.toLocaleString('vi-VN')}</span>
                            </button>

                            {/* Reset chip — only when ≥1 dimension filter active */}
                            {dimensionCount > 0 && (
                                <button type="button" onClick={onResetFilters} title="Xoá toàn bộ bộ lọc đang áp dụng"
                                    className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-wider hover:bg-rose-100 hover:border-rose-300 transition-colors focus-visible:ring-2 focus-visible:ring-rose-300">
                                    <FaIcon className="fas fa-eraser text-[10px]" aria-hidden="true" />
                                    Xoá lọc <span className="tabular-nums px-1 rounded bg-rose-600 text-white text-[9px]">{dimensionCount}</span>
                                </button>
                            )}

                            {/* Matrix unit toggle — pinned to the right edge.
                                Drives the unit (SKU count / qty / value-in-millions)
                                shown in the Aging + LOIS matrix tables below. */}
                            <div className={`${segShell} ml-auto`} role="group" aria-label="Đơn vị hiển thị trong bảng matrix">
                                {[
                                    { id: 'sku', label: 'SKU',  tip: 'Đếm theo số mã' },
                                    { id: 'qty', label: 'SL',   tip: 'Đếm theo số lượng' },
                                    { id: 'val', label: 'Tr ₫', tip: 'Đếm theo giá trị (Triệu VND)' },
                                ].map(m => (
                                    <button key={m.id} type="button"
                                        onClick={() => setMatrixMetric(m.id as any)}
                                        aria-pressed={matrixMetric === m.id}
                                        title={m.tip}
                                        className={segBtn(matrixMetric === m.id)}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        );
                    })()}

                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition duration-700 flex flex-col relative overflow-hidden group/m1">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-32 -mt-32 blur-3xl group-hover/m1:bg-indigo-100/40 transition-colors duration-1000"></div>
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <Typography variant="label" className="text-[#635bff] font-black uppercase tracking-[0.3em] !text-[11px] mb-1 block">Aging Distribution</Typography>
                                <Typography variant="h2" className="text-[#1a1f36] !font-bold tracking-tight !text-2xl">Phân bổ theo Tuổi nợ (Aging)</Typography>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-600">
                                {matrixMetric === 'sku' ? 'Đếm theo số SKU' : matrixMetric === 'qty' ? 'Đếm theo số lượng' : 'Đếm theo Triệu VND'}
                            </span>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar relative z-10 max-h-[640px]">
                            <table className="w-full border-collapse">
                                {/*
                                  Header design:
                                  - Two sticky rows. Row 1 = column groups (TỔNG / LOẠI ĐƠN / AGING).
                                    Row 2 = leaf labels.
                                  - Row 1 sticks at top:0; row 2 at top:38px (height of row 1).
                                  - Single bg color per group (slate-50 muted) — drops the previous
                                    fractional-opacity stack that rendered as visually-identical noise.
                                */}
                                <thead className="bg-white">
                                    <tr>
                                        <th rowSpan={2} className="sticky top-0 z-20 bg-white py-3 px-5 text-left border-b border-slate-200 min-w-[200px]">
                                            <Typography variant="label" className="text-[#4f566b] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography>
                                        </th>
                                        <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 py-3 px-4 text-right border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[#1a1f36] !text-[11px] font-black uppercase tracking-wider">TỔNG NỢ</Typography>
                                        </th>
                                        <th colSpan={6} className="sticky top-0 z-20 bg-slate-50 py-3 text-center border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[#4f566b] !text-[10px] font-black uppercase tracking-[0.2em]">PHÂN RÃ THEO LOẠI ĐƠN</Typography>
                                        </th>
                                        <th colSpan={4} className="sticky top-0 z-20 bg-slate-50 py-3 text-center border-b border-slate-200">
                                            <Typography variant="label" className="text-[#4f566b] !text-[10px] font-black uppercase tracking-[0.2em]">PHÂN RÃ THEO TUỔI NỢ (AGING)</Typography>
                                        </th>
                                    </tr>
                                    <tr>
                                        {[
                                            { key: 'VOR',     min: '80px' },
                                            { key: 'BH',      min: '80px' },
                                            { key: 'KHẨN',    min: '80px' },
                                            { key: 'C/DỊCH',  min: '80px' },
                                            { key: 'STOCK',   min: '80px' },
                                            { key: 'KHÁC',    min: '80px', last: true },
                                        ].map(c => (
                                            <th key={c.key} style={{ minWidth: c.min, top: 38 }} className={`sticky z-10 bg-white py-2 text-center px-2 border-b border-slate-200 ${c.last ? 'border-r-2 border-slate-300' : ''}`}>
                                                <Typography variant="label" className="text-slate-700 !text-[10px] font-bold tracking-tight">{c.key}</Typography>
                                            </th>
                                        ))}
                                        {[
                                            { key: '< 30D' },
                                            { key: '30-60D' },
                                            { key: '60-90D' },
                                            { key: '> 90D' },
                                        ].map(c => (
                                            <th key={c.key} style={{ minWidth: '90px', top: 38 }} className="sticky z-10 bg-white py-2 text-center px-2 border-b border-slate-200">
                                                <Typography variant="label" className="text-slate-700 !text-[10px] font-bold tracking-tight">{c.key}</Typography>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="py-12 text-center text-slate-600 !text-[12px]">Không có dữ liệu phù hợp với bộ lọc</td>
                                        </tr>
                                    )}
                                    {matrixData.map((row, idx) => (
                                        <tr key={row.source} className={`group/row hover:bg-blue-50/50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                                            <td className="py-3 px-5 border-b border-slate-100">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[14px] group-hover/row:text-blue-700 transition-colors tracking-tight">{row.source}</Typography>
                                            </td>
                                            <td className="py-3 text-right px-4 bg-slate-50/60 border-r-2 border-slate-200 border-b border-slate-100">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900 tabular-nums">
                                                    {formatMatrixVal(row.total)}
                                                </Typography>
                                            </td>

                                            {/* Types breakdown */}
                                            {[
                                                'type_1. VOR (Xe nằm đường)',
                                                'type_2. Bảo Hành',
                                                'type_3. Khẩn (EO/Emergency)',
                                                'type_4. Chiến dịch',
                                                'type_5. Dự trữ (Stock)',
                                                'type_6. Khác',
                                            ].map((k, i, arr) => (
                                                <td key={k} className={`py-3 text-center px-2 border-b border-slate-100 ${i === arr.length - 1 ? 'border-r-2 border-slate-200' : ''}`}>
                                                    <Typography variant="mono" className={`!text-[14px] tabular-nums ${row[k] > 0 ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{row[k] > 0 ? formatMatrixVal(row[k]) : '–'}</Typography>
                                                </td>
                                            ))}

                                            {/* Aging breakdown — distinct color per bucket: amber=60-90D, rose=>90D */}
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.q30 > 0 ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{row.q30 > 0 ? formatMatrixVal(row.q30) : '–'}</Typography></td>
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.q60 > 0 ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{row.q60 > 0 ? formatMatrixVal(row.q60) : '–'}</Typography></td>
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.q90 > 0 ? 'font-bold text-amber-600' : 'text-slate-400'}`}>{row.q90 > 0 ? formatMatrixVal(row.q90) : '–'}</Typography></td>
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.qO90 > 0 ? 'font-black text-rose-700' : 'text-slate-400'}`}>{row.qO90 > 0 ? formatMatrixVal(row.qO90) : '–'}</Typography></td>
                                        </tr>
                                    ))}
                                </tbody>
                                {matrixData.length > 0 && (
                                    <tfoot className="bg-slate-100/70 border-t-2 border-slate-300">
                                        <tr>
                                            <td className="py-4 px-5 text-slate-700 !text-[11px] uppercase font-black tracking-[0.15em]">Tổng cộng</td>
                                            <td className="py-4 text-right px-4 bg-slate-200/60 border-r-2 border-slate-300">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900 tabular-nums">
                                                    {formatMatrixVal(matrixData.reduce((a, b) => a + (b.total || 0), 0))}
                                                </Typography>
                                            </td>
                                            {/* Type Totals */}
                                            {[
                                                'type_1. VOR (Xe nằm đường)',
                                                'type_2. Bảo Hành',
                                                'type_3. Khẩn (EO/Emergency)',
                                                'type_4. Chiến dịch',
                                                'type_5. Dự trữ (Stock)',
                                                'type_6. Khác',
                                            ].map((k, i, arr) => (
                                                <td key={k} className={`py-4 text-center px-2 ${i === arr.length - 1 ? 'border-r-2 border-slate-300' : ''}`}>
                                                    <Typography variant="mono" className="!text-[12px] font-black text-slate-800 tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b[k] || 0), 0))}</Typography>
                                                </td>
                                            ))}
                                            {/* Aging Totals — apply same color semantics as body cells */}
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-slate-800 tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q30 || 0), 0))}</Typography></td>
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-slate-800 tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q60 || 0), 0))}</Typography></td>
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-amber-600 tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q90 || 0), 0))}</Typography></td>
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-rose-700 tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.qO90 || 0), 0))}</Typography></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition duration-700 flex flex-col relative overflow-hidden group/m2">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-32 -mt-32 blur-3xl group-hover/m2:bg-indigo-100/40 transition-colors duration-1000"></div>
                        <div className="mb-6 flex justify-between items-end relative z-10">
                            <div>
                                <Typography variant="label" className="text-[#635bff] font-black uppercase tracking-[0.3em] !text-[11px] mb-1 block">Line of Interest Matrix</Typography>
                                <Typography variant="h2" className="text-[#1a1f36] !font-bold tracking-tight !text-2xl">Phân bổ nợ hàng theo LOIS</Typography>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-600">
                                {matrixMetric === 'sku' ? 'Đếm theo số SKU' : matrixMetric === 'qty' ? 'Đếm theo số lượng' : 'Đếm theo Triệu VND'}
                            </span>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar relative z-10 max-h-[640px]">
                            <table className="w-full border-collapse">
                                <thead className="bg-white">
                                    <tr>
                                        <th className="sticky top-0 z-20 bg-white py-3 px-5 text-left border-b border-slate-200 min-w-[200px]">
                                            <Typography variant="label" className="text-[#4f566b] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography>
                                        </th>
                                        <th className="sticky top-0 z-20 bg-slate-50 py-3 px-4 text-right border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[#1a1f36] !text-[11px] font-black uppercase tracking-wider">TỔNG NỢ</Typography>
                                        </th>
                                        {loisList.map(lois => (
                                            <th key={lois} style={{ minWidth: '80px' }} className="sticky top-0 z-20 bg-white py-3 text-center px-2 border-b border-slate-200">
                                                <Typography variant="label" className="text-slate-700 !text-[11px] font-black tracking-tight">{lois}</Typography>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loisMatrixData.length === 0 && (
                                        <tr>
                                            <td colSpan={2 + loisList.length} className="py-12 text-center text-slate-600 !text-[12px]">Không có dữ liệu phù hợp với bộ lọc</td>
                                        </tr>
                                    )}
                                    {loisMatrixData.map((row, idx) => (
                                        <tr key={row.source} className={`group/row hover:bg-blue-50/50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                                            <td className="py-3 px-5 border-b border-slate-100">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[14px] group-hover/row:text-blue-700 transition-colors tracking-tight">{row.source}</Typography>
                                            </td>
                                            <td className="py-3 text-right px-4 bg-slate-50/60 border-r-2 border-slate-200 border-b border-slate-100">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900 tabular-nums">
                                                    {formatMatrixVal(row.total)}
                                                </Typography>
                                            </td>
                                            {loisList.map(lois => (
                                                <td key={lois} className="py-3 text-center px-2 border-b border-slate-100">
                                                    <Typography variant="mono" className={`!text-[14px] tabular-nums ${row[`lois_${lois}`] > 0 ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                                                        {row[`lois_${lois}`] > 0 ? formatMatrixVal(row[`lois_${lois}`]) : '–'}
                                                    </Typography>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                {loisMatrixData.length > 0 && (
                                    <tfoot className="bg-slate-100/70 border-t-2 border-slate-300">
                                        <tr>
                                            <td className="py-4 px-5 text-slate-700 !text-[11px] uppercase font-black tracking-[0.15em]">Tổng cộng</td>
                                            <td className="py-4 text-right px-4 bg-slate-200/60 border-r-2 border-slate-300">
                                                <Typography variant="mono" className="!text-[14px] font-black text-slate-900 tabular-nums">
                                                    {formatMatrixVal(loisMatrixData.reduce((a, b) => a + (b.total || 0), 0))}
                                                </Typography>
                                            </td>
                                            {loisList.map(lois => (
                                                <td key={lois} className="py-4 text-center px-2">
                                                    <Typography variant="mono" className="!text-[12px] font-black text-slate-800 tabular-nums">
                                                        {formatMatrixVal(loisMatrixData.reduce((a, b) => a + (b[`lois_${lois}`] || 0), 0))}
                                                    </Typography>
                                                </td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition duration-700 flex flex-col group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Cơ cấu nợ theo loại đơn</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Phân tách nợ đại lý</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shadow-inner">
                                    <FaIcon className="fas fa-chart-pie text-sm" />
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
                                                    className={`h-full ${colorClass} rounded-full transition duration-1000 ease-out shadow-sm group-hover/item:brightness-110`}
                                                    style={{ width: `${width}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_40px_80px_-20px_rgba(99,91,255,0.12)] transition duration-700 flex flex-col group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Top 5 đơn vị nợ hàng</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Hiệu suất chi nhánh</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shadow-inner">
                                    <FaIcon className="fas fa-building text-sm" />
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
                                                    className={`h-full ${colorClass} rounded-full transition duration-1000 ease-out shadow-sm group-hover/item:brightness-110`}
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
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] overflow-hidden relative group/table hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] transition duration-700 flex-1 flex flex-col">
                        <div className="p-8 pb-4 shrink-0 flex justify-between items-center bg-slate-50/30">
                            <div className="flex items-center gap-6">
                                <div>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Chi tiết danh sách SKU</Typography>
                                    <Typography variant="label" className="text-slate-600 !text-[10px] uppercase font-bold tracking-widest">Hiển thị {filteredData.length} kết quả phù hợp</Typography>
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
                                                    <div className={`flex flex-col text-[8px] ${isActive ? 'text-[#635bff]' : 'text-slate-600 opacity-0 group-hover/th:opacity-100'}`}>
                                                        <FaIcon className={`fas fa-caret-up ${isActive && sortConfig.direction === 'asc' ? 'opacity-100' : 'opacity-30'}`} />
                                                        <FaIcon className={`fas fa-caret-down ${isActive && sortConfig.direction === 'desc' ? 'opacity-100' : 'opacity-30'}`} />
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    };

                                    return (
                                        <tr>
                                            <SortableHeader label="SKU" sortKey="ItemCode" align="left" />
                                            <th className="px-3 py-3 text-left"><Typography variant="label" className="text-slate-600 font-black uppercase tracking-widest">TÌNH TRẠNG</Typography></th>
                                            <SortableHeader label="TỔNG NỢ" sortKey="Backorder" align="right" />
                                            <SortableHeader label="NỢ LÂU" sortKey="OldestDebt" align="right" />
                                            <th className="px-3 py-3 text-left"><Typography variant="label" className="text-slate-600 font-black uppercase tracking-widest">LOẠI ĐƠN</Typography></th>
                                            <SortableHeader label="AGING" sortKey="Aging" />
                                            <SortableHeader label="TỒN KHO" sortKey="Stock" />
                                            <SortableHeader label="ĐẠI LÝ" sortKey="DealerInventory" align="right" />
                                            <SortableHeader label="HÀNG ĐANG VỀ" sortKey="TotalPO" align="right" />
                                            <SortableHeader label="GIÁ TRỊ NỢ (TR)" sortKey="totalValue" align="right" />
                                        </tr>
                                    );
                                })()}
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {pagedData.map(item => {
                                    const nbStock = item.QuantityInventory_NB + item.QuantityDC_NB;
                                    const bbStock = item.QuantityInventory_BB + item.QuantityDC_BB;

                                    // When a warehouse scope is selected, aging buckets and order-type
                                    // breakdown for the row are recomputed from the scoped subset of
                                    // BackorderBreakdown so what the operator sees lines up with what
                                    // the filter and totals say. With scope='all' we use the engine's
                                    // pre-computed aging (faster, identical result).
                                    const rowBreakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                                    let aging = item.computed?.boAging;
                                    if (deferredWarehouseScope !== 'all') {
                                        const a = { qty30: 0, qty60: 0, qty90: 0, qtyOver90: 0, totalQty: 0, totalValue: 0, oldestDebtDays: 0 };
                                        const dayMs = 24 * 60 * 60 * 1000;
                                        let maxDays = 0;
                                        for (const bo of rowBreakdown) {
                                            const ts = bo.RawDate || 0;
                                            a.totalQty += bo.Qty;
                                            if (ts <= 0) { a.qty30 += bo.Qty; continue; }
                                            const d = Math.max(0, Math.floor((anomalyNow - ts) / dayMs));
                                            if (d <= 30) a.qty30 += bo.Qty;
                                            else if (d <= 60) a.qty60 += bo.Qty;
                                            else if (d <= 90) a.qty90 += bo.Qty;
                                            else a.qtyOver90 += bo.Qty;
                                            if (d > maxDays) maxDays = d;
                                        }
                                        a.oldestDebtDays = maxDays;
                                        aging = a;
                                    }

                                    const boTypes: Record<string, number> = {};
                                    rowBreakdown.forEach(b => {
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

                                    // Rewritten for data density: single semantic color (rose) for critical state,
                                    // mono numbers throughout, no decorative pills/badges. Padding tightened.
                                    const isCritical = priority === 'CRITICAL';
                                    const isHigh = priority === 'HIGH';
                                    // Total BO and breakdown shown in popup respect the active warehouse scope.
                                    const scopedBreakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                                    const totalBO = deferredWarehouseScope === 'all'
                                        ? Math.max(item.Backorder || 0, item.computed?.boAging?.totalQty || 0)
                                        : getScopedBOQty(item, deferredWarehouseScope);
                                    // Unified sizing: data = 13px mono, labels = 9px slate-400, single semantic color.
                                    return (
                                        <tr key={item.ItemCode} tabIndex={0} role="button" aria-label={`Xem chi tiết ${item.ItemCode}`} className={`hover:bg-blue-50/40 transition-colors group cursor-pointer border-b border-slate-100 last:border-0 focus-visible:bg-blue-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${isCritical ? 'bg-rose-50/30' : ''}`} onClick={() => onSkuSelect(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkuSelect(item); } }}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-slate-200'}`} aria-hidden />
                                                    <div className="min-w-0">
                                                        <div className="font-mono font-bold text-slate-900 group-hover:text-[#635bff] transition-colors text-[14px] tabular-nums tracking-tight">
                                                            {item.ItemCode}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 truncate max-w-[260px] mt-0.5 font-bold">{item.ItemName}</div>
                                                        <div className="text-[10px] text-slate-600 font-medium mt-0.5 flex flex-wrap items-baseline gap-x-1">
                                                            {item.SourceId && (
                                                                <span className="font-mono font-black text-[10px] text-[#635bff] uppercase tracking-wider">{item.SourceId}</span>
                                                            )}
                                                            <span className="text-slate-600 font-bold">· {item.BrandName}</span>
                                                            {item.TypeCar && <span>· {item.TypeCar}</span>}
                                                        </div>
                                                        {(() => {
                                                            const ss = getSupplierStatus(item);
                                                            const agg = getItemAnomaly(item).aggregate;
                                                            const showSupplier = ss !== 'none';
                                                            const showAnomaly = agg.abnormalCount > 0;
                                                            if (!showSupplier && !showAnomaly) return null;
                                                            return (
                                                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                                                    {showSupplier && (() => {
                                                                        const meta = SUPPLIER_STATUS_META[ss];
                                                                        return (
                                                                            <span title={meta.full} className={`inline-flex items-center gap-1 font-mono font-black text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}>
                                                                                <FaIcon className="fas fa-truck-fast text-[8px]" />
                                                                                {meta.label}
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                    {showAnomaly && (() => {
                                                                        const meta = ANOMALY_META[agg.worst];
                                                                        const detail = (['CRITICAL','HIGH','WARNING'] as const)
                                                                            .filter(t => agg.counts[t] > 0)
                                                                            .map(t => `${agg.counts[t]} ${ANOMALY_META[t].label}`).join(' • ');
                                                                        const maxDays = Math.round(agg.maxDaysOpen);
                                                                        const score = Math.round(agg.maxScore);
                                                                        const tooltip = `${meta.label} (score ${score}/100) • ${detail} • Đơn lâu nhất ${maxDays}d (trễ ${Math.round(agg.maxDaysOverdue)}d so với LT)`;
                                                                        return (
                                                                            <span title={tooltip} className={`inline-flex items-center gap-1 font-mono font-black text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}>
                                                                                <FaIcon className="fas fa-triangle-exclamation text-[8px]" />
                                                                                {meta.label} · {score}đ · {maxDays}D · {agg.abnormalCount} ĐƠN
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                {(() => {
                                                    const cs = getCoverageStatus(item, deferredWarehouseScope);
                                                    const meta = COVERAGE_META[cs];
                                                    return (
                                                        <span title={meta.full} className={`inline-flex font-mono font-black text-[10px] uppercase tracking-wider px-2 py-1 rounded-md ring-1 ${meta.cls}`}>
                                                            {meta.label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <BackorderPopup items={scopedBreakdown} effectiveLTDays={item.computed?.effectiveLT}>
                                                    <span className={`font-mono font-bold text-[14px] tabular-nums ${isCritical ? 'text-rose-600' : 'text-slate-900'} hover:text-[#635bff] transition-colors`}>
                                                        {totalBO.toLocaleString('vi-VN')}
                                                    </span>
                                                </BackorderPopup>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className={`font-mono font-bold text-[14px] tabular-nums ${isCritical ? 'text-rose-600' : isHigh ? 'text-amber-600' : 'text-slate-700'}`}>
                                                    {aging?.oldestDebtDays ?? 0}<span className="text-[11px] text-slate-600 font-medium ml-0.5">d</span>
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="text-[14px] tabular-nums font-bold text-slate-800 max-w-[180px] leading-snug">
                                                    {Object.entries(boTypes).map(([type, qty], idx) => {
                                                        const meta = ORDER_TYPE_SYMBOL[type] ?? { sym: '?', full: type, color: 'text-slate-600' };
                                                        return (
                                                            <span key={type} title={meta.full}>
                                                                {idx > 0 && <span className="text-slate-400 mx-1.5">|</span>}
                                                                <span>{qty}</span>
                                                                <span className={`font-mono font-black text-[11px] ml-0.5 ${meta.color}`}>({meta.sym})</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex justify-center gap-3 text-[14px] tabular-nums font-bold">
                                                    {[
                                                        { label: '30d', val: aging?.qty30 || 0, color: 'text-slate-700' },
                                                        { label: '60d', val: aging?.qty60 || 0, color: 'text-amber-600' },
                                                        { label: '90d', val: aging?.qty90 || 0, color: 'text-rose-500' },
                                                        { label: '>90d', val: aging?.qtyOver90 || 0, color: 'text-rose-700' },
                                                    ].map(({ label, val, color }) => (
                                                        <div key={label} className="flex flex-col items-center min-w-[34px]">
                                                            <span className={val > 0 ? color : 'text-slate-400'}>{val > 0 ? val : '–'}</span>
                                                            <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">{label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex justify-center gap-3 text-[14px] tabular-nums font-bold">
                                                    <div className="flex flex-col items-center min-w-[34px]">
                                                        <span className={item.Backorder_NB > 0 ? 'text-rose-600' : 'text-slate-700'}>{nbStock}</span>
                                                        <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">NB</span>
                                                    </div>
                                                    <div className="flex flex-col items-center min-w-[34px]">
                                                        <span className={item.Backorder_BB > 0 ? 'text-rose-600' : 'text-slate-700'}>{bbStock}</span>
                                                        <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">BB</span>
                                                    </div>
                                                </div>
                                                {(canTransferToBB || canTransferToNB) && (
                                                    <div className="text-[11px] text-emerald-600 uppercase font-bold tracking-wide mt-1">↔ Điều chuyển</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <DealerInventoryPopup items={item.DealerBreakdown || []}>
                                                    <span className="font-mono font-bold tabular-nums text-slate-700 hover:text-blue-600 text-[14px] transition-colors">
                                                        {item.DealerInventory.toLocaleString()}
                                                    </span>
                                                </DealerInventoryPopup>
                                            </td>
                                            <td className="px-3 py-3">
                                                <PipelinePopup pipeline={item.Pipeline} pipelineNB={item.Pipeline_NB} pipelineBB={item.Pipeline_BB}>
                                                    <div className="flex justify-end gap-3 text-[14px] tabular-nums font-bold cursor-help">
                                                        <div className="flex flex-col items-center min-w-[34px]">
                                                            <span className={poM0 > 0 ? 'text-slate-900' : 'text-slate-400'}>{poM0 > 0 ? poM0 : '–'}</span>
                                                            <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">T.này</span>
                                                        </div>
                                                        <div className="flex flex-col items-center min-w-[34px]">
                                                            <span className={poM1 > 0 ? 'text-slate-900' : 'text-slate-400'}>{poM1 > 0 ? poM1 : '–'}</span>
                                                            <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">T.sau</span>
                                                        </div>
                                                        <div className="flex flex-col items-center min-w-[42px] border-l border-slate-200 pl-3">
                                                            <span className={item.TotalPO > 0 ? 'text-slate-900' : 'text-slate-400'}>{item.TotalPO}</span>
                                                            <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">Tổng</span>
                                                        </div>
                                                    </div>
                                                </PipelinePopup>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-mono font-bold text-slate-900 text-[14px] tabular-nums">
                                                    {formatCurrency(item.computed?.boAging?.totalValue || 0)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-slate-900 text-white z-10 shadow-2xl">
                                <tr className="text-[14px] tabular-nums font-bold">
                                    <td className="px-4 py-3 text-white/80 !text-[11px] uppercase tracking-widest">Tổng cộng trang</td>
                                    <td className="px-3 py-3 text-white/40">–</td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.Backorder, 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-right text-white/40">–</td>
                                    <td className="px-3 py-3 text-white/40">–</td>
                                    <td className="px-3 py-3 text-center text-white/40">–</td>
                                    <td className="px-3 py-3 text-center">
                                        <span className="mr-3">{pagedData.reduce((a, b) => a + (b.QuantityInventory_NB + b.QuantityDC_NB), 0).toLocaleString()}<span className="text-white/50 text-[11px] font-medium ml-0.5">NB</span></span>
                                        <span>{pagedData.reduce((a, b) => a + (b.QuantityInventory_BB + b.QuantityDC_BB), 0).toLocaleString()}<span className="text-white/50 text-[11px] font-medium ml-0.5">BB</span></span>
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.DealerInventory, 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.TotalPO, 0).toLocaleString()}<span className="text-white/50 text-[11px] font-medium ml-0.5">tổng</span>
                                    </td>
                                    <td className="px-4 py-3 text-right !text-[14px]">
                                        {formatCurrency(pagedData.reduce((a, b) => a + (b.computed?.boAging?.totalValue || 0), 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        {filteredData.length === 0 && (
                            <div className="p-20 text-center">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                                    <FaIcon className="fas fa-search text-slate-600 text-2xl" />
                                </div>
                                <Typography variant="h3" className="text-slate-600 uppercase tracking-widest">Không tìm thấy dữ liệu nợ hàng</Typography>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Typography variant="label" className="text-slate-600 !text-[10px]">
                                Đang hiển thị <span className="text-slate-900 font-black">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)}</span> trong tổng số <span className="text-slate-900 font-black">{filteredData.length.toLocaleString()}</span> SKU nợ hàng
                            </Typography>
                            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                                <Typography variant="label" className="text-slate-500 !text-[10px]">Dòng/trang:</Typography>
                                <select
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <FaIcon className="fas fa-chevron-left text-xs" />
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
                                                className={`w-10 h-10 rounded-xl text-[11px] font-black transition ${currentPage === page ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                            >
                                                {page}
                                            </button>
                                        );
                                    });
                                })()}
                                {Math.ceil(filteredData.length / (pageSize || 25)) > 5 && <span className="text-slate-600 px-2">…</span>}
                            </div>
                            <button 
                                disabled={pageSize <= 0 || currentPage === Math.ceil(filteredData.length / (pageSize || 25))}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <FaIcon className="fas fa-chevron-right text-xs" />
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
                        <Typography variant="body-sm" className="text-slate-600">Vui lòng đợi trong giây lát...</Typography>
                    </div>
                </div>
            )}
        </div>
    );
};
