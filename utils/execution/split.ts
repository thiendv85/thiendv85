import { normalizePartCode } from '../partAffinity';

export interface SplittableLine {
  part_code: string;
  qty_ordered: number;
  [k: string]: unknown;
}

/**
 * Gom dòng theo NCC dựa trên master map (mã PT đã normalize → NCC).
 * resolveSupersession (tuỳ chọn): đổi mã cũ → mã mới TRƯỚC khi tra map.
 * Mã không tra được → trả về unmapped (KHÔNG tự đoán NCC).
 *
 * Cầu nối keyspace: map keys phải đã normalizePartCode; resolver trả mã gốc,
 * hàm tự normalize trước khi tra → 2 keyspace không lẫn.
 */
export function splitBySupplier<T extends SplittableLine>(
  lines: T[],
  partSupplierMap: Map<string, string>,
  resolveSupersession?: (code: string) => string,
): { groups: Map<string, T[]>; unmapped: T[] } {
  const groups = new Map<string, T[]>();
  const unmapped: T[] = [];
  for (const line of lines) {
    const resolved = resolveSupersession ? resolveSupersession(line.part_code) : line.part_code;
    const key = normalizePartCode(resolved);
    const supplier = partSupplierMap.get(key);
    if (!supplier) {
      unmapped.push(line);
      continue;
    }
    if (!groups.has(supplier)) groups.set(supplier, []);
    groups.get(supplier)!.push(line);
  }
  return { groups, unmapped };
}
