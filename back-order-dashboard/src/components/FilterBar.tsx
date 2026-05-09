'use client';
import { useData } from './DataProvider';

interface FilterBarProps {
  filters: {
    region: string;
    dealer: string;
    type: string;
  };
  setFilters: (f: { region: string; dealer: string; type: string }) => void;
}

export default function FilterBar({ filters, setFilters }: FilterBarProps) {
  const { data } = useData();
  
  const regions = ["Tất cả", "Miền Bắc", "Miền Nam"];
  const dealers = ["Tất cả", ...Array.from(new Set(data.map(d => d["SR-ĐL2"])))].sort();
  const types = ["Tất cả", ...Array.from(new Set(data.map(d => d.OPropertyName)))].sort();

  return (
    <div className="flex flex-wrap items-center gap-6 p-4 bg-white border border-slate-200 rounded-lg shadow-sm mb-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vùng miền</label>
        <select 
          value={filters.region}
          onChange={(e) => setFilters({ ...filters, region: e.target.value })}
          className="text-xs font-bold bg-slate-50 border-none rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-slate-200"
        >
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đại lý</label>
        <select 
          value={filters.dealer}
          onChange={(e) => setFilters({ ...filters, dealer: e.target.value })}
          className="text-xs font-bold bg-slate-50 border-none rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-slate-200 max-w-[200px]"
        >
          {dealers.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loại đơn</label>
        <select 
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="text-xs font-bold bg-slate-50 border-none rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-slate-200"
        >
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}
