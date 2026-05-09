/**
 * SUPPLIER ANOMALY DETECTION v2 — composite multi-signal score.
 *
 * v1 was a single-signal classifier (progressRatio = daysOpen / LT) → tier.
 * That under-detected real anomalies because:
 *  - It couldn't distinguish a "slow but normal-for-this-supplier" order from
 *    a genuinely abnormal one — every Mazda order looked CRITICAL while a
 *    same-age Kia order looked CRITICAL too, even though Mazda's median LT
 *    performance is intrinsically slower.
 *  - It ignored downstream impact — a 200d-old debt on a SKU with 6 months
 *    of stock is less urgent than the same debt on a SKU about to stock out.
 *  - It treated each order in isolation — couldn't detect supplier silence
 *    (multiple open orders for one SKU all overdue = systemic, not noise).
 *
 * v2 computes a composite 0-100 score per order from six signals, weighted
 * and combined with an urgency multiplier. Tier is assigned by score band.
 *
 *   score = 100 × urgencyMul × (
 *       0.35 × LT_tardiness        // current daysOverdue/LT signal
 *     + 0.25 × cohort_percentile   // NEW: how slow is this vs SAME-source baseline
 *     + 0.10 × stale_flag          // NEW (was tier override): >180 days = systemic
 *     + 0.15 × stockout_risk       // NEW: amplify if SKU is about to run out
 *     + 0.10 × cluster_penalty     // NEW: 3+ open orders for same SKU all overdue
 *     + 0.05 × volume_weight       // NEW: bigger qty = bigger ops impact
 *   )
 *   urgencyMul = isUrgent(VOR/Khẩn) ? 1.5 : 1.0   // capped so score ≤ 100
 *
 * Tier bands (lower bound):
 *   CRITICAL ≥ 80    HIGH ≥ 60    WARNING ≥ 40    DUE_SOON ≥ 20    NORMAL < 20
 *
 * The cohort and stockout signals require batch context — supply via
 * `AnomalyContext` when calling. Without context, those signals contribute 0
 * (graceful degradation back to v1-equivalent behavior).
 *
 * Weights are exported so a future autoresearch loop can tune them against
 * a target flag-rate distribution or labeled "real anomaly" examples.
 */

import type { BackorderDetail, InventoryItem } from '../types/inventory';

export type OrderAnomaly = 'CRITICAL' | 'HIGH' | 'WARNING' | 'DUE_SOON' | 'NORMAL';

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 180;
const URGENT_MULTIPLIER = 1.5;

/** Weights for each signal in the composite score. Sum should be 1.0. */
export const ANOMALY_WEIGHTS = {
    ltTardiness:    0.35,
    cohortPercentile: 0.25,
    staleFlag:      0.10,
    stockoutRisk:   0.15,
    clusterPenalty: 0.10,
    volumeWeight:   0.05,
} as const;

/** Score thresholds for tier assignment (lower bound of each tier). */
export const ANOMALY_SCORE_THRESHOLDS = {
    CRITICAL: 80,
    HIGH:     60,
    WARNING:  40,
    DUE_SOON: 20,
} as const;

export const ANOMALY_META: Record<OrderAnomaly, { label: string; cls: string; rank: number }> = {
    CRITICAL: { label: 'TRỄ NGHIÊM TRỌNG', cls: 'bg-rose-100 text-rose-700 ring-rose-300',     rank: 0 },
    HIGH:     { label: 'TRỄ NẶNG',         cls: 'bg-rose-50 text-rose-600 ring-rose-200',       rank: 1 },
    WARNING:  { label: 'TRỄ NHẸ',          cls: 'bg-amber-50 text-amber-700 ring-amber-200',   rank: 2 },
    DUE_SOON: { label: 'SẮP ĐẾN HẠN',      cls: 'bg-yellow-50 text-yellow-700 ring-yellow-200', rank: 3 },
    NORMAL:   { label: 'BÌNH THƯỜNG',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', rank: 4 },
};

const ANOMALY_RANK_ORDER: OrderAnomaly[] = ['CRITICAL', 'HIGH', 'WARNING', 'DUE_SOON', 'NORMAL'];

export interface OrderAnomalyResult {
    anomaly: OrderAnomaly;
    score: number;          // 0-100 composite
    daysOpen: number;
    daysOverdue: number;
    progressRatio: number;
    isUrgent: boolean;
    isStale: boolean;
    /** Human-readable signal contributions (largest first) for tooltip. */
    reasons: string[];
}

/**
 * Per-source baseline statistics for cohort-relative scoring. Compute ONCE
 * per render over all open BO orders for the same source profile, then pass
 * to classifyOrderAnomaly via context.
 *   p50 / p90 = quantiles of daysOpen across the cohort
 *   stockoutDaysRemaining = (stock + pipeline) / dailyDemand for this SKU
 *   sameSkuOverdueOrders = count of overdue open orders for the same SKU
 */
export interface AnomalyContext {
    cohortP50?: number;
    cohortP90?: number;
    stockoutDaysRemaining?: number;
    sameSkuOverdueOrders?: number;
    maxQtyInBatch?: number;
}

/** Regex-based date parser — handles DD/MM/YYYY, YYYY-MM-DD, DD/MM/YY,
 *  DD MM YYYY, and trailing time portions. Returns 0 on failure. */
const parseFlexibleDate = (str?: string): number => {
    if (!str) return 0;
    const m = str.match(/(\d{1,4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,4})/);
    if (!m) return 0;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
    let day: number, month: number, year: number;
    if (m[1].length === 4) { year = a; month = b; day = c; }
    else if (m[3].length === 4) { day = a; month = b; year = c; }
    else { day = a; month = b; year = c < 50 ? 2000 + c : 1900 + c; }
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return 0;
    const ts = new Date(year, month - 1, day).getTime();
    return Number.isFinite(ts) ? ts : 0;
};

const isUrgentOrder = (bo: Pick<BackorderDetail, 'OrderType' | 'DocNo'>): boolean => {
    const docPrefix = (bo.DocNo || '').trim().toUpperCase().charAt(0);
    if (docPrefix === 'V' || docPrefix === 'E') return true;
    const t = (bo.OrderType || '').toUpperCase();
    return t.includes('VOR') || t.includes('KHẨN') || t.includes('URGENT') || t.includes('EO') || t.includes('NHANH');
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const tierFromScore = (score: number): OrderAnomaly => {
    if (score >= ANOMALY_SCORE_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (score >= ANOMALY_SCORE_THRESHOLDS.HIGH) return 'HIGH';
    if (score >= ANOMALY_SCORE_THRESHOLDS.WARNING) return 'WARNING';
    if (score >= ANOMALY_SCORE_THRESHOLDS.DUE_SOON) return 'DUE_SOON';
    return 'NORMAL';
};

export function classifyOrderAnomaly(
    bo: Pick<BackorderDetail, 'RawDate' | 'DocDate' | 'OrderType' | 'DocNo' | 'Qty'>,
    effectiveLTDays: number,
    now: number = Date.now(),
    ctx: AnomalyContext = {},
): OrderAnomalyResult {
    const reasons: string[] = [];
    const isUrgent = isUrgentOrder(bo);
    const reparsed = parseFlexibleDate(bo.DocDate);
    const orderTs = reparsed > 0 ? reparsed : (bo.RawDate || 0);
    if (!orderTs) {
        return { anomaly: 'NORMAL', score: 0, daysOpen: 0, daysOverdue: 0, progressRatio: 0, isUrgent, isStale: false, reasons: ['Không có ngày đặt'] };
    }
    if (!effectiveLTDays || effectiveLTDays <= 0) {
        return { anomaly: 'NORMAL', score: 0, daysOpen: 0, daysOverdue: 0, progressRatio: 0, isUrgent, isStale: false, reasons: ['Không có Lead Time'] };
    }

    const daysOpen = Math.max(0, (now - orderTs) / DAY_MS);
    const expectedDelivery = orderTs + effectiveLTDays * DAY_MS;
    const daysOverdue = Math.max(0, (now - expectedDelivery) / DAY_MS);
    const progressRatio = daysOpen / effectiveLTDays;
    const isStale = daysOpen > STALE_DAYS;

    // ── Signals (each 0-1) ───────────────────────────────────────────────────

    // 1. LT-relative tardiness — saturates at 2× LT (anything past 2x is "fully late")
    const ltTardiness = clamp01(daysOverdue / Math.max(1, effectiveLTDays));

    // 2. Cohort percentile — how does this order's daysOpen compare to its source-cohort?
    //    Returns 0 if order is at/below cohort p50 (median), 1 if at/above p90.
    let cohortPercentile = 0;
    if (ctx.cohortP50 !== undefined && ctx.cohortP90 !== undefined && ctx.cohortP90 > ctx.cohortP50) {
        cohortPercentile = clamp01((daysOpen - ctx.cohortP50) / (ctx.cohortP90 - ctx.cohortP50));
    }

    // 3. Stale flag — binary, kicks in past 180d
    const staleFlag = isStale ? 1 : 0;

    // 4. Stockout risk amplifier — 1 if SKU runs out before LT expires, 0 if has plenty
    let stockoutRisk = 0;
    if (ctx.stockoutDaysRemaining !== undefined && ctx.stockoutDaysRemaining > 0) {
        // Days until stockout vs days until LT-expected delivery
        const daysUntilExpected = Math.max(0, (expectedDelivery - now) / DAY_MS);
        // If we'll stock out before this order arrives, amplify
        stockoutRisk = clamp01((daysUntilExpected - ctx.stockoutDaysRemaining) / Math.max(1, effectiveLTDays));
    }

    // 5. Cluster penalty — many same-SKU orders all overdue = supplier silence
    let clusterPenalty = 0;
    if (ctx.sameSkuOverdueOrders !== undefined && ctx.sameSkuOverdueOrders >= 3) {
        clusterPenalty = clamp01(ctx.sameSkuOverdueOrders / 10); // 3 → 0.3, 10+ → 1.0
    }

    // 6. Volume weight — log scale relative to batch max
    let volumeWeight = 0;
    if (ctx.maxQtyInBatch && ctx.maxQtyInBatch > 0 && bo.Qty > 0) {
        volumeWeight = clamp01(Math.log(bo.Qty + 1) / Math.log(ctx.maxQtyInBatch + 1));
    }

    // Composite score
    const w = ANOMALY_WEIGHTS;
    const baseScore = 100 * (
        w.ltTardiness * ltTardiness +
        w.cohortPercentile * cohortPercentile +
        w.staleFlag * staleFlag +
        w.stockoutRisk * stockoutRisk +
        w.clusterPenalty * clusterPenalty +
        w.volumeWeight * volumeWeight
    );
    const score = Math.min(100, baseScore * (isUrgent ? URGENT_MULTIPLIER : 1));
    const anomaly = tierFromScore(score);

    // Build reasons sorted by signal contribution (largest first)
    const contribs: Array<[string, number]> = [
        [`Trễ ${Math.round(daysOverdue)}d (${Math.round(progressRatio * 100)}% LT)`, w.ltTardiness * ltTardiness],
        [`Top ${Math.round(cohortPercentile * 100)}% chậm trong nguồn`,                w.cohortPercentile * cohortPercentile],
        [isStale ? `Đơn quá lâu (${Math.round(daysOpen)}d)` : '',                       w.staleFlag * staleFlag],
        [`Sắp hết hàng — chỉ còn ${Math.round(ctx.stockoutDaysRemaining ?? 0)}d`,        w.stockoutRisk * stockoutRisk],
        [`${ctx.sameSkuOverdueOrders ?? 0} đơn cùng SKU đang trễ (NCC im lặng)`,         w.clusterPenalty * clusterPenalty],
        [`Đơn lớn (${bo.Qty})`,                                                          w.volumeWeight * volumeWeight],
    ];
    for (const [label, contrib] of contribs.sort((a, b) => b[1] - a[1])) {
        if (contrib > 0.02 && label) reasons.push(label);
    }
    if (isUrgent && anomaly !== 'NORMAL') reasons.push('Đơn ưu tiên (×1.5)');

    return { anomaly, score, daysOpen, daysOverdue, progressRatio, isUrgent, isStale, reasons };
}

export interface AnomalyAggregate {
    worst: OrderAnomaly;             // tier of the order with max score
    maxScore: number;                // composite score of the worst-aged order
    maxDaysOpen: number;
    maxDaysOverdue: number;
    maxProgressRatio: number;
    counts: Record<OrderAnomaly, number>;
    abnormalCount: number;
    totalQtyAbnormal: number;
}

export function aggregateAnomalies(
    results: Array<OrderAnomalyResult & { qty?: number }>,
): AnomalyAggregate {
    const counts: Record<OrderAnomaly, number> = {
        CRITICAL: 0, HIGH: 0, WARNING: 0, DUE_SOON: 0, NORMAL: 0,
    };
    let totalQtyAbnormal = 0;
    let maxScore = 0;
    let maxDaysOpen = 0;
    let maxDaysOverdue = 0;
    let maxProgressRatio = 0;
    let worst: OrderAnomaly = 'NORMAL';
    for (const r of results) {
        counts[r.anomaly]++;
        if (r.daysOpen > maxDaysOpen) maxDaysOpen = r.daysOpen;
        if (r.daysOverdue > maxDaysOverdue) maxDaysOverdue = r.daysOverdue;
        if (r.progressRatio > maxProgressRatio) maxProgressRatio = r.progressRatio;
        if (r.score > maxScore) {
            maxScore = r.score;
            worst = r.anomaly;
        }
        if (r.anomaly === 'CRITICAL' || r.anomaly === 'HIGH' || r.anomaly === 'WARNING') {
            totalQtyAbnormal += r.qty || 0;
        }
    }
    if (maxScore === 0) {
        worst = ANOMALY_RANK_ORDER.find(a => counts[a] > 0) ?? 'NORMAL';
    }
    return {
        worst,
        maxScore,
        maxDaysOpen,
        maxDaysOverdue,
        maxProgressRatio,
        counts,
        abnormalCount: counts.CRITICAL + counts.HIGH + counts.WARNING,
        totalQtyAbnormal,
    };
}

const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx];
};

/**
 * Build per-source cohort statistics from a flat list of open BO orders.
 *   key = source profile id (or 'KHÁC' fallback)
 *   value = { p50, p90 } of daysOpen across all orders for that source
 *
 * Call ONCE per render (over enriched/filtered data), then pass per-row
 * via classifyOrderAnomaly's context.
 */
export function buildCohortStats(
    items: Array<{ SourceId?: string; BackorderBreakdown?: BackorderDetail[]; computed?: { effectiveLT?: number } }>,
    now: number = Date.now(),
): Map<string, { p50: number; p90: number; sampleSize: number }> {
    const buckets = new Map<string, number[]>();
    for (const item of items) {
        const key = (item.SourceId || 'KHÁC').toString().trim().toUpperCase() || 'KHÁC';
        const breakdown = item.BackorderBreakdown;
        if (!breakdown || breakdown.length === 0) continue;
        if (!buckets.has(key)) buckets.set(key, []);
        const bucket = buckets.get(key)!;
        for (const bo of breakdown) {
            const ts = parseFlexibleDate(bo.DocDate) || (bo.RawDate || 0);
            if (ts > 0) bucket.push(Math.max(0, (now - ts) / DAY_MS));
        }
    }
    const out = new Map<string, { p50: number; p90: number; sampleSize: number }>();
    for (const [key, arr] of buckets) {
        if (arr.length < 5) continue; // skip tiny cohorts (would skew percentiles)
        const sorted = arr.slice().sort((a, b) => a - b);
        out.set(key, { p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9), sampleSize: sorted.length });
    }
    return out;
}

/** Convenience: classify all orders for one item and aggregate. */
export function classifyItemAnomalies(
    breakdown: BackorderDetail[] | undefined,
    effectiveLTDays: number | undefined,
    now: number = Date.now(),
    ctx: AnomalyContext = {},
): { results: OrderAnomalyResult[]; aggregate: AnomalyAggregate } {
    if (!breakdown || breakdown.length === 0 || !effectiveLTDays || effectiveLTDays <= 0) {
        return {
            results: [],
            aggregate: {
                worst: 'NORMAL',
                maxScore: 0,
                maxDaysOpen: 0,
                maxDaysOverdue: 0,
                maxProgressRatio: 0,
                counts: { CRITICAL: 0, HIGH: 0, WARNING: 0, DUE_SOON: 0, NORMAL: 0 },
                abnormalCount: 0,
                totalQtyAbnormal: 0,
            },
        };
    }
    const maxQtyInBatch = Math.max(...breakdown.map(b => b.Qty || 0));
    // Pre-compute "same-SKU overdue order count" so each per-order classifier sees it
    let overdueCount = 0;
    for (const bo of breakdown) {
        const ts = parseFlexibleDate(bo.DocDate) || (bo.RawDate || 0);
        if (ts > 0) {
            const daysOpen = (now - ts) / DAY_MS;
            if (daysOpen > effectiveLTDays) overdueCount++;
        }
    }
    const enrichedCtx: AnomalyContext = { ...ctx, maxQtyInBatch, sameSkuOverdueOrders: overdueCount };
    const results = breakdown.map(bo => ({
        ...classifyOrderAnomaly(bo, effectiveLTDays, now, enrichedCtx),
        qty: bo.Qty,
    }));
    return { results, aggregate: aggregateAnomalies(results) };
}

/**
 * Compute days-until-stockout for an item: (currentStock + sumPipeline) / (demand/day).
 * Returns Infinity if demand is 0 or supply already huge.
 */
export function stockoutDaysRemaining(item: InventoryItem): number {
    const stock = (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0)
                + (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0);
    const pipelineThis = item.computed?.incomingCurrentMonth || 0;
    const pipelineNext = item.computed?.incomingNextMonth || 0;
    const supply = stock + pipelineThis + pipelineNext;
    const demandMonthly = item.computed?.demandMonthly || 0;
    if (demandMonthly <= 0) return Infinity;
    return (supply / demandMonthly) * 30;
}
