import { describe, it, expect } from 'vitest';
import { applyTemplate, getTemplate, DEFAULT_HEADER_INDEX } from '../execution/importAdapter';
import { buildExistingIndex, reconcile } from '../execution/reconcile';

const tmpl = getTemplate('mobis-default')!;

function mkRaw(part: string, extRef: string | null, invoice: string | null, status: string, qty: number): unknown[] {
  const r: unknown[] = [];
  r[1] = 'EPCBB001'; r[5] = 'Air'; r[7] = part; r[11] = qty; r[15] = 'Mobis Korea';
  r[17] = extRef; r[19] = invoice; r[27] = status;
  return r;
}

describe('applyTemplate', () => {
  it('ánh xạ dòng thô → dòng chuẩn (khoá = external_ref)', () => {
    const rows = applyTemplate([mkRaw('Z1140306256K', 'A26VBW3AAE', 'F3A00719', 'Đã nhập kho', 15)], tmpl);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderKey).toBe('A26VBW3AAE');
    expect(rows[0].part_code).toBe('Z1140306256K');
    expect(rows[0].invoice_no).toBe('F3A00719');
    expect(rows[0].canonical.lot.qty_received).toBe(15); // nhập kho → nhận đủ
    expect(rows[0].canonical.order.stage).toBe('S8_RECEIVED');
  });

  it('template có trong registry', () => {
    expect(getTemplate('mobis-default')).toBeTruthy();
    expect(DEFAULT_HEADER_INDEX.ext_ref).toBe(17);
  });
});

describe('applyTemplate → reconcile (end-to-end thuần)', () => {
  it('phân loại đúng so với dữ liệu đã có', () => {
    // đã có: đơn A26VBW3AAE, dòng Z1140306256K, lô F3A00719
    const idx = buildExistingIndex([
      { orderKey: 'A26VBW3AAE', part_code: 'Z1140306256K', invoice_no: 'F3A00719' },
    ]);
    const rows = applyTemplate(
      [
        mkRaw('Z1140306256K', 'A26VBW3AAE', 'F3A00719', 'Đã nhập kho', 15), // matched
        mkRaw('Z1140306256K', 'A26VBW3AAE', 'F3B11111', 'Đang thông quan', 0), // newLot (invoice mới)
        mkRaw('NEWPART', 'A26VBW9ZZZ', 'INV9', 'Chưa invoice', 5), // newOrder (đơn mới)
        mkRaw('NOPART', null, null, 'Chưa invoice', 1), // unmatched (thiếu khoá)
      ],
      tmpl,
    );
    const r = reconcile(rows, idx);
    expect(r.matched).toHaveLength(1);
    expect(r.newLots).toHaveLength(1);
    expect(r.newOrders).toHaveLength(1);
    expect(r.unmatched).toHaveLength(1);
  });
});
