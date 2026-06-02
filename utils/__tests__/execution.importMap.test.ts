import { describe, it, expect } from 'vitest';
import {
  mapExcelRowToCanonical,
  excelStatusToStage,
  iso,
  groupCanonicalRows,
  type HeaderIndex,
  type MappedRow,
} from '../execution/importMap';

const headerIndex: HeaderIndex = {
  po_no: 1, po_date: 2, region: 3, order_type: 4, ship_method: 5,
  part_old: 6, part_new: 7, name_vi: 8, name_en: 9, unit: 10, qty: 11,
  unit_price: 12, car: 14, supplier: 15, ordered_at: 16, ext_ref: 17,
  confirmed_at: 18, invoice_no: 19, invoice_date: 20, etd: 21, eta: 22,
  port: 23, expected_wh: 24, actual_wh: 25, warehouse: 26, status: 27, group: 29,
};

describe('excelStatusToStage', () => {
  it('ánh xạ 4 trạng thái Excel', () => {
    expect(excelStatusToStage('Đã nhập kho')).toBe('S8_RECEIVED');
    expect(excelStatusToStage('Chưa invoice')).toBe('S2_ORDERED');
    expect(excelStatusToStage('Đang thông quan')).toBe('S7_CUSTOMS');
    expect(excelStatusToStage('Đã có invoice, có lịch về')).toBe('S4_INVOICED');
  });
  it('dữ liệu bẩn: hoa/thường/space/null → vẫn đúng hoặc mặc định an toàn', () => {
    expect(excelStatusToStage('đã nhập kho')).toBe('S8_RECEIVED');
    expect(excelStatusToStage('  Đã   nhập kho ')).toBe('S8_RECEIVED');
    expect(excelStatusToStage(null)).toBe('S2_ORDERED');
    expect(excelStatusToStage('')).toBe('S2_ORDERED');
    expect(excelStatusToStage('linh tinh')).toBe('S2_ORDERED');
  });
});

describe('iso', () => {
  it('Date / null / chuỗi lỗi / Excel serial', () => {
    expect(iso(new Date('2023-01-18'))).toBe('2023-01-18');
    expect(iso(null)).toBeNull();
    expect(iso('')).toBeNull();
    expect(iso('not-a-date')).toBeNull();
    expect(iso(44930)).toBe('2023-01-04'); // Excel serial (44927 = 2023-01-01)
  });
});

describe('mapExcelRowToCanonical', () => {
  it('tách 1 dòng đã nhập kho → order/line/lot chuẩn hoá', () => {
    const row: unknown[] = [];
    row[1] = 'EPCBB23010501'; row[2] = new Date('2023-01-06'); row[3] = 'Miền Bắc';
    row[4] = 'Khẩn'; row[5] = 'Air'; row[6] = '_'; row[7] = 'Z1140306256K';
    row[8] = 'BU LÔNG'; row[9] = 'BOLT'; row[10] = 'CÁI'; row[11] = 15; row[12] = 0.05;
    row[14] = 'RIO 2012'; row[15] = 'Mobis Korea'; row[16] = new Date('2023-01-07');
    row[17] = 'A26VBW3AAE'; row[19] = 'F3A00719'; row[22] = new Date('2023-01-15');
    row[23] = 'HẢI PHÒNG'; row[25] = new Date('2023-01-18'); row[26] = 'Kho Đài Tư';
    row[27] = 'Đã nhập kho'; row[29] = 'MÁY GẦM ĐIỆN';

    const c = mapExcelRowToCanonical(row, headerIndex);
    expect(c.order.supplier).toBe('Mobis Korea');
    expect(c.order.ship_method).toBe('AIR');
    expect(c.order.order_type).toBe('KHAN');
    expect(c.order.external_order_ref).toBe('A26VBW3AAE');
    expect(c.order.stage).toBe('S8_RECEIVED');
    expect(c.line.part_code).toBe('Z1140306256K');
    expect(c.line.qty_ordered).toBe(15);
    expect(c.lot.qty_received).toBe(15);
    expect(c.lot.actual_wh_date).toBe('2023-01-18');
  });

  it('dòng chưa invoice → qty_received = 0', () => {
    const row: unknown[] = [];
    row[1] = 'PO2'; row[7] = 'ABC'; row[11] = 9; row[15] = 'Mobis Korea'; row[27] = 'Chưa invoice';
    const c = mapExcelRowToCanonical(row, headerIndex);
    expect(c.order.stage).toBe('S2_ORDERED');
    expect(c.lot.qty_received).toBe(0);
  });

  it('supplier rỗng → null (không bịa)', () => {
    const row: unknown[] = [];
    row[1] = 'PO3'; row[7] = 'ABC'; row[11] = 1; row[15] = '_'; row[27] = 'Đã nhập kho';
    const c = mapExcelRowToCanonical(row, headerIndex);
    expect(c.order.supplier).toBeNull();
  });
});

describe('groupCanonicalRows', () => {
  const mk = (po: string | null, supplier: string | null, part: string, qty: number, invoice: string | null, received: number): MappedRow => ({
    order: { source: 'imported', v16_approval_id: null, po_region_no: po, po_date: null, region: null, order_type: null, ship_method: null, supplier, external_order_ref: null, ordered_at: null, supplier_confirmed_at: null, stage: 'S2_ORDERED' },
    line: { part_code_old: null, part_code: part, name_vi: null, name_en: null, unit: null, car_model: null, group_name: null, qty_ordered: qty, unit_price: null },
    lot: { invoice_no: invoice, invoice_date: null, etd_pol: null, eta_pod: null, port: null, expected_wh_date: null, actual_wh_date: null, warehouse: null, qty_received: received },
  });

  it('gộp qty đa-lô cùng (đơn, mã) + đếm lô', () => {
    const rows = [mk('PO1', 'NCC1', 'P1', 10, 'INV1', 10), mk('PO1', 'NCC1', 'P1', 5, 'INV2', 5)];
    const r = groupCanonicalRows(rows);
    const line = r.orders.get('PO1|NCC1')!.lines.get('P1')!;
    expect(line.line.qty_ordered).toBe(15);
    expect(line.lots).toHaveLength(2);
  });

  it('đếm & bỏ dòng thiếu po/supplier/part, không bịa', () => {
    const rows = [mk(null, 'NCC1', 'P1', 1, null, 0), mk('PO1', null, 'P1', 1, null, 0), mk('PO1', 'NCC1', '', 1, null, 0)];
    const r = groupCanonicalRows(rows);
    expect(r.skippedNoPo).toBe(1);
    expect(r.skippedNoSupplier).toBe(1);
    expect(r.skippedNoPart).toBe(1);
    expect(r.orders.size).toBe(0);
  });
});
