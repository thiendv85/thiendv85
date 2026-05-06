'use client';
import { TransformedBOData } from '@/lib/transform';
import { formatNumber } from '@/lib/utils';

interface PrioritySectionProps {
  title: string;
  data: TransformedBOData[];
  color: 'red' | 'orange' | 'green' | 'yellow';
}

export default function PrioritySection({ title, data, color }: PrioritySectionProps) {
  if (data.length === 0) return null;

  const colorMap = {
    red: "bg-rose-500",
    orange: "bg-orange-500",
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm mb-8">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${colorMap[color]}`}></span>
        <h3 className="text-[11px] font-black uppercase tracking-tight text-slate-700">{title}</h3>
        <span className="ml-auto text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          {data.length} dòng
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-400 font-bold uppercase">
              <th className="px-4 py-2">Đại lý</th>
              <th className="px-4 py-2">Mã PT</th>
              <th className="px-4 py-2">Tên PT</th>
              <th className="px-4 py-2">Loại đơn</th>
              <th className="px-4 py-2 text-right">SL</th>
              <th className="px-4 py-2 text-center">Ngày nợ</th>
              <th className="px-4 py-2 text-center">Ngày ETA</th>
              <th className="px-4 py-2 text-right">Tuổi nợ</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.slice(0, 50).map((row, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-slate-700 truncate max-w-[120px]">{row["SR-ĐL2"]}</td>
                <td className="px-4 py-2.5 font-bold text-slate-900">{row.ItemCode}</td>
                <td className="px-4 py-2.5 text-slate-500 truncate max-w-[200px]">{row.ItemName}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                    {row.OPropertyName}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-bold">{formatNumber(row.Quantity)}</td>
                <td className="px-4 py-2.5 text-center text-slate-500">{row.DocDate}</td>
                <td className="px-4 py-2.5 text-center font-bold text-blue-600">{row.EstimatedDate1 || "—"}</td>
                <td className="px-4 py-2.5 text-right font-bold text-rose-600">{row.AgingDays}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
