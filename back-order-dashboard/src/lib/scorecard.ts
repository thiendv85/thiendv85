import type { ReminderEntry } from './types';

export interface SupplierStats {
  supplier: string;
  totalOrders: number;
  totalReminders: number;
  committedCount: number;
  silentCount: number;
  pctCommitted: number;
  pctSilent: number;
  avgEtaSlipDays: number;
  avgResponseTimeHours: number;
}

interface Opts {
  now?: Date;
  windowDays?: number | 'all';
}

export function computeScorecard(archive: ReminderEntry[], opts: Opts = {}): SupplierStats[] {
  const now = opts.now ?? new Date();
  const window = opts.windowDays ?? 'all';
  const cutoff = window === 'all' ? -Infinity : now.getTime() - window * 86_400_000;

  const filtered = archive.filter(r => new Date(r.created_at).getTime() >= cutoff);
  const bySupplier = new Map<string, ReminderEntry[]>();
  for (const r of filtered) {
    const list = bySupplier.get(r.supplier) ?? [];
    list.push(r);
    bySupplier.set(r.supplier, list);
  }

  const out: SupplierStats[] = [];
  Array.from(bySupplier.entries()).forEach(([supplier, rs]) => {
    const orders = new Set(rs.map(r => `${r.doc_no}|${r.item_code}|${r.row_id ?? ''}`));
    const committed = rs.filter(r => r.ncc_response_status === 'committed').length;
    const silent = rs.filter(r => r.ncc_response_status === 'silent').length;
    out.push({
      supplier,
      totalOrders: orders.size,
      totalReminders: rs.length,
      committedCount: committed,
      silentCount: silent,
      pctCommitted: rs.length === 0 ? 0 : committed / rs.length,
      pctSilent: rs.length === 0 ? 0 : silent / rs.length,
      avgEtaSlipDays: 0,
      avgResponseTimeHours: 0,
    });
  });
  out.sort((a, b) => b.totalReminders - a.totalReminders);
  return out;
}

export function reliabilityScore(s: SupplierStats): number {
  if (s.totalReminders === 0) return 0;
  const normSlip = Math.min(1, Math.max(0, s.avgEtaSlipDays / 30));
  const raw = 0.4 * s.pctCommitted - 0.3 * normSlip - 0.3 * s.pctSilent;
  return Math.max(0, Math.min(10, (raw + 0.6) * 10));
}
