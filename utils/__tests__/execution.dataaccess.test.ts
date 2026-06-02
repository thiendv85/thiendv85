import { describe, it, expect } from 'vitest';
import { buildSupplierOrderRows, type OrderMeta } from '../../utils/supabase/execution';

describe('buildSupplierOrderRows', () => {
  const meta: OrderMeta = { po_region_no: 'PO1', region: 'Miền Bắc', order_type: 'KHAN', ship_method: 'AIR' };

  it('map nhóm NCC → bản ghi supplier_orders (source v16 khi có approvalId)', () => {
    const groups = new Map([['Mobis Korea', [{ part_code: 'A', qty_ordered: 2 }]]]);
    const rows = buildSupplierOrderRows('appr-1', groups, meta);
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier).toBe('Mobis Korea');
    expect(rows[0].source).toBe('v16');
    expect(rows[0].v16_approval_id).toBe('appr-1');
    expect(rows[0].stage).toBe('S1_SPLIT');
    expect(rows[0].ship_method).toBe('AIR');
  });

  it('source manual khi không có approvalId; 1 bản ghi / NCC', () => {
    const groups = new Map([
      ['NCC A', [{ part_code: 'A', qty_ordered: 1 }]],
      ['NCC B', [{ part_code: 'B', qty_ordered: 1 }]],
    ]);
    const rows = buildSupplierOrderRows(null, groups, meta);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === 'manual')).toBe(true);
  });
});
