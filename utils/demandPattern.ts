/**
 * Demand Pattern Classification
 * Phân loại pattern nhu cầu theo CV và zero ratio
 */

export type DemandPattern = 'SMOOTH' | 'ERRATIC' | 'INTERMITTENT' | 'LUMPY';

export function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

/**
 * Phân loại demand pattern dựa trên:
 * - Zero ratio: tỷ lệ kỳ bán = 0
 * - CV (Coefficient of Variation): biến động nhu cầu trên các kỳ có bán
 *
 * | Pattern       | Zero Ratio | CV   |
 * |---------------|-----------|------|
 * | SMOOTH        | ≤ 50%     | ≤ 0.75 |
 * | ERRATIC       | ≤ 50%     | > 0.75 |
 * | INTERMITTENT  | > 50%     | ≤ 1.0  |
 * | LUMPY         | > 50%     | > 1.0  |
 */
export function classifyDemandPattern(history: number[]): DemandPattern {
    if (!history || history.length === 0) return 'SMOOTH';

    const zeros = history.filter(x => x === 0).length;
    const zeroRatio = history.length > 0 ? zeros / history.length : 1;
    const nonZero = history.filter(x => x > 0);

    if (nonZero.length === 0) return 'INTERMITTENT'; // all zeros

    const mean = avg(nonZero);
    const cv = mean > 0 ? stdDev(nonZero) / mean : 999;

    if (zeroRatio > 0.5 && cv > 1.0) return 'LUMPY';
    if (zeroRatio > 0.5) return 'INTERMITTENT';
    if (cv > 0.75) return 'ERRATIC';
    return 'SMOOTH';
}

/**
 * Detect anomaly in demand: SPIKE or DROP
 */
export function detectAnomaly(history: number[]): 'NORMAL' | 'SPIKE' | 'DROP' {
    if (!history || history.length < 3) return 'NORMAL';

    const base = history.slice(0, -1);
    const latest = history[history.length - 1] || 0;
    const meanVal = avg(base);
    const sd = stdDev(base);

    if (latest > meanVal + 2.5 * sd && latest > 2) return 'SPIKE';
    if (meanVal > 2 && latest === 0) return 'DROP';
    return 'NORMAL';
}
