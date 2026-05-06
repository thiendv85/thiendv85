'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import EmptyState from '@/components/EmptyState';
import DataTable from '@/components/DataTable';
import { Search } from 'lucide-react';

export default function DetailPage() {
  const { data } = useData();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    region: "Tất cả",
    eta: "Tất cả",
    type: "Tất cả"
  });

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const s = search.toLowerCase();
      const matchSearch = d.ItemCode.toLowerCase().includes(s) || 
                          d.ItemName.toLowerCase().includes(s) || 
                          d["SR-ĐL2"].toLowerCase().includes(s);
      const matchRegion = filters.region === "Tất cả" || d.Region === filters.region;
      const matchETA = filters.eta === "Tất cả" || d.ETAGroup === filters.eta;
      const matchType = filters.type === "Tất cả" || d.OPropertyName === filters.type;
      
      return matchSearch && matchRegion && matchETA && matchType;
    });
  }, [data, search, filters]);

  if (data.length === 0) {
    return <div className="max-w-[1400px] mx-auto p-6"><EmptyState /></div>;
  }

  const regions = ["Tất cả", "Miền Bắc", "Miền Nam"];
  const etas = ["Tất cả", "Quá hạn ETA", "Chưa có ETA", "Sắp về (<14 ngày)", "Có ETA (>14 ngày)", "Đang xử lý"];
  const types = ["Tất cả", ...Array.from(new Set(data.map(d => d.OPropertyName)))].sort();

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text"
            placeholder="Tìm theo Mã, Tên hoặc Đại lý..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-xs outline-none focus:ring-2 focus:ring-slate-200 font-medium"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Vùng</label>
            <select 
              value={filters.region}
              onChange={(e) => setFilters({ ...filters, region: e.target.value })}
              className="text-[11px] font-bold bg-slate-50 border-none rounded px-2 py-1 outline-none"
            >
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tình trạng</label>
            <select 
              value={filters.eta}
              onChange={(e) => setFilters({ ...filters, eta: e.target.value })}
              className="text-[11px] font-bold bg-slate-50 border-none rounded px-2 py-1 outline-none"
            >
              {etas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Loại đơn</label>
            <select 
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="text-[11px] font-bold bg-slate-50 border-none rounded px-2 py-1 outline-none"
            >
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <DataTable data={filteredData} />
    </div>
  );
}
