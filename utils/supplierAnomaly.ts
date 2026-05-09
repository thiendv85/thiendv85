/**
 * SUPPLIER ANOMALY DETECTION — per-order classifier.
 *
 * Replaces the previous SKU-level "supplier status" aggregation that hid which
 * specific orders were problematic. Now every BackorderDetail entry gets a
 * tier (CRITICAL / HIGH / WARNING / DUE_SOON / NORMAL) plus a list of
 * human-readable reasons for the classification.
 *
 * Algorithm (all units in days):
 *   daysOpen        = (now - RawDate)
 *   expectedDelivery = RawDate + effectiveLT
 *   daysOverdue     = max(0, now - expectedDelivery)
 *   progressRatio   = daysOpen / effectiveLT
 *
 * Two threshold sets — urgent order types (VOR / Khẩn / EO) get tighter
 * windows because the business expects faster fulfillment for those:
 *
 *   Tier         | normal LT trigger    | urgent LT trigger
 *   ─────────────┼──────────────────────┼──────────────────────
 *   CRITICAL     | progressRatio > 2.0  | progressRatio > 1.5
 *                |   OR daysOpen > 180  |   OR daysOpen > 180
 *   HIGH         | progressRatio > 1.5  | progressRatio > 1.0
 *   WARNING      | progressRatio > 1.0  | progressRatio > 0.5
 *   DUE_SOON     | progressRatio > 0.8  | progressRatio > 0.3
 *   NORMAL       | otherwise            | otherwise
 *
 * STALE override: any order older than 180d is forced to CRITICAL regardless
 * of LT — likely a lost/abandoned order on the supplier side.
 *
 * Thresholds are exported so the autoresearch harness can tune them later
 * (e.g. to match a target flagging-rate distribution per source profile).
 */

import type { BackorderDetail } from '../types/inventory';

export type OrderAnomaly = 'CRITICAL' | 'HIGH' | 'WARNING' | 'DUE_SOON' | 'NORMAL';

export interface OrderAnomalyResult {
    anomaly: OrderAnomaly;
    daysOpen: number;
    daysOverdue: number;
    progressRatio: number;
    isUrgent: boolean;
    isStale: boolean;
    reasons: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 180;

export const ANOMALY_THRESHOLDS = {
    normal: { critical: 2.0, high: 1.5, warning: 1.0, dueSoon: 0.8 },
    urgent: { critical: 1.5, high: 1.0, warning: 0.5, dueSoon: 0.3 },
} as const;

export const ANOMALY_META: Record<OrderAnomaly, { label: string; cls: string; rank: number }> = {
    CRITICAL: { label: 'TRỄ NGHIÊM TRỌNG', cls: 'bg-rose-100 text-rose-700 ring-rose-300',     rank: 0 },
    HIGH:     { label: 'TRỄ NẶNG',         cls: 'bg-rose-50 text-rose-600 ring-rose-200',       rank: 1 },
    WARNING:  { label: 'TRỄ NHẸ',          cls: 'bg-amber-50 text-amber-700 ring-amber-200',   rank: 2 },
    DUE_SOON: { label: 'SẮP ĐẾN HẠN',      cls: 'bg-yellow-50 text-yellow-700 ring-yellow-200', rank: 3 },
    NORMAL:   { label: 'BÌNH THƯỜNG',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', rank: 4 },
};

const ANOMALY_RANK_ORDER: OrderAnomaly[] = ['CRITICAL', 'HIGH', 'WARNING', 'DUE_SOON', 'NORMAL'];

const isUrgentOrder = (bo: Pick<BackorderDetail, 'OrderType' | 'DocNo'>): boolean => {
    const docPrefix = (bo.DocNo || '').trim().toUpperCase().charAt(0);
    if (docPrefix === 'V' || docPrefix === 'E') return true;
    const t = (bo.OrderType || '').toUpperCase();
    return t.includes('VOR') || t.includes('KHẨN') || t.includes('URGENT') || t.includes('EO') || t.includes('NHANH');
};

export function classifyOrderAnomaly(
    bo: Pick<BackorderDetail, 'RawDate' | 'OrderType' | 'DocNo' | 'Qty'>,
    effectiveLTDays: number,
    now: number = Date.now(),
): OrderAnomalyResult {
    const reasons: string[] = [];
    const isUrgent = isUrgentOrder(bo);
    if (!bo.RawDate) {
        return { anomaly: 'NORMAL', daysOpen: 0, daysOverdue: 0, progressRatio: 0, isUrgent, isStale: false, reasons: ['Không có ngày đặt'] };
    }
    if (!effectiveLTDays || effectiveLTDays <= 0) {
        return { anomaly: 'NORMAL', daysOpen: 0, daysOverdue: 0, progressRatio: 0, isUrgent, isStale: false, reasons: ['Không có Lead Time'] };
    }

    const daysOpen = Math.max(0, (now - bo.RawDate) / DAY_MS);
    const expectedDelivery = bo.RawDate + effectiveLTDays * DAY_MS;
    const daysOverdue = Math.max(0, (now - expectedDelivery) / DAY_MS);
    const progressRatio = daysOpen / effectiveLTDays;
    const isStale = daysOpen > STALE_DAYS;

    const t = isUrgent ? ANOMALY_THRESHOLDS.urgent : ANOMALY_THRESHOLDS.normal;

    let anomaly: OrderAnomaly = 'NORMAL';
    if (isStale) {
        anomaly = 'CRITICAL';
        reasons.push(`Đơn quá lâu (${Math.round(daysOpen)}d) — NCC có thể đã quên`);
    } else if (progressRatio > t.critical) {
        anomaly = 'CRITICAL';
        reasons.push(`Trễ ${Math.round(daysOverdue)}d, ${Math.round(progressRatio * 100)}% LT`);
    } else if (progressRatio > t.high) {
        anomaly = 'HIGH';
        reasons.push(`Trễ ${Math.round(daysOverdue)}d so với LT`);
    } else if (progressRatio > t.warning) {
        anomaly = 'WARNING';
        reasons.push(`Vượt LT ${Math.round(daysOverdue)}d`);
    } else if (progressRatio > t.dueSoon) {
        anomaly = 'DUE_SOON';
        reasons.push(`Sắp đến hạn (còn ${Math.round(effectiveLTDays - daysOpen)}d)`);
    }

    if (isUrgent && anomaly !== 'NORMAL') reasons.push('Đơn ưu tiên (VOR/Khẩn)');

    return { anomaly, daysOpen, daysOverdue, progressRatio, isUrgent, isStale, reasons };
}

export interface AnomalyAggregate {
    worst: OrderAnomaly;
    counts: Record<OrderAnomaly, number>;
    abnormalCount: number;       // = critical + high + warning (not due_soon, not normal)
    totalQtyAbnormal: number;    // sum of Qty across abnormal orders
}

export function aggregateAnomalies(
    results: Array<OrderAnomalyResult & { qty?: number }>,
): AnomalyAggregate {
    const counts: Record<OrderAnomaly, number> = {
        CRITICAL: 0, HIGH: 0, WARNING: 0, DUE_SOON: 0, NORMAL: 0,
    };
    let totalQtyAbnormal = 0;
    for (const r of results) {
        counts[r.anomaly]++;
        if (r.anomaly === 'CRITICAL' || r.anomaly === 'HIGH' || r.anomaly === 'WARNING') {
            totalQtyAbnormal += r.qty || 0;
        }
    }
    const worst = ANOMALY_RANK_ORDER.find(a => counts[a] > 0) ?? 'NORMAL';
    return {
        worst,
        counts,
        abnormalCount: counts.CRITICAL + counts.HIGH + counts.WARNING,
        totalQtyAbnormal,
    };
}

/** Convenience: classify all orders for one item and aggregate. */
export function classifyItemAnomalies(
    breakdown: BackorderDetail[] | undefined,
    effectiveLTDays: number | undefined,
    now: number = Date.now(),
): { results: OrderAnomalyResult[]; aggregate: AnomalyAggregate } {
    if (!breakdown || breakdown.length === 0 || !effectiveLTDays || effectiveLTDays <= 0) {
        return {
            results: [],
            aggregate: { worst: 'NORMAL', counts: { CRITICAL: 0, HIGH: 0, WARNING: 0, DUE_SOON: 0, NORMAL: 0 }, abnormalCount: 0, totalQtyAbnormal: 0 },
        };
    }
    const results = breakdown.map(bo => ({
        ...classifyOrderAnomaly(bo, effectiveLTDays, now),
        qty: bo.Qty,
    }));
    return { results, aggregate: aggregateAnomalies(results) };
}
