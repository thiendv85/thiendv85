'use client';
import { useData } from './DataProvider';
import { formatNumber } from '@/lib/utils';

export default function DealerTable() {
  const { data } = useData();
  
  const dealers = Array.from(new Set(data.map(d => d["SR-ĐL2"])));
  const stats = dealers.map(name => {
    const rows = data.filter(d => d["SR-ĐL2"] === name);
    const qty = rows.reduce((acc, curr) => acc + curr.Quantity, 0);
    const avgAging = rows.reduce((acc, curr) => acc + curr.AgingDays, 0) / rows.length;
    const urgentCount = rows.filter(d => d.isUrgent).length;
    return {
      name,
      region: rows[0].Region,
      qty,
      rowCount: rows.length,
      avgAging,
      urgentCount
    };
  }).sort((a, b) => b.qty - a.qty).slice(0, 10);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm h-full">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Top 10 Đại lý nợ hàng</h3>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-400 font-bold uppercase">
            <th className="px-4 py-2 font-bold">Đại lý</th>
            <th className="px-4 py-2">Vùng</th>
            <th className="px-4 py-2 text-right">Tổng SL</th>
            <th className="px-4 py-2 text-right">Số dòng</th>
            <th className="px-4 py-2 text-right">TB ngày</th>
            <th className="px-4 py-2 text-right">Khẩn</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stats.map((s) => (
            <tr key={s.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-slate-700 truncate max-w-[150px]">{s.name}</td>
              <td className="px-4 py-2.5 text-slate-500">{s.region}</td>
              <td className="px-4 py-2.5 text-right font-bold">{formatNumber(s.qty)}</td>
              <td className="px-4 py-2.5 text-right">{formatNumber(s.rowCount)}</td>
              <td className="px-4 py-2.5 text-right">{s.avgAging.toFixed(0)}</td>
              <td className="px-4 py-2.5 text-right">
                <span className={s.urgentCount > 0 ? "text-orange-600 font-bold" : "text-slate-300"}>
                  {s.urgentCount}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
