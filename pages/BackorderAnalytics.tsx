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
import {
    classifyItemAnomalies,
    classifyOrderAnomaly,
    ANOMALY_META,
    buildCohortStats,
    stockoutDaysRemaining,
    type OrderAnomaly,
} from '../utils/supplierAnomaly';
import { CriticalSkuSpotlight } from '../components/CriticalSkuSpotlight';
import { BentoHeader } from '../components/BentoHeader';
import { AnomalyRail } from '../components/AnomalyRail';
import { AgingMatrix } from '../components/AgingMatrix';
import { VelocityMatrix } from '../components/VelocityMatrix';
import { AgingBadge } from './backorder-analytics/AgingBadge';
import { MetricCard } from './backorder-analytics/MetricCard';
import { FilterDropdown } from './backorder-analytics/FilterDropdown';

export const BackorderAnalytics = ({
    enrichedData,
    isProcessing,
    onSkuSelect,
    graph,
    sourceProfiles,
}: {
    enrichedData?: InventoryItem[];
    isProcessing?: boolean;
    onSkuSelect: (item: InventoryItem) => void;
    graph?: any;
    sourceProfiles?: SourceProfile[];
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
            const c = item.computed;
            const skuCtx: Record<string, any> = {
                'Mã hàng': item.ItemCode,
                'Tên hàng': item.ItemName,
                Nguồn: item.SourceId,
                'Thương hiệu': item.BrandName,
                'Nhóm mẹ': resolveMotherGroup(item),
                'Loại xe': item.TypeCar || '',
                LOIS: item.LOISGroup || '',
                'LT (ngày)': lt || '',
                'Tổng nợ': item.Backorder,
                'Nợ NB': item.Backorder_NB,
                'Nợ BB': item.Backorder_BB,
                'Tồn NB': item.QuantityInventory_NB,
                'Tồn BB': item.QuantityInventory_BB,
                'DC NB': item.QuantityDC_NB,
                'DC BB': item.QuantityDC_BB,
                'Tồn đại lý': item.DealerInventory,
                'Tổng tồn kho': item.TotalInventory,
                'Hàng về (PO)': item.TotalPO,
                'PO NB': item.TotalPO_NB || 0,
                'PO BB': item.TotalPO_BB || 0,
                'PO về tháng này': c?.incomingCurrentMonth || 0,
                'PO về tháng sau': c?.incomingNextMonth || 0,
                'Net Demand': item.NetDemand,
                'Total Supply': item.TotalSupply,
                // Anomaly & Aging
                'Nợ lâu nhất (ngày)': c?.boAging?.oldestDebtDays || 0,
                'Nợ ≤30 ngày': c?.boAging?.qty30 || 0,
                'Nợ 31-60 ngày': c?.boAging?.qty60 || 0,
                'Nợ 61-90 ngày': c?.boAging?.qty90 || 0,
                'Nợ >90 ngày': c?.boAging?.qtyOver90 || 0,
                'Giá trị nợ tổng': c?.boAging?.totalValue || 0,
                'Cảnh báo NCC (SKU)': supplierLabel,
                'Bất thường nhất (SKU)': agg.abnormalCount > 0 ? ANOMALY_META[agg.worst].label : '',
                'Score bất thường tối đa': Math.round(agg.maxScore),
                'Số đơn bất thường (SKU)': agg.abnormalCount,
                // Pricing
                'Đơn giá PP': item.UnitCost_PP,
                'Đơn giá FOB': item.UnitCost_FOB,
                'Giá trị tồn': c?.stockValue || 0,
                // Inventory metrics
                MOS: c?.mos != null ? Math.round(c.mos * 100) / 100 : '',
                CST: c?.cst != null ? Math.round(c.cst * 100) / 100 : '',
                ROP: c?.rop || '',
                'Stock Max': c?.stockMax || '',
                'Safety Stock': c?.safetyStock || '',
                Available: c?.available || 0,
                'Net Available': c?.netAvailable || 0,
                'Demand/ngày': c?.demandRateDaily != null ? Math.round(c.demandRateDaily * 1000) / 1000 : '',
                'Demand/tháng': c?.demandMonthly != null ? Math.round(c.demandMonthly * 100) / 100 : '',
                Priority: c?.priorityBucket || '',
                'Stockout Risk': c?.stockoutRiskFlag ? 'Có' : '',
                // Forecast & Statistics
                'AVG 3M': item.AvgQty3M,
                'AVG 6M': item.AvgQty6M,
                'AVG 12M': item.AvgQty12M,
                'AVG 24M': item.AvgQty24M,
                'Base Forecast': item.BaseForecast,
                'Forecast NB': item.Forecast_NB || '',
                'Forecast BB': item.Forecast_BB || '',
                CV: c?.cv != null ? Math.round(c.cv * 1000) / 1000 : '',
                Slope: c?.slope != null ? Math.round(c.slope * 1000) / 1000 : '',
                SSI: c?.ssi != null ? Math.round(c.ssi * 1000) / 1000 : '',
                'Forecast LinReg': c?.forecastLinReg != null ? Math.round(c.forecastLinReg * 100) / 100 : '',
                // Other
                'Trend Flag': item.TrendFlag || '',
                Status: item.Status || '',
                SNP: item.SNP || '',
                'Stop Biz': c?.isStopBiz ? 'Có' : '',
                'Suggested BO': c?.suggestedBO || '',
                'BO Critical': c?.isBOCritical ? 'Có' : '',
                // Transfer/DRP
                'Transfer NB→BB': c?.transfer?.transferNBtoBB || '',
                'Transfer BB→NB': c?.transfer?.transferBBtoNB || '',
                'MOS NB': c?.transfer?.mosNB != null ? Math.round(c.transfer.mosNB * 100) / 100 : '',
                'MOS BB': c?.transfer?.mosBB != null ? Math.round(c.transfer.mosBB * 100) / 100 : '',
            };

            if (breakdown.length === 0) {
                rows.push({
                    ...skuCtx,
                    'Số đơn (DocNo)': '',
                    'Ngày đặt': '',
                    'Loại đơn': '',
                    'SL đơn': item.Backorder || 0,
                    Kho: '',
                    BranchCode: '',
                    BranchCodeReceipt: '',
                    'Khu vực (NB/BB)': '',
                    'Chi nhánh': '',
                    Showroom: '',
                    KhoNo: '',
                    'Loại xe đơn': '',
                    ETA: '',
                    'Ghi chú': '',
                    'Tuổi đơn (ngày)': '',
                    'Trễ so với LT (ngày)': '',
                    'Mức bất thường (đơn)': '',
                    'Score đơn': '',
                    'Lý do': '',
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
                    Kho: bo.Warehouse || '',
                    BranchCode: bo.BranchCode || '',
                    BranchCodeReceipt: bo.BranchCodeReceipt || '',
                    'Khu vực (NB/BB)': classifyBORegion(bo) === 'unknown' ? '' : classifyBORegion(bo),
                    'Chi nhánh': bo.BranchName || '',
                    Showroom: bo.Showroom || '',
                    KhoNo: bo.KhoNo || '',
                    'Loại xe đơn': bo.TypeCar || '',
                    ETA: bo.ETA || '',
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
    const [matrixMetric] = useState<'sku' | 'qty' | 'val'>('sku');
    const [motherGroupFilters, setMotherGroupFilters] = useState<string[]>([]);
    const [specialFilter, setSpecialFilter] = useState<'all' | 'critical' | 'transfer' | 'po'>('all');
    const [masterFilter, setMasterFilter] = useState<'all' | 'stock_ok' | 'po_ok' | 'fail'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({
        key: 'totalValue',
        direction: 'desc',
    });
    const [activeAnomalyTier, setActiveAnomalyTier] = useState<OrderAnomaly | 'NONE' | null>(null);

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
                if (parsed.sourceFilters)
                    setSourceFilters(parsed.sourceFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.motherGroupFilters)
                    setMotherGroupFilters(
                        parsed.motherGroupFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'),
                    );
                if (parsed.orderTypeFilters)
                    setOrderTypeFilters(parsed.orderTypeFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (parsed.branchFilters)
                    setBranchFilters(parsed.branchFilters.filter((f: any) => f && f !== 'All' && f !== 'Tất cả'));
                if (Array.isArray(parsed.supplierStatusFilters))
                    setSupplierStatusFilters(
                        parsed.supplierStatusFilters.filter(
                            (f: any) => f && ['overdue', 'due_this_month', 'due_next_month'].includes(f),
                        ),
                    );
                if (Array.isArray(parsed.anomalyFilters))
                    setAnomalyFilters(
                        parsed.anomalyFilters.filter(
                            (f: any) => f && ['CRITICAL', 'HIGH', 'WARNING', 'DUE_SOON'].includes(f),
                        ),
                    );
                if (parsed.warehouseScope && ['all', 'NB', 'BB'].includes(parsed.warehouseScope))
                    setWarehouseScope(parsed.warehouseScope);
                if (parsed.pageSize) setPageSize(Math.max(1, parsed.pageSize));

                if (parsed.masterFilter) setMasterFilter(parsed.masterFilter);
            }
        } catch (e) {
            /* filters load failed */
        }
    }, []);

    React.useEffect(() => {
        const state = {
            search,
            agingFilter,
            sourceFilters,
            motherGroupFilters,
            orderTypeFilters,
            branchFilters,
            supplierStatusFilters,
            anomalyFilters,
            warehouseScope,
            pageSize,
            matrixMetric,
            sortConfig,
            specialFilter,
            masterFilter,
        };
        localStorage.setItem('backorder_filters', JSON.stringify(state));
    }, [
        search,
        agingFilter,
        sourceFilters,
        motherGroupFilters,
        orderTypeFilters,
        branchFilters,
        supplierStatusFilters,
        anomalyFilters,
        warehouseScope,
        pageSize,
        matrixMetric,
        sortConfig,
        specialFilter,
        masterFilter,
    ]);

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
        if (prefix === 'F' || type.includes('BẢO HÀNH') || type.includes('WARRANTY') || type.includes('BH'))
            return '2. Bảo Hành';
        if (prefix === 'E' || ['KHẨN', 'URGENT', 'EO', 'NHANH'].some(k => type.includes(k)))
            return '3. Khẩn (EO/Emergency)';
        if (type.includes('CHIẾN DỊCH') || type.includes('CAMPAIGN')) return '4. Chiến dịch';
        if (prefix === 'S' || doc.startsWith('RO') || ['DỰ TRỮ', 'STOCK'].some(k => type.includes(k)))
            return '5. Dự trữ (Stock)';
        return '6. Khác';
    };

    // Compact one-letter symbol for table display (V/F/E/C/S/X). Title attr exposes full name.
    // Color ladder: critical→clay, warn→bronze-strong, neutral→ink, ok→sage. No rainbow.
    const ORDER_TYPE_SYMBOL: Record<string, { sym: string; full: string; color: string }> = {
        '1. VOR (Xe nằm đường)': { sym: 'V', full: 'VOR — Xe nằm đường', color: 'text-[var(--bo-accent)]' }, // clay — critical
        '2. Bảo Hành': { sym: 'F', full: 'Bảo Hành', color: 'text-[var(--bo-ink-muted)]' }, // ink — neutral
        '3. Khẩn (EO/Emergency)': { sym: 'E', full: 'Khẩn (EO/Emergency)', color: 'text-[var(--bo-bronze-strong)]' }, // bronze — urgent
        '4. Chiến dịch': { sym: 'C', full: 'Chiến dịch', color: 'text-[var(--bo-ink)]' }, // ink — neutral
        '5. Dự trữ (Stock)': { sym: 'S', full: 'Dự trữ (Stock)', color: 'text-[var(--bo-ok)]' }, // sage — positive
        '6. Khác': { sym: 'X', full: 'Khác', color: 'text-[var(--bo-ink-soft)]' }, // ink-soft — muted
    };

    // Coverage status — same logic as the master filter cards above the table.
    // STOCK: backorder ≤ on-hand. PO: incoming-this-month closes the gap. GAP: still short.
    // Palette: STOCK→sage (positive), PO→bronze (warn-neutral), GAP→clay (critical).
    type CoverageStatus = 'STOCK' | 'PO' | 'GAP';
    const COVERAGE_META: Record<CoverageStatus, { label: string; full: string; cls: string }> = {
        STOCK: {
            label: 'STOCK',
            full: 'Tồn đủ trả',
            cls: 'bg-[var(--bo-ok-soft)] text-[var(--bo-ok)] ring-1 ring-[var(--bo-ok)]/20',
        },
        PO: {
            label: 'PO',
            full: 'PO đủ trả',
            cls: 'bg-[var(--bo-bronze-soft)] text-[var(--bo-bronze-deep)] ring-1 ring-[var(--bo-bronze)]/20',
        },
        GAP: {
            label: 'GAP',
            full: 'Không đủ trả',
            cls: 'bg-[var(--bo-accent-soft)] text-[var(--bo-accent-deep)] ring-1 ring-[var(--bo-accent)]/20',
        },
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
        const breakdown = item.BackorderBreakdown ?? [];
        if (breakdown.length > 0) {
            if (scope === 'NB') return breakdown.filter(isNBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
            if (scope === 'BB') return breakdown.filter(isBBEntry).reduce((s, b) => s + (b.Qty || 0), 0);
            return breakdown.reduce((s, b) => s + (b.Qty || 0), 0);
        }
        if (scope === 'NB') return item.Backorder_NB || 0;
        if (scope === 'BB') return item.Backorder_BB || 0;
        return (item.Backorder_NB || 0) + (item.Backorder_BB || 0);
    };
    const getScopedStock = (item: InventoryItem, scope: 'all' | 'NB' | 'BB'): number => {
        if (scope === 'NB') return (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
        if (scope === 'BB') return (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
        return (
            (item.QuantityInventory_NB || 0) +
            (item.QuantityInventory_BB || 0) +
            (item.QuantityDC_NB || 0) +
            (item.QuantityDC_BB || 0)
        );
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
    const SUPPLIER_STATUS_META: Record<
        Exclude<SupplierStatus, 'none'>,
        { label: string; full: string; cls: string }
    > = {
        overdue: {
            label: 'TRỄ HẸN',
            full: 'NCC quá hạn — RawDate+LT đã qua, không có PO confirm tháng này',
            cls: 'bg-[var(--bo-accent-soft)] text-[var(--bo-accent-deep)] ring-1 ring-[var(--bo-accent)]/20',
        },
        due_this_month: {
            label: 'TRONG THÁNG',
            full: 'Có PO confirm về tháng này (Pipeline)',
            cls: 'bg-[var(--bo-bronze-soft)] text-[var(--bo-bronze-deep)] ring-1 ring-[var(--bo-bronze)]/20',
        },
        due_next_month: {
            label: 'THÁNG SAU',
            full: 'Có PO confirm về tháng sau (Pipeline)',
            cls: 'bg-[var(--bo-surface-sunken)] text-[var(--bo-ink)] ring-1 ring-[var(--bo-hairline)]',
        },
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
        ['Về trong tháng', 'due_this_month'],
        ['Về tháng sau', 'due_next_month'],
    ];

    // ── Per-order anomaly aggregate (memoized per SKU code+breakdown len+LT) ─
    // Stable now reference so all rows are classified against the same instant
    // (prevents drift when many items are processed in sequence).
    const anomalyNow = useMemo(() => Date.now(), []);
    // Build per-source cohort stats once over all enriched items so each SKU
    // classifier can compare its order daysOpen against its supplier baseline.
    const cohortStats = useMemo(() => buildCohortStats(enrichedData ?? [], anomalyNow), [enrichedData, anomalyNow]);
    const anomalyCache = useMemo(
        () => new Map<string, ReturnType<typeof classifyItemAnomalies>>(),
        [anomalyNow, cohortStats, deferredWarehouseScope],
    );
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
        ['Trễ nặng', 'HIGH'],
        ['Trễ nhẹ', 'WARNING'],
        ['Sắp đến hạn', 'DUE_SOON'],
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
            const matchesSource =
                deferredSourceFilters.length === 0 || deferredSourceFilters.includes(item.SourceId ?? '');
            const matchesMother =
                deferredMotherGroupFilters.length === 0 ||
                deferredMotherGroupFilters.includes(resolveMotherGroup(item));

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

            const matchesType =
                deferredOrderTypeFilters.length === 0 ||
                scopedBreakdown.some(bo => deferredOrderTypeFilters.includes(getOrderTypeName(bo)));
            const matchesBranch =
                deferredBranchFilters.length === 0 ||
                scopedBreakdown.some(bo => deferredBranchFilters.includes(bo.Showroom || bo.BranchName || 'Khác'));

            let matchesSpecial = true;
            const b = item.computed?.boAging;
            if (deferredSpecialFilter === 'critical') matchesSpecial = (b?.qtyOver90 || 0) > 0 || (b?.qty90 || 0) > 0;
            else if (deferredSpecialFilter === 'transfer') {
                const nbStock = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
                const bbStock = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
                matchesSpecial =
                    ((item.Backorder_BB || 0) > 0 && nbStock > 0) || ((item.Backorder_NB || 0) > 0 && bbStock > 0);
            } else if (deferredSpecialFilter === 'po') matchesSpecial = (item.TotalPO || 0) > 0;

            // Master filter (STOCK/PO/GAP) uses the scoped stock + scoped BO too,
            // so the cards above the table line up with the rendered list.
            let matchesMaster = true;
            const scopedStock = getScopedStock(item, deferredWarehouseScope);
            const poThisMonth = item.computed?.incomingCurrentMonth || 0;
            const boQty = getScopedBOQty(item, deferredWarehouseScope);

            if (deferredMasterFilter === 'stock_ok') matchesMaster = boQty <= scopedStock;
            else if (deferredMasterFilter === 'po_ok')
                matchesMaster = boQty > scopedStock && boQty <= scopedStock + poThisMonth;
            else if (deferredMasterFilter === 'fail') matchesMaster = boQty > scopedStock + poThisMonth;

            const matchesSupplier =
                deferredSupplierStatusFilters.length === 0 ||
                deferredSupplierStatusFilters.includes(getSupplierStatus(item));
            const matchesAnomaly =
                (deferredAnomalyFilters.length === 0 && activeAnomalyTier !== 'NONE') ||
                (() => {
                    const agg = getItemAnomaly(item).aggregate;
                    if (activeAnomalyTier === 'NONE') return agg.abnormalCount === 0;
                    return deferredAnomalyFilters.some(t => agg.counts[t] > 0);
                })();

            // Warehouse scope predicate: when scope ≠ 'all', the SKU only counts
            // if it has BO in that warehouse.
            const hasBO = boQty > 0;
            return (
                hasBO &&
                matchesSearch &&
                matchesSource &&
                matchesMother &&
                matchesAging &&
                matchesType &&
                matchesBranch &&
                matchesSpecial &&
                matchesMaster &&
                matchesSupplier &&
                matchesAnomaly
            );
        });

        if (sortConfig) {
            list.sort((a, b) => {
                let aVal: any = 0;
                let bVal: any = 0;
                switch (sortConfig.key) {
                    case 'ItemCode':
                        aVal = a.ItemCode;
                        bVal = b.ItemCode;
                        break;
                    case 'Backorder':
                        aVal = a.Backorder;
                        bVal = b.Backorder;
                        break;
                    case 'totalValue':
                        aVal = a.computed?.boAging?.totalValue || 0;
                        bVal = b.computed?.boAging?.totalValue || 0;
                        break;
                    case 'TotalPO':
                        aVal = a.TotalPO;
                        bVal = b.TotalPO;
                        break;
                    case 'Stock':
                        aVal = a.QuantityInventory_NB + a.QuantityDC_NB + (a.QuantityInventory_BB + a.QuantityDC_BB);
                        bVal = b.QuantityInventory_NB + b.QuantityDC_NB + (b.QuantityInventory_BB + b.QuantityDC_BB);
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
    }, [
        cachedData,
        searchResult,
        deferredSourceFilters,
        deferredMotherGroupFilters,
        deferredAgingFilter,
        deferredOrderTypeFilters,
        deferredBranchFilters,
        deferredSupplierStatusFilters,
        deferredAnomalyFilters,
        deferredWarehouseScope,
        sortConfig,
        deferredSpecialFilter,
        deferredMasterFilter,
        startOfThisMonth,
        anomalyNow,
        activeAnomalyTier,
    ]);

    const stats = useMemo(() => {
        if (!filteredData)
            return {
                totalValue: 0,
                totalQty: 0,
                criticalCount: 0,
                aging: { q30: 0, q60: 0, q90: 0, qO90: 0 },
                totalPOVal: 0,
                poCoverage: 0,
            };
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
                let q30 = 0,
                    q60 = 0,
                    q90 = 0,
                    qO90 = 0;
                const scopedBd = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                for (const bo of scopedBd) {
                    const ts = bo.RawDate || 0;
                    if (ts <= 0) {
                        q30 += bo.Qty;
                        continue;
                    }
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

        return {
            totalValue,
            totalQty,
            criticalCount,
            aging,
            totalPOVal,
            poCoverage: totalQty > 0 ? (poCoverageCount / totalQty) * 100 : 0,
        };
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
                    types: {},
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

        return Object.values(matrix)
            .map((data: any) => {
                const row: any = { source: data.source };
                row.q30 = getVal(data.aging.q30);
                row.q60 = getVal(data.aging.q60);
                row.q90 = getVal(data.aging.q90);
                row.qO90 = getVal(data.aging.qO90);

                const typeLabels = [
                    '1. VOR (Xe nằm đường)',
                    '2. Bảo Hành',
                    '3. Khẩn (EO/Emergency)',
                    '4. Chiến dịch',
                    '5. Dự trữ (Stock)',
                    '6. Khác',
                ];
                typeLabels.forEach(t => {
                    row[`type_${t}`] = getVal(data.types[t]);
                });

                row.total =
                    matrixMetric === 'sku'
                        ? new Set([
                              ...data.aging.q30.skus,
                              ...data.aging.q60.skus,
                              ...data.aging.q90.skus,
                              ...data.aging.qO90.skus,
                          ]).size
                        : data.aging.q30[matrixMetric] +
                          data.aging.q60[matrixMetric] +
                          data.aging.q90[matrixMetric] +
                          data.aging.qO90[matrixMetric];

                return row;
            })
            .sort((a, b) => b.total - a.total);
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
        const sourceMap: Record<string, Record<string, { skus: Set<string>; qty: number; val: number }>> = {};

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

        return Object.entries(sourceMap)
            .map(([source, loisData]) => {
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
            })
            .sort((a, b) => b.total - a.total);
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
            sources.add(item.SourceId ?? '');
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
            branches: Array.from(branches).sort(),
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
        let totalDaysOpen = 0,
            countOpen = 0,
            countOverLT = 0;
        let totalScore = 0,
            countScored = 0,
            maxDays = 0;
        let nCritical = 0,
            nHigh = 0,
            nWarning = 0,
            nSupplierLate = 0;
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
                        totalDaysOpen += days;
                        countOpen++;
                        if (days > maxDays) maxDays = days;
                        if (lt && days > lt) countOverLT++;
                    }
                }
                // getItemAnomaly already filters its input breakdown by scope, so
                // the per-tier counts below are scope-correct out of the box.
                const agg = getItemAnomaly(item).aggregate;
                if (agg.maxScore > 0) {
                    totalScore += agg.maxScore;
                    countScored++;
                }
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
            maxDays,
            countOpen,
            countOverLT,
            nCritical,
            nHigh,
            nWarning,
            nSupplierLate,
            nTransfer,
        };
    }, [enrichedData, anomalyNow, deferredWarehouseScope]);

    // Master filter cohort counts (computed against unfiltered enrichedData so
    // the segmented control reflects the underlying volume per bucket).
    const masterCounts = useMemo(() => {
        const counts = { all: 0, stock_ok: 0, po_ok: 0, fail: 0 };
        for (const i of enrichedData || []) {
            const totalStock = i.QuantityInventory_NB + i.QuantityInventory_BB + i.QuantityDC_NB + i.QuantityDC_BB;
            const po = i.computed?.incomingCurrentMonth || 0;
            counts.all++;
            if (i.Backorder <= totalStock) counts.stock_ok++;
            else if (i.Backorder <= totalStock + po) counts.po_ok++;
            else counts.fail++;
        }
        return counts;
    }, [enrichedData]);

    const sparkline12m = useMemo(() => {
        const out = Array(12).fill(0);
        for (const it of filteredData)
            (it.SalesHistory || []).forEach((v: number, i: number) => {
                out[i] += v || 0;
            });
        return out;
    }, [filteredData]);

    const sortByScore = () => setSortConfig({ key: 'AnomalyScore', direction: 'desc' });
    const onCriticalChip = () => {
        setAnomalyFilters(['CRITICAL']);
        setSupplierStatusFilters([]);
        sortByScore();
        setCurrentPage(1);
    };
    const onHighChip = () => {
        setAnomalyFilters(['HIGH']);
        setSupplierStatusFilters([]);
        sortByScore();
        setCurrentPage(1);
    };
    const onWarningChip = () => {
        setAnomalyFilters(['WARNING']);
        setSupplierStatusFilters([]);
        sortByScore();
        setCurrentPage(1);
    };
    const onSupplierChip = () => {
        setSupplierStatusFilters(['overdue']);
        setAnomalyFilters([]);
        sortByScore();
        setCurrentPage(1);
    };
    const handleAnomalyTierClick = (tier: OrderAnomaly | 'NONE' | null) => {
        setActiveAnomalyTier(tier);
        if (tier === null || tier === 'NONE') {
            setAnomalyFilters([]);
        } else {
            setAnomalyFilters([tier]);
        }
        setSupplierStatusFilters([]);
        setCurrentPage(1);
    };
    // Drill-down from hero "SKU NỢ" — clears every dimension filter (search, aging,
    // dropdowns, anomaly) but keeps coverage band + warehouse scope so operators can
    // re-inspect the full population currently in scope. Pattern: glance hero → click → audit.
    const onResetFilters = () => {
        setSearch('');
        setAgingFilter('all');
        setSourceFilters([]);
        setOrderTypeFilters([]);
        setBranchFilters([]);
        setMotherGroupFilters([]);
        setSupplierStatusFilters([]);
        setAnomalyFilters([]);
        setSpecialFilter('all');
        setCurrentPage(1);
    };

    return (
        <div
            className="bo-page flex flex-col h-full"
            style={{
                background: '#F7F5F2', // surface — warm limestone per spec
                color: '#15181E', // ink
                fontFamily: "'Inter', system-ui, sans-serif",
            }}
        >
            {/* ═══ UNIFIED HEADER BLOCK — obsidian banner + anomaly rail + controls ═══ */}
            <div className="px-6 lg:px-8 pt-5 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BentoHeader
                    items={filteredData}
                    sparkline={sparkline12m}
                    actions={
                        <button
                            onClick={handleExport}
                            className="bo-chip"
                            style={{
                                background: 'rgba(244, 226, 180, 0.10)',
                                border: '1px solid rgba(244, 226, 180, 0.20)',
                                color: '#F4F1EB',
                            }}
                        >
                            <FaIcon className="fas fa-file-csv" style={{ fontSize: 12 }} />
                            <span>Xuất Excel</span>
                        </button>
                    }
                />

                {/* Anomaly tier strip + warehouse/metric/search — single control row */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        padding: '6px 8px',
                        background: 'var(--bo-paper)',
                        border: '1px solid var(--bo-hairline)',
                        borderRadius: 'var(--bo-radius-md)',
                        boxShadow: 'var(--bo-shadow-tile)',
                    }}
                >
                    <AnomalyRail
                        items={filteredData}
                        getAggregate={it => getItemAnomaly(it).aggregate}
                        activeTier={activeAnomalyTier}
                        onTierClick={handleAnomalyTierClick}
                    />

                    {/* Vertical divider */}
                    <div style={{ width: 1, height: 22, background: 'var(--bo-hairline)', flexShrink: 0 }} />

                    <div className="bo-segmented" role="group" aria-label="Phạm vi kho NB / BB">
                        {(
                            [
                                { id: 'all', label: 'Cả 2' },
                                { id: 'NB', label: 'NB' },
                                { id: 'BB', label: 'BB' },
                            ] as const
                        ).map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setWarehouseScope(s.id)}
                                aria-pressed={warehouseScope === s.id}
                                data-active={warehouseScope === s.id}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginLeft: 'auto', position: 'relative', width: 220, flexShrink: 0 }}>
                        <FaIcon
                            className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[12px]"
                            style={{ color: 'var(--bo-ink-soft)' }}
                            aria-hidden="true"
                        />
                        <label htmlFor="bo-search" className="sr-only">
                            Tìm SKU theo mã hoặc tên hàng
                        </label>
                        <input
                            id="bo-search"
                            type="text"
                            placeholder="Tìm mã / tên hàng…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            inputMode="search"
                            className="w-full pl-9 pr-9 h-8 text-[11px] font-semibold tabular-nums outline-none transition-colors"
                            style={{
                                background: 'var(--bo-surface-sunken)',
                                border: '1px solid var(--bo-hairline)',
                                borderRadius: 'var(--bo-radius-sm)',
                                color: 'var(--bo-ink)',
                            }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--bo-bronze)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo-hairline)')}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Xoá tìm kiếm"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                                style={{ color: 'var(--bo-ink-soft)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--bo-accent)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--bo-ink-soft)')}
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
                        const dimensionCount =
                            (search ? 1 : 0) +
                            (agingFilter !== 'all' ? 1 : 0) +
                            sourceFilters.length +
                            orderTypeFilters.length +
                            branchFilters.length +
                            motherGroupFilters.length +
                            supplierStatusFilters.length +
                            anomalyFilters.length;
                        const nAnomaly = headerStats.nCritical + headerStats.nHigh + headerStats.nWarning;
                        const supplierActive = supplierStatusFilters.length > 0;
                        const anomalyActive = anomalyFilters.length > 0;
                        return (
                            <div
                                className="sticky top-0 z-30 px-4 py-2.5 flex items-center gap-2 flex-wrap"
                                style={{
                                    background: 'var(--bo-surface-raised)',
                                    border: '1px solid var(--bo-hairline)',
                                    borderRadius: 'var(--bo-radius-lg)',
                                    boxShadow:
                                        '0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)',
                                }}
                            >
                                {/* Coverage segmented (TỔNG / STOCK / PO / GAP) — bo-segmented */}
                                <div className="bo-segmented" role="group" aria-label="Bộ lọc phủ tồn / PO / GAP">
                                    {(
                                        [
                                            {
                                                id: 'all',
                                                label: 'TỔNG',
                                                count: masterCounts.all,
                                                tip: 'Tổng nợ — toàn bộ',
                                            },
                                            {
                                                id: 'stock_ok',
                                                label: 'STOCK',
                                                count: masterCounts.stock_ok,
                                                tip: 'Tồn đủ trả ngay',
                                            },
                                            {
                                                id: 'po_ok',
                                                label: 'PO',
                                                count: masterCounts.po_ok,
                                                tip: 'PO về tháng này đủ trả',
                                            },
                                            { id: 'fail', label: 'GAP', count: masterCounts.fail, tip: 'Không đủ trả' },
                                        ] as const
                                    ).map(f => {
                                        const isActive = masterFilter === f.id;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => {
                                                    setMasterFilter(f.id);
                                                    setCurrentPage(1);
                                                }}
                                                aria-pressed={isActive}
                                                data-active={isActive}
                                                title={f.tip}
                                            >
                                                {f.label}
                                                <span className="bo-mono ml-1 text-[10px]">
                                                    {f.count.toLocaleString('vi-VN')}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Aging buckets — bo-segmented */}
                                <div className="bo-segmented" role="group" aria-label="Tuổi nợ">
                                    {(['all', '30', '60', '90', 'over90'] as const).map(val => {
                                        const isActive = agingFilter === val;
                                        return (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => setAgingFilter(val)}
                                                aria-pressed={isActive}
                                                data-active={isActive}
                                            >
                                                {val === 'all' ? 'Tất cả' : val === 'over90' ? '>90d' : `${val}d`}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* 4 multi-select dropdowns — bo-dropdown-trigger via FilterDropdown */}
                                <FilterDropdown
                                    label="Nhóm mẹ"
                                    options={filterOptions.motherGroups}
                                    selected={motherGroupFilters}
                                    onChange={setMotherGroupFilters}
                                    icon="fa-layer-group"
                                />
                                <FilterDropdown
                                    label="Nguồn"
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

                                {/* NCC trễ — bo-chip with clay tone (critical hue) */}
                                <button
                                    type="button"
                                    onClick={() => (supplierActive ? setSupplierStatusFilters([]) : onSupplierChip())}
                                    aria-pressed={supplierActive}
                                    data-active={supplierActive}
                                    title="NCC trễ hẹn — bật/tắt lọc đơn có NCC quá hạn"
                                    className="bo-chip bo-chip-tone-danger"
                                >
                                    <FaIcon className="fas fa-truck-fast text-[10px]" aria-hidden="true" />
                                    NCC{' '}
                                    <span className="bo-mono">{headerStats.nSupplierLate.toLocaleString('vi-VN')}</span>
                                </button>

                                {/* Đơn bất thường — bo-chip with clay tone */}
                                <button
                                    type="button"
                                    onClick={() => (anomalyActive ? setAnomalyFilters([]) : onCriticalChip())}
                                    aria-pressed={anomalyActive}
                                    data-active={anomalyActive}
                                    title="Đơn bất thường (CRITICAL/HIGH/WARNING) — bật/tắt lọc"
                                    className="bo-chip bo-chip-tone-danger"
                                >
                                    <FaIcon className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                                    Đơn <span className="bo-mono">{nAnomaly.toLocaleString('vi-VN')}</span>
                                </button>

                                {/* Reset chip — only when ≥1 dimension filter active */}
                                {dimensionCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={onResetFilters}
                                        title="Xoá toàn bộ bộ lọc đang áp dụng"
                                        className="bo-chip bo-chip-tone-danger"
                                    >
                                        <FaIcon className="fas fa-eraser text-[10px]" aria-hidden="true" />
                                        Xoá lọc <span className="bo-mono">{dimensionCount}</span>
                                    </button>
                                )}
                            </div>
                        );
                    })()}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                        <AgingMatrix
                            items={filteredData}
                            resolveMotherGroup={resolveMotherGroup}
                            getScopedBreakdown={it =>
                                filterBreakdownByScope(it.BackorderBreakdown, deferredWarehouseScope)
                            }
                            now={anomalyNow}
                            onSelectBucket={b => setAgingFilter(b as any)}
                        />

                        <VelocityMatrix
                            items={filteredData}
                            resolveMotherGroup={resolveMotherGroup}
                            getScopedBOQty={it => getScopedBOQty(it, deferredWarehouseScope)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-5 flex flex-col bo-bento-tile group hover:-translate-y-2">
                            <div className="mb-8 flex justify-between items-start">
                                <div>
                                    <Typography
                                        variant="label"
                                        className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]"
                                    >
                                        Cơ cấu nợ theo loại đơn
                                    </Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">
                                        Phân tách nợ đại lý
                                    </Typography>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center shadow-inner"
                                    style={{ background: 'var(--bo-surface-sunken)', color: 'var(--bo-ink)' }}
                                >
                                    <FaIcon className="fas fa-chart-pie text-sm" />
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {orderTypeData.map((d, i) => {
                                    const max = orderTypeData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    // 4-hue ladder: ink → bronze-strong → bronze → bronze-soft for rank decay.
                                    // Earlier rows are more important, hue darkens as importance rises.
                                    const colors = [
                                        'bg-[var(--bo-ink)]',
                                        'bg-[var(--bo-bronze-deep)]',
                                        'bg-[var(--bo-bronze-strong)]',
                                        'bg-[var(--bo-bronze)]',
                                        'bg-[var(--bo-ink-muted)]',
                                        'bg-[var(--bo-ink-soft)]',
                                    ];
                                    const colorClass = colors[i % colors.length];

                                    return (
                                        <div key={d.name} className="flex flex-col gap-2 group/item">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <Typography
                                                        variant="label"
                                                        className="text-slate-700 font-black truncate max-w-[180px] uppercase !text-[10px] group-hover/item:text-slate-900 transition-colors tracking-wide"
                                                    >
                                                        {d.name}
                                                    </Typography>
                                                </div>
                                                <Typography
                                                    variant="mono-sm"
                                                    className="text-slate-900 font-black !text-[11px]"
                                                >
                                                    {d.qty.toLocaleString()}
                                                </Typography>
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
                                    <Typography
                                        variant="label"
                                        className="text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block !text-[10px]"
                                    >
                                        Top 5 đơn vị nợ hàng
                                    </Typography>
                                    <Typography variant="h3" className="text-slate-900 !font-black tracking-tight">
                                        Hiệu suất chi nhánh
                                    </Typography>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center shadow-inner"
                                    style={{ background: 'var(--bo-bronze-soft)', color: 'var(--bo-bronze-strong)' }}
                                >
                                    <FaIcon className="fas fa-building text-sm" />
                                </div>
                            </div>
                            <div className="space-y-4 flex-1 overflow-auto max-h-[340px] pr-4 custom-scrollbar">
                                {branchData.map((d, i) => {
                                    const max = branchData[0]?.qty || 1;
                                    const width = (d.qty / max) * 100;
                                    // 4-hue ladder: bronze ramp for rank decay (top branches darker).
                                    const colors = [
                                        'bg-[var(--bo-bronze-deep)]',
                                        'bg-[var(--bo-bronze-strong)]',
                                        'bg-[var(--bo-bronze)]',
                                        'bg-[var(--bo-ink-muted)]',
                                        'bg-[var(--bo-ink-soft)]',
                                    ];
                                    const colorClass = colors[i % colors.length];

                                    return (
                                        <div key={d.name} className="flex flex-col gap-2 group/item">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`w-3 h-3 rounded-full ${colorClass} shadow-lg shadow-${colorClass.split('-')[1]}-200 group-hover/item:scale-125 transition-transform`}
                                                    />
                                                    <Typography
                                                        variant="label"
                                                        className="text-slate-700 font-black truncate max-w-[220px] uppercase !text-[10px] group-hover/item:text-slate-900 transition-colors tracking-wide"
                                                    >
                                                        {d.name}
                                                    </Typography>
                                                </div>
                                                <Typography
                                                    variant="mono-sm"
                                                    className="text-slate-900 font-black !text-[11px]"
                                                >
                                                    {d.qty.toLocaleString()}
                                                </Typography>
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

            <div className="px-6 lg:px-8 pb-4">
                <CriticalSkuSpotlight
                    items={filteredData}
                    getAnomaly={getItemAnomaly}
                    getBoQty={item => {
                        const scoped = filterBreakdownByScope(item.BackorderBreakdown, deferredWarehouseScope);
                        return scoped.reduce((sum, bo) => sum + (bo.Qty || 0), 0) || item.Backorder || 0;
                    }}
                    onSelect={onSkuSelect}
                    topN={15}
                />
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-6 pt-0">
                <div className="bo-data-table-shell flex-1 flex flex-col">
                    <div
                        className="px-6 py-5 shrink-0 flex justify-between items-center gap-6 flex-wrap"
                        style={{ background: 'var(--bo-surface-sunken)', borderBottom: '1px solid var(--bo-hairline)' }}
                    >
                        <div className="flex items-baseline gap-3 min-w-0">
                            <h3
                                className="font-display font-extrabold tracking-tight text-[20px]"
                                style={{ color: 'var(--bo-ink)' }}
                            >
                                Chi tiết danh sách SKU
                            </h3>
                            <span
                                className="text-[10px] uppercase tracking-[0.18em] font-black"
                                style={{ color: 'var(--bo-ink-muted)' }}
                            >
                                Hiển thị{' '}
                                <span className="font-mono">{filteredData.length.toLocaleString('vi-VN')}</span> kết quả
                            </span>
                        </div>

                        {/* Search moved to top toolbar next to warehouse/metric switchers */}
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
                                                onClick={() =>
                                                    setSortConfig(p => ({
                                                        key: sortKey,
                                                        direction:
                                                            p?.key === sortKey && p?.direction === 'desc'
                                                                ? 'asc'
                                                                : 'desc',
                                                    }))
                                                }
                                            >
                                                <div
                                                    className={`flex items-center gap-2 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : ''}`}
                                                >
                                                    <Typography
                                                        variant="label"
                                                        className={`${isActive ? 'text-[var(--bo-bronze-strong)]' : 'text-[var(--bo-ink-muted)]'} group-hover/th:text-[var(--bo-bronze-strong)] transition-colors font-bold uppercase tracking-wider`}
                                                    >
                                                        {label}
                                                    </Typography>
                                                    <div
                                                        className={`flex flex-col text-[8px] ${isActive ? 'text-[var(--bo-bronze-strong)]' : 'text-slate-600 opacity-0 group-hover/th:opacity-100'}`}
                                                    >
                                                        <FaIcon
                                                            className={`fas fa-caret-up ${isActive && sortConfig?.direction === 'asc' ? 'opacity-100' : 'opacity-30'}`}
                                                        />
                                                        <FaIcon
                                                            className={`fas fa-caret-down ${isActive && sortConfig?.direction === 'desc' ? 'opacity-100' : 'opacity-30'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    };

                                    return (
                                        <tr>
                                            <SortableHeader label="SKU" sortKey="ItemCode" align="left" />
                                            <th className="px-3 py-3 text-left">
                                                <Typography
                                                    variant="label"
                                                    className="text-slate-600 font-black uppercase tracking-widest"
                                                >
                                                    TÌNH TRẠNG
                                                </Typography>
                                            </th>
                                            <SortableHeader label="TỔNG NỢ" sortKey="Backorder" align="right" />
                                            <SortableHeader label="NỢ LÂU" sortKey="OldestDebt" align="right" />
                                            <th className="px-3 py-3 text-left">
                                                <Typography
                                                    variant="label"
                                                    className="text-slate-600 font-black uppercase tracking-widest"
                                                >
                                                    LOẠI ĐƠN
                                                </Typography>
                                            </th>
                                            <SortableHeader label="AGING" sortKey="Aging" />
                                            <SortableHeader label="TỒN KHO" sortKey="Stock" />
                                            <SortableHeader label="ĐẠI LÝ" sortKey="DealerInventory" align="right" />
                                            <SortableHeader label="HÀNG ĐANG VỀ" sortKey="TotalPO" align="right" />
                                            <SortableHeader
                                                label="GIÁ TRỊ NỢ (TR)"
                                                sortKey="totalValue"
                                                align="right"
                                            />
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
                                    const rowBreakdown = filterBreakdownByScope(
                                        item.BackorderBreakdown,
                                        deferredWarehouseScope,
                                    );
                                    let aging = item.computed?.boAging;
                                    if (deferredWarehouseScope !== 'all') {
                                        const a = {
                                            qty30: 0,
                                            qty60: 0,
                                            qty90: 0,
                                            qtyOver90: 0,
                                            totalQty: 0,
                                            totalValue: 0,
                                            oldestDebtDays: 0,
                                        };
                                        const dayMs = 24 * 60 * 60 * 1000;
                                        let maxDays = 0;
                                        for (const bo of rowBreakdown) {
                                            const ts = bo.RawDate || 0;
                                            a.totalQty += bo.Qty;
                                            if (ts <= 0) {
                                                a.qty30 += bo.Qty;
                                                continue;
                                            }
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

                                    const isCritical = priority === 'CRITICAL';
                                    const isHigh = priority === 'HIGH';
                                    const scopedBreakdown = filterBreakdownByScope(
                                        item.BackorderBreakdown,
                                        deferredWarehouseScope,
                                    );
                                    const totalBO = getScopedBOQty(item, deferredWarehouseScope);
                                    return (
                                        <tr
                                            key={item.ItemCode}
                                            className={`hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0 ${isCritical ? 'bg-red-50/40' : ''}`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span
                                                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-slate-300'}`}
                                                        aria-hidden
                                                    />
                                                    <div className="min-w-0">
                                                        <div
                                                            className="font-mono font-semibold text-slate-800 hover:text-blue-700 transition-colors text-[13px] tabular-nums tracking-tight cursor-pointer hover:underline"
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                onSkuSelect(item);
                                                            }}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    onSkuSelect(item);
                                                                }
                                                            }}
                                                        >
                                                            {item.ItemCode}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 truncate max-w-[260px] mt-0.5 font-medium">
                                                            {item.ItemName}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium mt-0.5 flex flex-wrap items-baseline gap-x-1">
                                                            {item.SourceId && (
                                                                <span className="font-mono font-bold text-[10px] text-slate-500 uppercase tracking-wider">
                                                                    {item.SourceId}
                                                                </span>
                                                            )}
                                                            <span className="text-slate-400">· {item.BrandName}</span>
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
                                                                    {showSupplier &&
                                                                        (() => {
                                                                            const meta = SUPPLIER_STATUS_META[ss];
                                                                            return (
                                                                                <span
                                                                                    title={meta.full}
                                                                                    className={`inline-flex items-center gap-1 font-mono font-black text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}
                                                                                >
                                                                                    <FaIcon className="fas fa-truck-fast text-[8px]" />
                                                                                    {meta.label}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    {showAnomaly &&
                                                                        (() => {
                                                                            const meta = ANOMALY_META[agg.worst];
                                                                            const detail = (
                                                                                ['CRITICAL', 'HIGH', 'WARNING'] as const
                                                                            )
                                                                                .filter(t => agg.counts[t] > 0)
                                                                                .map(
                                                                                    t =>
                                                                                        `${agg.counts[t]} ${ANOMALY_META[t].label}`,
                                                                                )
                                                                                .join(' • ');
                                                                            const maxDays = Math.round(agg.maxDaysOpen);
                                                                            const score = Math.round(agg.maxScore);
                                                                            const tooltip = `${meta.label} (score ${score}/100) • ${detail} • Đơn lâu nhất ${maxDays}d (trễ ${Math.round(agg.maxDaysOverdue)}d so với LT)`;
                                                                            return (
                                                                                <span
                                                                                    title={tooltip}
                                                                                    className={`inline-flex items-center gap-1 font-mono font-black text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}
                                                                                >
                                                                                    <FaIcon className="fas fa-triangle-exclamation text-[8px]" />
                                                                                    {meta.label} · {score}đ · {maxDays}D
                                                                                    · {agg.abnormalCount} ĐƠN
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
                                                        <span
                                                            title={meta.full}
                                                            className={`inline-flex font-mono font-black text-[10px] uppercase tracking-wider px-2 py-1 rounded-md ring-1 ${meta.cls}`}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <BackorderPopup
                                                    items={scopedBreakdown}
                                                    effectiveLTDays={item.computed?.effectiveLT}
                                                >
                                                    <span
                                                        className={`font-mono font-semibold text-[13px] tabular-nums ${isCritical ? 'text-red-600' : 'text-slate-800'} hover:text-blue-700 transition-colors`}
                                                    >
                                                        {totalBO.toLocaleString('vi-VN')}
                                                    </span>
                                                </BackorderPopup>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span
                                                    className={`font-mono font-semibold text-[13px] tabular-nums ${isCritical ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-slate-700'}`}
                                                >
                                                    {aging?.oldestDebtDays ?? 0}
                                                    <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                                                        d
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="text-[13px] tabular-nums font-semibold text-slate-700 max-w-[180px] leading-snug">
                                                    {Object.entries(boTypes).map(([type, qty], idx) => {
                                                        const meta = ORDER_TYPE_SYMBOL[type] ?? {
                                                            sym: '?',
                                                            full: type,
                                                            color: 'text-slate-600',
                                                        };
                                                        return (
                                                            <span key={type} title={meta.full}>
                                                                {idx > 0 && (
                                                                    <span className="text-slate-400 mx-1.5">|</span>
                                                                )}
                                                                <span>{qty}</span>
                                                                <span
                                                                    className={`font-mono font-black text-[11px] ml-0.5 ${meta.color}`}
                                                                >
                                                                    ({meta.sym})
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex justify-center gap-3 text-[13px] tabular-nums font-semibold">
                                                    {[
                                                        {
                                                            label: '30D',
                                                            val: aging?.qty30 || 0,
                                                            color: 'text-slate-600',
                                                        },
                                                        {
                                                            label: '60D',
                                                            val: aging?.qty60 || 0,
                                                            color: 'text-amber-600',
                                                        },
                                                        {
                                                            label: '90D',
                                                            val: aging?.qty90 || 0,
                                                            color: 'text-orange-600',
                                                        },
                                                        {
                                                            label: '>90D',
                                                            val: aging?.qtyOver90 || 0,
                                                            color: 'text-red-600',
                                                        },
                                                    ].map(({ label, val, color }) => (
                                                        <div
                                                            key={label}
                                                            className="flex flex-col items-center min-w-[34px]"
                                                        >
                                                            <span className={val > 0 ? color : 'text-slate-300'}>
                                                                {val > 0 ? val : '–'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                                {label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex justify-center gap-3 text-[13px] tabular-nums font-semibold">
                                                    <div className="flex flex-col items-center min-w-[34px]">
                                                        <span
                                                            className={
                                                                nbStock > 0 ? 'text-slate-700' : 'text-slate-300'
                                                            }
                                                        >
                                                            {nbStock}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                            NB
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-center min-w-[34px]">
                                                        <span
                                                            className={
                                                                bbStock > 0 ? 'text-slate-700' : 'text-slate-300'
                                                            }
                                                        >
                                                            {bbStock}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                            BB
                                                        </span>
                                                    </div>
                                                </div>
                                                {(canTransferToBB || canTransferToNB) && (
                                                    <div className="text-[10px] uppercase font-medium tracking-wide mt-1 text-emerald-600">
                                                        ↔ Điều chuyển
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <DealerInventoryPopup items={item.DealerBreakdown || []}>
                                                    <span
                                                        className={`font-mono font-semibold tabular-nums text-[13px] cursor-help hover:scale-105 transition-transform inline-flex items-center gap-1 ${(item.DealerBreakdown?.length || 0) > 0 ? 'text-blue-700' : 'text-slate-700'}`}
                                                    >
                                                        {(item.DealerBreakdown?.length || 0) > 0 && (
                                                            <FaIcon className="fas fa-warehouse text-[10px] opacity-60" />
                                                        )}
                                                        <span
                                                            className={
                                                                (item.DealerBreakdown?.length || 0) > 0
                                                                    ? 'border-b border-dashed border-blue-300'
                                                                    : ''
                                                            }
                                                        >
                                                            {item.DealerInventory.toLocaleString()}
                                                        </span>
                                                    </span>
                                                </DealerInventoryPopup>
                                            </td>
                                            <td className="px-3 py-3">
                                                <PipelinePopup
                                                    pipeline={item.Pipeline}
                                                    pipelineNB={item.Pipeline_NB}
                                                    pipelineBB={item.Pipeline_BB}
                                                >
                                                    <div className="flex justify-end gap-3 text-[13px] tabular-nums font-semibold cursor-help">
                                                        <div className="flex flex-col items-center min-w-[34px]">
                                                            <span
                                                                className={
                                                                    poM0 > 0 ? 'text-slate-700' : 'text-slate-300'
                                                                }
                                                            >
                                                                {poM0 > 0 ? poM0 : '–'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                                T.nay
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-center min-w-[34px]">
                                                            <span
                                                                className={
                                                                    poM1 > 0 ? 'text-slate-700' : 'text-slate-300'
                                                                }
                                                            >
                                                                {poM1 > 0 ? poM1 : '–'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                                T.sau
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-center min-w-[42px] border-l border-slate-200 pl-3">
                                                            <span
                                                                className={
                                                                    item.TotalPO > 0
                                                                        ? 'text-slate-700'
                                                                        : 'text-slate-300'
                                                                }
                                                            >
                                                                {item.TotalPO}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                                                                Tổng
                                                            </span>
                                                        </div>
                                                    </div>
                                                </PipelinePopup>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-mono font-semibold text-slate-700 text-[13px] tabular-nums">
                                                    {formatCurrency(item.computed?.boAging?.totalValue || 0)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-slate-900 text-white z-10 shadow-2xl">
                                <tr className="text-[14px] tabular-nums font-bold">
                                    <td className="px-4 py-3 text-white/80 !text-[11px] uppercase tracking-widest">
                                        Tổng cộng trang
                                    </td>
                                    <td className="px-3 py-3 text-white/40">–</td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.Backorder, 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-right text-white/40">–</td>
                                    <td className="px-3 py-3 text-white/40">–</td>
                                    <td className="px-3 py-3 text-center text-white/40">–</td>
                                    <td className="px-3 py-3 text-center">
                                        <span className="mr-3">
                                            {pagedData
                                                .reduce((a, b) => a + (b.QuantityInventory_NB + b.QuantityDC_NB), 0)
                                                .toLocaleString()}
                                            <span className="text-white/50 text-[11px] font-medium ml-0.5">NB</span>
                                        </span>
                                        <span>
                                            {pagedData
                                                .reduce((a, b) => a + (b.QuantityInventory_BB + b.QuantityDC_BB), 0)
                                                .toLocaleString()}
                                            <span className="text-white/50 text-[11px] font-medium ml-0.5">BB</span>
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.DealerInventory, 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        {pagedData.reduce((a, b) => a + b.TotalPO, 0).toLocaleString()}
                                        <span className="text-white/50 text-[11px] font-medium ml-0.5">tổng</span>
                                    </td>
                                    <td className="px-4 py-3 text-right !text-[14px]">
                                        {formatCurrency(
                                            pagedData.reduce((a, b) => a + (b.computed?.boAging?.totalValue || 0), 0),
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        {filteredData.length === 0 && (
                            <div className="p-20 text-center">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                                    <FaIcon className="fas fa-search text-slate-600 text-2xl" />
                                </div>
                                <Typography variant="h3" className="text-slate-600 uppercase tracking-widest">
                                    Không tìm thấy dữ liệu nợ hàng
                                </Typography>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Typography variant="label" className="text-slate-600 !text-[10px]">
                                Đang hiển thị{' '}
                                <span className="text-slate-900 font-black">
                                    {(currentPage - 1) * pageSize + 1} -{' '}
                                    {Math.min(currentPage * pageSize, filteredData.length)}
                                </span>{' '}
                                trong tổng số{' '}
                                <span className="text-slate-900 font-black">
                                    {filteredData.length.toLocaleString()}
                                </span>{' '}
                                SKU nợ hàng
                            </Typography>
                            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                                <Typography variant="label" className="text-slate-500 !text-[10px]">
                                    Dòng/trang:
                                </Typography>
                                <select
                                    value={pageSize}
                                    onChange={e => {
                                        setPageSize(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="bg-white border rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:ring-2 shadow-sm"
                                    style={{ borderColor: 'var(--bo-hairline)' }}
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
                                {Math.ceil(filteredData.length / (pageSize || 25)) > 5 && (
                                    <span className="text-slate-600 px-2">…</span>
                                )}
                            </div>
                            <button
                                disabled={
                                    pageSize <= 0 || currentPage === Math.ceil(filteredData.length / (pageSize || 25))
                                }
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
                <div
                    className="fixed bottom-6 right-6 bg-white shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-4 flex items-center gap-4 z-50"
                    style={{ border: '1px solid var(--bo-hairline)' }}
                >
                    <div
                        className="w-10 h-10 rounded-full animate-spin"
                        style={{ border: '4px solid rgba(168, 133, 75, 0.2)', borderTopColor: 'var(--bo-bronze)' }}
                    ></div>
                    <div>
                        <Typography
                            variant="label"
                            className="font-black block"
                            style={{ color: 'var(--bo-bronze-strong)' }}
                        >
                            ĐANG TÍNH TOÁN DỮ LIỆU
                        </Typography>
                        <Typography variant="body-sm" className="text-slate-600">
                            Vui lòng đợi trong giây lát...
                        </Typography>
                    </div>
                </div>
            )}
        </div>
    );
};
