// Khung adapter import đa-NCC: mỗi NCC khai 1 template (ánh xạ cột + khoá khớp).
// Lõi độc lập NCC — thêm NCC mới = thêm 1 template, không sửa engine.

import { mapExcelRowToCanonical, type HeaderIndex, type MappedRow } from './importMap';
import { orderKeyOf, type KeyStrategy, type CanonicalImportRow } from './reconcile';

export interface ImportTemplate {
  id: string;
  name: string; // tên NCC / biểu mẫu
  headerIndex: HeaderIndex; // ánh xạ cột → trường chuẩn
  keyStrategy: KeyStrategy; // khoá khớp về đơn đã tách
}

/** Dòng import sau khi áp template — kèm canonical đầy đủ để ghi DB khi commit. */
export interface AdapterRow extends CanonicalImportRow {
  canonical: MappedRow;
}

/** Ánh xạ cột mặc định (vị trí 1-based) khớp file lịch sử KIA — dùng cho NCC Mobis. */
export const DEFAULT_HEADER_INDEX: HeaderIndex = {
  po_no: 1, po_date: 2, region: 3, order_type: 4, ship_method: 5,
  part_old: 6, part_new: 7, name_vi: 8, name_en: 9, unit: 10, qty: 11,
  unit_price: 12, car: 14, supplier: 15, ordered_at: 16, ext_ref: 17,
  confirmed_at: 18, invoice_no: 19, invoice_date: 20, etd: 21, eta: 22,
  port: 23, expected_wh: 24, actual_wh: 25, warehouse: 26, status: 27, group: 29,
};

/** Áp template lên các dòng thô (mảng theo cột) → dòng chuẩn cho reconcile. */
export function applyTemplate(rawRows: unknown[][], t: ImportTemplate): AdapterRow[] {
  return rawRows.map((r) => {
    const c = mapExcelRowToCanonical(r, t.headerIndex);
    const orderKey = orderKeyOf(t.keyStrategy, {
      external_order_ref: c.order.external_order_ref,
      po_region_no: c.order.po_region_no,
    });
    return {
      orderKey,
      part_code: c.line.part_code,
      invoice_no: c.lot.invoice_no,
      supplier: c.order.supplier,
      detail: `${c.line.part_code} · ${c.lot.invoice_no ?? 'no-inv'} · SL nhận ${c.lot.qty_received}`,
      canonical: c,
    };
  });
}

/** Registry template (xây dần theo từng NCC). */
export const IMPORT_TEMPLATES: ImportTemplate[] = [
  { id: 'mobis-default', name: 'Mobis (mẫu mặc định)', headerIndex: DEFAULT_HEADER_INDEX, keyStrategy: 'external_ref' },
];

export const getTemplate = (id: string): ImportTemplate | undefined =>
  IMPORT_TEMPLATES.find((t) => t.id === id);
