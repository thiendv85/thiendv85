import { supabase } from './client';
import { selectAllPaginated } from './helpers';
import type { SupplierOrder, OrderLine, ReceiptLot, OrderType, ShipMethod, PartSupplierMap } from '../../types/execution';
import { STAGE_ORDER } from '../../types/execution';
import type { SplittableLine } from '../execution/split';
import { stageFromLot, rollupOrderStage } from '../execution/stateMachine';
import { computeOutstanding, computeAgingDays } from '../execution/outstanding';
import {
  EXECUTION_MOCK,
  MOCK_SUPPLIER_ORDERS,
  MOCK_PART_SUPPLIER_MAP,
  mockOrderLines,
  mockReceiptLots,
} from '../execution/mockData';

export interface OrderMeta {
  po_region_no: string | null;
  region: string | null;
  order_type: OrderType | null;
  ship_method: ShipMethod | null;
}

/** Tạo bản ghi supplier_orders (chưa id) từ kết quả tách NCC. Thuần — test được. */
export function buildSupplierOrderRows(
  approvalId: string | null,
  groups: Map<string, SplittableLine[]>,
  meta: OrderMeta,
): Omit<SupplierOrder, 'id'>[] {
  return [...groups.keys()].map((supplier) => ({
    source: approvalId ? 'v16' : 'manual',
    v16_approval_id: approvalId,
    po_region_no: meta.po_region_no,
    po_date: null,
    region: meta.region,
    order_type: meta.order_type,
    ship_method: meta.ship_method,
    supplier,
    external_order_ref: null,
    ordered_at: null,
    supplier_confirmed_at: null,
    stage: 'S1_SPLIT',
  }));
}

export async function listSupplierOrders(): Promise<SupplierOrder[]> {
  if (EXECUTION_MOCK) return MOCK_SUPPLIER_ORDERS;
  // selectAllPaginated nhận CALLBACK builder (from,to).
  return selectAllPaginated<SupplierOrder>((from, to) =>
    supabase.from('supplier_orders').select('*').order('created_at').range(from, to),
  );
}

export async function listOrderLines(orderId: string): Promise<OrderLine[]> {
  if (EXECUTION_MOCK) return mockOrderLines(orderId);
  const { data, error } = await supabase.from('order_lines').select('*').eq('supplier_order_id', orderId);
  if (error) throw error;
  return (data ?? []) as OrderLine[];
}

export async function listReceiptLots(lineId: string): Promise<ReceiptLot[]> {
  if (EXECUTION_MOCK) return mockReceiptLots(lineId);
  const { data, error } = await supabase.from('receipt_lots').select('*').eq('order_line_id', lineId);
  if (error) throw error;
  return (data ?? []) as ReceiptLot[];
}

export async function updateSupplierOrder(id: string, patch: Partial<SupplierOrder>): Promise<void> {
  if (EXECUTION_MOCK) return; // demo: no-op
  const { error } = await supabase.from('supplier_orders').update(patch).eq('id', id);
  if (error) throw error;
}

export async function upsertReceiptLot(lot: Partial<ReceiptLot>): Promise<void> {
  if (EXECUTION_MOCK) return; // demo: no-op
  // onConflict khớp uq_rl_line_invoice → sửa tay/re-import không nhân đôi lô.
  const { error } = await supabase.from('receipt_lots').upsert(lot, { onConflict: 'order_line_id,invoice_no' });
  if (error) throw error;
}

/**
 * Tính lại stage của 1 đơn từ các lô thực tế (stage là cache, không tin cột lưu).
 * Mỗi dòng → bậc cao nhất trong các lô của nó; đơn = rollup các dòng.
 */
export async function recomputeOrderStage(orderId: string): Promise<SupplierOrder['stage']> {
  const lines = await listOrderLines(orderId);
  const lineStages = await Promise.all(
    lines.map(async (l) => {
      const lots = await listReceiptLots(l.id);
      if (lots.length === 0) return 'S2_ORDERED' as const;
      // dòng = bậc CAO nhất trong các lô (lô tiến xa nhất)
      return lots
        .map((lot) => stageFromLot(lot))
        .reduce((hi, s) => (STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(hi) ? s : hi));
    }),
  );
  const stage = rollupOrderStage(lineStages);
  await updateSupplierOrder(orderId, { stage });
  return stage;
}

/** Master map mã PT (đã normalize) → NCC. Dùng cho tách đơn (splitBySupplier). */
export async function listPartSupplierMap(): Promise<Map<string, string>> {
  if (EXECUTION_MOCK) return MOCK_PART_SUPPLIER_MAP;
  const rows = await selectAllPaginated<PartSupplierMap>((from, to) =>
    supabase.from('part_supplier_map').select('part_code,supplier').range(from, to),
  );
  return new Map(rows.map((r) => [r.part_code, r.supplier]));
}

/**
 * Ghi kết quả tách NCC: 1 supplier_order / NCC + order_lines theo nhóm.
 * groups: Map<NCC, dòng[]>. Trả số đơn/dòng đã ghi. KHÔNG ghi nếu groups rỗng.
 */
export async function persistSplit(
  approvalId: string | null,
  meta: OrderMeta,
  groups: Map<string, SplittableLine[]>,
): Promise<{ orders: number; lines: number }> {
  if (groups.size === 0) return { orders: 0, lines: 0 };
  if (EXECUTION_MOCK) {
    const lines = [...groups.values()].reduce((s, g) => s + g.length, 0);
    return { orders: groups.size, lines }; // demo: no DB write
  }
  const orderRows = buildSupplierOrderRows(approvalId, groups, meta);
  const { data: inserted, error } = await supabase
    .from('supplier_orders')
    .insert(orderRows)
    .select('id, supplier');
  if (error) throw error;
  const idBySupplier = new Map((inserted ?? []).map((o: { id: string; supplier: string }) => [o.supplier, o.id]));

  const lineRows: Omit<OrderLine, 'id'>[] = [];
  for (const [supplier, lines] of groups) {
    const oid = idBySupplier.get(supplier);
    if (!oid) continue;
    for (const l of lines) {
      lineRows.push({
        supplier_order_id: oid,
        part_code: String(l.part_code),
        part_code_old: (l.part_code_old as string) ?? null,
        name_vi: (l.name_vi as string) ?? null,
        name_en: (l.name_en as string) ?? null,
        unit: (l.unit as string) ?? null,
        car_model: (l.car_model as string) ?? null,
        group_name: (l.group_name as string) ?? null,
        qty_ordered: Number(l.qty_ordered) || 0,
        unit_price: (l.unit_price as number) ?? null,
      });
    }
  }
  if (lineRows.length) {
    const { error: e2 } = await supabase.from('order_lines').insert(lineRows);
    if (e2) throw e2;
  }
  return { orders: orderRows.length, lines: lineRows.length };
}

export interface OrderSummary {
  eta: string | null; // ETA sớm nhất của lô chưa về
  outstanding: number; // tổng tồn nợ các dòng
  agingDays: number | null; // tuổi từ ngày đặt
  isLate: boolean; // còn mở & quá ngày dự kiến về kho
}

/**
 * Gom tóm tắt cấp đơn (ETA/tồn nợ/aging/trễ) cho bảng pipeline.
 * Mock: tính từ fixture. Thật: trả Map rỗng (cần view tổng hợp DB — giai đoạn sau,
 * tránh N+1 trên ~3k đơn). Bảng hiển thị "—" khi không có summary.
 */
export async function getOrderSummaries(orders: SupplierOrder[]): Promise<Map<string, OrderSummary>> {
  const out = new Map<string, OrderSummary>();
  if (!EXECUTION_MOCK) return out;
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const o of orders) {
    const lines = await listOrderLines(o.id);
    let outstanding = 0;
    const lots: ReceiptLot[] = [];
    for (const l of lines) {
      const ls = await listReceiptLots(l.id);
      outstanding += computeOutstanding(l.qty_ordered, ls);
      lots.push(...ls);
    }
    const open = lots.filter((x) => !x.actual_wh_date);
    const eta = open.map((x) => x.eta_pod).filter((d): d is string => !!d).sort()[0] ?? null;
    const expected = open.map((x) => x.expected_wh_date).filter((d): d is string => !!d).sort()[0] ?? null;
    out.set(o.id, {
      eta,
      outstanding,
      agingDays: computeAgingDays(o.ordered_at, new Date()),
      isLate: o.stage !== 'S9_DONE' && !!expected && expected < todayISO,
    });
  }
  return out;
}
