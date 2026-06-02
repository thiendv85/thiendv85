import { describe, it, expect } from 'vitest';
import {
  orderKeyOf,
  classifyRow,
  reconcile,
  lineKeyOf,
  lotKeyOf,
  type CanonicalImportRow,
  type ExistingIndex,
} from '../execution/reconcile';

const row = (over: Partial<CanonicalImportRow>): CanonicalImportRow => ({
  orderKey: 'A26VBW3AAE',
  part_code: 'Z1140306256K',
  invoice_no: 'F3A00719',
  supplier: 'Mobis Korea',
  detail: 'x',
  ...over,
});

const idx: ExistingIndex = {
  orders: new Set(['A26VBW3AAE']),
  lines: new Set([lineKeyOf('A26VBW3AAE', 'Z1140306256K')]),
  lots: new Set([lotKeyOf('A26VBW3AAE', 'Z1140306256K', 'F3A00719')]),
};

describe('orderKeyOf', () => {
  it('chọn khoá theo strategy', () => {
    expect(orderKeyOf('external_ref', { external_order_ref: 'X', po_region_no: 'P' })).toBe('X');
    expect(orderKeyOf('po', { external_order_ref: 'X', po_region_no: 'P' })).toBe('P');
    expect(orderKeyOf('external_ref', { external_order_ref: null })).toBeNull();
  });
});

describe('classifyRow', () => {
  it('lô đã có → matched', () => {
    expect(classifyRow(row({}), idx)).toBe('matched');
  });
  it('đơn có, invoice mới → newLot', () => {
    expect(classifyRow(row({ invoice_no: 'F3A99999' }), idx)).toBe('newLot');
  });
  it('đơn có, mã mới → newLot', () => {
    expect(classifyRow(row({ part_code: 'NEWPART' }), idx)).toBe('newLot');
  });
  it('đơn chưa có → newOrder', () => {
    expect(classifyRow(row({ orderKey: 'UNKNOWN' }), idx)).toBe('newOrder');
  });
  it('thiếu khoá / mã → unmatched', () => {
    expect(classifyRow(row({ orderKey: null }), idx)).toBe('unmatched');
    expect(classifyRow(row({ part_code: '' }), idx)).toBe('unmatched');
  });
});

describe('reconcile', () => {
  it('gom các nhóm đúng', () => {
    const rows = [
      row({}), // matched
      row({ invoice_no: 'NEW1' }), // newLot
      row({ orderKey: 'OTHER' }), // newOrder
      row({ orderKey: null }), // unmatched
    ];
    const r = reconcile(rows, idx);
    expect(r.matched).toHaveLength(1);
    expect(r.newLots).toHaveLength(1);
    expect(r.newOrders).toHaveLength(1);
    expect(r.unmatched).toHaveLength(1);
  });
});
