import { type ExecStage, STAGE_ORDER } from '../../types/execution';
import type { ReceiptLot } from '../../types/execution';

type LotMarks = Partial<Pick<ReceiptLot, 'invoice_no' | 'etd_pol' | 'eta_pod' | 'actual_wh_date'>> & {
  customs?: boolean;
};

/** Bậc của một lô dựa trên mốc đã điền (mốc muộn nhất thắng). */
export function stageFromLot(lot: LotMarks): ExecStage {
  if (lot.actual_wh_date) return 'S8_RECEIVED';
  if (lot.customs) return 'S7_CUSTOMS';
  if (lot.eta_pod) return 'S6_ETA';
  if (lot.etd_pol) return 'S5_ETD';
  if (lot.invoice_no) return 'S4_INVOICED';
  return 'S2_ORDERED';
}

const rank = (s: ExecStage) => STAGE_ORDER.indexOf(s);

/** Trạng thái đơn = bậc thấp nhất trong các dòng. Mọi dòng S9 → S9. Rỗng → S1. */
export function rollupOrderStage(lineStages: ExecStage[]): ExecStage {
  if (lineStages.length === 0) return 'S1_SPLIT';
  if (lineStages.every((s) => s === 'S9_DONE')) return 'S9_DONE';
  return lineStages.reduce((min, s) => (rank(s) < rank(min) ? s : min), lineStages[0]);
}
