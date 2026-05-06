'use client';
import { useData } from '@/components/DataProvider';
import EmptyState from '@/components/EmptyState';
import KPICard from '@/components/KPICard';
import AgingTable from '@/components/AgingTable';
import ETADonut from '@/components/ETADonut';
import DealerTable from '@/components/DealerTable';
import ItemTable from '@/components/ItemTable';
import TrendChart from '@/components/TrendChart';

export default function DashboardPage() {
  const { data, isLoading } = useData();

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded"></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-lg"></div>)}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto p-6">
        <EmptyState />
      </div>
    );
  }

  const kpis = [
    { label: "Tổng dòng nợ", value: data.length, sub: "Tổng số dòng ghi nhận", color: "neutral" as const },
    { label: "Tổng số lượng", value: data.reduce((acc, curr) => acc + curr.Quantity, 0), sub: "Tổng số lượng phụ tùng", color: "neutral" as const },
    { label: "Đơn khẩn", value: data.filter(d => d.isUrgent).length, sub: "Đơn Khẩn & Khẩn VOR", color: "orange" as const },
    { label: "Quá hạn ETA", value: data.filter(d => d.ETAGroup === "Quá hạn ETA").length, sub: "Đã quá ngày hẹn dự kiến", color: "red" as const },
    { label: "Chưa có ETA", value: data.filter(d => d.ETAGroup === "Chưa có ETA").length, sub: "Thiếu thông tin ngày về", color: "orange" as const },
    { label: "Sắp về <14 ngày", value: data.filter(d => d.ETAGroup === "Sắp về (<14 ngày)").length, sub: "Dự kiến về trong 2 tuần", color: "green" as const },
  ];

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6 pb-12">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <KPICard key={i} {...k} value={k.value.toLocaleString('vi-VN')} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <AgingTable />
        </div>
        <div className="lg:col-span-2">
          <ETADonut />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DealerTable />
        <ItemTable />
      </div>

      <div className="w-full">
        <TrendChart />
      </div>
    </div>
  );
}
