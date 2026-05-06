'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import EmptyState from '@/components/EmptyState';
import FilterBar from '@/components/FilterBar';
import PrioritySection from '@/components/PrioritySection';

export default function ActionBoardPage() {
  const { data } = useData();
  const [filters, setFilters] = useState({
    region: "Tất cả",
    dealer: "Tất cả",
    type: "Tất cả"
  });

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchRegion = filters.region === "Tất cả" || d.Region === filters.region;
      const matchDealer = filters.dealer === "Tất cả" || d["SR-ĐL2"] === filters.dealer;
      const matchType = filters.type === "Tất cả" || d.OPropertyName === filters.type;
      return matchRegion && matchDealer && matchType;
    });
  }, [data, filters]);

  if (data.length === 0) {
    return <div className="max-w-[1400px] mx-auto p-6"><EmptyState /></div>;
  }

  const overdueETA = filteredData
    .filter(d => d.ETAGroup === "Quá hạn ETA")
    .sort((a, b) => (a.DaysUntilETA || 0) - (b.DaysUntilETA || 0));

  const urgentNoETA = filteredData
    .filter(d => d.ETAGroup === "Chưa có ETA" && d.isUrgent)
    .sort((a, b) => b.AgingDays - a.AgingDays);

  const incomingSoon = filteredData
    .filter(d => d.ETAGroup === "Sắp về (<14 ngày)")
    .sort((a, b) => (a.DaysUntilETA || 0) - (b.DaysUntilETA || 0));

  const urgentLongAging = filteredData
    .filter(d => d.AgingDays > 90 && d.isUrgent && d.ETAGroup !== "Quá hạn ETA" && d.ETAGroup !== "Chưa có ETA")
    .sort((a, b) => b.AgingDays - a.AgingDays);

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-black uppercase tracking-tight text-slate-400">Action Board</h2>
        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tabular-nums">
          {filteredData.length} dòng phù hợp
        </span>
      </div>
      
      <FilterBar filters={filters} setFilters={setFilters} />

      {filteredData.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Không có dữ liệu phù hợp với bộ lọc</p>
        </div>
      ) : (
        <>
          <PrioritySection title="🔴 Quá hạn ETA" data={overdueETA} color="red" />
          <PrioritySection title="🟠 Khẩn chưa có ETA" data={urgentNoETA} color="orange" />
          <PrioritySection title="🟢 Sắp về (<14 ngày)" data={incomingSoon} color="green" />
          <PrioritySection title="🟡 Khẩn >90 ngày" data={urgentLongAging} color="yellow" />
        </>
      )}
    </div>
  );
}
