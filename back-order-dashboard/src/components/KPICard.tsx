'use client';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: string | number;
  sub: string;
  color?: 'neutral' | 'orange' | 'red' | 'green';
}

export default function KPICard({ label, value, sub, color = 'neutral' }: KPICardProps) {
  const colorMap = {
    neutral: "text-slate-900 border-slate-200",
    orange: "text-orange-600 border-orange-100 bg-orange-50/30",
    red: "text-rose-600 border-rose-100 bg-rose-50/30",
    green: "text-emerald-600 border-emerald-100 bg-emerald-50/30",
  };

  return (
    <div className={cn("p-4 rounded-lg border bg-white shadow-sm", colorMap[color])}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums tracking-tight">{value}</p>
      <p className="text-[10px] font-medium mt-1 opacity-70 truncate">{sub}</p>
    </div>
  );
}
