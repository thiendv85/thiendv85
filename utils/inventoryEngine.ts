/**
 * INVENTORY ENGINE — Single Source of Truth
 * ==========================================
 * Tất cả logic tính toán ROP, Max, Excess, Priority, Demand
 * được tập trung tại đây để đảm bảo nhất quán giữa các trang.
 */

import { InventoryItem, SourceProfile } from '../types/inventory';
import { prepareSearchCache } from './searchLogic';
import { getZScore } from './safetyStock';
import { TET_DATES, PUBLIC_HOLIDAYS, getDaysInMonth } from './calendar';
import { getVietnameseWorkingDays, getWorkingDaysByLeadTime, buildWorkingDaysCache } from './calendar';

// Re-export imported bindings (gộp để tránh Rollup "is not exported" do duplicate
// re-export pattern khi cùng name vừa import vừa export from cùng module).
export { getVietnameseWorkingDays, getWorkingDaysByLeadTime, buildWorkingDaysCache };
export type { ComputeParams, SimulatedFields, ComputedFields } from './inventoryEngine.types';
import type { ComputeParams, ComputedFields, SimulatedFields } from './inventoryEngine.types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Ngưỡng MOS phân loại "tồn thấp" / P2 priority (tháng) */
export const MOS_LOW_STOCK_THRESHOLD = 1.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a Vietnamese-ERP date string into a timestamp. Mirror of
 * csvParser.parseFlexibleDate — kept inline so the engine can recover
 * oldestDebtDays/aging buckets when BackorderDetail.RawDate is 0 or stale.
 * Uses regex match so trailing time portions and whitespace separators don't
 * break parsing. Returns 0 on failure.
 */
const parseDocDateFallback = (str?: string): number => {
    if (!str) return 0;
    const m = str.match(/(\d{1,4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,4})/);
    if (!m) return 0;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
    let day: number, month: number, year: number;
    if (m[1].length === 4) {
        year = a;
        month = b;
        day = c;
    } else if (m[3].length === 4) {
        day = a;
        month = b;
        year = c;
    } else {
        day = a;
        month = b;
        year = c < 50 ? 2000 + c : 1900 + c;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return 0;
    const ts = new Date(year, month - 1, day).getTime();
    return Number.isFinite(ts) ? ts : 0;
};

// Calendar functions imported from ./calendar.ts
// Working days cache imported from ./calendar.ts

/**
 * PHASE 5b: Data-Driven SSI (Standardized Seasonal Index)
 *
 * Design Principles (B2B context - Dealer pre-stocking):
 * 1. MA3 cluster is the SOLE automatic driver — let the data speak.
 * 2. NO hardcoded month ranges. Tet proximity uses actual TET_DATES registry.
 * 3. Causal weights (Tet/Weather sliders) are OPTIONAL manual boosters
 *    that amplify an already-detected peak, never trigger on their own.
 * 4. Higher threshold (1.5x) for B2B to avoid false positives from lumpy orders.
 */
function calculateSSI(item: InventoryItem, params: ComputeParams): number {
    // Computed for SkuDetail panel display only — never applied to Demand/ROP.
    // (Round 1 autoresearch confirmed JS SSI multiplier double-counts SQL's
    // SeasonalityFactor pre-baked into BaseForecast.)

    const tuning = params.seasonalityTuning || { tetWeight: 1.2, weatherWeight: 1.1 };
    const history = item.SalesHistory || [];
    if (history.length < 12) return 1.0;

    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    // ── 1. MA3 Cluster Detection (Pure Data) ──
    const annualMean = history.reduce((a, b) => a + b, 0) / history.length;
    if (annualMean <= 0) return 1.0;

    // MA3: Current month ± 1 (rolling window of 3 months)
    const h = (i: number) => history[((i % 12) + 12) % 12] || 0;
    const ma3 = (h(curMonth - 1) + h(curMonth) + h(curMonth + 1)) / 3;
    const ma3Ratio = ma3 / annualMean;

    // B2B Threshold: Lowered to 1.2x to be more responsive to moderate seasonal shifts.
    // IfSliders are boosted (>1.0), we allow SSI to activate even if data-driven MA3 is lower (min 1.05 threshold).
    const boostActive = (tuning.tetWeight || 1.0) > 1.0 || (tuning.weatherWeight || 1.0) > 1.0;
    const effectiveThreshold = boostActive ? 1.05 : 1.2;

    if (ma3Ratio <= effectiveThreshold) return 1.0;

    // SSI starts at the MA3 ratio, capped at 2.0x to prevent runaway
    let ssi = Math.min(2.0, ma3Ratio);

    // ── 2. Causal Booster: Tet Proximity (Data from TET_DATES registry) ──
    const tet = TET_DATES[curYear];
    if (tet) {
        const tetStart = new Date(curYear, tet.month, tet.day);
        const daysDiff = Math.abs((now.getTime() - tetStart.getTime()) / MS_PER_DAY);
        // Within 45 days of Tet (before or after) → apply Tet booster
        if (daysDiff <= 45) {
            ssi *= tuning.tetWeight || 1.1;
        }
    }

    // ── 3. Causal Booster: Weather
    if ((tuning.weatherWeight || 1.0) > 1.0) {
        ssi *= tuning.weatherWeight;
    }

    // Final cap at 2.5x to protect working capital (DRP Max ceiling rule)
    return Math.min(2.5, ssi);
}

/**
 * Thử phân giải chuỗi ngày từ tiêu đề OO (vd: "25/05", "OO 03/26") thành Timestamp
 */
function parsePipelineDate(key: string, snapshotYYMM: string): number | null {
    const clean = key
        .toLowerCase()
        .replace(/[^0-9/]/g, '')
        .trim();
    if (!clean) return null;

    const snapMM = parseInt(snapshotYYMM.slice(2, 4));
    const snapYY = parseInt(snapshotYYMM.slice(0, 2));
    const snapYYYY = 2000 + snapYY;

    if (clean.includes('/') && clean.split('/').length === 2) {
        const parts = clean.split('/');
        if (parts[1].length === 2 && parts[1] !== '05' && parseInt(parts[1]) > 12) {
            // Probably MM/YY (legacy check)
        } else {
            const [d, m] = parts.map(n => parseInt(n));
            if (!isNaN(d) && !isNaN(m)) {
                const year = m < snapMM ? snapYYYY + 1 : snapYYYY;
                return new Date(year, m - 1, d).getTime();
            }
        }
    }

    if (clean.includes('/') && clean.split('/').length === 2 && clean.split('/')[1].length === 2) {
        const [m, y] = clean.split('/').map(n => parseInt(n));
        const fullY = 2000 + y;
        return new Date(fullY, m - 1, 1).getTime();
    }

    if (clean.length === 4 && !clean.includes('/')) {
        const y = parseInt(clean.slice(0, 2));
        const m = parseInt(clean.slice(2, 4));
        return new Date(2000 + y, m - 1, 1).getTime();
    }

    if (clean.length === 6 && !clean.includes('/')) {
        const y = parseInt(clean.slice(0, 2));
        const m = parseInt(clean.slice(2, 4));
        const d = parseInt(clean.slice(4, 6));
        return new Date(2000 + y, m - 1, d).getTime();
    }

    return null;
}

/**
 * Tổng qty Pipeline entries có arrival date trong vòng `days` ngày tới.
 * Floor mềm: entries trong quá khứ ≤30d (vd month-key day=1 trễ vài ngày) coi như sắp về.
 */
function computePoArrivingWithinDays(
    pipeline: Record<string, number> | undefined,
    days: number,
    now: Date,
    snapshotYYMM: string,
): number {
    if (!pipeline) return 0;
    const cutoff = now.getTime() + days * MS_PER_DAY;
    const floor = now.getTime() - 30 * MS_PER_DAY;
    let total = 0;
    for (const [k, v] of Object.entries(pipeline)) {
        const ts = parsePipelineDate(k, snapshotYYMM);
        if (ts == null) continue;
        if (ts >= floor && ts <= cutoff) total += v;
    }
    return total;
}

/**
 * Build mảng arrival schedule: [{day, qty}] sorted theo day.
 * Month-key past (day=1 trong tháng cũ ≤30d) → snap to day 0 (coi như có sẵn).
 * Entries quá cũ (>30d quá khứ) → bỏ qua (probably stale data).
 */
function buildArrivalSchedule(
    pipeline: Record<string, number> | undefined,
    now: Date,
    snapshotYYMM: string,
): Array<{ day: number; qty: number }> {
    if (!pipeline) return [];
    const nowTs = now.getTime();
    const entries: Array<{ day: number; qty: number }> = [];
    for (const [k, v] of Object.entries(pipeline)) {
        const ts = parsePipelineDate(k, snapshotYYMM);
        if (ts == null) continue;
        let day = (ts - nowTs) / MS_PER_DAY;
        if (day < -30) continue; // quá cũ
        if (day < 0) day = 0; // snap past → arrived today
        entries.push({ day, qty: v });
    }
    entries.sort((a, b) => a.day - b.day);
    return entries;
}

/**
 * OPTIMAL ORDER — cost-aware (Air = 2× Sea), multi-cycle aware.
 *
 * REASSESS 2026-05-21 (qua thảo luận user):
 *   - Cap Air = max(1 tháng demand, BO_qty) — ưu tiên trả BO, 1m fallback
 *   - Cap Sea = không cap tháng — fill tới stockMax (vì stockout cost 2-5× Air)
 *   - Phân loại SKU theo airNeed: healthy / strained / critical
 *   - Multi-cycle: chấp nhận partial fix, badge cảnh báo critical
 *   - Stockout cost > Air → flag prominent khi cap-limited
 *
 * Bài toán: min cost = 2·a + 1·s, ràng buộc I(t) ≥ 0 ∀ t ∈ [0, LT_sea]
 *   Air = cầm cự [LT_air, LT_sea]. Sea = fill stockMax tại LT_sea.
 *
 * Time-phased: I(t) = available + poBy(t) - bo - demand_d × t
 *   + a contributes from t ≥ LT_air
 *   + s contributes from t ≥ LT_sea
 *
 * Closed-form (grid scan ngày):
 *   stockoutFlag = (min I(t) over [0, LT_air) < 0)
 *   a* = min(airNeed, capAir) where airNeed = -min I(t) over [LT_air, LT_sea]
 *        capAir = max(demandMonthly, bo)
 *   s* = max(0, stockMax - (I(LT_sea) + a))  — no monthly cap
 *
 * Classification (badge color):
 *   critical = airNeed > 3 × demandMonthly
 *   strained = airNeed > demandMonthly
 *   healthy  = otherwise
 */
function computeOptimalOrder(params: {
    available: number;
    onOrder: number;
    bo: number;
    pipeline: Record<string, number> | undefined;
    snapshotYYMM: string;
    now: Date;
    brandName: string;
    effectiveLT: number;
    demandRateDaily: number;
    demandMonthly: number;
    annualSales: number;
    stockMax: number;
    snp: number;
}): {
    airQty: number;
    seaQty: number;
    stockoutFlag: boolean;
    stockoutQty: number;
    capLimited: boolean;
    classification: 'healthy' | 'strained' | 'critical' | 'slow' | 'dead';
    ltAir: number;
    ltSea: number;
    urgentTrigger: 'bridge_to_sea' | 'stockout_unavoidable' | 'none';
    reserveTrigger: 'below_stockmax' | 'none';
    urgentReason: string;
    reserveReason: string;
} {
    const {
        available,
        onOrder,
        bo,
        pipeline,
        snapshotYYMM,
        now,
        brandName,
        effectiveLT,
        demandRateDaily,
        demandMonthly,
        annualSales,
        stockMax,
        snp,
    } = params;
    const roundUp = (x: number) => (snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x));
    const isBMW = (brandName || '').toUpperCase().includes('BMW');
    const ltAir = isBMW ? 22 : 35;
    const ltSea = Math.max(effectiveLT || 75, ltAir + 1);
    const demand_d = Math.max(demandRateDaily, 0);

    // ── Velocity gating: slow/dead movers KHÔNG dùng Air (đắt 4-10×, vô lý cho hàng khó bán) ──
    // Chuẩn ngành FSN. dead: 12 tháng không bán (annualSales=0).
    // slow: TSB demandMonthly < 1/tháng — dùng TSB (đã smooth intermittent) thay raw count.
    const SLOW_MONTHLY_THRESHOLD = 1;
    const isDead = annualSales <= 0;
    const isSlow = !isDead && demandMonthly < SLOW_MONTHLY_THRESHOLD;
    if (isDead || isSlow) {
        // Air = 0 (Air freight không kinh tế). Sea cover tới stockMax (tiny cho slow mover).
        const invPosition = available + onOrder - bo;
        const seaNeedRaw = Math.max(0, stockMax - invPosition);
        const seaQty = seaNeedRaw > 0 ? roundUp(seaNeedRaw) : 0;
        const classification: 'slow' | 'dead' = isDead ? 'dead' : 'slow';
        return {
            airQty: 0,
            seaQty,
            stockoutFlag: false,
            stockoutQty: 0,
            capLimited: false,
            classification,
            ltAir,
            ltSea,
            urgentTrigger: 'none',
            reserveTrigger: seaQty > 0 ? 'below_stockmax' : 'none',
            urgentReason: isDead
                ? `Hàng chết (12 tháng không bán) — không Air, review thủ công`
                : `Slow-mover (TSB ${demandMonthly.toFixed(2)}/tháng < ${SLOW_MONTHLY_THRESHOLD}) — Air không kinh tế, chỉ Sea`,
            reserveReason:
                seaQty > 0
                    ? `${isDead ? 'Dead' : 'Slow'}: inv.position ${Math.round(invPosition)} < MAX ${Math.round(stockMax)} → Sea ${seaQty}`
                    : `${isDead ? 'Dead' : 'Slow'}: inv.position ${Math.round(invPosition)} ≥ MAX, không cần đặt`,
        };
    }

    const schedule = buildArrivalSchedule(pipeline, now, snapshotYYMM);

    // Grid scan ngày 0..ltSea — tìm min I(t) trong 2 cửa sổ
    let cumPo = 0,
        idx = 0;
    let minPreAir = Infinity;
    let minPostAir = Infinity;
    let preAirArgmin = 0,
        postAirArgmin = 0;
    const horizonEnd = Math.ceil(ltSea);
    for (let t = 0; t <= horizonEnd; t++) {
        while (idx < schedule.length && schedule[idx].day <= t) {
            cumPo += schedule[idx].qty;
            idx++;
        }
        const I = available + cumPo - bo - demand_d * t;
        if (t < ltAir) {
            if (I < minPreAir) {
                minPreAir = I;
                preAirArgmin = t;
            }
        } else {
            if (I < minPostAir) {
                minPostAir = I;
                postAirArgmin = t;
            }
        }
    }

    const stockoutFlag = minPreAir < 0;
    const stockoutQty = stockoutFlag ? Math.ceil(-minPreAir) : 0;

    // Air cap = max(1m demand, BO_qty) — ưu tiên trả BO, 1m fallback
    const airNeed = Math.max(0, -minPostAir);
    const capAir = Math.max(demandMonthly, bo);
    const airRaw = Math.min(airNeed, capAir);
    const airQty = airRaw > 0 ? roundUp(airRaw) : 0;
    const capLimited = airNeed > capAir + 0.01;

    // Phân loại SKU
    const classification: 'healthy' | 'strained' | 'critical' =
        airNeed > 3 * demandMonthly ? 'critical' : airNeed > demandMonthly ? 'strained' : 'healthy';

    let urgentTrigger: 'bridge_to_sea' | 'stockout_unavoidable' | 'none' = 'none';
    let urgentReason = '';
    if (stockoutFlag && airQty === 0) {
        urgentTrigger = 'stockout_unavoidable';
        urgentReason = `⚠ Stockout ngày ${Math.round(preAirArgmin)} (trước LT_air ${ltAir}d) — Air không kịp. Thiếu ${stockoutQty}`;
    } else if (airQty > 0) {
        urgentTrigger = stockoutFlag ? 'stockout_unavoidable' : 'bridge_to_sea';
        const reasonParts = [
            `Min I(t) tại ngày ${Math.round(postAirArgmin)} = ${Math.round(minPostAir)}`,
            `Air cần ${Math.round(airNeed)}, cap max(1m=${Math.round(demandMonthly)}, BO=${Math.round(bo)}) = ${Math.round(capAir)} → đặt ${airQty}`,
        ];
        if (capLimited)
            reasonParts.push(`⚠ Cap-limited [${classification}]: thiếu ${Math.round(airNeed - capAir)} (multi-cycle)`);
        if (stockoutFlag) reasonParts.unshift(`⚠ Stockout trước LT_air: thiếu ${stockoutQty} (Air không cứu kịp)`);
        urgentReason = reasonParts.join(' | ');
    } else {
        urgentReason = `Min I(t) [${ltAir}d..${ltSea}d] = ${Math.round(minPostAir)} ≥ 0, không khẩn`;
    }

    // Sea = order-up-to-stockMax. Classic inventory position = available + onOrder - bo + air.
    // KHÔNG trừ demand: stockMax (order-up-to level) đã chứa demand-leadtime → trừ nữa = double-count.
    const invPosition = available + onOrder - bo + airQty;
    const seaNeedRaw = Math.max(0, stockMax - invPosition);
    const seaQty = seaNeedRaw > 0 ? roundUp(seaNeedRaw) : 0;
    const reserveTrigger: 'below_stockmax' | 'none' = seaQty > 0 ? 'below_stockmax' : 'none';
    const reserveReason =
        seaQty > 0
            ? `Inv.position ${Math.round(invPosition)} (tồn ${Math.round(available)} + PO ${Math.round(onOrder)} - BO ${Math.round(bo)} + Air ${airQty}) < MAX ${Math.round(stockMax)} → cần ${Math.round(seaNeedRaw)}`
            : `Inv.position ${Math.round(invPosition)} ≥ MAX ${Math.round(stockMax)}, không cần Sea`;

    return {
        airQty,
        seaQty,
        stockoutFlag,
        stockoutQty,
        capLimited,
        classification,
        ltAir,
        ltSea,
        urgentTrigger,
        reserveTrigger,
        urgentReason,
        reserveReason,
    };
}

/**
 * Khẩn (Air) — đặt nhanh chỉ để CẦM CỰ tới khi Sea về. KHÔNG xây buffer.
 *
 * Triết lý: Air đắt → bù đúng phần âm. Restock dài hạn (fill stockMax) là Sea.
 *
 * FIX 2026-05-17:
 *   FIX 1: proj30d TRỪ demand 30d — so với 0 (0 không chứa demand).
 *   FIX 2: BỎ buffer — Air = deficit trần. Anti-thrash do Air về nhanh.
 *   FIX 3: Trig2 size tới max(SS, 1m demand), KHÔNG ROP.
 *   Quy tắc: so 0/target tuyệt đối → trừ demand; so ROP (đã chứa) → không trừ.
 */
function computeUrgentQty(params: {
    available: number;
    bo: number;
    poIn30d: number;
    safetyStock: number;
    snp: number;
    demandMonthly: number;
}): { qty: number; trigger: 'backorder_uncovered' | 'stockout_imminent' | 'none'; reason: string } {
    const { available, bo, poIn30d, safetyStock, snp, demandMonthly } = params;
    const roundUp = (x: number) => (snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x));
    const realStock = available - bo;
    const demand30d = demandMonthly;
    const proj30d = available + poIn30d - bo - demand30d;

    // Trigger 1: BO + demand vượt tồn + PO30d. deficit trần, KHÔNG buffer.
    if (bo > 0 && proj30d < 0) {
        const deficit = -proj30d;
        return {
            qty: roundUp(deficit),
            trigger: 'backorder_uncovered',
            reason: `BO ${bo}: tồn ${Math.round(available)} + PO30d ${Math.round(poIn30d)} - demand 1m ${Math.round(demand30d)} = thiếu ${Math.round(deficit)} (cầm cự, Sea fill MAX)`,
        };
    }

    // Trigger 2: sắp stockout, không PO30d cứu. target lean = max(SS, 1m).
    const target = Math.max(safetyStock, demandMonthly);
    if (bo === 0 && realStock < target && poIn30d <= 0) {
        const need = target - realStock;
        return {
            qty: roundUp(need),
            trigger: 'stockout_imminent',
            reason: `Tồn ${Math.round(realStock)} < target ${Math.round(target)} (max[SS ${Math.round(safetyStock)}, 1m ${Math.round(demandMonthly)}]), không PO30d cứu`,
        };
    }

    return {
        qty: 0,
        trigger: 'none',
        reason:
            bo > 0
                ? `BO ${bo} được cover: tồn ${Math.round(available)} + PO30d ${Math.round(poIn30d)} - demand 1m ${Math.round(demand30d)} >= 0`
                : `Tồn ${Math.round(realStock)} >= target ${Math.round(Math.max(safetyStock, demandMonthly))}, không khẩn`,
    };
}

/**
 * Dự trữ (Sea) — fill tới stockMax. Baseline NetDemand + urgentQty (future state).
 * Anti-double-count: KHÔNG cộng lại bo (đã trừ trong NetDemand) / urgent đã tính.
 */
function computeReserveQty(params: {
    netDemand: number;
    urgentQty: number;
    stockMax: number;
    snp: number;
    demandMonthly: number;
    maxOrderMonths?: number;
}): { qty: number; trigger: 'below_stockmax' | 'none'; reason: string } {
    const { netDemand, urgentQty, stockMax, snp, demandMonthly, maxOrderMonths = 4 } = params;
    const roundUp = (x: number) => (snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x));
    const futureStock = netDemand + urgentQty;
    const cap = demandMonthly * maxOrderMonths;

    if (futureStock >= stockMax) {
        return {
            qty: 0,
            trigger: 'none',
            reason: `Future stock ${Math.round(futureStock)} >= MAX ${Math.round(stockMax)}, không cần dự trữ`,
        };
    }

    const need = stockMax - futureStock;
    const capped = Math.min(need, cap);
    return {
        qty: roundUp(capped),
        trigger: 'below_stockmax',
        reason: `Future stock ${Math.round(futureStock)} < MAX ${Math.round(stockMax)}, cần thêm ${Math.round(Math.min(need, cap))}`,
    };
}

function classifyOrderPriority(
    urgentQty: number,
    reserveQty: number,
): 'urgent_only' | 'reserve_only' | 'both' | 'none' {
    if (urgentQty > 0 && reserveQty > 0) return 'both';
    if (urgentQty > 0) return 'urgent_only';
    if (reserveQty > 0) return 'reserve_only';
    return 'none';
}

// Types exported from ./inventoryEngine.types.ts

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Tuned via two autoresearch rounds on 2 months of historical snapshots
 * (2026-03/04 vs 2026-04/05 actuals, n=2126).
 *
 * Round 1 (single-objective WMAPE): 0.699 → 0.385 (-45%).
 * Round 2 (multi-objective composite = WMAPE + |bias| + 1.5·stockout_rate):
 *   v17 baseline 0.682 → v18 winner 0.678 (-0.5%).
 *   - WMAPE: 0.385 → 0.383
 *   - |bias|: 0.037 → 0.036
 *   - stockout_rate: 0.174 → 0.173
 *
 * Findings (results-multi.tsv on autoresearch/may08):
 *  - SQL's SeasonalityFactor pre-multiplies BaseForecast already; second
 *    JS-side seasonal layer hurts accuracy. → ignore seasonality flag.
 *  - Outlier cap 2.5× AvgQty12M (round 2 tightened from 3×).
 *  - Lumpy threshold cv>1.2 with 0.1/0.9 median/a3 blend (round 2 lowered
 *    from 1.5 / 0.2/0.8 — leans harder on recent for lumpy).
 *  - Smooth CV-aware interpolation: alpha = max(0.1, 0.65 - 0.3·CV).
 *  - Stockout buffer (×(1+0.1·cv)), trend slope, P75, alpha shifts —
 *    all regressed under multi-objective scoring.
 *
 * Stockout asymmetry rationale (W_STOCKOUT=1.5 in metric): in a distribution
 * business with LT 2-5 months, lost-sales / expedite cost > carrying cost,
 * so the metric penalizes under-forecast 1.5× harder than over-forecast.
 */
function resolveDemand(item: InventoryItem): number {
    let baseDemand = 0;
    if (item.BaseForecast > 0) baseDemand = item.BaseForecast;
    else if (item.AvgQty3M > 0) baseDemand = item.AvgQty3M;
    else if (item.AvgQty6M > 0) baseDemand = item.AvgQty6M;
    else if (item.AvgQty12M > 0) baseDemand = item.AvgQty12M;
    else if (item.SalesHistory && item.SalesHistory.length > 0) {
        const total = item.SalesHistory.reduce((a, b) => a + b, 0);
        baseDemand = total / item.SalesHistory.length || 0;
    }

    // Outlier cap: prevent EWMA from over-reacting to one-month spikes.
    // Tightened 3x → 2.5x via multi-objective autoresearch (composite -0.5%).
    if (item.AvgQty12M > 0) {
        baseDemand = Math.min(baseDemand, 2.5 * item.AvgQty12M);
    }

    const a3 = item.AvgQty3M || 0;
    if (a3 <= 0) return baseDemand;

    const cv = (item as any).CV || 0;
    // Lumpy items: lower threshold cv>1.2 (was 1.5) + 0.1/0.9 (was 0.2/0.8).
    // Multi-objective autoresearch tuning — leans harder on recent for lumpy.
    if (cv > 1.2) {
        const med = median(item.SalesHistory || []);
        return 0.1 * med + 0.9 * a3;
    }
    // Smooth CV-aware blend: more variability → lean more on recent
    const alpha = Math.max(0.1, 0.65 - 0.3 * cv);
    return alpha * baseDemand + (1 - alpha) * a3;
}

function resolveAvailable(item: InventoryItem, scope: 'All' | 'NB' | 'BB'): { oh: number; dc: number } {
    if (scope === 'NB') return { oh: item.QuantityInventory_NB || 0, dc: item.QuantityDC_NB || 0 };
    if (scope === 'BB') return { oh: item.QuantityInventory_BB || 0, dc: item.QuantityDC_BB || 0 };
    return {
        oh: (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0),
        dc: (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0),
    };
}

function checkIsStop(
    item: InventoryItem,
    loisProfiles?: import('../types/inventory').LoisProfile[],
): { isStop: boolean; alertType?: string } {
    // 1. Manual check from note or status
    const manualStop = (item.Note || '').toLowerCase().includes('không đặt') || item.Status === 'Dead Stock';
    if (manualStop) return { isStop: true, alertType: 'critical' };

    // 2. LOIS Group configuration check
    if (loisProfiles && item.LOISGroup) {
        const id = item.LOISGroup.trim().toUpperCase().substring(0, 2);
        const profile = loisProfiles.find(p => p.id.toUpperCase() === id || p.id === item.LOISGroup);
        if (profile) {
            return { isStop: profile.noPlan, alertType: profile.alertType };
        }
    }

    return { isStop: false };
}

function resolvePriority(
    available: number,
    onOrder: number,
    bo: number,
    rop: number,
    demandMonthly: number,
    isStop: boolean,
): 'P1' | 'P2' | 'P3' {
    if (isStop) return 'P3';
    const netReserve = available + onOrder - bo;
    const nrMos = demandMonthly > 0 ? netReserve / demandMonthly : 0;
    if (available <= 0 || netReserve < 0 || nrMos < 0.2) return 'P1';
    if (available < bo || netReserve < rop || nrMos < MOS_LOW_STOCK_THRESHOLD) return 'P2';
    return 'P3';
}

function calculateCV(history: number[]): number {
    if (!history || history.length < 2) return 0;
    const n = history.length;
    const mean = history.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;
    const variance = history.reduce((seq, x) => seq + Math.pow(x - mean, 2), 0) / n;
    return Math.sqrt(variance) / mean;
}

function calculateLinReg(history: number[]): { slope: number; forecast: number } {
    if (!history || history.length < 2) return { slope: 0, forecast: 0 };
    const n = history.length;
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += history[i];
        sumXY += i * history[i];
        sumX2 += i * i;
    }
    const den = n * sumX2 - sumX * sumX;
    if (den === 0) return { slope: 0, forecast: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / den;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, forecast: Math.max(0, intercept + slope * n) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function computeInventory(
    item: InventoryItem,
    params: ComputeParams,
    draftData: { air: number; sea: number } = { air: 0, sea: 0 },
    itemProfileResult?: { profile?: SourceProfile; isFallback?: boolean; fallbackReason?: string },
    wdCache?: Map<number, number>,
): ComputedFields {
    const draftQty = draftData.air + draftData.sea;
    const profile = itemProfileResult?.profile;
    const effectiveLT = profile?.lt ?? params.lt;
    const effectiveSP = profile?.sp ?? params.sp;
    const effectiveSSP = profile?.ssp ?? params.ssp;

    const demandMonthly = resolveDemand(item);
    const isZeroDemand = demandMonthly <= 0;

    /**
     * UNIFIED SAA FORMULA — autoresearch tuned 2026-05-08.
     * `demandMonthly` already incorporates seasonality (via SQL SeasonalityFactor
     * baked into BaseForecast) and a CV-aware blend with AvgQty3M (see
     * resolveDemand). Applying SSI on top double-counts seasonal effect — see
     * results.tsv exp 1-2: dropping the JS SSI multiplier improved WMAPE -42%.
     * SSI is computed for downstream display/SkuDetail but NOT applied here.
     */
    const anchorDays = 26;
    const ssi = calculateSSI(item, params); // kept for SkuDetail panel, not applied
    const demandRateDaily = demandMonthly / anchorDays;
    const now = params.snapshotDate ? new Date(params.snapshotDate) : new Date();

    const { oh, dc } = resolveAvailable(item, params.warehouseScope);
    const available = oh + dc;
    const bo = Math.max(0, item.Backorder || 0);
    const onOrder = Math.max(0, item.TotalPO || 0);
    const netAvailable = Math.max(0, available - bo);
    const reserve = available + onOrder;
    const unitCost = (params.costBasis === 'PP' ? item.UnitCost_PP : item.UnitCost_FOB) || 0;
    const snp = Math.max(1, item.SNP || 1);
    const { isStop, alertType } = checkIsStop(item, params.loisProfiles);

    // Synchronize Lead Time (Calendar) with Sales Schedule (Working Days)
    // Use pre-built cache for O(1) lookup when available (batch path), fall back to per-call computation
    const workingDaysInLT = wdCache
        ? (wdCache.get(effectiveLT) ?? getWorkingDaysByLeadTime(effectiveLT, now))
        : getWorkingDaysByLeadTime(effectiveLT, now);
    const workingDaysInSP = wdCache
        ? (wdCache.get(effectiveSP) ?? getWorkingDaysByLeadTime(effectiveSP, now))
        : getWorkingDaysByLeadTime(effectiveSP, now);

    /**
     * Safety stock — proper Z×√(σ²·LT + d²·σ_LT²) formula.
     *
     * Replaces the prior time-based proxy `demandRateDaily × WD(SSP)` which
     * ignored demand variability entirely (lumpy CV>1.5 SKUs got the same SS
     * as smooth CV<0.3 SKUs). For LT 2-5 months in this distribution business,
     * variability is the dominant SS driver — formula now uses:
     *   - σ_d  = item.Sigma_eff  (computed by SQL on 12-month history)
     *   - LT   = effectiveLT in months (per-source profile or default)
     *   - σ_LT = params.sigmaLT (default 0.2 = 20% CV on lead time)
     *   - Z    = LOIS-tier mapping (98% L1-L3, 95% L4-L5, 90% L6-L7, 80% L8/N/C)
     *
     * This compensates for the +19% bias buffer that the old double-count
     * seasonal formula was implicitly providing (see results.tsv).
     *
     * `effectiveSSP` is exposed in ComputedFields for UI (SimulationLab default)
     * but no longer participates in ROP/MAX calculation.
     */
    const sigmaD = (item as any).Sigma_eff || 0;
    const sigmaLT = params.sigmaLT ?? 0.2;
    const ltMonths = workingDaysInLT / 26;
    const z = getZScore(item.LOISGroup || '');
    const safetyStock =
        isStop || isZeroDemand
            ? 0
            : Math.max(
                  0,
                  z * Math.sqrt(sigmaD * sigmaD * ltMonths + demandMonthly * demandMonthly * sigmaLT * sigmaLT),
              );
    // ROP = expected demand during lead time + safety stock
    const rop = isStop || isZeroDemand ? 0 : demandRateDaily * workingDaysInLT + safetyStock;
    // MAX = ROP + supply-period coverage (review-cycle buffer)
    const stockMax = isStop || isZeroDemand ? 0 : rop + demandRateDaily * workingDaysInSP;

    const history = item.SalesHistory || [];
    const cv = calculateCV(history);
    const { slope, forecast } = calculateLinReg(history);

    const warnings: any[] = [];
    if (bo > 0 && onOrder === 0)
        warnings.push({ type: 'Critical', code: 'BO_NO_SUPPLY', message: 'Nợ hàng – Không có PO sắp về' });
    if (itemProfileResult?.isFallback)
        warnings.push({ type: 'Warning', code: 'SOURCE_FALLBACK', message: itemProfileResult.fallbackReason });

    // LOIS-based alert
    if (alertType && alertType !== 'none') {
        const typeMap: Record<string, 'Critical' | 'Warning' | 'Info'> = {
            critical: 'Critical',
            warning: 'Warning',
            info: 'Info',
        };
        const id = (item.LOISGroup || '').trim().toUpperCase().substring(0, 2);
        const desc = params.loisProfiles?.find(p => p.id.toUpperCase() === id || p.id === item.LOISGroup)?.name;
        warnings.push({
            type: typeMap[alertType] || 'Info',
            code: 'LOIS_ALERT',
            message: `Cảnh báo theo nhóm LOIS (${item.LOISGroup})${desc ? ' - ' + desc : ''}`,
        });
    }

    // Seasonality Tuning Logic
    if (history.length >= 12) {
        const now = new Date();
        now.setDate(1);
        const startMonthIndex = (now.getMonth() - 1 - (history.length - 1)) % 12;
        const normalizedStartMonth = (startMonthIndex + 12) % 12;

        const useSPD = params.seasonalityTuning?.useSPD !== false;
        const normalizedHistory = history.map((val, i) => {
            if (!useSPD) return val;
            const d = new Date(now);
            d.setMonth(now.getMonth() - 1 - (history.length - 1 - i));
            const actualMonth = d.getMonth();
            const actualYear = d.getFullYear();
            const days = getVietnameseWorkingDays(actualMonth, actualYear);
            return val / days;
        });

        const spdAvg = new Array(12).fill(0);
        const spdCount = new Array(12).fill(0);
        normalizedHistory.forEach((spd, i) => {
            const actualMonth = (normalizedStartMonth + i) % 12;
            spdAvg[actualMonth] += spd;
            spdCount[actualMonth]++;
        });

        const overallMeanSPD = spdAvg.reduce((a, b) => a + b, 0) / history.length || 0.001;
        const getSPD = (m: number) => spdAvg[m] / (spdCount[m] || 1);
        const ma3Relative = new Array(12).fill(0).map((_, i) => {
            const clusterSPD = (getSPD((i + 11) % 12) + getSPD(i) + getSPD((i + 1) % 12)) / 3;
            return clusterSPD / overallMeanSPD;
        });

        const currentMonth = now.getMonth();
        const nextMonth = (currentMonth + 1) % 12;
        const monthAfterNext = (currentMonth + 2) % 12;

        const isPeakIdx = (m: number) => {
            let threshold = 1.3;
            if (params.seasonalityTuning) {
                if (m === 0 || m === 1) threshold /= params.seasonalityTuning.tetWeight;
            }
            return ma3Relative[m] > threshold;
        };

        if (demandMonthly > 10 && (isPeakIdx(nextMonth) || isPeakIdx(monthAfterNext))) {
            const peakMonth = isPeakIdx(nextMonth) ? nextMonth : monthAfterNext;
            const yearOfPeak = peakMonth < currentMonth ? now.getFullYear() + 1 : now.getFullYear();
            const daysInPeak = getVietnameseWorkingDays(peakMonth, yearOfPeak);
            const holidayContext = daysInPeak < 22 ? ` (Số ngày làm việc ít: ${daysInPeak})` : '';

            warnings.push({
                type: 'Warning',
                code: 'SEASONAL_UPCOMING',
                message: `Sắp đến cụm cao điểm (Tháng ${peakMonth + 1})${holidayContext} – Cần đặt trước ${Math.ceil(effectiveLT / 30) + 1} tháng`,
            });
        }
    }

    const stockoutRiskFlag = !isStop && reserve < rop;
    const excessQty = isStop ? 0 : Math.max(0, netAvailable - stockMax);
    const mos = demandMonthly > 0 ? netAvailable / demandMonthly : 0;
    const cst = demandMonthly > 0 ? (item.NetDemand + (item.DealerInventory || 0)) / demandMonthly : 99;

    // T.NÀY / T.SAU dùng **lịch hôm nay**, không phải snapshotDate. Nguyên nhân:
    // snapshotDate là ngày data được upload (có thể cũ vài tháng), trong khi PO trong Pipeline
    // là forward-looking — user quan tâm "PO sắp về tháng nào theo lịch hiện tại".
    const today = new Date();
    const currMM = today.getMonth() + 1;
    const currYY = today.getFullYear() % 100;
    const nextDate = new Date(today);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextMM = nextDate.getMonth() + 1;
    const nextYY = nextDate.getFullYear() % 100;

    // Pipeline header format: `OO YYMM[XX]` where MM is the arrival month. We match by MM
    // primarily and tolerate ±1y drift on YY for stale-year-tag tolerance. "Chưa Invoice"
    // (no parseable date) is excluded from both buckets.
    const isMatchCurr = (k: string) => {
        const ts = parsePipelineDate(k, params.snapshotYYMM);
        if (!ts) return false;
        const d = new Date(ts);
        if (d.getMonth() + 1 !== currMM) return false;
        const yy = d.getFullYear() % 100;
        return Math.abs(yy - currYY) <= 1;
    };

    const isMatchNext = (k: string) => {
        const ts = parsePipelineDate(k, params.snapshotYYMM);
        if (!ts) return false;
        const d = new Date(ts);
        if (d.getMonth() + 1 !== nextMM) return false;
        const yy = d.getFullYear() % 100;
        return Math.abs(yy - nextYY) <= 1;
    };

    const incomingCurrentMonth = item.Pipeline
        ? Object.entries(item.Pipeline).reduce((sum, [k, v]) => (isMatchCurr(k) ? sum + v : sum), 0)
        : 0;
    const incomingNextMonth = item.Pipeline
        ? Object.entries(item.Pipeline).reduce((sum, [k, v]) => (isMatchNext(k) ? sum + v : sum), 0)
        : 0;
    const priorityBucket = resolvePriority(available, onOrder, bo, rop, demandMonthly, isStop);

    // === Optimal ordering: cost-aware (Air = 2× Sea), time-phased grid scan ===
    const poIn30d = computePoArrivingWithinDays(item.Pipeline, 30, today, params.snapshotYYMM);
    let urgentQty = 0,
        reserveQty = 0;
    let urgentTrigger: 'bridge_to_sea' | 'stockout_unavoidable' | 'none' = 'none';
    let reserveTrigger: 'below_stockmax' | 'none' = 'none';
    let urgentReason = '',
        reserveReason = '';
    let stockoutFlag = false,
        stockoutQty = 0,
        capLimited = false;
    let classification: 'healthy' | 'strained' | 'critical' | 'slow' | 'dead' = 'healthy';
    let ltAir = 35,
        ltSea = effectiveLT;

    if (!isStop && !isZeroDemand) {
        const annualSales = (item.SalesHistory || []).reduce((a, b) => a + b, 0);
        const optimal = computeOptimalOrder({
            available,
            onOrder,
            bo,
            pipeline: item.Pipeline,
            snapshotYYMM: params.snapshotYYMM,
            now: today,
            brandName: item.BrandName || '',
            effectiveLT,
            demandRateDaily,
            demandMonthly,
            annualSales,
            stockMax,
            snp,
        });
        urgentQty = optimal.airQty;
        reserveQty = optimal.seaQty;
        urgentTrigger = optimal.urgentTrigger;
        reserveTrigger = optimal.reserveTrigger;
        urgentReason = optimal.urgentReason;
        reserveReason = optimal.reserveReason;
        stockoutFlag = optimal.stockoutFlag;
        stockoutQty = optimal.stockoutQty;
        capLimited = optimal.capLimited;
        classification = optimal.classification;
        ltAir = optimal.ltAir;
        ltSea = optimal.ltSea;
    }

    const orderPriority = classifyOrderPriority(urgentQty, reserveQty);
    // Backward-compat: code cũ chưa migrate vẫn đọc suggestedBO/gapOrExcess
    const suggestedBO = urgentQty;
    const gapOrExcess = reserveQty;

    // DRP / Transfer NB-BB
    let transferProps;
    const fcNB = item.Forecast_NB || 0;
    const fcBB = item.Forecast_BB || 0;
    const totalFC = fcNB + fcBB;
    const ratioNB = totalFC > 0 ? fcNB / totalFC : 0.5;
    const ratioBB = totalFC > 0 ? fcBB / totalFC : 0.5;
    const physicalNB = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0) - (item.Backorder_NB || 0);
    const physicalBB = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0) - (item.Backorder_BB || 0);
    const incomingNB_Month = item.Pipeline_NB
        ? Object.entries(item.Pipeline_NB).reduce((sum, [k, v]) => (isMatchCurr(k) ? sum + v : sum), 0)
        : 0;
    const incomingBB_Month = item.Pipeline_BB
        ? Object.entries(item.Pipeline_BB).reduce((sum, [k, v]) => (isMatchCurr(k) ? sum + v : sum), 0)
        : 0;

    // ── DRP Multi-Echelon Allocation Algorithm ──────────────────────────
    // Step 1: Target stock per warehouse (demand-weighted)
    const maxNB = Math.round(stockMax * ratioNB);
    const maxBB = Math.round(stockMax * ratioBB);

    // Step 2: Reserve position per warehouse = physical + pipeline - backorders
    const poNB = item.TotalPO_NB || 0;
    const poBB = item.TotalPO_BB || 0;
    const boNB = item.Backorder_NB || 0;
    const boBB = item.Backorder_BB || 0;
    const reserveNB = physicalNB + poNB; // physicalNB already subtracted boNB
    const reserveBB = physicalBB + poBB; // physicalBB already subtracted boBB

    // Step 3: Gap per warehouse (how much each needs to reach target)
    const rawGapNB = Math.max(0, maxNB - reserveNB);
    const rawGapBB = Math.max(0, maxBB - reserveBB);
    const excessNB = Math.max(0, reserveNB - maxNB);
    const excessBB = Math.max(0, reserveBB - maxBB);

    // Step 4: Inter-warehouse transfer (move excess from one to deficit of other)
    let transferNBtoBB = 0;
    let transferBBtoNB = 0;
    if (excessNB > 0 && rawGapBB > 0) {
        transferNBtoBB = Math.min(excessNB, rawGapBB);
        transferNBtoBB = Math.ceil(transferNBtoBB / snp) * snp;
    } else if (excessBB > 0 && rawGapNB > 0) {
        transferBBtoNB = Math.min(excessBB, rawGapNB);
        transferBBtoNB = Math.ceil(transferBBtoNB / snp) * snp;
    }

    // Step 5: Remaining gap after transfer = need to order from supplier
    const gapAfterTransferNB = Math.max(0, rawGapNB - transferBBtoNB);
    const gapAfterTransferBB = Math.max(0, rawGapBB - transferNBtoBB);

    // Step 6: Allocate total gapOrExcess (SEA suggestion) proportionally
    // Use gap-weighted allocation to prioritize the warehouse that needs more
    let sugOrderNB = 0;
    let sugOrderBB = 0;
    if (!isStop && !isZeroDemand && gapOrExcess > 0) {
        const totalGapAfterTransfer = gapAfterTransferNB + gapAfterTransferBB;
        if (totalGapAfterTransfer > 0) {
            // Proportional to each warehouse's remaining need
            const allocRatioNB = gapAfterTransferNB / totalGapAfterTransfer;
            const allocRatioBB = gapAfterTransferBB / totalGapAfterTransfer;
            sugOrderNB = Math.ceil((gapOrExcess * allocRatioNB) / snp) * snp;
            sugOrderBB = Math.ceil((gapOrExcess * allocRatioBB) / snp) * snp;
            // Ensure total doesn't exceed gapOrExcess due to rounding
            const totalAllocated = sugOrderNB + sugOrderBB;
            if (totalAllocated > gapOrExcess + snp) {
                // Reduce the larger allocation
                if (sugOrderNB >= sugOrderBB) {
                    sugOrderNB = Math.max(0, gapOrExcess - sugOrderBB);
                } else {
                    sugOrderBB = Math.max(0, gapOrExcess - sugOrderNB);
                }
            }
        } else {
            // Both warehouses at/above target — fallback to forecast ratio
            sugOrderNB = Math.ceil((gapOrExcess * ratioNB) / snp) * snp;
            sugOrderBB = Math.ceil((gapOrExcess * ratioBB) / snp) * snp;
            const totalAllocated = sugOrderNB + sugOrderBB;
            if (totalAllocated > gapOrExcess + snp) {
                if (sugOrderNB >= sugOrderBB) {
                    sugOrderNB = Math.max(0, gapOrExcess - sugOrderBB);
                } else {
                    sugOrderBB = Math.max(0, gapOrExcess - sugOrderNB);
                }
            }
        }
    }

    const mosNB = demandRateDaily * ratioNB > 0 ? physicalNB / (demandRateDaily * ratioNB * 30) : 99;
    const mosBB = demandRateDaily * ratioBB > 0 ? physicalBB / (demandRateDaily * ratioBB * 30) : 99;

    transferProps = {
        maxNB,
        maxBB,
        physicalNB,
        physicalBB,
        incomingNB: poNB,
        incomingBB: poBB,
        mosNB,
        mosBB,
        incomingNB_Month,
        incomingBB_Month,
        transferNBtoBB,
        transferBBtoNB,
        suggestedOrderNB: sugOrderNB,
        suggestedOrderBB: sugOrderBB,
    };

    const simTotalStock = available + onOrder + draftQty;
    const simStockoutRiskFlag = !isStop && simTotalStock < rop;
    const simExcessQty = isStop ? 0 : Math.max(0, simTotalStock - stockMax);
    const simBOQty = Math.max(0, bo - simTotalStock);
    const simBOValue = simBOQty * unitCost;

    const simulated: SimulatedFields = {
        totalStock: simTotalStock,
        stockAtDelivery: available + onOrder,
        stockoutRiskFlag: simStockoutRiskFlag,
        excessQty: simExcessQty,
        excessValue: simExcessQty * unitCost,
        stockValue: simTotalStock * unitCost,
        stockoutGapQty: simStockoutRiskFlag ? Math.max(0, rop - simTotalStock) : 0,
        draftQty,
        pipelineQty: onOrder,
        boQty: simBOQty,
        boValue: simBOValue,
        totalIncomingValue: (onOrder + draftQty) * unitCost,
    };

    // Aging Calculation (New)
    const boAging: import('../types/inventory').BackorderAging = {
        qty30: 0,
        qty60: 0,
        qty90: 0,
        qtyOver90: 0,
        totalQty: 0,
        totalValue: 0,
        oldestDebtDays: 0,
    };

    if (item.BackorderBreakdown && item.BackorderBreakdown.length > 0) {
        // Aging is measured against TODAY (real wall clock), not the snapshot
        // export date. Reason: an operator looking at this dashboard is asking
        // "how old is this debt RIGHT NOW so I can chase the supplier today".
        const todayTs = Date.now();
        let maxDaysOld = 0;
        item.BackorderBreakdown.forEach(boItem => {
            // ALWAYS prefer recomputing from DocDate string. Older snapshot uploads
            // can leave RawDate=0 (parser miss) OR set to a stale/wrong value (e.g.
            // upload-time timestamp). The DocDate string is the ground truth from
            // the CSV — parse it fresh every time. Only fall back to RawDate when
            // DocDate is empty or unparseable.
            const reparsed = parseDocDateFallback(boItem.DocDate);
            const docTs = reparsed > 0 ? reparsed : boItem.RawDate || 0;
            if (docTs > 0) {
                const daysOld = Math.max(0, Math.floor((todayTs - docTs) / MS_PER_DAY));
                if (daysOld <= 30) boAging.qty30 += boItem.Qty;
                else if (daysOld <= 60) boAging.qty60 += boItem.Qty;
                else if (daysOld <= 90) boAging.qty90 += boItem.Qty;
                else boAging.qtyOver90 += boItem.Qty;
                if (daysOld > maxDaysOld) maxDaysOld = daysOld;
            } else {
                // Truly no parseable date — bucket as unknown (kept in qty30 to preserve totalQty)
                // but DO NOT contribute to maxDaysOld.
                boAging.qty30 += boItem.Qty;
            }
            boAging.totalQty += boItem.Qty;
        });
        boAging.totalValue = boAging.totalQty * unitCost;
        boAging.oldestDebtDays = maxDaysOld;
    }

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
        excessValue: excessQty * unitCost,
        stockValue: available * unitCost,
        stockoutGapQty: stockoutRiskFlag ? Math.max(0, rop - reserve) : 0,
        stockoutGapValue: (stockoutRiskFlag ? Math.max(0, rop - reserve) : 0) * unitCost,
        mos,
        cst,
        incomingCurrentMonth,
        incomingNextMonth,
        priorityBucket,
        priorityScore: 0,
        stockTurnRatio: 0,
        fillRate: 0,
        capitalEfficiency: 0,
        gapOrExcess,
        suggestedBO,
        isBOCritical: bo > reserve,
        snp,
        ssi,
        // === Optimal ordering fields (cost-aware Air=2×Sea, time-phased) ===
        poIn30d,
        urgentQty,
        reserveQty,
        urgentTrigger,
        reserveTrigger,
        urgentReason,
        reserveReason,
        orderPriority,
        stockoutFlag,
        stockoutQty,
        capLimited,
        classification,
        ltAir,
        ltSea,
        boAging, // Include aging in computed fields
        transfer: transferProps,
        cv,
        slope,
        forecastLinReg: forecast,
        warnings,
        simulated,
    };
}

export function resolveItemProfile(
    item: InventoryItem,
    sourceProfiles?: SourceProfile[],
): { profile?: SourceProfile; isFallback?: boolean; fallbackReason?: string } {
    if (!sourceProfiles || sourceProfiles.length === 0) return {};
    const sId = (item.SourceId || '').toLowerCase();
    const brand = (item.BrandName || '').toLowerCase();

    // 1. Precise Match (ID + Brand)
    const exact = sourceProfiles.find(p => p.id.toLowerCase() === sId && p.brand.toLowerCase() === brand);
    if (exact) return { profile: exact };

    // 2. Brand-Specific Fallback: Use Max Lead Time of the same brand
    const sameBrandProfiles = sourceProfiles.filter(p => p.brand.toLowerCase() === brand);
    if (sameBrandProfiles.length > 0) {
        // Pick the profile with the highest Lead Time as a conservative fallback for that brand (User requirement)
        const brandFallback = sameBrandProfiles.reduce((max, p) => (p.lt > max.lt ? p : max), sameBrandProfiles[0]);
        return {
            profile: brandFallback,
            isFallback: true,
            fallbackReason: `Dùng LT cao nhất của ${item.BrandName || 'thương hiệu'}`,
        };
    }

    // 3. Absolute Fallback: Default to General profile (GEN) or first profile if Brand is completely unknown
    const generalProfile = sourceProfiles.find(p => p.id.toUpperCase() === 'GEN') || sourceProfiles[0];
    return {
        profile: generalProfile,
        isFallback: true,
        fallbackReason: brand ? `Không tìm thấy profile cho ${brand}` : 'Dùng profile chung',
    };
}

export function computeInventoryBatch(items: InventoryItem[], params: ComputeParams, draftData?: any): InventoryItem[] {
    // Build working days cache ONCE for entire batch — anchored to snapshot date
    const wdCache = buildWorkingDaysCache(params.snapshotDate ? new Date(params.snapshotDate) : new Date());
    const computed = items.map(item => ({
        ...item,
        computed: computeInventory(
            item,
            params,
            draftData?.[item.ItemCode],
            resolveItemProfile(item, params.sourceProfiles),
            wdCache,
        ),
    }));

    // PHASE 6: Prepare Search Cache off-main-thread (Worker)
    // This offloads ~300-600ms of string processing from the UI thread for 50K items.
    return prepareSearchCache(computed) as InventoryItem[];
}

export function makeComputeParams(settings: any): ComputeParams {
    const sDate = settings.snapshotDate || new Date().toISOString().split('T')[0];
    return {
        lt: settings.params.lt,
        sp: settings.params.sp,
        ssp: settings.params.ssp,
        warehouseScope: settings.warehouseScope,
        costBasis: settings.costBasis,
        snapshotYYMM: sDate.replace(/-/g, '').substring(2, 6),
        snapshotDate: sDate,
        sourceProfiles: settings.sourceProfiles,
        loisProfiles: settings.loisProfiles,
        seasonalityTuning: {
            useSPD: settings.seasonalityTuning?.useSPD ?? true,
            tetWeight: settings.seasonalityTuning?.tetWeight ?? 1.2,
            weatherWeight: settings.seasonalityTuning?.weatherWeight ?? 1.1,
            normalizationMethod: settings.seasonalityTuning?.normalizationMethod ?? 'Fixed',
            workingDayFallback: settings.seasonalityTuning?.workingDayFallback ?? 26,
        },
    };
}
