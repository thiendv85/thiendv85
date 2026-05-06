'use client';
import { useState, useMemo } from 'react';
import { TransformedBOData } from '@/lib/transform';
import { formatNumber, cn } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';
import Papa from 'papaparse';

interface DataTableProps {
  data: TransformedBOData[];
}

type SortConfig = {
  key: keyof TransformedBOData | null;
  direction: 'asc' | 'desc';
};

export default function DataTable({ data }: DataTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const aVal = a[sortConfig.key!] ?? "";
        const bVal = b[sortConfig.key!] ?? "";
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage) || 1;
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const requestSort = (key: keyof TransformedBOData) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleExport = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `backorder_export_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ col }: { col: keyof TransformedBOData }) => {
    if (sortConfig.key !== col) return <div className="w-3 h-3" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Bảng chi tiết phụ tùng nợ</h3>
        <button 
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold uppercase tracking-tight hover:bg-slate-50 transition-colors"
        >
          <Download size={12} /> Xuất CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[11px] relative border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            <tr className="text-slate-400 font-bold uppercase">
              {[
                { label: "Ngày nợ", key: "DocDate" },
                { label: "Số chứng từ", key: "DocNo" },
                { label: "Đại lý", key: "SR-ĐL2" },
                { label: "Loại đơn", key: "OPropertyName" },
                { label: "Mã PT", key: "ItemCode" },
                { label: "Tên PT", key: "ItemName" },
                { label: "Model", key: "TypeCar" },
                { label: "SL nợ", key: "Quantity" },
                { label: "Tình trạng", key: "ETAGroup" },
                { label: "Ngày ETA", key: "EstimatedDate1" },
                { label: "Tuổi nợ", key: "AgingDays" }
              ].map(col => (
                <th 
                  key={col.key} 
                  className="px-4 py-3 cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap"
                  onClick={() => requestSort(col.key as any)}
                >
                  <div className="flex items-center gap-1">
                    {col.label} <SortIcon col={col.key as any} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {currentData.map((row, i) => (
              <tr 
                key={i} 
                className={cn(
                  "border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors",
                  row.ETAGroup === "Quá hạn ETA" ? "bg-rose-50/30" : 
                  row.ETAGroup === "Chưa có ETA" ? "bg-orange-50/30" :
                  row.ETAGroup === "Sắp về (<14 ngày)" ? "bg-emerald-50/30" : ""
                )}
              >
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{row.DocDate}</td>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{row.DocNo}</td>
                <td className="px-4 py-2.5 font-medium text-slate-700 truncate max-w-[120px]">{row["SR-ĐL2"]}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                    {row.OPropertyName}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-bold text-slate-900 whitespace-nowrap">{row.ItemCode}</td>
                <td className="px-4 py-2.5 text-slate-500 truncate max-w-[200px]">{row.ItemName}</td>
                <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{row.TypeCar || "—"}</td>
                <td className="px-4 py-2.5 text-right font-bold">{formatNumber(row.Quantity)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <StatusBadge label={row.ETAGroup} type={row.ETAGroup} />
                </td>
                <td className="px-4 py-2.5 text-center font-bold text-blue-600 whitespace-nowrap">{row.EstimatedDate1 || "—"}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{row.AgingDays}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] font-bold text-slate-500">
        <div>
          Hiển thị {sortedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, sortedData.length)} / {sortedData.length} dòng
        </div>
        <div className="flex items-center gap-1">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="px-3 py-1 bg-white border border-slate-200 rounded disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Trước
          </button>
          <span className="px-4 tabular-nums text-slate-900 font-black">Trang {currentPage} / {totalPages}</span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="px-3 py-1 bg-white border border-slate-200 rounded disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}
