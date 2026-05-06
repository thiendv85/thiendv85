'use client';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  label: string;
  type: string;
}

export default function StatusBadge({ label, type }: StatusBadgeProps) {
  const colorMap: Record<string, string> = {
    "Quá hạn ETA": "bg-rose-100 text-rose-700 border-rose-200",
    "Chưa có ETA": "bg-orange-100 text-orange-700 border-orange-200",
    "Sắp về (<14 ngày)": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Có ETA (>14 ngày)": "bg-blue-100 text-blue-700 border-blue-200",
    "Đang xử lý": "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-tight", colorMap[type] || colorMap["Đang xử lý"])}>
      {label}
    </span>
  );
}
