import { supabase } from './client';
import { selectAllPaginated } from './helpers';
import type { SupplierOrder, OrderLine, ReceiptLot, OrderType, ShipMethod } from '../../types/execution';
import { STAGE_ORDER } from '../../types/execution';
import type { SplittableLine } from '../execution/split';
import { stageFromLot, rollupOrderStage } from '../execution/stateMachine';

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
  // selectAllPaginated nhận CALLBACK builder (from,to).
  return selectAllPaginated<SupplierOrder>((from, to) =>
    supabase.from('supplier_orders').select('*').order('created_at').range(from, to),
  );
}

export async function listOrderLines(orderId: string): Promise<OrderLine[]> {
  const { data, error } = await supabase.from('order_lines').select('*').eq('supplier_order_id', orderId);
  if (error) throw error;
  return (data ?? []) as OrderLine[];
}

export async function listReceiptLots(lineId: string): Promise<ReceiptLot[]> {
  const { data, error } = await supabase.from('receipt_lots').select('*').eq('order_line_id', lineId);
  if (error) throw error;
  return (data ?? []) as ReceiptLot[];
}

export async function updateSupplierOrder(id: string, patch: Partial<SupplierOrder>): Promise<void> {
  const { error } = await supabase.from('supplier_orders').update(patch).eq('id', id);
  if (error) throw error;
}

export async function upsertReceiptLot(lot: Partial<ReceiptLot>): Promise<void> {
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
