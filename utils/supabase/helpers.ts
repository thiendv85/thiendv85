import { supabase } from './client';
import type { SnapshotData, ApprovalSummary } from '../../types/inventory';

/**
 * Generic paginated select — Supabase default cap = 1000 rows.
 * Truyền factory build query với .range(offset, offset+limit-1) đã set.
 * Lặp đến khi page < PAGE size = hết.
 *
 * Dùng cho mọi list query có khả năng > 1000 rows (mappings, requests, actions...).
 *
 * Ví dụ:
 *   const rows = await selectAllPaginated<{ id: string }>((from, to) =>
 *     supabase.from('foo').select('id').order('id').range(from, to)
 *   );
 */
export async function selectAllPaginated<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) { console.error('selectAllPaginated:', error); return all; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

/**
 * Tính KPI tóm tắt cho 1 snapshot đơn hàng:
 *   - skuCount   : số SKU có quantity > 0
 *   - totalQty   : tổng số lượng (Air + Sea) trên tất cả SKU đã đặt
 *   - totalValue : giá trị đơn (VND) — tính bằng quantity × unitCost của ctx
 */
export function computeSnapshotSummary(snap: SnapshotData | null | undefined): ApprovalSummary {
  let skuCount = 0;
  let totalQty = 0;
  let totalValue = 0;
  if (!snap) return { skuCount, totalQty, totalValue };
  const qtys = snap.quantities || {};
  const ctxList = snap.inventory_context || [];
  const costMap: Record<string, number> = {};
  ctxList.forEach((c) => { costMap[c.itemCode] = c.unitCost || 0; });

  Object.entries(qtys).forEach(([code, q]) => {
    const air = q?.air || 0;
    const sea = q?.sea || 0;
    const total = air + sea;
    if (total <= 0) return;
    skuCount++;
    totalQty += total;
    totalValue += total * (costMap[code] || 0);
  });
  return { skuCount, totalQty, totalValue };
}

/**
 * Server-side admin verification via Supabase RPC.
 * The previous implementation exposed VITE_ADMIN_PIN to the client bundle which is
 * trivially extractable. Until a proper RPC `verify_admin_pin(pin text)` exists in the
 * database (gated by RLS / service role), this helper falls back to checking the user's
 * profile role on the server.
 */
export const verifyAdminPin = async (_inputPin: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .maybeSingle();
    return Boolean(profile?.is_active && (profile.role === 'admin' || profile.role === 'super_admin'));
};

/**
 * Normalizes brand names from departments or CSV headers to a standard set.
 */
export const normalizeBrand = (brandText?: string | null): string | null => {
    if (!brandText) return null;
    const b = brandText.toLowerCase().trim();
    if (b.includes('kia')) return 'Kia';
    if (b.includes('mazda')) return 'Mazda';
    if (b.includes('peugeot') || b.includes('peu') || b.includes('stellantis')) return 'Stellantis';
    if (b.includes('bmw')) return 'BMW';
    if (b.includes('mini')) return 'MINI';
    // Handle common ALL or empty cases
    if (b === 'all' || b === 'tất cả') return null;
    return brandText.trim();
};
