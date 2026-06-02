import { describe, it, expect } from 'vitest';
import { stageFromLot, rollupOrderStage } from '../execution/stateMachine';

describe('stageFromLot', () => {
  it('suy bậc từ các mốc đã điền của lô', () => {
    expect(stageFromLot({})).toBe('S2_ORDERED');
    expect(stageFromLot({ invoice_no: 'F1' })).toBe('S4_INVOICED');
    expect(stageFromLot({ invoice_no: 'F1', etd_pol: '2026-01-14' })).toBe('S5_ETD');
    expect(stageFromLot({ invoice_no: 'F1', eta_pod: '2026-01-15' })).toBe('S6_ETA');
    expect(stageFromLot({ customs: true })).toBe('S7_CUSTOMS');
    expect(stageFromLot({ actual_wh_date: '2026-01-18' })).toBe('S8_RECEIVED');
  });
  it('mốc muộn nhất thắng khi nhiều mốc cùng có', () => {
    expect(stageFromLot({ invoice_no: 'F1', etd_pol: 'x', eta_pod: 'y', actual_wh_date: 'z' })).toBe('S8_RECEIVED');
  });
});

describe('rollupOrderStage', () => {
  it('đơn = bậc THẤP NHẤT của các dòng', () => {
    expect(rollupOrderStage(['S6_ETA', 'S4_INVOICED', 'S8_RECEIVED'])).toBe('S4_INVOICED');
  });
  it('có dòng done + dòng chưa xong → bậc thấp nhất (còn nợ)', () => {
    expect(rollupOrderStage(['S9_DONE', 'S4_INVOICED'])).toBe('S4_INVOICED');
  });
  it('mọi dòng done → S9_DONE', () => {
    expect(rollupOrderStage(['S9_DONE', 'S9_DONE'])).toBe('S9_DONE');
  });
  it('một phần tử → chính nó', () => {
    expect(rollupOrderStage(['S6_ETA'])).toBe('S6_ETA');
  });
  it('rỗng → S1_SPLIT', () => {
    expect(rollupOrderStage([])).toBe('S1_SPLIT');
  });
});
