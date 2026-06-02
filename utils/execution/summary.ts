import { computeOutstanding, computeAgingDays } from './outstanding';
import type { ExecStage } from '../../types/execution';

export interface SummaryLot {
  qty_received: number;
  eta_pod: string | null;
  expected_wh_date: string | null;
  actual_wh_date: string | null;
}
export interface SummaryLine {
  qty_ordered: number;
  lots: SummaryLot[];
}
export interface OrderSummaryResult {
  eta: string | null; // ETA sớm nhất của lô chưa về
  outstanding: number; // Σ theo dòng GREATEST(đặt − nhận, 0)
  agingDays: number | null;
  isLate: boolean; // chưa S9 & quá ngày dự kiến về kho
}

/**
 * Tóm tắt cấp đơn — nguồn sự thật chung cho UI mock VÀ view SQL (migration 021).
 * Test giữ cho logic JS và SQL không lệch.
 */
export function computeOrderSummary(
  order: { ordered_at: string | null; stage: ExecStage },
  lines: SummaryLine[],
  asOf: Date,
): OrderSummaryResult {
  let outstanding = 0;
  const openEtas: string[] = [];
  const openExpected: string[] = [];
  for (const l of lines) {
    outstanding += computeOutstanding(l.qty_ordered, l.lots);
    for (const lot of l.lots) {
      if (lot.actual_wh_date) continue; // lô đã về → bỏ
      if (lot.eta_pod) openEtas.push(lot.eta_pod);
      if (lot.expected_wh_date) openExpected.push(lot.expected_wh_date);
    }
  }
  const eta = openEtas.sort()[0] ?? null;
  const expected = openExpected.sort()[0] ?? null;
  const todayISO = asOf.toISOString().slice(0, 10);
  return {
    eta,
    outstanding,
    agingDays: computeAgingDays(order.ordered_at, asOf),
    isLate: order.stage !== 'S9_DONE' && !!expected && expected < todayISO,
  };
}
