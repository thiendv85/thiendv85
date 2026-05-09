/**
 * LT-horizon backtest for V16 inventory engine.
 *
 * The default 1-month backtest validates "predict for the next month".
 * In real ordering, demand must be predicted over LT months (LT 2-5 here),
 * because an order placed at month N with LT=k arrives at end of N+k and
 * stock must cover months N+1..N+k.
 *
 * Engine uses flat monthly extrapolation: cumulative_pred(LT) = predict() × LT.
 * This script measures how well that approximation holds over LT=1 and LT=2.
 *
 * Data:
 *   - Inputs: scripts/backtest-pair-03.json (snapshot 2026-03 features, n=1073)
 *   - Actuals: scripts/lt-actuals.json — sh[10] (March) + sh[11] (April) of
 *     snapshot 2026-05's sales_history.
 *
 * Constraints:
 *   - Only LT=1, LT=2 testable with current 3 monthly_snapshots in DB.
 *     LT≥3 requires snapshot 2026-06+ (will accrue over time).
 *
 * Metric: same multi-objective composite as backtest-engine.ts.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Row {
    item_code: string;
    base_forecast: number;
    cv: number;
    avg_qty_3m: number;
    avg_qty_6m: number;
    avg_qty_12m: number;
    hist: number[];
}

interface Actual {
    m1: number;
    m2: number;
}

const W_BIAS = 1.0;
const W_STOCKOUT = 1.5;

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Mirror utils/inventoryEngine.ts:resolveDemand (v18 winner). Keep in sync.
function predict(row: Row): number {
    let base = 0;
    if (row.base_forecast > 0) base = row.base_forecast;
    else if (row.avg_qty_3m > 0) base = row.avg_qty_3m;
    else if (row.avg_qty_6m > 0) base = row.avg_qty_6m;
    else if (row.avg_qty_12m > 0) base = row.avg_qty_12m;
    else if (row.hist.length > 0) base = row.hist.reduce((a, b) => a + b, 0) / row.hist.length;

    if (row.avg_qty_12m > 0) base = Math.min(base, 2.5 * row.avg_qty_12m);

    const a3 = row.avg_qty_3m;
    if (a3 <= 0) return base;

    if (row.cv > 1.2) {
        const med = median(row.hist);
        return 0.1 * med + 0.9 * a3;
    }
    const alpha = Math.max(0.1, 0.65 - 0.3 * row.cv);
    return alpha * base + (1 - alpha) * a3;
}

interface Metrics {
    lt: number;
    n: number;
    actualSum: number;
    predSum: number;
    wmape: number;
    bias: number;
    absBias: number;
    stockoutRate: number;
    excessRate: number;
    composite: number;
    skuStockoutPct: number;
}

function computeForLT(rows: Row[], actualMap: Map<string, Actual>, lt: number): Metrics {
    let sumAbsErr = 0;
    let sumActual = 0;
    let sumPred = 0;
    let sumSignedErr = 0;
    let sumUnderErr = 0;
    let sumOverErr = 0;
    let n = 0;
    let nStockout = 0;
    for (const r of rows) {
        const a = actualMap.get(r.item_code);
        if (!a) continue;
        const monthlyPred = predict(r);
        if (!Number.isFinite(monthlyPred)) continue;
        const cumPred = monthlyPred * lt;
        const cumActual = lt === 1 ? a.m1 : a.m1 + a.m2;
        const diff = cumPred - cumActual;
        sumAbsErr += Math.abs(diff);
        sumSignedErr += diff;
        if (diff < 0) sumUnderErr += -diff;
        else sumOverErr += diff;
        sumActual += cumActual;
        sumPred += cumPred;
        if (cumActual > 0 && cumPred < 0.8 * cumActual) nStockout++;
        n++;
    }
    const wmape = sumActual > 0 ? sumAbsErr / sumActual : 0;
    const bias = sumActual > 0 ? sumSignedErr / sumActual : 0;
    const absBias = Math.abs(bias);
    const stockoutRate = sumActual > 0 ? sumUnderErr / sumActual : 0;
    const excessRate = sumActual > 0 ? sumOverErr / sumActual : 0;
    return {
        lt,
        n,
        actualSum: sumActual,
        predSum: sumPred,
        wmape,
        bias,
        absBias,
        stockoutRate,
        excessRate,
        composite: wmape + W_BIAS * absBias + W_STOCKOUT * stockoutRate,
        skuStockoutPct: n > 0 ? nStockout / n : 0,
    };
}

function fmt(m: Metrics): string {
    return [
        `LT=${m.lt}:`,
        `  N=${m.n}  actualSum=${m.actualSum.toFixed(0)}  predSum=${m.predSum.toFixed(0)}`,
        `  WMAPE=${m.wmape.toFixed(4)}  Bias=${m.bias.toFixed(4)}  |Bias|=${m.absBias.toFixed(4)}`,
        `  Stockout=${m.stockoutRate.toFixed(4)}  Excess=${m.excessRate.toFixed(4)}  SKU stockout%=${(m.skuStockoutPct * 100).toFixed(1)}%`,
        `  COMPOSITE=${m.composite.toFixed(6)}`,
    ].join('\n');
}

async function main() {
    const rows = JSON.parse(readFileSync(join(HERE, 'backtest-pair-03.json'), 'utf8')) as Row[];
    const actuals = JSON.parse(readFileSync(join(HERE, 'lt-actuals.json'), 'utf8')) as Array<{
        item_code: string;
        m1: string | number;
        m2: string | number;
    }>;
    const actualMap = new Map(actuals.map(a => [a.item_code, { m1: Number(a.m1), m2: Number(a.m2) }]));

    console.log(`Loaded ${rows.length} input rows, ${actualMap.size} actuals.`);
    console.log('');

    const r1 = computeForLT(rows, actualMap, 1);
    const r2 = computeForLT(rows, actualMap, 2);

    console.log(fmt(r1));
    console.log('');
    console.log(fmt(r2));
    console.log('');
    console.log('Composite delta (LT=2 vs LT=1):', (r2.composite - r1.composite).toFixed(6));
    console.log('Stockout delta:', (r2.stockoutRate - r1.stockoutRate).toFixed(4));
    console.log('Bias delta:', (r2.bias - r1.bias).toFixed(4));
    console.log('');
    console.log('Interpretation:');
    console.log('  - LT=1 baseline mirrors backtest-engine.ts on snapshot 03 cohort.');
    console.log('  - LT=2 measures flat-extrapolation accuracy over 2-month horizon.');
    console.log('  - If LT=2 stockout > 2 × LT=1 stockout, flat extrapolation under-buffers');
    console.log('    long-LT items — consider trend-aware multi-month projection.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
