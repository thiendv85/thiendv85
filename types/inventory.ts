
export const AVAILABLE_BRANDS = ['Kia', 'Mazda', 'Stellantis', 'BMW'] as const;
export type Brand = (typeof AVAILABLE_BRANDS)[number];

export interface SourceProfile {
    id: string;          // unique key, e.g. 'NB', 'BMWASIA'
    brand: Brand;        // brand classification
    name: string;        // display name, e.g. 'Nhật Bản'
    lt: number;          // Lead Time (days)
    sp: number;          // Safety Period (days)
    ssp: number;         // Safety Stock Period (days)
}

export const DEFAULT_SOURCE_PROFILES: SourceProfile[] = [
    { id: 'NB', brand: 'Kia', name: 'Nhật Bản', lt: 90, sp: 30, ssp: 15 },
    { id: 'TL', brand: 'Kia', name: 'Thái Lan', lt: 60, sp: 20, ssp: 10 },
    { id: 'TQ', brand: 'Kia', name: 'Trung Quốc', lt: 75, sp: 25, ssp: 12 },
    { id: 'HQ', brand: 'Kia', name: 'Hàn Quốc', lt: 60, sp: 20, ssp: 10 },
    { id: 'AD', brand: 'Kia', name: 'Ấn Độ', lt: 75, sp: 25, ssp: 12 },
    { id: 'OEM', brand: 'Kia', name: 'OEM chưa xác định', lt: 90, sp: 30, ssp: 15 },
    { id: 'CXD', brand: 'Kia', name: 'Chưa xác định', lt: 90, sp: 30, ssp: 15 },
    { id: 'BMWASIA', brand: 'BMW', name: 'BMW Asia', lt: 60, sp: 15, ssp: 7 },
    { id: 'ML', brand: 'Kia', name: 'Malaysia', lt: 45, sp: 15, ssp: 7 },
];

export interface InventoryFilters {
    search: string;
    priority: 'All' | 'P1' | 'P2' | 'P3';
    costRange: number;
    fobCostRange: number;
    status: 'All' | 'Active' | 'Sleeping' | 'Dead Stock';
    lois: string;
    trend: string;
    specialFilter: 'none' | 'stockout' | 'excess' | 'low_stock' | 'has_po' | 'has_supersession' | 'has_warning';
    showBackorders: boolean;
    debtStatus: string[];
    source: string;
}

export const DEFAULT_FILTERS: InventoryFilters = {
    search: '',
    priority: 'All',
    costRange: 0,
    fobCostRange: 0,
    status: 'All',
    lois: 'All',
    trend: 'All',
    specialFilter: 'none',
    showBackorders: false,
    debtStatus: [],
    source: 'All',
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
    'E': 'Hàng thay thế cũ (Superseded)',
    'N': 'Không bán > 6 tháng',
    'A': 'Không bán 12 - 24 tháng',
    'V': 'Không bán > 24 tháng (Dead)',
    'I': 'Inactive (Ngưng hoạt động)',
};

export interface DealerDetail {
    BranchName: string;
    Showroom: string;
    Qty: number;
}

export interface BackorderDetail {
    ItemCode: string;
    ItemName: string;
    DocDate: string;
    DocNo: string;
    Qty: number;
    Warehouse: string;
    Note?: string;
    Showroom?: string;
    OrderType?: string;
    ETA?: string;
    RawDate?: number;
}

/**
 * MonthlyData — parsed from File B (monthly CSV, uploaded via Settings and cached in Supabase).
 * All fields from the monthly file. ItemCode is the join key with File A (daily).
 * Fields: forecast coefficients, sales avgs, LOIS, sales history (M0-M11),
 * statistical indicators, risk levels, etc.
 */
export interface MonthlyData {
    ItemCode: string;
    ItemName?: string;
    LOISGroup?: string;
    AvgQty3M?: number;
    AvgQty6M?: number;
    AvgQty12M?: number;
    AvgQty24M?: number;
    TrendFlag?: string;
    // Note: SafetyStock / ROP / MaxInventory are CALCULATED by inventoryEngine using LT settings
    // These raw file values are informational only; engine values take precedence.
    SafetyStock_Raw?: number;
    ROPFinal_Raw?: number;
    MaxInventory_High_Raw?: number;
    MaxInventory_Low_Raw?: number;
    MaxInventory_Mid_Raw?: number;
    MOS?: number;
    BaseForecast?: number;
    Forecast_NB?: number;
    Forecast_BB?: number;
    // Sales history months: M0 (oldest/Jan of 12m window) to M11 (newest/last month)
    // Parser normalizes to array [M0..M11] → oldest first
    SalesHistory?: number[];
    // Extended forecast fields
    OrderType?: string;
    BranchGroup?: string;
    Forecast_eff?: number;
    Forecast_M1?: number;
    Forecast_M2?: number;
    Forecast_M3?: number;
    SeasonalityFactor?: number;
    SeasonalityFactor_M1?: number;
    SeasonalityFactor_M2?: number;
    SeasonalityFactor_M3?: number;
    ForecastMethod?: string;
    ForecastMethodDetail?: string;
    TrendAdjMethod?: string;
    BaseForecast_Orig?: number;
    LinRegSlope?: number;
    LinRegForecast?: number;
    Sigma_eff?: number;
    CV?: number;
    AlphaUsed?: number;
    InventoryRiskLevel?: string;
    MAD?: number;
    MAPE?: number;
}

export interface InventoryItem {
    ItemCode: string;
    ItemName: string;
    TypeCar: string;
    LOISGroup: string;
    TrendFlag: string;
    Status: string;
    Note: string;
    SNP: number;
    QuantityInventory_NB: number;
    QuantityInventory_BB: number;
    QuantityDC_NB: number;
    QuantityDC_BB: number;
    Backorder: number;
    Backorder_NB: number;
    Backorder_BB: number;
    DealerInventory: number;
    TotalInventory: number;
    TotalDC: number;
    TotalPO: number;
    TotalSupply: number;
    NetDemand: number;
    SourceId?: string;                      // ID của nguồn hàng (để mapping với Profile)
    BrandName?: string;                     // Tên thương hiệu từ file (ThuongHieu)
    AvgQty3M: number;
    AvgQty6M: number;
    AvgQty12M: number;
    AvgQty24M: number;
    BaseForecast: number;
    Forecast_NB?: number;
    Forecast_BB?: number;
    SalesHistory: number[];
    Pipeline: Record<string, number>;
    Pipeline_NB?: Record<string, number>;
    Pipeline_BB?: Record<string, number>;
    TotalPO_NB?: number;
    TotalPO_BB?: number;
    UnitCost_PP: number;
    UnitCost_FOB: number;

    // Optional/Enriched fields
    DealerBreakdown?: DealerDetail[];
    BackorderBreakdown?: BackorderDetail[];

    computed?: {
        effectiveLT?: number;
        effectiveSP?: number;
        effectiveSSP?: number;
        demandRateDaily: number;
        demandMonthly?: number;        // = demandRateDaily * 30 (from inventoryEngine)
        available: number;
        netAvailable?: number;         // = max(0, available - Backorder) (from inventoryEngine)
        dcQuantity: number;
        rop: number;
        stockMax: number;
        safetyStock: number;
        unitCost: number;
        stockoutRiskFlag: boolean;
        excessQty: number;
        stockValue: number;
        excessValue: number;
        stockoutGapQty: number;
        stockoutGapValue: number;
        mos: number;
        cst: number;
        incomingCurrentMonth: number;
        priorityBucket: 'P1' | 'P2' | 'P3';
        priorityScore: number;
        stockTurnRatio: number;
        fillRate: number;
        capitalEfficiency: number;
        gapOrExcess: number;
        isStopBiz: boolean;
        
        // Statistical Intelligence
        cv: number;                    // Coefficient of Variation
        slope: number;                 // LinReg Slope
        forecastLinReg: number;        // LinReg Forecast for next month
        
        // Tiered Warning System
        warnings: {
            type: 'Critical' | 'Warning' | 'Info';
            code: string;
            message: string;
        }[];

        // Simulation
        simulated?: {
            totalStock: number;
            stockAtDelivery?: number;
            stockoutRiskFlag: boolean;
            excessQty: number;
            excessValue: number;
            stockValue: number;
            stockoutGapQty: number;
            draftQty: number;
            pipelineQty: number;
            boQty?: number;
            boValue?: number;
            totalIncomingValue?: number;
        };

        // Transfer Feature (DRP)
        transfer?: {
            maxNB: number;
            maxBB: number;
            physicalNB: number;
            physicalBB: number;
            incomingNB: number;
            incomingBB: number;
            mosNB: number;
            mosBB: number;
            incomingNB_Month: number;
            incomingBB_Month: number;
            transferNBtoBB: number;
            transferBBtoNB: number;
            suggestedOrderNB: number;
            suggestedOrderBB: number;
        };

        suggestedBO?: number;
        isBOCritical?: boolean;
        snp?: number;
    };
}

export interface OrderingDraft {
    quantities: Record<string, { air: number; sea: number }>;
    notes: Record<string, string>;
}

export interface KittingDefinition {
    SetPartsCode: string;
    SetPartsName: string;
    ItemCode: string;
    ItemNameEng?: string;
    QtyRequired: number;
    ModelCar?: string;
    EngineCode?: string;
    UnitPrice?: number;
}

/**
 * REFINED DEBT STATUS LOGIC
 * Phân loại khả năng cung ứng dựa trên phân tầng nguồn lực (Physical -> Current Month -> Pipeline)
 */
export const getDebtStatus = (item: InventoryItem): string => {
    const bo = Math.max(0, item.Backorder || 0);

    // Nếu không có nợ hàng, trả về trạng thái bình thường ngay lập tức
    if (bo === 0) return 'normal';

    const available = Math.max(0, (item.computed?.available || 0));
    const incomingMonth = Math.max(0, (item.computed?.incomingCurrentMonth || 0));
    const totalPO = Math.max(0, (item.TotalPO || 0));

    // Cấp độ 1: Tồn tại kho (Physical Stock) đủ để Clear nợ
    if (available >= bo) return 'stock_cover';

    // Cấp độ 2: Tồn hiện tại + Hàng về trong tháng đủ để Clear nợ
    if ((available + incomingMonth) >= bo) return 'month_cover';

    // Cấp độ 3: Tổng cung ứng (Tồn + Toàn bộ Pipeline) đủ để Clear nợ
    if ((available + totalPO) >= bo) return 'po_cover';

    // Cấp độ 4: Tổng cung ứng vẫn không đủ (Deficit)
    // Phân biệt: Đã có PO nhưng vẫn thiếu vs. Hoàn toàn chưa có PO
    if (totalPO > 0) return 'deficit_po';

    return 'deficit_no_po';
};

export interface DashboardSettings {
    snapshotDate: string;
    warehouseScope: 'All' | 'NB' | 'BB';
    costBasis: 'PP' | 'FOB';
    demandSource: '3M' | '6M' | '12M';
    params: {
        lt: number;
        sp: number;
        ssp: number;
    };
    sourceProfiles?: SourceProfile[];
}
