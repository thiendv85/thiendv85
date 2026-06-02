import { normalizePartCode } from '../partAffinity';
import { normShipMethod, normOrderType, normPort, normGroup } from './normalize';
import type { ExecStage, SupplierOrder, OrderLine, ReceiptLot } from '../../types/execution';

export type HeaderKey =
  | 'po_no' | 'po_date' | 'region' | 'order_type' | 'ship_method'
  | 'part_old' | 'part_new' | 'name_vi' | 'name_en' | 'unit' | 'qty'
  | 'unit_price' | 'car' | 'supplier' | 'ordered_at' | 'ext_ref'
  | 'confirmed_at' | 'invoice_no' | 'invoice_date' | 'etd' | 'eta'
  | 'port' | 'expected_wh' | 'actual_wh' | 'warehouse' | 'status' | 'group';
export type HeaderIndex = Record<HeaderKey, number>;

export function excelStatusToStage(status: string | null): ExecStage {
  const s = (status || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!s) return 'S2_ORDERED';
  if (s === 'ĐÃ NHẬP KHO') return 'S8_RECEIVED';
  if (s === 'ĐANG THÔNG QUAN') return 'S7_CUSTOMS';
  if (s === 'ĐÃ CÓ INVOICE, CÓ LỊCH VỀ' || s.startsWith('ĐÃ CÓ INVOICE')) return 'S4_INVOICED';
  if (s === 'CHƯA INVOICE') return 'S2_ORDERED';
  return 'S2_ORDERED'; // giá trị lạ — script đếm & báo, không nuốt thầm
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
/** ISO yyyy-mm-dd. null = rỗng HOẶC không parse được. */
export const iso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(EXCEL_EPOCH + v * 86_400_000);
  else d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => {
  const raw =
    v && typeof v === 'object' && !(v instanceof Date)
      ? ((v as { text?: string; result?: unknown }).text ?? (v as { result?: unknown }).result ?? '')
      : v;
  const s = (raw == null ? '' : String(raw)).trim();
  return s && s !== '_' ? s : null;
};

export type MappedOrder = Omit<SupplierOrder, 'id' | 'supplier'> & { supplier: string | null };
export type MappedLine = Omit<OrderLine, 'id' | 'supplier_order_id'>;
export type MappedLot = Omit<ReceiptLot, 'id' | 'order_line_id'>;
export interface MappedRow {
  order: MappedOrder;
  line: MappedLine;
  lot: MappedLot;
}

/** Map 1 dòng Excel (mảng theo cột) → {order, line, lot} canonical, đã chuẩn hoá. */
export function mapExcelRowToCanonical(row: unknown[], h: HeaderIndex): MappedRow {
  const stage = excelStatusToStage(str(row[h.status]));
  const qty = num(row[h.qty]);
  const order: MappedOrder = {
    source: 'imported',
    v16_approval_id: null,
    po_region_no: str(row[h.po_no]),
    po_date: iso(row[h.po_date]),
    region: str(row[h.region]),
    order_type: normOrderType(str(row[h.order_type])),
    ship_method: normShipMethod(str(row[h.ship_method])),
    supplier: str(row[h.supplier]), // string | null — KHÔNG bịa
    external_order_ref: str(row[h.ext_ref]),
    ordered_at: iso(row[h.ordered_at]),
    supplier_confirmed_at: iso(row[h.confirmed_at]),
    stage,
  };
  const line: MappedLine = {
    part_code_old: str(row[h.part_old]),
    part_code: normalizePartCode(String(row[h.part_new] ?? '')),
    name_vi: str(row[h.name_vi]),
    name_en: str(row[h.name_en]),
    unit: str(row[h.unit]),
    car_model: str(row[h.car]),
    group_name: normGroup(str(row[h.group])),
    qty_ordered: qty,
    unit_price: row[h.unit_price] == null ? null : num(row[h.unit_price]),
  };
  const received = stage === 'S8_RECEIVED' || stage === 'S9_DONE' ? qty : 0;
  const lot: MappedLot = {
    invoice_no: str(row[h.invoice_no]),
    invoice_date: iso(row[h.invoice_date]),
    etd_pol: iso(row[h.etd]),
    eta_pod: iso(row[h.eta]),
    port: normPort(str(row[h.port])),
    expected_wh_date: iso(row[h.expected_wh]),
    actual_wh_date: iso(row[h.actual_wh]),
    warehouse: str(row[h.warehouse]),
    qty_received: received,
  };
  return { order, line, lot };
}

export interface GroupedOrder {
  order: MappedOrder & { supplier: string };
  lines: Map<string, { line: MappedLine; lots: MappedLot[] }>;
}
export interface GroupResult {
  orders: Map<string, GroupedOrder>;
  skippedNoPo: number;
  skippedNoSupplier: number;
  skippedNoPart: number;
}

const orderKey = (o: MappedOrder) => `${o.po_region_no || ''}|${o.supplier}`;

/**
 * Gom các dòng Excel đã map thành cây order→lines→lots.
 * qty_ordered(dòng) = Σ qty các dòng cùng (đơn, mã). Mỗi dòng = 1 lô.
 * Bỏ qua (đếm) dòng thiếu po/supplier/part — KHÔNG bịa.
 */
export function groupCanonicalRows(rows: MappedRow[]): GroupResult {
  const orders = new Map<string, GroupedOrder>();
  let skippedNoPo = 0,
    skippedNoSupplier = 0,
    skippedNoPart = 0;
  for (const c of rows) {
    if (!c.order.po_region_no) {
      skippedNoPo++;
      continue;
    }
    if (!c.order.supplier) {
      skippedNoSupplier++;
      continue;
    }
    if (!c.line.part_code) {
      skippedNoPart++;
      continue;
    }
    const k = orderKey(c.order);
    if (!orders.has(k)) {
      orders.set(k, { order: c.order as GroupedOrder['order'], lines: new Map() });
    }
    const bucket = orders.get(k)!;
    if (!bucket.lines.has(c.line.part_code)) {
      bucket.lines.set(c.line.part_code, { line: { ...c.line, qty_ordered: 0 }, lots: [] });
    }
    const lb = bucket.lines.get(c.line.part_code)!;
    lb.line.qty_ordered += c.line.qty_ordered;
    // Gộp lô theo invoice_no (key '' cho null) → tránh tuple trùng (order_line_id, invoice_no)
    // trong 1 upsert batch; cộng qty_received, giữ mốc mới nhất (coalesce).
    const inv = lb.lots.find((x) => (x.invoice_no || '') === (c.lot.invoice_no || ''));
    if (inv) {
      inv.qty_received += c.lot.qty_received;
      inv.invoice_date ??= c.lot.invoice_date;
      inv.etd_pol ??= c.lot.etd_pol;
      inv.eta_pod ??= c.lot.eta_pod;
      inv.port ??= c.lot.port;
      inv.expected_wh_date ??= c.lot.expected_wh_date;
      inv.actual_wh_date ??= c.lot.actual_wh_date;
      inv.warehouse ??= c.lot.warehouse;
    } else {
      lb.lots.push({ ...c.lot });
    }
  }
  return { orders, skippedNoPo, skippedNoSupplier, skippedNoPart };
}
