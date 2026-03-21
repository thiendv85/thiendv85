/**
 * INVENTORY ENGINE — Single Source of Truth
 * ==========================================
 * Tất cả logic tính toán ROP, Max, Excess, Priority, Demand
 * được tập trung tại đây để đảm bảo nhất quán giữa các trang.
 *
 * Fixes addressed:
 *   Bug 1: excessQty trước đây không trừ Backorder → báo dư thừa sai
 *   Bug 2: demandSource setting bị bỏ qua → Max thấp hơn FC
 *   Bug 3: Logic priority/stockout không nhất quán giữa Dashboard và Ordering
 */

import { InventoryItem, SourceProfile } from '../types/inventory';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeParams {
    lt: number;                            // Lead Time (ngày)
    sp: number;                            // Sale Period / Replenishment Period (ngày)
    ssp: number;                           // Safety Stock Period (ngày)
    demandSource: '3M' | '6M' | '12M';    // Nguồn cầu dự phòng khi không có BaseForecast
    warehouseScope: 'All' | 'NB' | 'BB';  // Phạm vi kho
    costBasis: 'PP' | 'FOB';              // Cơ sở tính giá
    snapshotYYMM: string;                  // Tháng snapshot, dạng "YYMM" để match Pipeline keys
    sourceProfiles?: SourceProfile[];      // Danh sách profiles để mapping tự động
}

export interface SimulatedFields {
    totalStock: number;          // Tồn + PO + Draft
    stockAtDelivery: number;     // Tồn dự kiến khi hàng về = Tồn hiện tại - Nợ - Cầu trong LeadTime
    stockoutRiskFlag: boolean;   // Cảnh báo hụt sau khi tính PO+Draft
    excessQty: number;           // Dư thừa sau khi tính PO+Draft (đã trừ BO)
    excessValue: number;
    stockValue: number;
    stockoutGapQty: number;
    draftQty: number;
    pipelineQty: number;
    boQty: number;               // Remaining backorder after simulation
    boValue: number;
    totalIncomingValue: number;  // (PO + Draft) * unitCost
}

export interface ComputedFields {
    // Config params
    effectiveLT: number;
    effectiveSP: number;
    effectiveSSP: number;

    // Core
    demandRateDaily: number;      // Cầu hàng ngày (đvt/ngày)
    demandMonthly: number;        // Cầu hàng tháng (= demandRateDaily * 30)
    available: number;            // Tồn vật lý (OH + DC), KHÔNG trừ BO
    netAvailable: number;         // Tồn vật lý sau khi trừ BO (có thể âm, clamp 0)
    dcQuantity: number;
    unitCost: number;

    // Thresholds
    safetyStock: number;          // SS = daily × ssp
    rop: number;                  // ROP = daily × (lt + ssp)
    stockMax: number;             // Max = ROP + daily × sp

    // Risk Flags
    stockoutRiskFlag: boolean;    // available+PO < ROP (dùng reserve để quyết định order)
    isStopBiz: boolean;           // Mã ngừng đặt hàng

    // Excess (Bug Fix: dùng netAvailable, không phải available thô)
    excessQty: number;            // max(0, netAvailable − Max)
    excessValue: number;

    // Stock Values
    stockValue: number;
    stockoutGapQty: number;
    stockoutGapValue: number;

    // Time Metrics
    mos: number;                  // Months of Stock = available / demandMonthly
    cst: number;                  // Channel Supply Time = (NetDemand + DealerInv) / demandMonthly

    // Pipeline
    incomingCurrentMonth: number; // PO về trong tháng snapshot

    // Priority
    priorityBucket: 'P1' | 'P2' | 'P3';
    priorityScore: number;
    stockTurnRatio: number;
    fillRate: number;
    capitalEfficiency: number;
    gapOrExcess: number;          // Gợi ý đặt hàng SEA (>0 = thiếu, <0 = dư)

    // BO
    suggestedBO: number;          // Gợi ý đặt AIR để clear BO
    isBOCritical: boolean;
    snp: number;

    // Simulation
    simulated?: SimulatedFields;

    // Transfer Feature
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

    // Statistical Intelligence
    cv: number;
    slope: number;
    forecastLinReg: number;

    // Warnings
    warnings: {
        type: 'Critical' | 'Warning' | 'Info';
        code: string;
        message: string;
    }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (Private)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Xác định nhu cầu hàng tháng theo thứ tự ưu tiên:
 * 1. BaseForecast (từ hệ thống dự báo)
 * 2. AvgQty theo demandSource setting
 * 3. Trung bình SalesHistory nếu AvgQty = 0
 * 4. Tối thiểu 0.01 (tránh chia 0)
 */
function resolveDemand(item: InventoryItem, source: '3M' | '6M' | '12M'): number {
    // Tầng 1: BaseForecast ưu tiên cao nhất
    if (item.BaseForecast > 0) return item.BaseForecast;

    // Tầng 2: Dùng theo demandSource setting
    let avg = 0;
    if (source === '3M') {
        avg = item.AvgQty3M || item.AvgQty6M || item.AvgQty12M || 0;
    } else if (source === '6M') {
        avg = item.AvgQty6M || item.AvgQty3M || item.AvgQty12M || 0;
    } else { // 12M
        avg = item.AvgQty12M || item.AvgQty6M || item.AvgQty3M || 0;
    }
    if (avg > 0) return avg;

    // Tầng 3: Trung bình SalesHistory 12 tháng
    if (item.SalesHistory && item.SalesHistory.length > 0) {
        const total = item.SalesHistory.reduce((a, b) => a + b, 0);
        const histAvg = total / item.SalesHistory.length;
        if (histAvg > 0) return histAvg;
    }

    // Tầng 4: Fallback tối thiểu
    return 0.01;
}

/** Tính tồn kho vật lý (OH + DC) theo phạm vi kho */
function resolveAvailable(item: InventoryItem, scope: 'All' | 'NB' | 'BB'): { oh: number; dc: number } {
    if (scope === 'NB') return { oh: item.QuantityInventory_NB || 0, dc: item.QuantityDC_NB || 0 };
    if (scope === 'BB') return { oh: item.QuantityInventory_BB || 0, dc: item.QuantityDC_BB || 0 };
    return {
        oh: (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0),
        dc: (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0),
    };
}

/** Kiểm tra mã có phải ngừng đặt hàng không */
function checkIsStop(item: InventoryItem): boolean {
    return (item.Note || '').toLowerCase().includes('không đặt') || item.Status === 'Dead Stock';
}

/** Xác định mức ưu tiên P0/P1/P2
 *  O4 Fix: dùng reserve (available+PO) thay vì available thô để nhất quán với stockoutRiskFlag
 */
function resolvePriority(
    available: number,
    netAvailable: number,
    reserve: number,
    rop: number,
    mos: number,
    isStop: boolean
): 'P1' | 'P2' | 'P3' {
    if (isStop) return 'P3'; // Mã ngừng đặt → mức thấp nhất
    // P1: Hết hàng hoặc tồn net ≤ 0 (toàn bộ đang nợ BO) hoặc MOS rất thấp
    if (available <= 0 || netAvailable <= 0 || mos < 0.5) return 'P1';
    // P2: reserve (kể cả PO) dưới ROP hoặc MOS thấp
    if (reserve < rop || mos < 1.5) return 'P2';
    return 'P3';
}

/** 
 * Tính hệ số biến thiên (CV = Standard Deviation / Mean)
 */
function calculateCV(history: number[]): number {
    if (!history || history.length < 2) return 0;
    const n = history.length;
    const mean = history.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;
    
    const variance = history.reduce((seq, x) => seq + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean;
}

/**
 * Tính hệ số góc (Slope) và Dự báo (Forecast) bằng hồi quy tuyến tính
 */
function calculateLinReg(history: number[]): { slope: number; forecast: number } {
    if (!history || history.length < 2) return { slope: 0, forecast: 0 };
    
    const n = history.length;
    // x: 0, 1, 2, ..., n-1
    // y: history values
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
        const x = i;
        const y = history[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return { slope: 0, forecast: sumY / n };
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    // Dự báo cho tháng tiếp theo (index n)
    const forecast = Math.max(0, intercept + slope * n);
    
    return { slope, forecast };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tính toán toàn bộ các chỉ số inventory cho một SKU.
 * @param item       - Dữ liệu SKU thô từ CSV
 * @param params     - Tham số cài đặt (LT, SP, SSP, demandSource, warehouseScope, costBasis)
 * @param draftQty   - Số lượng đang dự thảo đặt (AIR + SEA), mặc định 0
 */
export function computeInventory(
    item: InventoryItem,
    params: ComputeParams,
    draftData: { air: number; sea: number } = { air: 0, sea: 0 },
    itemSourceProfile?: SourceProfile
): ComputedFields {
    const draftQty = draftData.air + draftData.sea;

    // ── 0. PARAMS RESOLUTION ────────────────────────────────────────────────
    // Nếu có profile truyền vào (ví dụ khớp từ SourceId), dùng tham số của profile đó.
    // Nếu không, dùng tham số toàn cục từ params.
    const effectiveLT = itemSourceProfile?.lt ?? params.lt;
    const effectiveSP = itemSourceProfile?.sp ?? params.sp;
    const effectiveSSP = itemSourceProfile?.ssp ?? params.ssp;

    // ── 1. DEMAND ──────────────────────────────────────────────────────────
    const demandMonthly = resolveDemand(item, params.demandSource);
    const demandRateDaily = demandMonthly / 30;

    // ── 2. STOCK POSITIONS ─────────────────────────────────────────────────
    const { oh, dc } = resolveAvailable(item, params.warehouseScope);
    const available = oh + dc;                                    // Tồn vật lý thô
    const bo = Math.max(0, item.Backorder || 0);
    const onOrder = Math.max(0, item.TotalPO || 0);

    // Net Available: tồn vật lý sau khi trừ BO đang nợ (clamp ≥ 0)
    const netAvailable = Math.max(0, available - bo);
    // Reserve: tổng supply kể cả PO (dùng để ra quyết định đặt hàng)
    const reserve = available + onOrder;

    const unitCost = (params.costBasis === 'PP' ? item.UnitCost_PP : item.UnitCost_FOB) || 0;
    const snp = Math.max(1, item.SNP || 1);

    // ── 3. THRESHOLDS ──────────────────────────────────────────────────────
    const isStop = checkIsStop(item);
    const safetyStock = isStop ? 0 : demandRateDaily * effectiveSSP;
    const rop = isStop ? 0 : demandRateDaily * (effectiveLT + effectiveSSP);
    const stockMax = isStop ? 0 : rop + demandRateDaily * effectiveSP;

    // ── 3.5 STATISTICAL INTELLIGENCE ─────────────────────────────────────────
    const history = item.SalesHistory || [];
    const cv = calculateCV(history);
    const { slope, forecast } = calculateLinReg(history);

    const warnings: { type: 'Critical' | 'Warning' | 'Info'; code: string; message: string }[] = [];

    // 🔴 Critical
    if (bo > 0 && onOrder === 0) {
        warnings.push({ type: 'Critical', code: 'BO_NO_SUPPLY', message: 'Nợ hàng – Không có PO sắp về' });
    }
    if (rop > stockMax * 1.3 && demandMonthly > 0.1) {
        warnings.push({ type: 'Critical', code: 'ROP_GT_MAX', message: 'Điểm đặt ROP cao bất thường (>1.3x Max)' });
    }

    // 🟡 Warning
    const avg12M = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
    
    // Volatility: Only warn if CV > 0.8 AND avg demand > 5 (ignore noise on ultra-slow items)
    if (cv > 0.8 && avg12M > 5) {
        warnings.push({ type: 'Warning', code: 'HIGH_VOLATILITY', message: 'Nhu cầu biến động rất lớn (CV > 0.8)' });
    }
    // Trend: Only warn if Slope < -2 AND avg demand > 10 (ignore noise on small drops)
    if (slope < -2 && avg12M > 10) {
        warnings.push({ type: 'Warning', code: 'TREND_DECLINE', message: 'Xu hướng giảm mạnh (Slope < -2)' });
    }
    // Forecast drop: Only warn if forecast < 30% of avg AND avg demand > 10
    if (avg12M > 10 && forecast < avg12M * 0.3) {
        warnings.push({ type: 'Warning', code: 'FORECAST_DROP', message: 'Dự báo sụt giảm cực mạnh (> 70%)' });
    }

    // 🔵 Info
    if (item.LOISGroup === '7' || item.LOISGroup === '8' || isStop) {
        warnings.push({ type: 'Info', code: 'NEAR_EOL', message: 'Mã hàng sắp ngừng / Slow-mover' });
    }

    // ── 4. RISK FLAGS ──────────────────────────────────────────────────────
    // stockoutRiskFlag: so reserve (available + PO) với ROP → quyết định có cần đặt không
    const stockoutRiskFlag = !isStop && reserve < rop;

    // ── 5. EXCESS (BUG FIX: dùng netAvailable thay vì available thô) ───────
    // excessQty = phần tồn VẬT LÝ vượt quá Max, sau khi trừ BO đang nợ
    // Ví dụ: available=50, BO=25, Max=30 → netAvailable=25 → excessQty=0 (không dư!)
    const excessQty = isStop ? 0 : Math.max(0, netAvailable - stockMax);
    const excessValue = excessQty * unitCost;

    // ── 6. STOCK VALUE & GAP ───────────────────────────────────────────────
    const stockValue = available * unitCost;
    const stockoutGapQty = stockoutRiskFlag ? Math.max(0, rop - reserve) : 0;
    const stockoutGapValue = stockoutGapQty * unitCost;

    // ── 7. METRICS ─────────────────────────────────────────────────────────
    // O7 Fix: MOS dùng netAvailable (đã trừ BO) thay vì available thô
    // → MOS phản ánh số tháng tồn THỰC SỰ dùng được sau khi trả BO
    const mos = demandMonthly > 0 ? netAvailable / demandMonthly : 0;
    const cst = demandMonthly > 0 ? (item.NetDemand + (item.DealerInventory || 0)) / demandMonthly : 99;

    // ── 8. INCOMING THIS MONTH ─────────────────────────────────────────────
    const snapshotMM = params.snapshotYYMM.slice(2, 4);
    const snapshotYY = params.snapshotYYMM.slice(0, 2);
    const snapshotYYYY = "20" + snapshotYY;
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const targetMonthName = monthNames[parseInt(snapshotMM) - 1];

    const isMatch = (k: string) => {
        const lowerK = k.toLowerCase();
        const cleanK = lowerK.replace(/\D/g, '');
        
        // 1. Match YYMM or YYYYMM or MMYY format (e.g. 2603, 202603, 0326)
        if (cleanK.startsWith(params.snapshotYYMM)) return true;
        if (cleanK.startsWith(snapshotYYYY + snapshotMM)) return true;
        if (cleanK.startsWith(snapshotMM + snapshotYY)) return true;
        
        // 2. Match with month name (e.g. "Mar-26", "26-Mar", "03-Mar")
        if (targetMonthName && lowerK.includes(targetMonthName)) {
            if (lowerK.includes(snapshotYY) || lowerK.includes(snapshotYYYY)) return true;
        }

        // 3. Fallback: contains snapshotYYMM or YYYY-MM
        const snapshotYYYY_MM = snapshotYYYY + "-" + snapshotMM;
        if (lowerK.includes(params.snapshotYYMM) || lowerK.includes(snapshotYYYY_MM)) return true;

        return false;
    };

    const incomingCurrentMonth = item.Pipeline
        ? Object.entries(item.Pipeline).reduce(
            (sum, [k, v]) => isMatch(k) ? sum + v : sum, 0
        )
        : 0;

    // ── 9. PRIORITY ────────────────────────────────────────────────────────
    // O4 Fix: truyền reserve vào resolvePriority
    const priorityBucket = resolvePriority(available, netAvailable, reserve, rop, mos, isStop);

    // ── 10. ORDER SUGGESTIONS ──────────────────────────────────────────────
    let gapOrExcess = 0;
    let suggestedBO = 0;
    const isBOCritical = bo > reserve; // PO không đủ cover BO

    if (!isStop) {
        // Mục tiêu đặt hàng: Đưa quy mô tồn lên mức lý tưởng (Max). 
        // Nếu nợ đơn (BO) lớn hơn cả Max thì nâng mục tiêu lên đủ trả nợ.
        const targetStock = Math.max(stockMax, bo);
        
        if (reserve < targetStock) {
            gapOrExcess = Math.ceil((targetStock - reserve) / snp) * snp;
        }

        // suggestedBO (AIR): Xử lý khẩn cấp khi Hàng sẵn + PO không đủ trả nguyên số nợ
        const boGap = bo - reserve;
        if (boGap > 0) {
            // Nếu lệnh SEA đã cover đủ phần nợ khẩn cấp này rồi thì chỉ cho nhập phần còn lại
            const boAlreadyCoveredBySea = gapOrExcess > 0 ? Math.min(gapOrExcess, boGap) : 0;
            const remainingBo = boGap - boAlreadyCoveredBySea;
            if (remainingBo > 0) {
                suggestedBO = Math.ceil(remainingBo / snp) * snp;
            }
        }
    }

    // ── 11. SIMULATION (với draftQty) ──────────────────────────────────────
    const simTotal = available + onOrder + draftQty;
    // Excess simulation: tồn kỳ vọng sau khi nhận hàng, trừ BO
    const simNetForExcess = Math.max(0, simTotal - bo);
    const simExcessQty = isStop ? 0 : Math.max(0, simNetForExcess - stockMax);
    const simStockoutRisk = !isStop && simTotal < rop;

    // Simulated Backorder: remaining BO if current + pipeline doesn't cover it
    const simBOQty = Math.max(0, bo - simTotal);

    // Simulated Stock at Delivery: what will happen during Lead Time?
    // Stock will drain by (demandRateDaily * effectiveLT). Backorder must also be covered.
    const expectedConsumption = demandRateDaily * effectiveLT;
    const stockAtDelivery = Math.max(0, available - bo) - expectedConsumption;

    const simulated: SimulatedFields = {
        totalStock: simTotal,
        stockAtDelivery,
        stockoutRiskFlag: simStockoutRisk,
        excessQty: simExcessQty,
        excessValue: simExcessQty * unitCost,
        stockValue: simTotal * unitCost,
        stockoutGapQty: simStockoutRisk ? Math.max(0, rop - simTotal) : 0,
        draftQty,
        pipelineQty: onOrder,
        boQty: simBOQty,
        boValue: simBOQty * unitCost,
        totalIncomingValue: (onOrder + draftQty) * unitCost
    };

    // ── 12. TRANSFER & DRP LOGIC (NB/BB) ───────────────────────────────────
    let transferProps;
    const fcNB = item.Forecast_NB || 0;
    const fcBB = item.Forecast_BB || 0;
    const totalFC = fcNB + fcBB;

    // 1. Calculate Target Ratios for each warehouse
    const hasFc = totalFC > 0;
    const ratioNB = hasFc ? fcNB / totalFC : 0.5;
    const ratioBB = hasFc ? fcBB / totalFC : 0.5;

    // Analysis: Physical (excludes BO)
    const physicalNB = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0) - (item.Backorder_NB || 0);
    const physicalBB = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0) - (item.Backorder_BB || 0);
    
    // Incoming Analysis: Total PO
    const totalIncomingNB = (item.TotalPO_NB || 0);
    const totalIncomingBB = (item.TotalPO_BB || 0);

    // Incoming Analysis: PO arriving in Snapshot Month
    const incomingNB_Month = item.Pipeline_NB 
        ? Object.entries(item.Pipeline_NB).reduce((sum, [k, v]) => isMatch(k) ? sum + v : sum, 0)
        : 0;
    const incomingBB_Month = item.Pipeline_BB
        ? Object.entries(item.Pipeline_BB).reduce((sum, [k, v]) => isMatch(k) ? sum + v : sum, 0)
        : 0;

    // Days of stock: USER RULE: MOS excludes PO (only Physical / FC)
    const dailyNB = demandRateDaily * ratioNB;
    const dailyBB = demandRateDaily * ratioBB;

    // Projected days (including arrivals this month) to assess real stock-out risk
    const projectedDaysNB = dailyNB > 0 ? (physicalNB + incomingNB_Month) / dailyNB : 999;
    const projectedDaysBB = dailyBB > 0 ? (physicalBB + incomingBB_Month) / dailyBB : 999;

    // Projected MOS (including arrivals this month) to assess real stock-out risk
    const projectedMosNB = dailyNB > 0 ? (physicalNB + incomingNB_Month) / (dailyNB * 30) : 99;
    const projectedMosBB = dailyBB > 0 ? (physicalBB + incomingBB_Month) / (dailyBB * 30) : 99;

    const daysNB = dailyNB > 0 ? physicalNB / dailyNB : 999;
    const daysBB = dailyBB > 0 ? physicalBB / dailyBB : 999;
    
    // MOS for UI (Physical Stock only, to show current vulnerability)
    const mosNB = dailyNB > 0 ? Math.max(0, physicalNB) / (dailyNB * 30) : 99;
    const mosBB = dailyBB > 0 ? Math.max(0, physicalBB) / (dailyBB * 30) : 99;

    let transferNBtoBB = 0;
    let transferBBtoNB = 0;
    let maxNB = 0;
    let maxBB = 0;
    let suggestedOrderNB = 0;
    let suggestedOrderBB = 0;

    if (!isStop) {
        // Rebalance Trigger
        const tLT = 15;
        // Logic Guard: If both regions are healthy (Projected MOS > 1.5), don't rebalance
        const bothHealthy = projectedMosNB > 1.5 && projectedMosBB > 1.5;
        
        // Use projected days (including pipeline) to check if a region is actually at risk of stockout
        const isAtRisk = !bothHealthy && totalFC > 0 && (projectedDaysNB < effectiveLT + tLT || projectedDaysBB < effectiveLT + tLT);

        if (isAtRisk) {
            const totalPhysical = physicalNB + physicalBB;
            const targetPhysicalNB = totalPhysical * ratioNB;
            const targetPhysicalBB = totalPhysical * ratioBB;

            // Only rebalance from a warehouse that has excess relative to the other's risk
            if (physicalNB > targetPhysicalNB + 0.5 && projectedDaysBB < effectiveLT + tLT) {
                transferNBtoBB = Math.floor(physicalNB - targetPhysicalNB);
            } else if (physicalBB > targetPhysicalBB + 0.5 && projectedDaysNB < effectiveLT + tLT) {
                transferBBtoNB = Math.floor(physicalBB - targetPhysicalBB);
            }
        }

        // Strategic Thresholds
        maxNB = Math.round(stockMax * ratioNB);
        maxBB = Math.round(stockMax * ratioBB);

        const amountToSplit = draftData.sea > 0 ? draftData.sea : gapOrExcess;

        if (amountToSplit > 0) {
            const reserveNB_forOrder = physicalNB + transferBBtoNB - transferNBtoBB + (item.TotalPO_NB || 0);
            const reserveBB_forOrder = physicalBB + transferNBtoBB - transferBBtoNB + (item.TotalPO_BB || 0);

            const gapNB = Math.max(0, maxNB - reserveNB_forOrder);
            const gapBB = Math.max(0, maxBB - reserveBB_forOrder);
            const totalDeficit = gapNB + gapBB;

            if (totalDeficit > 0) {
                const ratioNB_deficit = gapNB / totalDeficit;
                const rawShareNB = amountToSplit * ratioNB_deficit;
                suggestedOrderNB = Math.round(rawShareNB / snp) * snp;
                suggestedOrderBB = amountToSplit - suggestedOrderNB;
            } else {
                const rawShareNB = amountToSplit * ratioNB;
                suggestedOrderNB = Math.round(rawShareNB / snp) * snp;
                suggestedOrderBB = amountToSplit - suggestedOrderNB;
            }
        }
    }

    transferProps = {
        maxNB, maxBB, 
        physicalNB, physicalBB,
        incomingNB: totalIncomingNB, 
        incomingBB: totalIncomingBB, 
        incomingNB_Month,
        incomingBB_Month,
        mosNB, mosBB,
        transferNBtoBB, transferBBtoNB, suggestedOrderNB, suggestedOrderBB
    };

    return {
        effectiveLT,
        effectiveSP,
        effectiveSSP,
        demandRateDaily,
        demandMonthly,
        available,
        netAvailable,
        dcQuantity: dc,
        unitCost,
        safetyStock,
        rop,
        stockMax,
        stockoutRiskFlag,
        isStopBiz: isStop,
        excessQty,
        excessValue,
        stockValue,
        stockoutGapQty,
        stockoutGapValue,
        mos,
        cst,
        incomingCurrentMonth,
        priorityBucket,
        priorityScore: 0,
        stockTurnRatio: 0,
        fillRate: 0,
        capitalEfficiency: 0,
        gapOrExcess,
        suggestedBO,
        isBOCritical,
        snp,
        simulated,
        transfer: transferProps,
        // Statistical Intelligence
        cv,
        slope,
        forecastLinReg: forecast,
        warnings,
    };
}

/**
 * Batch: tính toán cho nhiều SKU cùng lúc
 */
/**
 * Tìm profile phù hợp nhất cho một mã hàng dựa trên Brand và SourceId
 */
export function resolveItemProfile(item: InventoryItem, sourceProfiles?: SourceProfile[]): SourceProfile | undefined {
    if (!sourceProfiles || sourceProfiles.length === 0) return undefined;

    const sourceVal = (item.SourceId || '').trim().toLowerCase();
    const brandVal = (item.BrandName || '').trim().toLowerCase();

    // Priority 1: Khớp cả Thương hiệu và Nguồn hàng
    let profile = sourceProfiles.find(p => {
        const pId = p.id.toLowerCase();
        const pName = p.name.toLowerCase();
        const pBrand = p.brand.toLowerCase();

        const brandMatch = !brandVal || pBrand === brandVal || brandVal.includes(pBrand) || pBrand.includes(brandVal);
        
        // Khớp ID hoặc Name (chấp nhận chứa nhau)
        const sourceMatch = sourceVal && (
            pId === sourceVal || 
            sourceVal.includes(pId) || 
            pName.includes(sourceVal) || 
            sourceVal.includes(pName)
        );

        return brandMatch && sourceMatch;
    });

    // Priority 2: Chỉ khớp Nguồn hàng (nếu Priority 1 thất bại)
    if (!profile && sourceVal) {
        profile = sourceProfiles.find(p => {
            const pId = p.id.toLowerCase();
            const pName = p.name.toLowerCase();
            return pId === sourceVal || sourceVal.includes(pId) || pName.includes(sourceVal) || sourceVal.includes(pName);
        });
    }

    return profile;
}

export function computeInventoryBatch(
    items: InventoryItem[],
    params: ComputeParams,
    draftData?: Record<string, { air: number; sea: number }>
): InventoryItem[] {
    return items.map(item => {
        const itemDraftData = draftData?.[item.ItemCode] || { air: 0, sea: 0 };

        const itemProfile = resolveItemProfile(item, params.sourceProfiles);
        const computed = computeInventory(item, params, itemDraftData, itemProfile);
        return { ...item, computed };
    });
}

/**
 * Helper: tạo ComputeParams từ DashboardSettings
 */
export function makeComputeParams(
    settings: {
        snapshotDate: string;
        warehouseScope: 'All' | 'NB' | 'BB';
        costBasis: 'PP' | 'FOB';
        demandSource: '3M' | '6M' | '12M';
        params: { lt: number; sp: number; ssp: number };
        sourceProfiles?: SourceProfile[];
    }
): ComputeParams {
    const d = settings.snapshotDate;
    const snapshotYYMM = d.slice(2, 4) + d.slice(5, 7);
    return {
        lt: settings.params.lt,
        sp: settings.params.sp,
        ssp: settings.params.ssp,
        demandSource: settings.demandSource,
        warehouseScope: settings.warehouseScope,
        costBasis: settings.costBasis,
        snapshotYYMM,
        sourceProfiles: settings.sourceProfiles,
    };
}
