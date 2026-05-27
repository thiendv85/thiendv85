// ─────────────────────────────────────────────────────────────────────────────
// COMMON TYPES — Shared across all domains
// ─────────────────────────────────────────────────────────────────────────────

/** App navigation views — single source of truth */
export type View =
    | 'upload'
    | 'dashboard'
    | 'ordering'
    | 'backorder'
    | 'transfer'
    | 'log'
    | 'kitting'
    | 'settings'
    | 'approval-queue'
    | 'report';

export const AVAILABLE_BRANDS = ['Kia', 'Mazda', 'Stellantis', 'BMW'] as const;
export type Brand = (typeof AVAILABLE_BRANDS)[number];

export interface LoisProfile {
    id: string; // Sub-group code (e.g., '1', 'E', 'L1')
    parentGroup: string; // Parent group name (e.g., 'L', 'O', 'U')
    name: string; // Description
    noPlan: boolean; // Stop planning/ordering if true
    alertType: 'none' | 'info' | 'warning' | 'critical';
    targetMOS: number;
    targetExcessPct: number;
}

export interface SourceProfile {
    id: string; // unique key, e.g. 'NB', 'BMWASIA'
    brand: Brand; // brand classification
    name: string; // display name, e.g. 'Nhật Bản'
    lt: number; // Lead Time (days)
    sp: number; // Safety Period (days)
    ssp: number; // Safety Stock Period (days)
    motherGroup?: string; // Parent group name for analytics (e.g. 'Hàn Quốc', 'Ấn Độ')
}

export const DEFAULT_SOURCE_PROFILES: SourceProfile[] = [
    // Kia Profiles
    { id: 'NB', brand: 'Kia', name: 'Nhật Bản', lt: 90, sp: 30, ssp: 15 },
    { id: 'TL', brand: 'Kia', name: 'Thái Lan', lt: 60, sp: 20, ssp: 10 },
    { id: 'TQ', brand: 'Kia', name: 'Trung Quốc', lt: 75, sp: 25, ssp: 12 },
    { id: 'HQ', brand: 'Kia', name: 'Hàn Quốc', lt: 60, sp: 20, ssp: 10 },
    { id: 'AD', brand: 'Kia', name: 'Ấn Độ', lt: 75, sp: 25, ssp: 12 },
    { id: 'OEM', brand: 'Kia', name: 'OEM chưa xác định', lt: 90, sp: 30, ssp: 15 },
    { id: 'CXD', brand: 'Kia', name: 'Chưa xác định', lt: 90, sp: 30, ssp: 15 },
    { id: 'ML', brand: 'Kia', name: 'Malaysia', lt: 45, sp: 15, ssp: 7 },

    // Mazda Profiles
    { id: 'NB', brand: 'Mazda', name: 'Nhật Bản', lt: 90, sp: 35, ssp: 15 },
    { id: 'TL', brand: 'Mazda', name: 'Thái Lan', lt: 60, sp: 25, ssp: 12 },
    { id: 'OEM', brand: 'Mazda', name: 'Nguồn nội địa', lt: 30, sp: 15, ssp: 7 },

    // Stellantis / Peugeot Profiles
    { id: 'EU', brand: 'Stellantis', name: 'Châu Âu', lt: 120, sp: 45, ssp: 20 },
    { id: 'ML', brand: 'Stellantis', name: 'Malaysia', lt: 45, sp: 20, ssp: 10 },

    // BMW Profiles
    { id: 'BMWASIA', brand: 'BMW', name: 'BMW Asia', lt: 60, sp: 15, ssp: 7 },
];

export interface InventoryFilters {
    search: string;
    priority: 'All' | 'P1' | 'P2' | 'P3';
    costRange: number;
    fobCostRange: number;
    status: 'All' | 'Active' | 'Sleeping' | 'Dead Stock';
    lois: string[];
    trend: string;
    specialFilter:
        | 'none'
        | 'stockout'
        | 'critical_stockout'
        | 'excess'
        | 'low_stock'
        | 'has_po'
        | 'has_supersession'
        | 'has_warning'
        | 'has_seasonality';
    showBackorders: boolean;
    debtStatus: string[];
    source: string[];
    onlyAdjusted: boolean;
}

export const DEFAULT_FILTERS: InventoryFilters = {
    search: '',
    priority: 'All',
    costRange: 0,
    fobCostRange: 0,
    status: 'All',
    lois: [],
    trend: 'All',
    specialFilter: 'none',
    showBackorders: false,
    debtStatus: [],
    source: [],
    onlyAdjusted: false,
};

export const COST_RANGES = [
    { label: 'Tất cả (PP)', min: 0, max: Infinity },
    { label: '< 100k', min: 0, max: 100000 },
    { label: '100k - 500k', min: 100000, max: 500000 },
    { label: '500k - 1.5tr', min: 500000, max: 1500000 },
    { label: '1.5tr - 5tr', min: 1500000, max: 5000000 },
    { label: '5tr - 10tr', min: 5000000, max: 10000000 },
    { label: '10tr - 30tr', min: 10000000, max: 30000000 },
    { label: '> 30tr', min: 30000000, max: Infinity },
];

export const FOB_COST_RANGES = [
    { label: 'Tất cả (EURO)', min: 0, max: Infinity },
    { label: '< €5', min: 0, max: 5 },
    { label: '€5 - €20', min: 5, max: 20 },
    { label: '€20 - €60', min: 20, max: 60 },
    { label: '€60 - €200', min: 60, max: 200 },
    { label: '€200 - €400', min: 200, max: 400 },
    { label: '€400 - €1200', min: 400, max: 1200 },
    { label: '> €1200', min: 1200, max: Infinity },
];

export const DEBT_STATUS_OPTIONS = [
    { id: 'normal', label: 'Bình thường' },
    { id: 'stock_cover', label: 'Tồn đủ trả' },
    { id: 'month_cover', label: 'Trả trong tháng' },
    { id: 'po_cover', label: 'PO đủ trả' },
    { id: 'deficit_po', label: 'Thiếu (Có PO)' },
    { id: 'deficit_no_po', label: 'Thiếu (No PO)' },
];

export const LOIS_DESCRIPTIONS: Record<string, string> = {
    '1': '> 300 cái/năm (Fast)',
    '2': '101 - 300 cái/năm',
    '3': '61 - 100 cái/năm',
    '4': '25 - 60 cái/năm',
    '5': '13 - 24 cái/năm',
    '6': '7 - 12 cái/năm',
    '7': '4 - 6 cái/năm',
    '8': '1 - 3 cái/năm (Low)',
    E: 'Hàng thay thế cũ (Superseded)',
    N: 'Không bán > 6 tháng',
    A: 'Không bán 12 - 24 tháng',
    V: 'Không bán > 24 tháng (Dead)',
    I: 'Inactive (Ngưng hoạt động)',
};

export interface DashboardSettings {
    snapshotDate: string;
    warehouseScope: 'All' | 'NB' | 'BB';
    costBasis: 'PP' | 'FOB';
    params: {
        lt: number;
        sp: number;
        ssp: number;
    };
    sourceProfiles?: SourceProfile[];
    loisProfiles?: LoisProfile[];
    seasonalityTuning: {
        useSPD: boolean;
        tetWeight: number;
        weatherWeight: number;
        normalizationMethod?: 'Dynamic' | 'Fixed';
        workingDayFallback?: number;
    };
}
