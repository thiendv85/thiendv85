import { describe, it, expect } from 'vitest';
import { expandApprovalToLines } from '../execution/fromApproval';
import type { SnapshotData } from '../../types/inventory';

describe('expandApprovalToLines', () => {
  it('bung quantities thành dòng (air & sea tách dòng, bỏ qty 0)', () => {
    const snapshot: SnapshotData = { quantities: { A1: { air: 5, sea: 0 }, B2: { air: 0, sea: 3 } } };
    const lines = expandApprovalToLines(snapshot);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ part_code: 'A1', qty_ordered: 5, ship_method: 'AIR' }),
        expect.objectContaining({ part_code: 'B2', qty_ordered: 3, ship_method: 'SEA' }),
      ]),
    );
    expect(lines).toHaveLength(2);
  });

  it('một mã có cả air & sea → 2 dòng', () => {
    const snapshot: SnapshotData = { quantities: { A1: { air: 2, sea: 4 } } };
    expect(expandApprovalToLines(snapshot)).toHaveLength(2);
  });

  it('quantities rỗng/thiếu → 0 dòng', () => {
    expect(expandApprovalToLines({})).toHaveLength(0);
  });

  it('stub nén chưa rehydrate → throw (không ra 0 dòng âm thầm)', () => {
    const stub = { is_compressed: true } as unknown as SnapshotData;
    expect(() => expandApprovalToLines(stub)).toThrow();
  });
});
