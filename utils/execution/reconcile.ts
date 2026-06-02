// Reconcile engine — đối chiếu dòng import từ app NCC với dữ liệu đã có.
// Phân loại: matched (cập nhật mốc) / newLot (lô/dòng mới) / newOrder (đơn mới) / unmatched.

export type ReconcileBucket = 'matched' | 'newLot' | 'newOrder' | 'unmatched';

/** Chiến lược khoá đơn theo từng NCC (khai trong template). */
export type KeyStrategy = 'external_ref' | 'po';

export function orderKeyOf(
  strategy: KeyStrategy,
  fields: { external_order_ref?: string | null; po_region_no?: string | null },
): string | null {
  const v = strategy === 'external_ref' ? fields.external_order_ref : fields.po_region_no;
  return v ?? null;
}

export interface CanonicalImportRow {
  orderKey: string | null; // khoá đơn theo strategy
  part_code: string;
  invoice_no: string | null;
  supplier: string | null;
  detail: string; // mô tả hiển thị
}

/** Chỉ mục dữ liệu đang có để so khớp (các Set khoá đã chuẩn hoá). */
export interface ExistingIndex {
  orders: Set<string>; // orderKey
  lines: Set<string>; // `${orderKey}|${part_code}`
  lots: Set<string>; // `${orderKey}|${part_code}|${invoice_no ?? ''}`
}

export const lineKeyOf = (orderKey: string, part: string) => `${orderKey}|${part}`;
export const lotKeyOf = (orderKey: string, part: string, invoice: string | null) =>
  `${orderKey}|${part}|${invoice ?? ''}`;

export function classifyRow(row: CanonicalImportRow, idx: ExistingIndex): ReconcileBucket {
  if (!row.orderKey || !row.part_code) return 'unmatched';
  if (!idx.orders.has(row.orderKey)) return 'newOrder';
  if (idx.lots.has(lotKeyOf(row.orderKey, row.part_code, row.invoice_no))) return 'matched';
  return 'newLot'; // đơn có nhưng lô (theo invoice) chưa → lô/dòng mới
}

/** Dựng chỉ mục từ dữ liệu đã có (đơn→dòng→lô đã phẳng hoá + orderKey theo strategy). */
export function buildExistingIndex(
  items: { orderKey: string | null; part_code: string; invoice_no: string | null }[],
): ExistingIndex {
  const idx: ExistingIndex = { orders: new Set(), lines: new Set(), lots: new Set() };
  for (const it of items) {
    if (!it.orderKey) continue;
    idx.orders.add(it.orderKey);
    idx.lines.add(lineKeyOf(it.orderKey, it.part_code));
    idx.lots.add(lotKeyOf(it.orderKey, it.part_code, it.invoice_no));
  }
  return idx;
}

export interface ReconcileResult {
  matched: CanonicalImportRow[];
  newLots: CanonicalImportRow[];
  newOrders: CanonicalImportRow[];
  unmatched: CanonicalImportRow[];
}

export function reconcile(rows: CanonicalImportRow[], idx: ExistingIndex): ReconcileResult {
  const r: ReconcileResult = { matched: [], newLots: [], newOrders: [], unmatched: [] };
  for (const row of rows) {
    switch (classifyRow(row, idx)) {
      case 'matched':
        r.matched.push(row);
        break;
      case 'newLot':
        r.newLots.push(row);
        break;
      case 'newOrder':
        r.newOrders.push(row);
        break;
      default:
        r.unmatched.push(row);
    }
  }
  return r;
}
