import { describe, it, expect } from 'vitest';
import { splitBySupplier } from '../execution/split';

const map = new Map<string, string>([
  ['Z1140306256K', 'Mobis Korea'],
  ['Z414282N010', 'Mobis Korea'],
  ['ABC123', 'Mobis India'],
]);

describe('splitBySupplier', () => {
  it('gom dòng theo NCC từ master map (đã normalize mã)', () => {
    const lines = [
      { part_code: 'Z11 40306256K', qty_ordered: 15 }, // dấu cách → normalize
      { part_code: 'Z414282N010', qty_ordered: 7 },
      { part_code: 'ABC123', qty_ordered: 2 },
    ];
    const { groups, unmapped } = splitBySupplier(lines, map);
    expect(unmapped).toHaveLength(0);
    expect(groups.get('Mobis Korea')).toHaveLength(2);
    expect(groups.get('Mobis India')).toHaveLength(1);
  });

  it('mã thường + dấu gạch/chấm vẫn khớp sau normalize', () => {
    const lines = [{ part_code: 'z11-4030.6256/k', qty_ordered: 1 }];
    const { groups, unmapped } = splitBySupplier(lines, map);
    expect(unmapped).toHaveLength(0);
    expect(groups.get('Mobis Korea')).toHaveLength(1);
  });

  it('mã không có trong map → unmapped, không đoán', () => {
    const lines = [{ part_code: 'NOPE999', qty_ordered: 1 }];
    const { groups, unmapped } = splitBySupplier(lines, map);
    expect(groups.size).toBe(0);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].part_code).toBe('NOPE999');
  });

  it('dùng resolver đổi mã (supersession) trước khi tra map', () => {
    const resolve = (c: string) => (c === 'OLD1' ? 'ABC123' : c);
    const { groups } = splitBySupplier([{ part_code: 'OLD1', qty_ordered: 3 }], map, resolve);
    expect(groups.get('Mobis India')).toHaveLength(1);
  });
});
