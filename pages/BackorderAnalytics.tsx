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
import { CriticalSkuSpotlight } from '../components/CriticalSkuSpotlight';

// Aging tier badge — Bento Light Luxury spec
// Spec: aging-30 #5B6470 | aging-60 #8A5A14 | aging-90 #9A2D2D | aging-over90 #6B1717
// Monotonic saturation: 90 & >90 share danger-soft surface, only ink darkens.
const AgingBadge = ({ days, qty }: { days: string, qty: number }) => {
    const getStyle = (d: string): { bg: string; ink: string } => {
        if (d === '>90') return { bg: '#F4D8D2', ink: '#6B1717' }; // aging-over90
        if (d === '90')  return { bg: '#F4D8D2', ink: '#9A2D2D' }; // aging-90
        if (d === '60')  return { bg: '#FBEDC9', ink: '#8A5A14' }; // aging-60
        return                  { bg: '#EEF0F4', ink: '#5B6470' }; // aging-30
    };
    const { bg, ink } = getStyle(days);
    return (
        <div className="flex flex-col items-center gap-1 group/aging">
            <span
                className="uppercase"
                style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: '#5B6470',
                }}
            >
                {days === '>90' ? '> 90D' : `${days}D`}
            </span>
            <div
                className="text-center"
                style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    minWidth: 44,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: bg,
                    color: ink,
                }}
            >
                {qty > 0 ? qty.toLocaleString() : '–'}
            </div>
        </div>
    );
};

// MetricCard — Bento Light Luxury spec: flat surface-raised tile, no gradient.
// Active state: ring with ink border instead of lift.
const MetricCard = ({ label, value, sub, icon, onClick, isActive }: any) => {
    return (
        <div
            onClick={onClick}
            style={{
                background: '#FFFFFF',
                border: `1px solid ${isActive ? '#15181E' : '#E6E1D8'}`,
                borderRadius: 14, // rounded.md
                padding: 16,
                boxShadow: isActive
                    ? '0 0 0 3px rgba(21, 24, 30, 0.08), 0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)'
                    : '0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)',
                cursor: 'pointer',
                transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 160ms ease',
                fontFamily: "'Inter', system-ui, sans-serif",
                color: '#15181E',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
            onMouseEnter={(e) => {
                if (!isActive) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.borderColor = '#15181E';
                }
            }}
            onMouseLeave={(e) => {
                if (!isActive) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#E6E1D8';
                }
            }}
        >
            <div
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10, // rounded.sm
                    background: '#EFECE6', // surface-sunken
                    color: '#15181E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                }}
            >
                <FaIcon className={`fas ${icon}`} aria-hidden="true" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: 'block',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: '#5B6470', // ink-muted
                        marginBottom: 4,
                    }}
                >
                    {label}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span
                        style={{
                            fontFamily: "'Fraunces', ui-serif, Georgia, serif",
                            fontSize: '1.5rem',          // metric-md
                            fontWeight: 600,
                            lineHeight: 1,
                            letterSpacing: '-0.015em',
                            color: '#15181E',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {value}
                    </span>
                    <span
                        style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            color: '#5B6470',
                            textTransform: 'uppercase',
                            letterSpacing: '0.18em',
                        }}
                    >
                        tr
                    </span>
                </div>
                {sub && (
                    <span
                        style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            color: '#5B6470',
                        }}
                    >
                        {sub}
                    </span>
                )}
            </div>
        </div>
    );
};

const FilterDropdown = ({ label, options, selected, onChange, icon }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const isActive = selected.length > 0;
    // Uses the .bo-dropdown-trigger token (index.css) so every dropdown on the
    // page reads as the same component — onyx idle, dark-glass + bronze rim
    // when ≥1 option is selected. No per-instance color: the only chrome
    // difference between an inactive and an active filter is the data-active
    // flag and the right-side count pill.
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                data-active={isActive}
                className="bo-dropdown-trigger"
            >
                <FaIcon className={`fas ${icon} text-[10px]`} aria-hidden="true" />
                <span>{label}</span>
                {isActive && (
                    <span className="bo-count-pill" aria-label={`${selected.length} đã chọn`}>{selected.length}</span>
                )}
                <FaIcon className={`fas fa-chevron-down text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true"></div>
                    <div
                        className="absolute top-full left-0 mt-1.5 w-64 z-50 animate-in fade-in zoom-in-95 origin-top-left"
                        style={{
                            background: 'var(--bo-surface-raised)',
                            border: '1px solid var(--bo-hairline)',
                            borderRadius: 'var(--bo-radius-md)',
                            boxShadow: 'var(--bo-shadow-tile)',
                            padding: 8,
                        }}
                    >
                        <div className="px-2 py-1.5 mb-1" style={{ borderBottom: '1px solid var(--bo-hairline)' }}>
                            <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--bo-ink-muted)' }}>
                                Lọc theo {label}
                            </span>
                        </div>
                        <div className="max-h-60 overflow-auto custom-scrollbar p-0.5">
                            {options.length > 0 && (
                                <label
                                    className="flex items-center gap-3 px-2.5 py-2 cursor-pointer transition-colors group sticky top-0 z-10"
                                    style={{
                                        background: 'var(--bo-surface-raised)',
                                        borderBottom: '1px solid var(--bo-hairline)',
                                        marginBottom: 2,
                                        borderRadius: 'var(--bo-radius-xs)',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bo-bronze-soft)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bo-surface-raised)')}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.length === options.length && options.length > 0}
                                        onChange={() => {
                                            if (selected.length === options.length) onChange([]);
                                            else onChange([...options]);
                                        }}
                                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--bo-bronze)]"
                                    />
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em] truncate" style={{ color: 'var(--bo-bronze-strong)' }}>
                                        Chọn tất cả
                                    </span>
                                </label>
                            )}
                            {options.map((opt: string) => (
                                <label
                                    key={opt}
                                    className="flex items-center gap-3 px-2.5 py-1.5 cursor-pointer transition-colors group"
                                    style={{ borderRadius: 'var(--bo-radius-xs)' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bo-surface-sunken)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={() => {
                                            const next = selected.includes(opt)
                                                ? selected.filter((s: string) => s !== opt)
                                                : [...selected, opt];
                                            onChange(next);
                                        }}
                                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--bo-bronze)]"
                                    />
                                    <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--bo-ink)' }}>
                                        {opt}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="px-2 pt-1.5 mt-1 flex justify-between items-center" style={{ borderTop: '1px solid var(--bo-hairline)' }}>
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="text-[10px] font-black uppercase tracking-[0.16em] hover:underline focus-visible:outline-none rounded px-1"
                                style={{ color: 'var(--bo-accent)' }}
                            >
                                Xoá
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="text-[10px] font-black uppercase tracking-[0.16em] hover:underline focus-visible:outline-none rounded px-1"
                                style={{ color: 'var(--bo-ink)' }}
                            >
                                Hoàn tất
                            </button>
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
    // Color ladder: critical→clay, warn→bronze-strong, neutral→ink, ok→sage. No rainbow.
    const ORDER_TYPE_SYMBOL: Record<string, { sym: string; full: string; color: string }> = {
        '1. VOR (Xe nằm đường)':  { sym: 'V', full: 'VOR — Xe nằm đường',  color: 'text-[var(--bo-accent)]' },          // clay — critical
        '2. Bảo Hành':            { sym: 'F', full: 'Bảo Hành',            color: 'text-[var(--bo-ink-muted)]' },        // ink — neutral
        '3. Khẩn (EO/Emergency)': { sym: 'E', full: 'Khẩn (EO/Emergency)', color: 'text-[var(--bo-bronze-strong)]' },    // bronze — urgent
        '4. Chiến dịch':          { sym: 'C', full: 'Chiến dịch',          color: 'text-[var(--bo-ink)]' },              // ink — neutral
        '5. Dự trữ (Stock)':      { sym: 'S', full: 'Dự trữ (Stock)',      color: 'text-[var(--bo-ok)]' },               // sage — positive
        '6. Khác':                { sym: 'X', full: 'Khác',                color: 'text-[var(--bo-ink-soft)]' },         // ink-soft — muted
    };

    // Coverage status — same logic as the master filter cards above the table.
    // STOCK: backorder ≤ on-hand. PO: incoming-this-month closes the gap. GAP: still short.
    // Palette: STOCK→sage (positive), PO→bronze (warn-neutral), GAP→clay (critical).
    type CoverageStatus = 'STOCK' | 'PO' | 'GAP';
    const COVERAGE_META: Record<CoverageStatus, { label: string; full: string; cls: string }> = {
        STOCK: { label: 'STOCK', full: 'Tồn đủ trả',     cls: 'bg-[var(--bo-ok-soft)] text-[var(--bo-ok)] ring-1 ring-[var(--bo-ok)]/20' },
        PO:    { label: 'PO',    full: 'PO đủ trả',      cls: 'bg-[var(--bo-bronze-soft)] text-[var(--bo-bronze-deep)] ring-1 ring-[var(--bo-bronze)]/20' },
        GAP:   { label: 'GAP',   full: 'Không đủ trả',   cls: 'bg-[var(--bo-accent-soft)] text-[var(--bo-accent-deep)] ring-1 ring-[var(--bo-accent)]/20' },
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
        // PARTITION INVARIANT: when breakdown rows are present, NB-sum + BB-sum +
        // unknown-sum must equal the total breakdown sum. Earlier this function
        // preferred the pre-aggregated Backorder_NB / Backorder_BB columns from
        // the CSV, but those values can drift from the breakdown (different
        // upload pipelines, mismatched cutoffs, manual edits). When the pre-agg
        // is inflated, NB + BB exceeded 'all' — that was the reported bug.
        // Now: when breakdown exists, ALWAYS sum from it (the single source of
        // truth for per-entry warehouse classification). Pre-agg is only used
        // when breakdown is missing, so legacy uploads still render.
        const breakdown = item.BackorderBreakdown ?? [];
        if (breakdown.length > 0) {
            if (scope === 'NB') return breakdown.filter(isNBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
            if (scope === 'BB') return breakdown.filter(isBBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
            // 'all' — keep the existing Math.max so that if item.Backorder is
            // larger than the breakdown sum (rare CSV/upload inconsistency) we
            // do not silently shrink the headline number. This still gives
            // all >= NB-sum + BB-sum.
            return Math.max(item.Backorder || 0, item.computed?.boAging?.totalQty || 0);
        }
        // Fallback: no breakdown. Use the pre-aggregated columns.
        if (scope === 'NB') return item.Backorder_NB || 0;
        if (scope === 'BB') return item.Backorder_BB || 0;
        return Math.max(item.Backorder || 0, (item.Backorder_NB || 0) + (item.Backorder_BB || 0));
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
    // Palette: overdue→clay (critical), due_this_month→bronze (warn), due_next_month→ink-soft (neutral).
    const SUPPLIER_STATUS_META: Record<Exclude<SupplierStatus, 'none'>, { label: string; full: string; cls: string }> = {
        overdue:        { label: 'TRỄ HẸN',     full: 'NCC quá hạn — RawDate+LT đã qua, không có PO confirm tháng này',  cls: 'bg-[var(--bo-accent-soft)] text-[var(--bo-accent-deep)] ring-1 ring-[var(--bo-accent)]/20' },
        due_this_month: { label: 'TRONG THÁNG', full: 'Có PO confirm về tháng này (Pipeline)',                            cls: 'bg-[var(--bo-bronze-soft)] text-[var(--bo-bronze-deep)] ring-1 ring-[var(--bo-bronze)]/20' },
        due_next_month: { label: 'THÁNG SAU',   full: 'Có PO confirm về tháng sau (Pipeline)',                              cls: 'bg-[var(--bo-surface-sunken)] text-[var(--bo-ink)] ring-1 ring-[var(--bo-hairline)]' },
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
        // Scope-aware aggregation. With NB/BB only entries from that warehouse
        // contribute to age/over-LT/anomaly/supplier counts; with 'all' the full
        // breakdown is used. nTransfer stays global because it represents cross-
        // warehouse rebalance opportunity, which is meaningful regardless of which
        // scope the operator is viewing.
        for (const item of enrichedData || []) {
            const lt = item.computed?.effectiveLT;
            const breakdown = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
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
                // getItemAnomaly already filters its input breakdown by scope, so
                // the per-tier counts below are scope-correct out of the box.
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
    }, [enrichedData, anomalyNow, deferredWarehouseScope]);

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
        <div
            className="bo-page flex flex-col h-full"
            style={{
                background: '#F7F5F2',           // surface — warm limestone per spec
                color: '#15181E',                 // ink
                fontFamily: "'Inter', system-ui, sans-serif",
            }}
        >
            {/* ════════════════════════════════════════════════════════════════
                BENTO HEADER — Light Luxury (per design-system/pages/backorder.md)
                Layout:
                  Row 1 (12-col): col-span-7 dark feature tile (identity + hero
                                  metric + reset-trigger) | col-span-5 white
                                  KPI cluster (TRẠNG THÁI SỨC KHOẺ 2×2)
                  Row 2: phân-loại chip rail on parchment + warehouse + metric
                Strict 4-hue palette (onyx · bronze · clay · sage). */}
            <div className="px-6 lg:px-8 pt-5 pb-3 grid grid-cols-12 gap-4">
                {/* ─── Feature tile (left, dark obsidian) */}
                <div className="col-span-12 lg:col-span-7 bo-bento-feature p-7 lg:p-8 relative">
                    <button
                        type="button"
                        onClick={handleExport}
                        aria-label="Xuất Excel danh sách nợ chi tiết theo từng đơn"
                        className="absolute top-6 right-6 inline-flex items-center gap-2 h-9 px-4 rounded-md text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors focus-visible:ring-2 focus-visible:ring-[var(--bo-bronze)]"
                        style={{ background: 'var(--bo-accent)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bo-accent-deep)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bo-accent)')}
                    >
                        <FaIcon className="fas fa-file-excel" aria-hidden="true" />
                        <span className="hidden sm:inline">Xuất Excel</span>
                    </button>

                    <div className="flex items-center gap-2 mb-5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-bronze)' }} aria-hidden="true" />
                        <span className="text-[10px] uppercase tracking-[0.22em] font-black" style={{ color: 'var(--bo-bronze)' }}>
                            Supply Chain · Backorder
                        </span>
                    </div>

                    <h1 className="bo-display text-[28px] lg:text-[32px] font-extrabold tracking-tight leading-tight mb-7" style={{ color: '#F4F1EB' }}>
                        Phân tích Nợ hàng
                    </h1>

                    <div className="text-[10px] uppercase tracking-[0.22em] font-black mb-2" style={{ color: 'rgba(168, 133, 75, 0.92)' }}>
                        Tổng nợ đang theo dõi
                    </div>

                    <button
                        type="button"
                        onClick={onResetFilters}
                        title="Xóa toàn bộ filter và xem toàn bộ SKU đang nợ"
                        aria-label="Bấm để reset filter và xem toàn bộ danh sách nợ"
                        className="block text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bo-bronze)]/60 rounded-md"
                    >
                        <div className="flex items-baseline gap-3">
                            <span className="bo-metric-xl">
                                {Math.round(stats.totalValue / 1e6).toLocaleString('vi-VN')}
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.22em] font-black" style={{ color: 'var(--bo-bronze)' }}>
                                Tr ₫
                            </span>
                        </div>

                        <div className="flex items-center gap-3 mt-3">
                            <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: '#E5DFCD' }}>
                                {filteredData.length.toLocaleString('vi-VN')}
                                <span className="text-[10px] tracking-[0.18em] uppercase font-extrabold ml-1.5" style={{ color: '#A8AAAE' }}>SKU</span>
                            </span>
                            <span className="w-px h-3.5" style={{ background: 'rgba(255,255,255,0.12)' }} aria-hidden="true" />
                            <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: '#E5DFCD' }}>
                                {stats.totalQty.toLocaleString('vi-VN')}
                                <span className="text-[10px] tracking-[0.18em] uppercase font-extrabold ml-1.5" style={{ color: '#A8AAAE' }}>SL</span>
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-3 text-[10px] tracking-[0.16em] uppercase font-bold transition-colors group-hover:opacity-100" style={{ color: '#8A8C90' }}>
                            <FaIcon className="fas fa-rotate-left text-[9px]" aria-hidden="true" />
                            <span className="group-hover:underline">bấm để reset filter</span>
                        </div>
                    </button>
                </div>

                {/* ─── KPI cluster tile (right, light) — TRẠNG THÁI SỨC KHOẺ 2×2 */}
                <div className="col-span-12 lg:col-span-5 bo-bento-tile p-6 lg:p-7">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-bronze)' }} aria-hidden="true" />
                            <h2 className="text-[12px] uppercase tracking-[0.22em] font-black" style={{ color: 'var(--bo-ink)' }}>
                                Trạng thái sức khoẻ
                            </h2>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--bo-ink-muted)' }}>
                            cập nhật theo filter
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        {([
                            { label: 'Tuổi nợ TB',    value: `${Math.round(headerStats.avgDays)}d`,    sub: `${headerStats.countOpen.toLocaleString('vi-VN')} đơn mở`,    accent: headerStats.avgDays > 90 ? 'critical' : 'default' },
                            { label: '% Trễ LT',      value: `${headerStats.pctOverLT.toFixed(1)}%`,   sub: `${headerStats.countOverLT.toLocaleString('vi-VN')} quá LT`,   accent: headerStats.pctOverLT > 50 ? 'critical' : 'default' },
                            { label: 'Đơn lâu nhất',  value: `${Math.round(headerStats.maxDays)}d`,    sub: 'tối đa',                                                       accent: 'bronze' },
                            { label: 'PO Coverage',   value: `${stats.poCoverage.toFixed(0)}%`,        sub: 'có hàng về',                                                   accent: stats.poCoverage >= 80 ? 'sage' : stats.poCoverage >= 50 ? 'default' : 'critical' },
                        ] as const).map(k => {
                            const valueColor =
                                k.accent === 'critical' ? 'var(--bo-accent)' :
                                k.accent === 'bronze'   ? 'var(--bo-bronze)' :
                                k.accent === 'sage'     ? 'var(--bo-ok)'      :
                                                           'var(--bo-ink)';
                            return (
                                <div key={k.label} className="flex flex-col gap-1.5">
                                    <span className="text-[10px] uppercase tracking-[0.18em] font-black" style={{ color: 'var(--bo-ink-muted)' }}>
                                        {k.label}
                                    </span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-display font-extrabold tabular-nums tracking-tight leading-none text-[28px] lg:text-[30px]" style={{ color: valueColor }}>
                                            {k.value}
                                        </span>
                                        <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--bo-ink-muted)' }}>
                                            {k.sub}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ─── Phân loại chip rail + warehouse/metric switchers (parchment) */}
            <div className="px-6 lg:px-8 pb-2 flex items-center gap-2 flex-wrap">
                <button type="button" onClick={onCriticalChip} title="Lọc các SKU có đơn ở mức TRỄ NGHIÊM TRỌNG"
                    className="bo-chip bo-chip-tone-danger" aria-pressed={anomalyFilters.includes('CRITICAL')}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-accent)' }} aria-hidden="true" />
                    Trễ N.trọng <span className="bo-mono">{headerStats.nCritical.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onHighChip} title="Lọc các SKU có đơn ở mức TRỄ NẶNG"
                    className="bo-chip bo-chip-tone-amber" aria-pressed={anomalyFilters.includes('HIGH')}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-bronze-strong)' }} aria-hidden="true" />
                    Trễ nặng <span className="bo-mono">{headerStats.nHigh.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onWarningChip} title="Lọc các SKU có đơn ở mức TRỄ NHẸ"
                    className="bo-chip bo-chip-tone-warn" aria-pressed={anomalyFilters.includes('WARNING')}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-bronze)' }} aria-hidden="true" />
                    Trễ nhẹ <span className="bo-mono">{headerStats.nWarning.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button" onClick={onSupplierChip} title="Lọc các SKU có NCC quá hạn giao"
                    className="bo-chip bo-chip-tone-ink" aria-pressed={supplierStatusFilters.includes('overdue')}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bo-ink-muted)' }} aria-hidden="true" />
                    NCC trễ <span className="bo-mono">{headerStats.nSupplierLate.toLocaleString('vi-VN')}</span>
                </button>
                <button type="button"
                    onClick={() => { setAnomalyFilters(['CRITICAL', 'HIGH', 'WARNING']); setSupplierStatusFilters(['overdue']); sortByScore(); setCurrentPage(1); }}
                    title="Lọc tất cả SKU đang cần xử lý (anomaly + NCC trễ)"
                    className="bo-chip bo-chip-tone-ink">
                    <FaIcon className="fas fa-bullseye text-[9px]" aria-hidden="true" />
                    Cần xử lý <span className="bo-mono">{(headerStats.nCritical + headerStats.nHigh + headerStats.nWarning + headerStats.nSupplierLate).toLocaleString('vi-VN')}</span>
                </button>
                <span title="Cơ hội điều chuyển nội bộ giữa NB/BB — xem cột Hành động trong bảng"
                    className="bo-chip bo-chip-tone-emerald cursor-help">
                    <FaIcon className="fas fa-arrow-right-arrow-left text-[9px]" aria-hidden="true" />
                    Điều chuyển <span className="bo-mono">{headerStats.nTransfer.toLocaleString('vi-VN')}</span>
                </span>

                {/* Warehouse + matrix-metric switchers — pushed right.
                    Both control the SAME data plane (warehouse scope filters
                    rows; metric switches the unit shown in the matrix tables),
                    so they sit side-by-side as one toolbar. */}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    <div className="bo-segmented" role="group" aria-label="Phạm vi kho NB / BB">
                        {([
                            { id: 'all', label: 'Cả 2' },
                            { id: 'NB',  label: 'NB'   },
                            { id: 'BB',  label: 'BB'   },
                        ] as const).map(s => (
                            <button key={s.id} type="button" onClick={() => setWarehouseScope(s.id)}
                                aria-pressed={warehouseScope === s.id} data-active={warehouseScope === s.id}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <div className="bo-segmented" role="group" aria-label="Đơn vị hiển thị trong bảng matrix">
                        {([
                            { id: 'sku', label: 'SKU',  tip: 'Đếm theo số mã' },
                            { id: 'qty', label: 'SL',   tip: 'Đếm theo số lượng' },
                            { id: 'val', label: 'Tr ₫', tip: 'Đếm theo giá trị (Triệu VND)' },
                        ] as const).map(m => (
                            <button key={m.id} type="button" onClick={() => setMatrixMetric(m.id)}
                                aria-pressed={matrixMetric === m.id} data-active={matrixMetric === m.id}
                                title={m.tip}>
                                {m.label}
                            </button>
                        ))}
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
                        const nAnomaly = headerStats.nCritical + headerStats.nHigh + headerStats.nWarning;
                        const supplierActive = supplierStatusFilters.length > 0;
                        const anomalyActive  = anomalyFilters.length > 0;
                        return (
                        <div
                            className="sticky top-0 z-30 px-4 py-2.5 flex items-center gap-2 flex-wrap"
                            style={{
                                background: 'var(--bo-surface-raised)',
                                border: '1px solid var(--bo-hairline)',
                                borderRadius: 'var(--bo-radius-lg)',
                                boxShadow: '0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)',
                            }}
                        >
                            {/* Coverage segmented (TỔNG / STOCK / PO / GAP) — bo-segmented */}
                            <div className="bo-segmented" role="group" aria-label="Bộ lọc phủ tồn / PO / GAP">
                                {([
                                    { id: 'all',      label: 'TỔNG',  count: masterCounts.all,      tip: 'Tổng nợ — toàn bộ' },
                                    { id: 'stock_ok', label: 'STOCK', count: masterCounts.stock_ok, tip: 'Tồn đủ trả ngay' },
                                    { id: 'po_ok',    label: 'PO',    count: masterCounts.po_ok,    tip: 'PO về tháng này đủ trả' },
                                    { id: 'fail',     label: 'GAP',   count: masterCounts.fail,     tip: 'Không đủ trả' },
                                ] as const).map(f => {
                                    const isActive = masterFilter === f.id;
                                    return (
                                        <button key={f.id} type="button"
                                            onClick={() => { setMasterFilter(f.id); setCurrentPage(1); }}
                                            aria-pressed={isActive} data-active={isActive} title={f.tip}>
                                            {f.label}
                                            <span className="bo-mono ml-1 text-[10px]">{f.count.toLocaleString('vi-VN')}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Aging buckets — bo-segmented */}
                            <div className="bo-segmented" role="group" aria-label="Tuổi nợ">
                                {(['all', '30', '60', '90', 'over90'] as const).map(val => {
                                    const isActive = agingFilter === val;
                                    return (
                                        <button key={val} type="button" onClick={() => setAgingFilter(val)}
                                            aria-pressed={isActive} data-active={isActive}>
                                            {val === 'all' ? 'Tất cả' : val === 'over90' ? '>90d' : `${val}d`}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 4 multi-select dropdowns — bo-dropdown-trigger via FilterDropdown */}
                            <FilterDropdown label="Nhóm mẹ"  options={filterOptions.motherGroups} selected={motherGroupFilters} onChange={setMotherGroupFilters} icon="fa-layer-group" />
                            <FilterDropdown label="Nguồn"    options={filterOptions.sources}      selected={sourceFilters}      onChange={setSourceFilters}      icon="fa-boxes-stacked" />
                            <FilterDropdown label="Loại đơn" options={filterOptions.types}        selected={orderTypeFilters}   onChange={setOrderTypeFilters}   icon="fa-file-invoice" />
                            <FilterDropdown label="Đơn vị"   options={filterOptions.branches}     selected={branchFilters}      onChange={setBranchFilters}      icon="fa-building" />

                            {/* NCC trễ — bo-chip with clay tone (critical hue) */}
                            <button type="button"
                                onClick={() => supplierActive ? setSupplierStatusFilters([]) : onSupplierChip()}
                                aria-pressed={supplierActive} data-active={supplierActive}
                                title="NCC trễ hẹn — bật/tắt lọc đơn có NCC quá hạn"
                                className="bo-chip bo-chip-tone-danger">
                                <FaIcon className="fas fa-truck-fast text-[10px]" aria-hidden="true" />
                                NCC <span className="bo-mono">{headerStats.nSupplierLate.toLocaleString('vi-VN')}</span>
                            </button>

                            {/* Đơn bất thường — bo-chip with clay tone */}
                            <button type="button"
                                onClick={() => anomalyActive ? setAnomalyFilters([]) : onCriticalChip()}
                                aria-pressed={anomalyActive} data-active={anomalyActive}
                                title="Đơn bất thường (CRITICAL/HIGH/WARNING) — bật/tắt lọc"
                                className="bo-chip bo-chip-tone-danger">
                                <FaIcon className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                                Đơn <span className="bo-mono">{nAnomaly.toLocaleString('vi-VN')}</span>
                            </button>

                            {/* Reset chip — only when ≥1 dimension filter active */}
                            {dimensionCount > 0 && (
                                <button type="button" onClick={onResetFilters} title="Xoá toàn bộ bộ lọc đang áp dụng"
                                    className="bo-chip bo-chip-tone-danger">
                                    <FaIcon className="fas fa-eraser text-[10px]" aria-hidden="true" />
                                    Xoá lọc <span className="bo-mono">{dimensionCount}</span>
                                </button>
                            )}

                        </div>
                        );
                    })()}

                    <CriticalSkuSpotlight
                        items={filteredData}
                        getAnomaly={getItemAnomaly}
                        getBoQty={(item) => {
                            const scoped = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                            return scoped.reduce((sum, bo) => sum + (bo.Qty || 0), 0) || (item.Backorder || 0);
                        }}
                        onSelect={onSkuSelect}
                        topN={8}
                    />

                    <div className="p-5 flex flex-col bo-bento-tile relative overflow-hidden group/m1">
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <span
                                    style={{
                                        display: 'block',
                                        fontFamily: "'Inter', system-ui, sans-serif",
                                        fontSize: '0.6875rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.18em',
                                        textTransform: 'uppercase',
                                        color: '#5B6470',
                                        marginBottom: 4,
                                    }}
                                >
                                    Aging Distribution
                                </span>
                                <h2
                                    style={{
                                        margin: 0,
                                        fontFamily: "'Fraunces', ui-serif, Georgia, serif",
                                        fontSize: '1.125rem',         // h2 per spec
                                        fontWeight: 600,
                                        lineHeight: 1.2,
                                        letterSpacing: '-0.01em',
                                        color: '#15181E',
                                    }}
                                >
                                    Phân bổ theo Tuổi nợ (Aging)
                                </h2>
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
                                            <Typography variant="label" className="text-[var(--bo-ink-muted)] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography>
                                        </th>
                                        <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 py-3 px-4 text-right border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[var(--bo-ink)] !text-[11px] font-black uppercase tracking-wider">TỔNG NỢ</Typography>
                                        </th>
                                        <th colSpan={6} className="sticky top-0 z-20 bg-slate-50 py-3 text-center border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[var(--bo-ink-muted)] !text-[10px] font-black uppercase tracking-[0.2em]">PHÂN RÃ THEO LOẠI ĐƠN</Typography>
                                        </th>
                                        <th colSpan={4} className="sticky top-0 z-20 bg-slate-50 py-3 text-center border-b border-slate-200">
                                            <Typography variant="label" className="text-[var(--bo-ink-muted)] !text-[10px] font-black uppercase tracking-[0.2em]">PHÂN RÃ THEO TUỔI NỢ (AGING)</Typography>
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
                                        <tr key={row.source} className={`group/row hover:bg-[var(--bo-bronze-soft)]/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                                            <td className="py-3 px-5 border-b border-slate-100">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[14px] group-hover/row:text-[var(--bo-bronze-strong)] transition-colors tracking-tight">{row.source}</Typography>
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
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.q90 > 0 ? 'font-bold text-[var(--bo-bronze-deep)]' : 'text-slate-400'}`}>{row.q90 > 0 ? formatMatrixVal(row.q90) : '–'}</Typography></td>
                                            <td className="py-3 text-center px-2 border-b border-slate-100"><Typography variant="mono" className={`!text-[14px] tabular-nums ${row.qO90 > 0 ? 'font-black text-[var(--bo-accent-deep)]' : 'text-slate-400'}`}>{row.qO90 > 0 ? formatMatrixVal(row.qO90) : '–'}</Typography></td>
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
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-[var(--bo-bronze-deep)] tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.q90 || 0), 0))}</Typography></td>
                                            <td className="py-4 text-center px-2"><Typography variant="mono" className="!text-[12px] font-black text-[var(--bo-accent-deep)] tabular-nums">{formatMatrixVal(matrixData.reduce((a, b) => a + (b.qO90 || 0), 0))}</Typography></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <div className="p-5 flex flex-col bo-bento-tile relative overflow-hidden group/m2">
                        <div className="mb-6 flex justify-between items-end relative z-10">
                            <div>
                                <span
                                    style={{
                                        display: 'block',
                                        fontFamily: "'Inter', system-ui, sans-serif",
                                        fontSize: '0.6875rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.18em',
                                        textTransform: 'uppercase',
                                        color: '#5B6470',
                                        marginBottom: 4,
                                    }}
                                >
                                    Line of Interest Matrix
                                </span>
                                <h2
                                    style={{
                                        margin: 0,
                                        fontFamily: "'Fraunces', ui-serif, Georgia, serif",
                                        fontSize: '1.125rem',
                                        fontWeight: 600,
                                        lineHeight: 1.2,
                                        letterSpacing: '-0.01em',
                                        color: '#15181E',
                                    }}
                                >
                                    Phân bổ nợ hàng theo LOIS
                                </h2>
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
                                            <Typography variant="label" className="text-[var(--bo-ink-muted)] !text-[11px] uppercase tracking-[0.2em] font-black">NHÓM MẸ / NGUỒN</Typography>
                                        </th>
                                        <th className="sticky top-0 z-20 bg-slate-50 py-3 px-4 text-right border-b border-r-2 border-slate-300">
                                            <Typography variant="label" className="text-[var(--bo-ink)] !text-[11px] font-black uppercase tracking-wider">TỔNG NỢ</Typography>
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
                                        <tr key={row.source} className={`group/row hover:bg-[var(--bo-bronze-soft)]/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                                            <td className="py-3 px-5 border-b border-slate-100">
                                                <Typography variant="label" className="text-slate-900 font-black uppercase !text-[14px] group-hover/row:text-[var(--bo-bronze-strong)] transition-colors tracking-tight">{row.source}</Typography>
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
                        <div className="p-5 flex flex-col bo-bento-tile group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Cơ cấu nợ theo loại đơn</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Phân tách nợ đại lý</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-inner" style={{ background: 'var(--bo-surface-sunken)', color: 'var(--bo-ink)' }}>
                                    <FaIcon className="fas fa-chart-pie text-sm" />
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {orderTypeData.map((d, i) => {
                                    const max = orderTypeData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    // 4-hue ladder: ink → bronze-strong → bronze → bronze-soft for rank decay.
                                    // Earlier rows are more important, hue darkens as importance rises.
                                    const colors = ['bg-[var(--bo-ink)]', 'bg-[var(--bo-bronze-deep)]', 'bg-[var(--bo-bronze-strong)]', 'bg-[var(--bo-bronze)]', 'bg-[var(--bo-ink-muted)]', 'bg-[var(--bo-ink-soft)]'];
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

                        <div className="p-5 flex flex-col bo-bento-tile group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography variant="label" className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]">Top 5 đơn vị nợ hàng</Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">Hiệu suất chi nhánh</Typography>
                                </div>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-inner" style={{ background: 'var(--bo-bronze-soft)', color: 'var(--bo-bronze-strong)' }}>
                                    <FaIcon className="fas fa-building text-sm" />
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {branchData.map((d, i) => {
                                    const max = branchData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    // 4-hue ladder: bronze ramp for rank decay (top branches darker).
                                    const colors = ['bg-[var(--bo-bronze-deep)]', 'bg-[var(--bo-bronze-strong)]', 'bg-[var(--bo-bronze)]', 'bg-[var(--bo-ink-muted)]', 'bg-[var(--bo-ink-soft)]'];
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
                <div className="bo-data-table-shell flex-1 flex flex-col">
                        <div className="px-6 py-5 shrink-0 flex justify-between items-center gap-6 flex-wrap" style={{ background: 'var(--bo-surface-sunken)', borderBottom: '1px solid var(--bo-hairline)' }}>
                            <div className="flex items-baseline gap-3 min-w-0">
                                <h3 className="font-display font-extrabold tracking-tight text-[20px]" style={{ color: 'var(--bo-ink)' }}>
                                    Chi tiết danh sách SKU
                                </h3>
                                <span className="text-[10px] uppercase tracking-[0.18em] font-black" style={{ color: 'var(--bo-ink-muted)' }}>
                                    Hiển thị <span className="font-mono">{filteredData.length.toLocaleString('vi-VN')}</span> kết quả
                                </span>
                            </div>

                            {/* Search — relocated from main filter strip into the SKU detail header
                                where it belongs scope-wise (search narrows the SKU list, not the
                                aggregate matrices above). Uses .bo-page tokens for consistency. */}
                            <div className="relative w-full sm:w-72 shrink-0">
                                <FaIcon className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--bo-ink-soft)' }} aria-hidden="true" />
                                <label htmlFor="bo-search" className="sr-only">Tìm SKU theo mã hoặc tên hàng</label>
                                <input
                                    id="bo-search"
                                    type="text"
                                    placeholder="Tìm mã hoặc tên hàng…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                    inputMode="search"
                                    className="w-full pl-9 pr-9 h-9 text-[12px] font-semibold tabular-nums outline-none transition-colors"
                                    style={{
                                        background: 'var(--bo-surface-raised)',
                                        border: '1px solid var(--bo-hairline)',
                                        borderRadius: 'var(--bo-radius-sm)',
                                        color: 'var(--bo-ink)',
                                    }}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--bo-bronze)')}
                                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--bo-hairline)')}
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        aria-label="Xoá tìm kiếm"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                                        style={{ color: 'var(--bo-ink-soft)' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--bo-accent)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--bo-ink-soft)')}
                                    >
                                        <FaIcon className="fas fa-circle-xmark text-[13px]" aria-hidden="true" />
                                    </button>
                                )}
                                {searchResult.type !== 'EMPTY' && (
                                    <div
                                        className="absolute top-full left-0 right-0 mt-1.5 px-3 py-2 text-[10px] font-black z-30 flex items-center gap-1.5"
                                        style={{
                                            background: 'var(--bo-surface-ink)',
                                            color: 'var(--bo-bronze)',
                                            border: '1px solid var(--bo-bronze-deep)',
                                            borderRadius: 'var(--bo-radius-xs)',
                                            letterSpacing: '0.12em',
                                            textTransform: 'uppercase',
                                        }}
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <FaIcon className="fas fa-microchip" aria-hidden="true" />
                                        <span style={{ color: '#F4F1EB' }}>{searchResult.modeDescription}</span>
                                    </div>
                                )}
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
                                                    <Typography variant="label" className={`${isActive ? 'text-[var(--bo-bronze-strong)]' : 'text-[var(--bo-ink-muted)]'} group-hover/th:text-[var(--bo-bronze-strong)] transition-colors font-bold uppercase tracking-wider`}>{label}</Typography>
                                                    <div className={`flex flex-col text-[8px] ${isActive ? 'text-[var(--bo-bronze-strong)]' : 'text-slate-600 opacity-0 group-hover/th:opacity-100'}`}>
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
                                        <tr key={item.ItemCode} tabIndex={0} role="button" aria-label={`Xem chi tiết ${item.ItemCode}`} className={`hover:bg-[var(--bo-bronze-soft)]/40 transition-colors group cursor-pointer border-b border-slate-100 last:border-0 focus-visible:bg-[var(--bo-bronze-soft)]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bo-bronze)] ${isCritical ? 'bg-[var(--bo-accent-soft)]/30' : ''}`} onClick={() => onSkuSelect(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkuSelect(item); } }}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-[var(--bo-accent)]' : isHigh ? 'bg-[var(--bo-bronze-strong)]' : 'bg-[var(--bo-ink-soft)]/40'}`} aria-hidden />
                                                    <div className="min-w-0">
                                                        <div className="font-mono font-bold text-slate-900 group-hover:text-[var(--bo-bronze-strong)] transition-colors text-[14px] tabular-nums tracking-tight">
                                                            {item.ItemCode}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 truncate max-w-[260px] mt-0.5 font-bold">{item.ItemName}</div>
                                                        <div className="text-[10px] text-slate-600 font-medium mt-0.5 flex flex-wrap items-baseline gap-x-1">
                                                            {item.SourceId && (
                                                                <span className="font-mono font-black text-[10px] text-[var(--bo-bronze-strong)] uppercase tracking-wider">{item.SourceId}</span>
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
                                                    <span className={`font-mono font-bold text-[14px] tabular-nums ${isCritical ? 'text-[var(--bo-accent)]' : 'text-[var(--bo-ink)]'} hover:text-[var(--bo-bronze-strong)] transition-colors`}>
                                                        {totalBO.toLocaleString('vi-VN')}
                                                    </span>
                                                </BackorderPopup>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className={`font-mono font-bold text-[14px] tabular-nums ${isCritical ? 'text-[var(--bo-accent)]' : isHigh ? 'text-[var(--bo-bronze-strong)]' : 'text-[var(--bo-ink)]'}`}>
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
                                                        { label: '60d', val: aging?.qty60 || 0, color: 'text-[var(--bo-bronze-strong)]' },
                                                        { label: '90d', val: aging?.qty90 || 0, color: 'text-[var(--bo-accent)]' },
                                                        { label: '>90d', val: aging?.qtyOver90 || 0, color: 'text-[var(--bo-accent-deep)]' },
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
                                                        <span className={item.Backorder_NB > 0 ? 'text-[var(--bo-accent)]' : 'text-[var(--bo-ink)]'}>{nbStock}</span>
                                                        <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">NB</span>
                                                    </div>
                                                    <div className="flex flex-col items-center min-w-[34px]">
                                                        <span className={item.Backorder_BB > 0 ? 'text-[var(--bo-accent)]' : 'text-[var(--bo-ink)]'}>{bbStock}</span>
                                                        <span className="text-[11px] text-slate-600 uppercase tracking-wide font-bold">BB</span>
                                                    </div>
                                                </div>
                                                {(canTransferToBB || canTransferToNB) && (
                                                    <div className="text-[11px] uppercase font-bold tracking-wide mt-1" style={{ color: 'var(--bo-ok)' }}>↔ Điều chuyển</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <DealerInventoryPopup items={item.DealerBreakdown || []}>
                                                    <span className="font-mono font-bold tabular-nums text-[var(--bo-ink)] hover:text-[var(--bo-bronze-strong)] text-[14px] transition-colors">
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
                                    className="bg-white border rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:ring-2 shadow-sm" style={{ borderColor: 'var(--bo-hairline)' }}
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
                <div className="fixed bottom-6 right-6 bg-white shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-4 flex items-center gap-4 z-50" style={{ border: '1px solid var(--bo-hairline)' }}>
                    <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '4px solid rgba(168, 133, 75, 0.2)', borderTopColor: 'var(--bo-bronze)' }}></div>
                    <div>
                        <Typography variant="label" className="font-black block" style={{ color: 'var(--bo-bronze-strong)' }}>ĐANG TÍNH TOÁN DỮ LIỆU</Typography>
                        <Typography variant="body-sm" className="text-slate-600">Vui lòng đợi trong giây lát...</Typography>
                    </div>
                </div>
            )}
        </div>
    );
};
