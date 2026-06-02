// Canonical entities cho phân hệ theo dõi thực thi đơn hàng & hàng về.

export type ExecStage =
  | 'S0_PENDING_SPLIT'
  | 'S1_SPLIT'
  | 'S2_ORDERED'
  | 'S3_SUPPLIER_CONFIRMED'
  | 'S4_INVOICED'
  | 'S5_ETD'
  | 'S6_ETA'
  | 'S7_CUSTOMS'
  | 'S8_RECEIVED'
  | 'S9_DONE';

export const STAGE_ORDER: readonly ExecStage[] = [
  'S0_PENDING_SPLIT', 'S1_SPLIT', 'S2_ORDERED', 'S3_SUPPLIER_CONFIRMED',
  'S4_INVOICED', 'S5_ETD', 'S6_ETA', 'S7_CUSTOMS', 'S8_RECEIVED', 'S9_DONE',
] as const;

export type ShipMethod = 'AIR' | 'SEA';
export type OrderType = 'DU_TRU' | 'KHAN';

export interface PartSupplierMap {
  part_code: string; // mã PT mới, đã normalize
  supplier: string; // tên NCC chuẩn
}

export interface SupplierOrder {
  id: string;
  source: 'v16' | 'imported' | 'manual';
  v16_approval_id: string | null;
  po_region_no: string | null;
  po_date: string | null;
  region: string | null;
  order_type: OrderType | null;
  ship_method: ShipMethod | null;
  supplier: string;
  external_order_ref: string | null;
  ordered_at: string | null;
  supplier_confirmed_at: string | null;
  stage: ExecStage;
}

export interface OrderLine {
  id: string;
  supplier_order_id: string;
  part_code_old: string | null;
  part_code: string;
  name_vi: string | null;
  name_en: string | null;
  unit: string | null;
  car_model: string | null;
  group_name: string | null;
  qty_ordered: number;
  unit_price: number | null;
}

export interface ReceiptLot {
  id: string;
  order_line_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  etd_pol: string | null;
  eta_pod: string | null;
  port: string | null;
  expected_wh_date: string | null;
  actual_wh_date: string | null;
  warehouse: string | null;
  qty_received: number;
}
