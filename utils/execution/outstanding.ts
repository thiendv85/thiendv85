const MS_PER_DAY = 86_400_000;

export function computeOutstanding(qtyOrdered: number, lots: { qty_received: number }[]): number {
  const received = lots.reduce((s, l) => s + (l.qty_received || 0), 0);
  return Math.max(0, qtyOrdered - received);
}

/** Số ngày dương lịch từ ngày đặt (ISO) đến asOf. null nếu thiếu/lỗi ngày đặt. */
export function computeAgingDays(orderedAt: string | null, asOf: Date): number | null {
  if (!orderedAt) return null;
  const start = new Date(orderedAt).getTime();
  if (Number.isNaN(start)) return null;
  return Math.floor((asOf.getTime() - start) / MS_PER_DAY);
}
