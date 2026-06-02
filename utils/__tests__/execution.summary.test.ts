import { describe, it, expect } from 'vitest';
import { computeOrderSummary, type SummaryLine } from '../execution/summary';

const asOf = new Date('2026-06-02');

describe('computeOrderSummary', () => {
  it('đơn nhận đủ → tồn nợ 0, không trễ, lấy aging', () => {
    const lines: SummaryLine[] = [
      { qty_ordered: 15, lots: [{ qty_received: 15, eta_pod: '2026-05-12', expected_wh_date: '2026-05-15', actual_wh_date: '2026-05-15' }] },
    ];
    const r = computeOrderSummary({ ordered_at: '2026-05-03', stage: 'S8_RECEIVED' }, lines, asOf);
    expect(r.outstanding).toBe(0);
    expect(r.eta).toBeNull(); // không còn lô mở
    expect(r.isLate).toBe(false);
    expect(r.agingDays).toBe(30);
  });

  it('giao thiếu + còn lô mở → tồn nợ > 0, ETA = mốc mở sớm nhất', () => {
    const lines: SummaryLine[] = [
      {
        qty_ordered: 200,
        lots: [
          { qty_received: 120, eta_pod: '2026-05-06', expected_wh_date: '2026-05-10', actual_wh_date: '2026-05-10' },
          { qty_received: 0, eta_pod: '2026-05-22', expected_wh_date: '2026-05-26', actual_wh_date: null },
        ],
      },
    ];
    const r = computeOrderSummary({ ordered_at: '2026-04-21', stage: 'S7_CUSTOMS' }, lines, asOf);
    expect(r.outstanding).toBe(80);
    expect(r.eta).toBe('2026-05-22'); // chỉ lô chưa về
    expect(r.isLate).toBe(true); // expected 2026-05-26 < 2026-06-02
  });

  it('chưa S9 nhưng chưa quá hạn → không trễ', () => {
    const lines: SummaryLine[] = [
      { qty_ordered: 4, lots: [{ qty_received: 0, eta_pod: '2026-06-20', expected_wh_date: '2026-06-25', actual_wh_date: null }] },
    ];
    const r = computeOrderSummary({ ordered_at: '2026-05-11', stage: 'S6_ETA' }, lines, asOf);
    expect(r.isLate).toBe(false);
    expect(r.outstanding).toBe(4);
  });

  it('ngày đặt null → agingDays null', () => {
    const r = computeOrderSummary({ ordered_at: null, stage: 'S2_ORDERED' }, [], asOf);
    expect(r.agingDays).toBeNull();
    expect(r.outstanding).toBe(0);
    expect(r.eta).toBeNull();
  });
});
