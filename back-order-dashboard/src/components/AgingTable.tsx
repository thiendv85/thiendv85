'use client';
import { useData } from './DataProvider';
import { formatNumber } from '@/lib/utils';

export default function AgingTable() {
  const { data } = useData();
  
  const buckets = ["0–30 ngày", "31–60 ngày", "61–90 ngày", "91–180 ngày", ">180 ngày"];
  
  const stats = buckets.map(bucket => {
    const rows = data.filter(d => d.AgingBucket === bucket);
    const qty = rows.reduce((acc, curr) => acc + curr.Quantity, 0);
    return {
      bucket,
      rowCount: rows.length,
      qty,
      percent: data.length > 0 ? (rows.length / data.length) * 100 : 0
    };
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm h-full">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Phân bổ tuổi nợ</h3>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-400 font-bold uppercase">
            <th className="px-4 py-2 font-bold">Nhóm tuổi</th>
            <th className="px-4 py-2 text-right">Số dòng</th>
            <th className="px-4 py-2 text-right">Số lượng</th>
            <th className="px-4 py-2 text-right">Tỷ lệ %</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stats.map((s) => (
            <tr key={s.bucket} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-slate-700">{s.bucket}</td>
              <td className="px-4 py-2.5 text-right font-bold">{formatNumber(s.rowCount)}</td>
              <td className="px-4 py-2.5 text-right font-bold">{formatNumber(s.qty)}</td>
              <td className="px-4 py-2.5 text-right text-slate-400">{s.percent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
