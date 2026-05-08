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
 * Metric:
 *   WMAPE = Σ|pred - actual| / Σ actual
 *   Lower is better.
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
function predict(row: BacktestRow): number {
    // V4 — 60/40 blend BaseForecast + avg_3m. Recent trend is often more reliable
    // than EWMA which has long memory. avg_3m is also closer in time to actual_next.
    const base = resolveDemand_v0(row, false);
    if (row.avg_qty_3m > 0) {
        return 0.6 * base + 0.4 * row.avg_qty_3m;
    }
    return base;
}

// ─── Metric computation ─────────────────────────────────────────────────────
function computeWMAPE(rows: BacktestRow[]): {
    wmape: number;
    bias: number;
    n: number;
    actualSum: number;
    predSum: number;
    avgError: number;
} {
    let sumAbsErr = 0;
    let sumActual = 0;
    let sumPred = 0;
    let sumSignedErr = 0;
    let n = 0;
    for (const r of rows) {
        const pred = predict(r);
        if (!Number.isFinite(pred)) continue;
        const actual = r.actual_next;
        sumAbsErr += Math.abs(pred - actual);
        sumSignedErr += pred - actual;
        sumActual += actual;
        sumPred += pred;
        n++;
    }
    const wmape = sumActual > 0 ? sumAbsErr / sumActual : 0;
    const bias = sumActual > 0 ? sumSignedErr / sumActual : 0;
    return {
        wmape,
        bias,
        n,
        actualSum: sumActual,
        predSum: sumPred,
        avgError: n > 0 ? sumAbsErr / n : 0,
    };
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
    const rows = loadBacktest();
    const m = computeWMAPE(rows);
    console.log(`N: ${m.n}`);
    console.log(`Actual sum: ${m.actualSum.toFixed(0)}`);
    console.log(`Pred sum: ${m.predSum.toFixed(0)}`);
    console.log(`Avg abs err per SKU: ${m.avgError.toFixed(2)}`);
    console.log(`Bias: ${m.bias.toFixed(4)}`);
    console.log(`WMAPE: ${m.wmape.toFixed(6)}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
