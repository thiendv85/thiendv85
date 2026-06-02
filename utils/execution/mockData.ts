// Dữ liệu GIẢ ĐỊNH cho phát triển & xem giao diện phân hệ "Hàng về" khi chưa có
// part_supplier_map / chưa import 187k / chưa nối Supabase live.
// Bật bằng env Vite: VITE_EXECUTION_MOCK=1 (xem .env.local). KHÔNG ảnh hưởng production khi tắt.

import type { SupplierOrder, OrderLine, ReceiptLot } from '../../types/execution';
import type { SnapshotData } from '../../types/inventory';

export const EXECUTION_MOCK: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_EXECUTION_MOCK === '1';

// ─── Master map mã PT → NCC (đã normalize) ───
export const MOCK_PART_SUPPLIER_MAP = new Map<string, string>([
  ['Z1140306256K', 'Mobis Korea'],
  ['Z414282N010', 'Mobis Korea'],
  ['Z96621R0000', 'Mobis Korea'],
  ['ABC123', 'Mobis India'],
  ['DEF456', 'Mobis India'],
  ['DENSO0001', 'Denso'],
]);

// ─── Đơn NCC phủ các trạng thái S2..S9 ───
export const MOCK_SUPPLIER_ORDERS: SupplierOrder[] = [
  { id: 'so-1', source: 'imported', v16_approval_id: null, po_region_no: 'EPCBB23010501', po_date: '2026-05-02', region: 'Miền Bắc', order_type: 'KHAN', ship_method: 'AIR', supplier: 'Mobis Korea', external_order_ref: 'A26VBW3AAE', ordered_at: '2026-05-03', supplier_confirmed_at: '2026-05-04', stage: 'S8_RECEIVED' },
  { id: 'so-2', source: 'imported', v16_approval_id: null, po_region_no: 'VORBB23020110', po_date: '2026-05-10', region: 'Miền Bắc', order_type: 'DU_TRU', ship_method: 'SEA', supplier: 'Mobis Korea', external_order_ref: 'A26VBW9KZ1', ordered_at: '2026-05-11', supplier_confirmed_at: '2026-05-12', stage: 'S6_ETA' },
  { id: 'so-3', source: 'imported', v16_approval_id: null, po_region_no: 'EPCNB23030220', po_date: '2026-05-15', region: 'Miền Nam', order_type: 'DU_TRU', ship_method: 'SEA', supplier: 'Mobis India', external_order_ref: 'MI-7781', ordered_at: '2026-05-16', supplier_confirmed_at: null, stage: 'S4_INVOICED' },
  { id: 'so-4', source: 'manual', v16_approval_id: null, po_region_no: 'EPCNB23030255', po_date: '2026-05-18', region: 'Miền Nam', order_type: 'KHAN', ship_method: 'AIR', supplier: 'Denso', external_order_ref: null, ordered_at: '2026-05-19', supplier_confirmed_at: null, stage: 'S2_ORDERED' },
  { id: 'so-5', source: 'imported', v16_approval_id: null, po_region_no: 'VORBB23040301', po_date: '2026-04-20', region: 'Miền Bắc', order_type: 'DU_TRU', ship_method: 'SEA', supplier: 'Mobis Korea', external_order_ref: 'A26VBW7QX2', ordered_at: '2026-04-21', supplier_confirmed_at: '2026-04-22', stage: 'S7_CUSTOMS' },
  { id: 'so-6', source: 'imported', v16_approval_id: null, po_region_no: 'EPCBB23010777', po_date: '2026-03-30', region: 'Miền Bắc', order_type: 'DU_TRU', ship_method: 'SEA', supplier: 'Mobis India', external_order_ref: 'MI-7620', ordered_at: '2026-03-31', supplier_confirmed_at: '2026-04-01', stage: 'S9_DONE' },
];

// ─── Dòng PT theo đơn ───
const LINES: Record<string, OrderLine[]> = {
  'so-1': [
    { id: 'ol-1a', supplier_order_id: 'so-1', part_code_old: '_', part_code: 'Z1140306256K', name_vi: 'BU LÔNG', name_en: 'BOLT', unit: 'CÁI', car_model: 'RIO 2012', group_name: 'MÁY GẦM ĐIỆN', qty_ordered: 15, unit_price: 0.05 },
    { id: 'ol-1b', supplier_order_id: 'so-1', part_code_old: null, part_code: 'Z414282N010', name_vi: 'ĐỆM CHỮ O', name_en: 'O-RING', unit: 'CÁI', car_model: 'MQ4', group_name: 'MÁY GẦM ĐIỆN', qty_ordered: 7, unit_price: 0.44 },
  ],
  'so-2': [
    { id: 'ol-2a', supplier_order_id: 'so-2', part_code_old: null, part_code: 'Z96621R0000', name_vi: 'CÒI ĐIỆN', name_en: 'HORN', unit: 'CÁI', car_model: 'CARNIVAL', group_name: 'ĐỒNG SƠN', qty_ordered: 4, unit_price: 11.88 },
  ],
  'so-3': [
    { id: 'ol-3a', supplier_order_id: 'so-3', part_code_old: null, part_code: 'ABC123', name_vi: 'LỌC GIÓ', name_en: 'AIR FILTER', unit: 'CÁI', car_model: 'SELTOS', group_name: 'BẢO DƯỠNG ĐỊNH KỲ', qty_ordered: 50, unit_price: 3.2 },
    { id: 'ol-3b', supplier_order_id: 'so-3', part_code_old: null, part_code: 'DEF456', name_vi: 'LỌC DẦU', name_en: 'OIL FILTER', unit: 'CÁI', car_model: 'SELTOS', group_name: 'BẢO DƯỠNG ĐỊNH KỲ', qty_ordered: 80, unit_price: 2.1 },
  ],
  'so-4': [
    { id: 'ol-4a', supplier_order_id: 'so-4', part_code_old: null, part_code: 'DENSO0001', name_vi: 'BUGI', name_en: 'SPARK PLUG', unit: 'CÁI', car_model: 'K3', group_name: 'BẢO DƯỠNG ĐỊNH KỲ', qty_ordered: 100, unit_price: 4.5 },
  ],
  'so-5': [
    { id: 'ol-5a', supplier_order_id: 'so-5', part_code_old: null, part_code: 'Z1140306256K', name_vi: 'BU LÔNG', name_en: 'BOLT', unit: 'CÁI', car_model: 'RIO', group_name: 'MÁY GẦM ĐIỆN', qty_ordered: 200, unit_price: 0.05 },
  ],
  'so-6': [
    { id: 'ol-6a', supplier_order_id: 'so-6', part_code_old: null, part_code: 'DEF456', name_vi: 'LỌC DẦU', name_en: 'OIL FILTER', unit: 'CÁI', car_model: 'SELTOS', group_name: 'BẢO DƯỠNG ĐỊNH KỲ', qty_ordered: 30, unit_price: 2.1 },
  ],
};

// ─── Lô về theo dòng (so-1 nhận đủ; so-5 giao thiếu → còn nợ; so-3 chưa về) ───
const LOTS: Record<string, ReceiptLot[]> = {
  'ol-1a': [{ id: 'rl-1', order_line_id: 'ol-1a', invoice_no: 'F3A00719', invoice_date: '2026-05-08', etd_pol: '2026-05-09', eta_pod: '2026-05-12', port: 'HẢI PHÒNG', expected_wh_date: '2026-05-15', actual_wh_date: '2026-05-15', warehouse: 'Kho Đài Tư', qty_received: 15 }],
  'ol-1b': [{ id: 'rl-2', order_line_id: 'ol-1b', invoice_no: 'F3A00719', invoice_date: '2026-05-08', etd_pol: '2026-05-09', eta_pod: '2026-05-12', port: 'HẢI PHÒNG', expected_wh_date: '2026-05-15', actual_wh_date: '2026-05-15', warehouse: 'Kho Đài Tư', qty_received: 7 }],
  'ol-2a': [{ id: 'rl-3', order_line_id: 'ol-2a', invoice_no: 'F3B01200', invoice_date: '2026-05-18', etd_pol: '2026-05-20', eta_pod: '2026-05-28', port: 'VICT HCM', expected_wh_date: '2026-06-02', actual_wh_date: null, warehouse: 'Kho Sóng Thần', qty_received: 0 }],
  'ol-3a': [{ id: 'rl-4', order_line_id: 'ol-3a', invoice_no: 'MI-INV-901', invoice_date: '2026-05-22', etd_pol: null, eta_pod: null, port: null, expected_wh_date: null, actual_wh_date: null, warehouse: 'Kho Sóng Thần', qty_received: 0 }],
  'ol-5a': [
    { id: 'rl-5', order_line_id: 'ol-5a', invoice_no: 'A-INV-501', invoice_date: '2026-04-25', etd_pol: '2026-04-27', eta_pod: '2026-05-06', port: 'CÁT LÁI HCM', expected_wh_date: '2026-05-10', actual_wh_date: '2026-05-10', warehouse: 'Kho Sóng Thần', qty_received: 120 },
    { id: 'rl-6', order_line_id: 'ol-5a', invoice_no: 'A-INV-540', invoice_date: '2026-05-12', etd_pol: '2026-05-14', eta_pod: '2026-05-22', port: 'CÁT LÁI HCM', expected_wh_date: '2026-05-26', actual_wh_date: null, warehouse: 'Kho Sóng Thần', qty_received: 0 },
  ],
  'ol-6a': [{ id: 'rl-7', order_line_id: 'ol-6a', invoice_no: 'MI-INV-700', invoice_date: '2026-04-02', etd_pol: '2026-04-04', eta_pod: '2026-04-12', port: 'HẢI PHÒNG', expected_wh_date: '2026-04-16', actual_wh_date: '2026-04-16', warehouse: 'Kho Đài Tư', qty_received: 30 }],
};

export const mockOrderLines = (orderId: string): OrderLine[] => LINES[orderId] ?? [];
export const mockReceiptLots = (lineId: string): ReceiptLot[] => LOTS[lineId] ?? [];

// ─── Snapshot đơn duyệt giả cho Cổng G1 (có mã mapped + mã unmapped) ───
// ─── Dòng thô NCC mẫu cho ImportWizard (vị trí cột theo DEFAULT_HEADER_INDEX) ───
// Khoá = external_ref (cột 17). Khớp với đơn mock: so-1 ext 'A26VBW3AAE' (Z1140306256K / F3A00719).
function rawRow(opts: { po?: string; ship?: string; part: string; qty?: number; supplier?: string; extRef?: string | null; invoice?: string | null; status?: string }): unknown[] {
  const r: unknown[] = [];
  r[1] = opts.po ?? 'EPCBB23010501';
  r[5] = opts.ship ?? 'SEA';
  r[7] = opts.part;
  r[11] = opts.qty ?? 1;
  r[15] = opts.supplier ?? 'Mobis Korea';
  r[17] = opts.extRef ?? null;
  r[19] = opts.invoice ?? null;
  r[27] = opts.status ?? 'Chưa invoice';
  return r;
}
export const SAMPLE_IMPORT_ROWS: unknown[][] = [
  rawRow({ part: 'Z1140306256K', extRef: 'A26VBW3AAE', invoice: 'F3A00719', status: 'Đã nhập kho', qty: 15 }), // matched
  rawRow({ part: 'Z1140306256K', extRef: 'A26VBW3AAE', invoice: 'F3B22222', status: 'Đang thông quan' }), // newLot (invoice mới)
  rawRow({ part: 'Z96621R0000', extRef: 'A26VBW9KZ1', invoice: 'F3B01200', status: 'Đến VN' }), // matched (so-2)
  rawRow({ part: 'NEWPART01', extRef: 'A26VBWNEW9', invoice: 'INV-NEW', status: 'Chưa invoice', qty: 5 }), // newOrder
  rawRow({ part: 'NOPART', extRef: null, invoice: null, status: 'Chưa invoice' }), // unmatched (thiếu khoá)
];

export const MOCK_APPROVAL_ID = 'mock-approval-1';
export const MOCK_APPROVAL_SNAPSHOT: SnapshotData = {
  submitted_at: '2026-05-30',
  app_version: '2.1.0',
  quantities: {
    Z1140306256K: { air: 10, sea: 0 },
    ABC123: { air: 0, sea: 40 },
    DENSO0001: { air: 5, sea: 0 },
    UNMAPPED99: { air: 0, sea: 12 }, // cố tình KHÔNG có trong map → vào unmapped
  },
};
