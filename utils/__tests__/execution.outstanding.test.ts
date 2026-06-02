import { describe, it, expect } from 'vitest';
import { computeOutstanding, computeAgingDays } from '../execution/outstanding';

describe('computeOutstanding', () => {
  it('tồn nợ = đặt − tổng nhận các lô', () => {
    expect(computeOutstanding(15, [{ qty_received: 5 }, { qty_received: 7 }])).toBe(3);
  });
  it('không âm khi nhận dư', () => {
    expect(computeOutstanding(10, [{ qty_received: 12 }])).toBe(0);
  });
  it('chưa có lô → nợ toàn bộ', () => {
    expect(computeOutstanding(8, [])).toBe(8);
  });
  it('bỏ qua qty_received null/undefined trong lô', () => {
    // @ts-expect-error test dữ liệu bẩn
    expect(computeOutstanding(10, [{ qty_received: null }, { qty_received: 3 }])).toBe(7);
  });
});

describe('computeAgingDays', () => {
  it('số ngày từ ngày đặt đến mốc cho trước', () => {
    expect(computeAgingDays('2026-01-01', new Date('2026-01-11'))).toBe(10);
  });
  it('null ngày đặt → null', () => {
    expect(computeAgingDays(null, new Date('2026-01-11'))).toBeNull();
  });
  it('ngày đặt lỗi → null', () => {
    expect(computeAgingDays('not-a-date', new Date('2026-01-11'))).toBeNull();
  });
  it('cùng ngày → 0', () => {
    expect(computeAgingDays('2026-01-11', new Date('2026-01-11'))).toBe(0);
  });
});
