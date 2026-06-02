const MS_PER_DAY = 86_400_000;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function addDaysISO(iso: string, days: number): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null; // ngày lỗi → null, KHÔNG throw
  return new Date(t + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Dự báo ngày về kho:
 *  - có ETA: ETA + đệm thông quan theo cảng
 *  - chưa có ETA: ngày đặt + lead-time trung vị (NCC × phương thức × loại đơn)
 */
export function forecastWarehouseDate(opts: {
  etaPod?: string | null;
  clearanceBufferDays?: number;
  orderedAt?: string | null;
  medianLeadTimeDays?: number | null;
}): string | null {
  if (opts.etaPod) return addDaysISO(opts.etaPod, opts.clearanceBufferDays ?? 0);
  if (opts.orderedAt && opts.medianLeadTimeDays != null) {
    return addDaysISO(opts.orderedAt, opts.medianLeadTimeDays);
  }
  return null;
}
