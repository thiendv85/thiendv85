/**
 * Safety Stock, ROP, MAX calculation
 * Based on service-level approach with demand variability
 */

import { avg, stdDev } from './demandPattern';

/**
 * Z-score mapping theo LOIS group → Service Level
 *
 * | LOIS        | Service Level | Z     |
 * |-------------|--------------|-------|
 * | L1-L3       | 98%          | 2.05  |
 * | L4-L5       | 95%          | 1.65  |
 * | L6-L7       | 90%          | 1.28  |
 * | O (8,E,N,A,V) | 80%       | 0.84  |
 * | I (Inactive)| 0%           | 0     |
 * | S (Special) | 95%          | 1.65  |
 * | Default     | 95%          | 1.65  |
 */
export function getZScore(loisGroup: string): number {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1', '2', '3'].includes(lois)) return 2.05;   // 98%
    if (['4', '5'].includes(lois)) return 1.65;          // 95%
    if (['6', '7'].includes(lois)) return 1.28;          // 90%
    if (['8', 'E', 'N', 'A', 'V'].includes(lois)) return 0.84; // 80%
    if (lois === 'I') return 0;                           // 0% — inactive
    if (['X', 'Y', 'Z', 'C', 'K', 'D'].includes(lois)) return 1.65; // 95% — special
    return 1.65; // default 95%
}

export function getServiceLevelLabel(loisGroup: string): string {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1', '2', '3'].includes(lois)) return '98%';
    if (['4', '5'].includes(lois)) return '95%';
    if (['6', '7'].includes(lois)) return '90%';
    if (['8', 'E', 'N', 'A', 'V'].includes(lois)) return '80%';
    if (lois === 'I') return '0%';
    return '95%';
}

export function getServiceLevelNumber(loisGroup: string): number {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1', '2', '3'].includes(lois)) return 0.98;
    if (['4', '5'].includes(lois)) return 0.95;
    if (['6', '7'].includes(lois)) return 0.90;
    if (['8', 'E', 'N', 'A', 'V'].includes(lois)) return 0.80;
    if (lois === 'I') return 0;
    return 0.95;
}

export interface SafetyStockResult {
    sigmaD: number;           // demand std dev (monthly)
    sigmaDAdj: number;        // adjusted for forecast error
    z: number;                // Z-score
    serviceLevel: number;     // 0-1
    serviceLevelLabel: string;
    ss: number;               // safety stock (units)
    rop: number;              // reorder point (units)
    stockMax: number;         // maximum stock level (units)
    leadTimeEstimated: boolean;
}

/**
 * Compute Safety Stock, ROP, MAX
 *
 * SS = Z × σd_adj × √(LT_months)
 * ROP = d̄_monthly × LT_months + SS
 * MAX = d̄_monthly × (LT_months + SP_months) + SS
 *
 * @param history - SalesHistory (monthly values)
 * @param forecastError - MAD from forecast engine
 * @param ltDays - Lead time in days (from engine effectiveLT or default)
 * @param spDays - Supply period in days (from engine effectiveSP or default)
 * @param loisGroup - LOIS group for service level mapping
 * @param demandMonthly - computed demand rate (monthly)
 */
export function computeSafetyStock(
    history: number[],
    forecastError: number,
    ltDays: number,
    spDays: number,
    loisGroup: string,
    demandMonthly: number,
): SafetyStockResult {
    const hasLeadTimeData = ltDays > 0;
    const lt = Math.max(ltDays, 30); // minimum 30 days if missing
    const sp = Math.max(spDays, 15);

    const ltMonths = lt / 30;
    const spMonths = sp / 30;

    // σd from historical monthly data
    const sigmaD = history.length >= 3 ? stdDev(history) : 0;

    // Inflate σd by forecast error: σd_adj = √(σd² + MAD²)
    const sigmaDAdj = Math.sqrt(sigmaD ** 2 + forecastError ** 2);

    // Z-score from LOIS mapping
    const z = getZScore(loisGroup);
    const serviceLevel = getServiceLevelNumber(loisGroup);
    const serviceLevelLabel = getServiceLevelLabel(loisGroup);

    // Safety Stock: SS = Z × σd_adj × √LT_months
    // Note: σLT unknown (no lead time history), so σLT = 0 term is omitted
    const ss = z * sigmaDAdj * Math.sqrt(ltMonths);

    // ROP = demand during lead time + safety stock
    const rop = demandMonthly * ltMonths + ss;

    // MAX = demand during (LT + SP) + safety stock
    const stockMax = demandMonthly * (ltMonths + spMonths) + ss;

    return {
        sigmaD,
        sigmaDAdj,
        z,
        serviceLevel,
        serviceLevelLabel,
        ss: Math.max(0, Math.ceil(ss)),
        rop: Math.max(0, Math.ceil(rop)),
        stockMax: Math.max(0, Math.ceil(stockMax)),
        leadTimeEstimated: !hasLeadTimeData,
    };
}
