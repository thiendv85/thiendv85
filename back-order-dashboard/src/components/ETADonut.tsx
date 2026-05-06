'use client';
import { useData } from './DataProvider';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export default function ETADonut() {
  const { data } = useData();
  
  const groups = Array.from(new Set(data.map(d => d.ETAGroup)));
  const stats = groups.map(group => ({
    name: group,
    value: data.filter(d => d.ETAGroup === group).length
  })).sort((a, b) => b.value - a.value);

  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#94a3b8'];

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tình trạng ETA</h3>
      </div>
      <div className="flex-1 min-h-[250px] p-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={stats}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {stats.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
            />
            <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
