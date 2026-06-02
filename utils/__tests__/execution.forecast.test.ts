import { describe, it, expect } from 'vitest';
import { median, forecastWarehouseDate } from '../execution/forecast';

describe('median', () => {
  it('trung vị lẻ/chẵn', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('một phần tử / số âm', () => {
    expect(median([5])).toBe(5);
    expect(median([-3, -1])).toBe(-2);
  });
  it('rỗng → null', () => {
    expect(median([])).toBeNull();
  });
});

describe('forecastWarehouseDate', () => {
  it('có ETA → ETA + đệm thông quan', () => {
    expect(forecastWarehouseDate({ etaPod: '2026-01-15', clearanceBufferDays: 3 })).toBe('2026-01-18');
  });
  it('chưa có ETA → ngày đặt + lead-time trung vị', () => {
    expect(forecastWarehouseDate({ orderedAt: '2026-01-01', medianLeadTimeDays: 17 })).toBe('2026-01-18');
  });
  it('ETA ưu tiên hơn orderedAt', () => {
    expect(forecastWarehouseDate({ etaPod: '2026-01-15', clearanceBufferDays: 0, orderedAt: '2026-01-01', medianLeadTimeDays: 99 })).toBe('2026-01-15');
  });
  it('ngày lỗi → null (không throw)', () => {
    expect(forecastWarehouseDate({ etaPod: 'not-a-date', clearanceBufferDays: 2 })).toBeNull();
  });
  it('thiếu dữ liệu → null', () => {
    expect(forecastWarehouseDate({})).toBeNull();
  });
});
