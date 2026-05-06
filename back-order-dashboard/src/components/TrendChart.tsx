'use client';
import { useData } from './DataProvider';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function TrendChart() {
  const { data } = useData();
  
  const months = Array.from(new Set(data.map(d => {
    const date = d.ParsedDocDate;
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${m}/${y}`;
  }))).sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number);
    const [mb, yb] = b.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });

  const chartData = months.map(m => {
    const rows = data.filter(d => {
      const date = d.ParsedDocDate;
      const dm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dy = date.getFullYear();
      return `${dm}/${dy}` === m;
    });
    return {
      month: m,
      "Số dòng": rows.length,
      "Tổng SL": rows.reduce((acc, curr) => acc + curr.Quantity, 0)
    };
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Xu hướng nợ hàng theo tháng</h3>
      </div>
      <div className="flex-1 min-h-[300px] p-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
            />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
            />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingBottom: '20px' }} />
            <Line type="monotone" dataKey="Số dòng" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="Tổng SL" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
