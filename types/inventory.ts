// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY TYPES — Core data models + barrel re-exports for backward compat
// ─────────────────────────────────────────────────────────────────────────────

// Re-export all common types (Brand, Filters, Settings, etc.)
export * from './common';

// Re-export ordering types (OrderingDraft, Kitting, Affinity)
export * from './ordering';

// ─────────────────────────────────────────────────────────────────────────────
// CORE INVENTORY TYPES (kept here — they ARE the inventory domain)
// ─────────────────────────────────────────────────────────────────────────────

import type { SourceProfile, LoisProfile } from './common';

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
    BranchCode?: string;
    BranchName?: string;
    /** Receiving branch code from BO file. Used to classify the order's
     *  destination warehouse (NB/BB) when KhoNo or Warehouse alone is unclear. */
    BranchCodeReceipt?: string;
    OrderType?: string;
    TypeCar?: string;
    RowId?: string;
    KhoNo?: string;
    Note?: string;
    Showroom?: string;
    ETA?: string;
    RawDate?: number;
}

export interface BackorderAging {
    qty30: number;   // <= 30 days
    qty60: number;   // 31-60 days
    qty90: number;   // 61-90 days
    qtyOver90: number; // > 90 days
    totalQty: number;
    totalValue: number;
    oldestDebtDays: number; // computed against snapshotDate to match bucket logic
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
        incomingNextMonth?: number;
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
        ssi: number;                   // Seasonal Index (SAA)

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
        boAging?: BackorderAging;
        snp?: number;

        // === Optimal ordering (cost-aware Air=2×Sea, time-phased grid scan) ===
        poIn30d?: number;
        urgentQty?: number;              // Air qty
        reserveQty?: number;             // Sea qty
        urgentTrigger?: 'bridge_to_sea' | 'stockout_unavoidable' | 'none';
        reserveTrigger?: 'below_stockmax' | 'none';
        urgentReason?: string;
        reserveReason?: string;
        orderPriority?: 'urgent_only' | 'reserve_only' | 'both' | 'none';
        stockoutFlag?: boolean;          // I(t)<0 trước LT_air → Air không cứu kịp
        stockoutQty?: number;            // ước thiếu hụt (units)
        capLimited?: boolean;            // airNeed > capAir → multi-cycle, partial fix
        classification?: 'healthy' | 'strained' | 'critical' | 'slow' | 'dead';  // SKU urgency/velocity tier
        ltAir?: number;                  // 22 (BMW) / 35 (khác)
        ltSea?: number;                  // effectiveLT
    };
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

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowLevel {
    level: number;
    approver_ids: string[];
    require_all: boolean;
}

export interface ApprovalWorkflow {
    id: string;
    name: string;
    brand: string | null;
    levels: WorkflowLevel[];
    proposer_ids: string[];
    is_active: boolean;
    created_by: string;
    created_at: string;
}

export type ApprovalStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'unlocked' | 'returned' | 'cancelled' | 'archived';

export interface SnapshotData {
    quantities?: Record<string, { air: number; sea: number }>;
    notes?: Record<string, string>;
    inventory_context?: Array<{
        itemCode: string;
        itemName: string;
        typecar: string;
        loisGroup: string;
        trendFlag: string;
        status: string;
        available: number;
        safetyStock: number;
        rop: number;
        stockMax: number;
        totalPO: number;
        backorder: number;
        dealerInventory: number;
        mos: number;
        runway: number;
        baseForecast: number;
        priorityBucket: string;
        unitCost: number;
        warnings: string[];
        m1Actual: number;
        avgQty3M: number;
        avgQty6M: number;
        avgQty12M: number;
        avgQty24M: number;
        incomingCurrentMonth: number;
        incomingNextMonth?: number;
        cst: number;
        salesHistory: number[];
        available_NB?: number;
        available_BB?: number;
        totalPO_NB?: number;
        totalPO_BB?: number;
        backorder_NB?: number;
        backorder_BB?: number;
        effectiveLT?: number;
        qtyNB?: number;
        qtyBB?: number;
    }>;
    submitted_at: string;
    app_version: string;
    original_quantities?: Record<string, { air: number; sea: number }>;
    storage_path?: string;
    is_compressed?: boolean;
}

export interface ApprovalSummary {
    skuCount: number;   // số SKU thực sự đặt (qty > 0)
    totalQty: number;   // tổng SL hàng (Air + Sea)
    totalValue: number; // giá trị đơn (VND)
}

export interface ApprovalRequest {
    id: string;
    draft_name: string;
    brand: string | null;
    workflow_id: string;
    current_level: number;
    status: ApprovalStatus;
    submitted_by: string;
    submitted_at: string;
    snapshot_data: SnapshotData;
    unlocked_by: string | null;
    unlocked_at: string | null;
    unlock_reason: string | null;
    rejection_reason: string | null;
    returned_reason: string | null;
    version: number;
    deadline: string | null;
    escalated_at: string | null;
    escalated_to: string | null;
    summary?: ApprovalSummary | null;
}

export interface ApprovalAction {
    id: string;
    request_id: string;
    level: number;
    action: 'approved' | 'rejected' | 'commented' | 'returned';
    actor_id: string;
    comment: string | null;
    acted_at: string;
    metadata?: {
        old_status?: ApprovalStatus;
        new_status?: ApprovalStatus;
        old_level?: number;
        new_level?: number;
        changed_fields?: string[];
        version_before?: number;
        version_after?: number;
        reason?: string;
    };
}
