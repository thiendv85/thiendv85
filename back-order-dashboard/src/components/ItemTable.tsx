'use client';
import { useData } from './DataProvider';
import { formatNumber } from '@/lib/utils';

export default function ItemTable() {
  const { data } = useData();
  
  const items = Array.from(new Set(data.map(d => d.ItemCode)));
  const stats = items.map(code => {
    const rows = data.filter(d => d.ItemCode === code);
    const qty = rows.reduce((acc, curr) => acc + curr.Quantity, 0);
    const avgAging = rows.reduce((acc, curr) => acc + curr.AgingDays, 0) / rows.length;
    return {
      code,
      name: rows[0].ItemName,
      qty,
      rowCount: rows.length,
      avgAging
    };
  }).sort((a, b) => b.qty - a.qty).slice(0, 10);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm h-full">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Top 10 Mã hàng nợ</h3>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-400 font-bold uppercase">
            <th className="px-4 py-2 font-bold">Mã PT</th>
            <th className="px-4 py-2">Tên PT</th>
            <th className="px-4 py-2 text-right">Tổng SL</th>
            <th className="px-4 py-2 text-right">Số dòng</th>
            <th className="px-4 py-2 text-right">TB ngày</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stats.map((s) => (
            <tr key={s.code} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-2.5 font-bold text-slate-900">{s.code}</td>
              <td className="px-4 py-2.5 text-slate-500 truncate max-w-[200px]">{s.name}</td>
              <td className="px-4 py-2.5 text-right font-bold">{formatNumber(s.qty)}</td>
              <td className="px-4 py-2.5 text-right">{formatNumber(s.rowCount)}</td>
              <td className="px-4 py-2.5 text-right">{s.avgAging.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
