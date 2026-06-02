import type { SnapshotData } from '../../types/inventory';
import type { ShipMethod } from '../../types/execution';

export interface ExpandedLine {
  part_code: string;
  qty_ordered: number;
  ship_method: ShipMethod;
}

/**
 * Bung snapshot_data.quantities {itemCode:{air,sea}} → các dòng (bỏ số lượng 0).
 * ⚠️ Snapshot lớn bị gzip lên Storage; snapshot_data trong DB chỉ là stub.
 * PHẢI rehydrate (download + decompressData qua utils/supabase/approval.ts) TRƯỚC
 * khi gọi hàm này. Hàm chỉ nhận snapshot ĐÃ rehydrate.
 */
export function expandApprovalToLines(snapshot: SnapshotData): ExpandedLine[] {
  const out: ExpandedLine[] = [];
  const q = snapshot.quantities ?? {};
  if ((snapshot as { is_compressed?: boolean }).is_compressed && Object.keys(q).length === 0) {
    throw new Error('Snapshot chưa rehydrate (đang nén ở Storage) — decompress qua approval.ts trước');
  }
  for (const [code, v] of Object.entries(q)) {
    if (v.air > 0) out.push({ part_code: code, qty_ordered: v.air, ship_method: 'AIR' });
    if (v.sea > 0) out.push({ part_code: code, qty_ordered: v.sea, ship_method: 'SEA' });
  }
  return out;
}
