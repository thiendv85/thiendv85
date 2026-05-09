/**
 * Backtest harness for V16 inventory engine demand prediction.
 *
 * Setup:
 *   - Pulls (snapshot_2026-04, snapshot_2026-05) and (snapshot_2026-03, snapshot_2026-04)
 *     pairs from Supabase. Uses snapshot N's BaseForecast / features as input,
 *     and snapshot N+1's sales_history[11] as the actual demand for the
 *     month that snapshot N predicted.
 *   - Caches dataset to scripts/backtest-data.json on first run.
 *
 * Multi-objective metric (lower is better):
 *   WMAPE          = Σ|pred - actual| / Σ actual                (accuracy)
 *   |bias|         = |Σ(pred - actual) / Σ actual|              (systematic skew)
 *   stockout_rate  = Σ max(0, actual - pred) / Σ actual         (under-forecast severity)
 *   composite      = WMAPE + W_BIAS·|bias| + W_STOCKOUT·stockout_rate
 *
 * Asymmetry: stockout (under-forecast) is heavier weighted than excess
 * (over-forecast) because in distribution business with LT 2-5 months,
 * lost sales / expedite cost > carrying cost.
 *
 * Usage:
 *   tsx scripts/backtest-engine.ts
 *
 * The `predict` function below is the experiment surface. Modify only that
 * function during autoresearch. Each commit = one experiment.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIR_FILES = [join(HERE, 'backtest-pair-03.json'), join(HERE, 'backtest-pair-04.json')];

// ─── Types ──────────────────────────────────────────────────────────────────
// Schema matches what extract-mcp-response.mjs writes (column aliases from SQL).
interface BacktestRow {
    item_code: string;
    lois_group: string;
    base_forecast: number;
    sigma_eff: number;
    cv: number;
    lin_reg_slope: number;
    lin_reg_forecast: number;
    mad: number;
    avg_qty_3m: number;
    avg_qty_6m: number;
    avg_qty_12m: number;
    hist: number[];
    sf: number;        // seasonal factor (current)
    sf_m1: number;     // seasonal factor for M+1
    forecast_eff: number;
    actual_next: number;
}

interface PredictParams {
    applySeasonality: boolean;
    tetWeight: number;
    weatherWeight: number;
}

function loadBacktest(): BacktestRow[] {
    const all: BacktestRow[] = [];
    for (const f of PAIR_FILES) {
        if (!existsSync(f)) {
            throw new Error(`Missing ${f}. Run extract-mcp-response.mjs first.`);
        }
        const rows = JSON.parse(readFileSync(f, 'utf8')) as BacktestRow[];
        all.push(...rows);
    }
    return all;
}

// ─── JS-side SSI: copy of utils/inventoryEngine.ts:calculateSSI ────────────
const TET_DATES: Record<number, { month: number; day: number; length: number }> = {
    2024: { month: 1, day: 8, length: 7 },
    2025: { month: 0, day: 26, length: 7 },
    2026: { month: 1, day: 16, length: 7 },
    2027: { month: 1, day: 5, length: 7 },
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calculateSSI_v0(history: number[], snapshotDate: Date, params: PredictParams): number {
    if (history.length < 12) return 1.0;
    const annualMean = history.reduce((a, b) => a + b, 0) / history.length;
    if (annualMean <= 0) return 1.0;
    const curMonth = snapshotDate.getMonth();
    const h = (i: number) => history[((i % 12) + 12) % 12] || 0;
    const ma3 = (h(curMonth - 1) + h(curMonth) + h(curMonth + 1)) / 3;
    const ma3Ratio = ma3 / annualMean;
    const boostActive = params.tetWeight > 1.0 || params.weatherWeight > 1.0;
    const effectiveThreshold = boostActive ? 1.05 : 1.2;
    if (ma3Ratio <= effectiveThreshold) return 1.0;
    let ssi = Math.min(2.0, ma3Ratio);
    const tet = TET_DATES[snapshotDate.getFullYear()];
    if (tet) {
        const tetStart = new Date(snapshotDate.getFullYear(), tet.month, tet.day);
        const daysDiff = Math.abs((snapshotDate.getTime() - tetStart.getTime()) / MS_PER_DAY);
        if (daysDiff <= 45) ssi *= params.tetWeight || 1.1;
    }
    if (params.weatherWeight > 1.0) ssi *= params.weatherWeight;
    return Math.min(2.5, ssi);
}

// ─── Demand source resolution: copy of inventoryEngine.ts:resolveDemand ─────
function resolveDemand_v0(row: BacktestRow, applySeasonality: boolean): number {
    let baseDemand = 0;
    if (row.base_forecast > 0) baseDemand = row.base_forecast;
    else if (row.avg_qty_3m > 0) baseDemand = row.avg_qty_3m;
    else if (row.avg_qty_6m > 0) baseDemand = row.avg_qty_6m;
    else if (row.avg_qty_12m > 0) baseDemand = row.avg_qty_12m;
    else if (row.hist.length > 0) {
        baseDemand = row.hist.reduce((a, b) => a + b, 0) / row.hist.length;
    }
    if (applySeasonality && row.sf > 0) {
        return baseDemand * row.sf;
    }
    return baseDemand;
}

// ────────────────────────────────────────────────────────────────────────────
// EXPERIMENT SURFACE — modify ONLY this function during autoresearch loop.
// ────────────────────────────────────────────────────────────────────────────
function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function predict(row: BacktestRow): number {
    // V15 — Smooth CV-aware interpolation instead of step thresholds.
    // alpha = weight on base. CV=0 → 0.6 base. CV=2 → 0.1 base. Clamped.
    let base = resolveDemand_v0(row, false);
    // EXP7: tighter cap 3x → 2.5x avg_qty_12m
    if (row.avg_qty_12m > 0) base = Math.min(base, 2.5 * row.avg_qty_12m);

    const a3 = row.avg_qty_3m;
    if (a3 <= 0) return base;

    if (row.cv > 1.2) {
        // EXP5: lower threshold + 0.1/0.9 weights (lean harder on a3 for lumpy)
        const med = median(row.hist);
        return 0.1 * med + 0.9 * a3;
    }
    const alpha = Math.max(0.1, 0.65 - 0.3 * row.cv);
    return alpha * base + (1 - alpha) * a3;
}

// ─── Metric computation ─────────────────────────────────────────────────────
const W_BIAS = 1.0;
const W_STOCKOUT = 1.5;

interface MetricResult {
    wmape: number;
    bias: number;
    absBias: number;
    stockoutRate: number;
    excessRate: number;
    composite: number;
    n: number;
    actualSum: number;
    predSum: number;
    avgError: number;
    skuStockoutPct: number;
}

function computeMetrics(rows: BacktestRow[]): MetricResult {
    let sumAbsErr = 0;
    let sumActual = 0;
    let sumPred = 0;
    let sumSignedErr = 0;
    let sumUnderErr = 0;  // Σ max(0, actual - pred) — stockout severity
    let sumOverErr = 0;   // Σ max(0, pred - actual) — excess severity
    let n = 0;
    let nStockout = 0;    // SKUs where under-prediction > 20% of actual (stockout-prone)
    for (const r of rows) {
        const pred = predict(r);
        if (!Number.isFinite(pred)) continue;
        const actual = r.actual_next;
        const diff = pred - actual;
        sumAbsErr += Math.abs(diff);
        sumSignedErr += diff;
        if (diff < 0) sumUnderErr += -diff;
        else sumOverErr += diff;
        sumActual += actual;
        sumPred += pred;
        if (actual > 0 && pred < 0.8 * actual) nStockout++;
        n++;
    }
    const wmape = sumActual > 0 ? sumAbsErr / sumActual : 0;
    const bias = sumActual > 0 ? sumSignedErr / sumActual : 0;
    const absBias = Math.abs(bias);
    const stockoutRate = sumActual > 0 ? sumUnderErr / sumActual : 0;
    const excessRate = sumActual > 0 ? sumOverErr / sumActual : 0;
    const composite = wmape + W_BIAS * absBias + W_STOCKOUT * stockoutRate;
    return {
        wmape,
        bias,
        absBias,
        stockoutRate,
        excessRate,
        composite,
        n,
        actualSum: sumActual,
        predSum: sumPred,
        avgError: n > 0 ? sumAbsErr / n : 0,
        skuStockoutPct: n > 0 ? nStockout / n : 0,
    };
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
    const rows = loadBacktest();
    const m = computeMetrics(rows);
    console.log(`N: ${m.n}`);
    console.log(`Actual sum: ${m.actualSum.toFixed(0)}`);
    console.log(`Pred sum: ${m.predSum.toFixed(0)}`);
    console.log(`Avg abs err per SKU: ${m.avgError.toFixed(2)}`);
    console.log(`Bias: ${m.bias.toFixed(4)}`);
    console.log(`WMAPE: ${m.wmape.toFixed(6)}`);
    console.log(`Stockout rate (Σ under / Σ actual): ${m.stockoutRate.toFixed(6)}`);
    console.log(`Excess rate   (Σ over  / Σ actual): ${m.excessRate.toFixed(6)}`);
    console.log(`SKU stockout % (pred<0.8·actual):   ${(m.skuStockoutPct * 100).toFixed(2)}%`);
    console.log(`COMPOSITE (W_BIAS=${W_BIAS}, W_STOCKOUT=${W_STOCKOUT}): ${m.composite.toFixed(6)}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
