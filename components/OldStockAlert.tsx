
import React, { useMemo, useState } from 'react';
import { InventoryItem, BackorderDetail } from '../types/inventory';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { BackorderPopup } from './BackorderPopup';
import { 
    AlertTriangle, 
    ChevronDown, 
    ChevronRight, 
    Archive,
    History,
    ArrowRight,
    CheckCircle,
    Package,
    ArrowLeftRight,
    FilterX,
    Eye
} from 'lucide-react';

interface OldStockAlertProps {
    data: InventoryItem[];
    graph: SupersessionGraph;
    onPartClick?: (partNumber: string) => void;
}

interface AlertRow {
    currentPart: string;
    itemName: string;
    currentStock: number;
    currentBO: number;
    currentBOBreakdown: BackorderDetail[];
    totalOldStock: number;
    totalOldBO: number;
    totalOldBOBreakdown: BackorderDetail[];
    oldSkusWithStockCount: number;
    details: Array<{
        partNumber: string;
        stock: number;
        bo: number;
        boBreakdown: BackorderDetail[];
        lastSold?: string; 
    }>;
}

// --- 1. Minimalist Metric Card Component ---
const MetricCard = ({ 
    label, 
    value, 
    subLabel, 
    icon: Icon, 
    colorClass, 
    bgClass,
    onClick,
    isActive
}: { 
    label: string, 
    value: string, 
    subLabel: string, 
    icon?: any, 
    colorClass: string, 
    bgClass?: string,
    onClick?: () => void,
    isActive?: boolean
}) => (
    <div 
        onClick={onClick}
        className={`
            bg-white rounded-xl border p-6 shadow-sm flex flex-col justify-between h-full transition-all duration-200
            ${onClick ? 'cursor-pointer select-none' : ''}
            ${isActive 
                ? 'ring-2 ring-offset-2 ring-blue-500 border-blue-500 bg-blue-50/10' 
                : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
            }
            ${bgClass || ''}
        `}
    >
        <div className="flex justify-between items-start mb-4">
            <div className="text-sm font-bold text-gray-500 uppercase tracking-wide">{label}</div>
            {Icon && (
                <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : (bgClass ? 'bg-white/50' : 'bg-gray-50')}`}>
                    <Icon size={24} className={isActive ? 'text-blue-600' : colorClass} />
                </div>
            )}
        </div>
        <div>
            <div className={`text-3xl font-bold leading-none mb-2 ${isActive ? 'text-blue-700' : colorClass}`}>{value}</div>
            <div className={`text-sm font-medium ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>{subLabel}</div>
        </div>
    </div>
);

export const OldStockAlert: React.FC<OldStockAlertProps> = ({ data, graph, onPartClick }) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'HAS_BO'>('ALL');

    const toggleRow = (partNumber: string) => {
        const next = new Set(expandedRows);
        if (next.has(partNumber)) next.delete(partNumber);
        else next.add(partNumber);
        setExpandedRows(next);
    };

    // --- LOGIC ENGINE ---
    const { alerts, summary } = useMemo(() => {
        const results: AlertRow[] = [];
        const itemMap = new Map<string, InventoryItem>();
        data.forEach(i => itemMap.set(i.ItemCode, i));

        const processedCurrentParts = new Set<string>();

        graph.chains.forEach(chain => {
            const currentPart = chain.currentPart;
            if (processedCurrentParts.has(currentPart)) return;
            processedCurrentParts.add(currentPart);

            const currentItem = itemMap.get(currentPart);
            const currentStock = currentItem ? (currentItem.QuantityInventory_NB + currentItem.QuantityInventory_BB) : 0;
            const currentBO = currentItem?.Backorder || 0;
            const currentBOBreakdown = currentItem?.BackorderBreakdown || [];
            const itemName = currentItem?.ItemName || 'N/A';

            let totalOldStock = 0;
            let totalOldBO = 0;
            let totalOldBOBreakdown: BackorderDetail[] = [];
            const details: AlertRow['details'] = [];

            chain.obsoleteParts.forEach(oldCode => {
                const oldItem = itemMap.get(oldCode);
                const oldStock = oldItem ? (oldItem.QuantityInventory_NB + oldItem.QuantityInventory_BB) : 0;
                const oldBO = oldItem?.Backorder || 0;
                const oldBOBreakdown = oldItem?.BackorderBreakdown || [];

                if (oldStock > 0) {
                    totalOldStock += oldStock;
                    totalOldBO += oldBO;
                    if (oldBO > 0) {
                        totalOldBOBreakdown = [...totalOldBOBreakdown, ...oldBOBreakdown];
                    }
                    details.push({
                        partNumber: oldCode,
                        stock: oldStock,
                        bo: oldBO,
                        boBreakdown: oldBOBreakdown
                    });
                }
            });

            if (totalOldStock > 0) {
                results.push({
                    currentPart,
                    itemName,
                    currentStock,
                    currentBO,
                    currentBOBreakdown,
                    totalOldStock,
                    totalOldBO,
                    totalOldBOBreakdown,
                    oldSkusWithStockCount: details.length,
                    details: details.sort((a, b) => b.stock - a.stock)
                });
            }
        });

        results.sort((a, b) => b.totalOldStock - a.totalOldStock);

        // Calculate KPI: How many Current Parts have Backorder AND there is Old Stock available?
        const substitutionOpportunities = results.filter(r => r.currentBO > 0).length;

        return {
            alerts: results,
            summary: {
                totalChains: results.length,
                totalVolume: results.reduce((sum, r) => sum + r.totalOldStock, 0),
                substitutionOpportunities
            }
        };
    }, [data, graph]);

    // --- FILTERING LOGIC ---
    const filteredAlerts = useMemo(() => {
        if (activeFilter === 'HAS_BO') {
            return alerts.filter(row => row.currentBO > 0);
        }
        return alerts;
    }, [alerts, activeFilter]);

    if (alerts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-gray-200 text-center shadow-sm min-h-[500px]">
                <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={48} />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 uppercase">Hệ thống sạch</h3>
                <p className="text-base text-gray-500 mt-3 max-w-lg leading-relaxed">
                    Tuyệt vời! Không phát hiện tồn kho của các mã phụ tùng cũ (Superseded).
                    Toàn bộ tồn kho hiện tại đều là mã mới nhất.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-6 bg-gray-50 min-h-screen font-sans animate-fadeIn">
            {/* 1. HEADER & METRICS */}
            <div className="flex flex-col gap-8">
                <div>
                    <h2 className="text-2xl font-bold text-blue-800 uppercase tracking-tight flex items-center gap-3">
                        <History size={28} className="text-blue-800" />
                        Cảnh Báo Tồn Mã Cũ
                    </h2>
                    <p className="text-base text-gray-600 mt-2 max-w-4xl leading-relaxed">
                        Danh sách các mã phụ tùng đã bị thay thế (Superseded) nhưng vẫn còn tồn kho thực tế.
                        Cần ưu tiên xuất bán các mã này trước khi nhập thêm mã mới để tránh lãng phí vốn.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <MetricCard 
                        label="Cần Thanh Lý (Units)" 
                        value={summary.totalVolume.toLocaleString()} 
                        subLabel="Tổng tồn kho mã cũ" 
                        icon={Package}
                        colorClass="text-red-600" 
                        bgClass="bg-red-50/30 border-red-100"
                        isActive={activeFilter === 'ALL'}
                        onClick={() => setActiveFilter('ALL')}
                    />
                    <MetricCard 
                        label="Cơ Hội Xử Lý BO" 
                        value={summary.substitutionOpportunities.toString()} 
                        subLabel="Mã Mới Nợ & Mã Cũ Còn" 
                        icon={ArrowLeftRight}
                        colorClass="text-amber-600" 
                        bgClass="bg-amber-50/30 border-amber-100"
                        isActive={activeFilter === 'HAS_BO'}
                        onClick={() => setActiveFilter('HAS_BO')}
                    />
                    <MetricCard 
                        label="Mã Bị Ảnh Hưởng" 
                        value={summary.totalChains.toString()} 
                        subLabel="SKU Active có tồn cũ" 
                        icon={AlertTriangle}
                        colorClass="text-gray-800" 
                        isActive={activeFilter === 'ALL'}
                        onClick={() => setActiveFilter('ALL')}
                    />
                    
                    {/* Strategy Card */}
                    <div className="bg-blue-800 rounded-xl p-6 text-white shadow-md flex flex-col justify-center h-full">
                        <div className="flex items-center gap-3 mb-3">
                            <Archive size={24} className="text-blue-300" />
                            <h4 className="text-base font-bold uppercase tracking-wide">Chiến lược ưu tiên</h4>
                        </div>
                        <p className="text-sm font-medium leading-7 opacity-90">
                            1. Dừng nhập mã mới nếu tồn mã cũ {'>'} 3 tháng bán.<br/>
                            2. Tự động chuyển đổi mã khi tạo đơn hàng.<br/>
                            3. Gán nhãn "Ưu tiên xuất" trên phiếu kho.
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. DATA TABLE */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                {/* Table Header Filter Indicator */}
                {activeFilter === 'HAS_BO' && (
                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                            <ArrowLeftRight size={16} />
                            Đang lọc: Chỉ hiển thị mã mới đang nợ hàng (BO)
                        </div>
                        <button 
                            onClick={() => setActiveFilter('ALL')}
                            className="flex items-center gap-1 text-xs font-black uppercase text-amber-700 hover:text-amber-900"
                        >
                            <FilterX size={12} /> Xóa lọc
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider w-16"></th>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">Mã Hiện Hành (New)</th>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">Tên Sản Phẩm</th>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider text-center">Tồn Mã Mới</th>
                                <th className="px-6 py-5 text-sm font-bold text-red-600 uppercase tracking-wider text-center border-l border-gray-200">Nợ BO (Mới)</th>
                                <th className="px-6 py-5 text-sm font-bold text-red-600 uppercase tracking-wider text-center bg-red-50/30 border-l border-red-50">Tồn Mã Cũ</th>
                                <th className="px-6 py-5 text-sm font-bold text-red-600 uppercase tracking-wider text-center border-l border-gray-200">Nợ BO (Cũ)</th>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider text-center">Số lượng mã</th>
                                <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider text-center">Chi tiết</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredAlerts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-gray-400">
                                        Không tìm thấy dữ liệu phù hợp với bộ lọc.
                                    </td>
                                </tr>
                            ) : (
                                filteredAlerts.map((row) => {
                                    const isExpanded = expandedRows.has(row.currentPart);
                                    return (
                                        <React.Fragment key={row.currentPart}>
                                            <tr 
                                                onClick={() => toggleRow(row.currentPart)}
                                                className={`cursor-pointer transition-colors h-16 group ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}
                                            >
                                                <td className="px-6 py-4 text-center text-gray-400">
                                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div 
                                                        onClick={(e) => { e.stopPropagation(); onPartClick && onPartClick(row.currentPart); }}
                                                        className="text-base font-bold text-blue-800 font-mono tracking-tight group-hover:text-blue-600 transition-colors hover:underline underline-offset-4 decoration-2 decoration-blue-300"
                                                    >
                                                        {row.currentPart}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-base font-bold text-gray-700 truncate max-w-[250px]">
                                                        {row.itemName}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="text-base font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-lg inline-block min-w-[60px]">
                                                        {row.currentStock.toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center border-l border-gray-100">
                                                    <BackorderPopup items={row.currentBOBreakdown || []}>
                                                        <div className={`text-base font-bold cursor-help hover:scale-105 transition-transform ${row.currentBO > 0 ? 'text-red-600 hover:text-red-800 border-b border-dashed border-red-300' : 'text-gray-300'}`}>
                                                            {row.currentBO > 0 ? row.currentBO.toLocaleString() : '-'}
                                                        </div>
                                                    </BackorderPopup>
                                                </td>
                                                <td className="px-6 py-4 text-center bg-red-50/10 border-l border-red-50/50">
                                                    <div className="text-lg font-bold text-red-600 bg-white border border-red-100 px-4 py-1 rounded-lg inline-block min-w-[60px] shadow-sm">
                                                        {row.totalOldStock.toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center border-l border-gray-100">
                                                    <BackorderPopup items={row.totalOldBOBreakdown || []}>
                                                        <div className={`text-base font-bold cursor-help hover:scale-105 transition-transform ${row.totalOldBO > 0 ? 'text-red-600 hover:text-red-800 border-b border-dashed border-red-300' : 'text-gray-300'}`}>
                                                            {row.totalOldBO > 0 ? row.totalOldBO.toLocaleString() : '-'}
                                                        </div>
                                                    </BackorderPopup>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-sm font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                                        {row.oldSkusWithStockCount} mã
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button className="h-10 w-10 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center transition-all shadow-sm mx-auto">
                                                        <ChevronDown size={20} />
                                                    </button>
                                                </td>
                                            </tr>
                                            
                                            {/* EXPANDED SECTION */}
                                            {isExpanded && (
                                                <tr className="bg-gray-50/50">
                                                    <td colSpan={9} className="p-0 border-b border-gray-200">
                                                        <div className="py-6 px-16 bg-gray-50 border-t border-gray-200 shadow-inner">
                                                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-w-4xl">
                                                                <div className="px-6 py-4 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                                                                    <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                                                                        <History size={18} /> Chi tiết các mã cũ còn tồn
                                                                    </h4>
                                                                    <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded border border-blue-100">
                                                                        Hành động: Ưu tiên xuất trước
                                                                    </span>
                                                                </div>
                                                                <table className="w-full text-left">
                                                                    <thead className="bg-white border-b border-gray-100 text-gray-400">
                                                                        <tr>
                                                                            <th className="px-6 py-3 text-sm font-bold uppercase w-1/3">Mã Phụ Tùng (Cũ)</th>
                                                                            <th className="px-6 py-3 text-sm font-bold uppercase w-1/3">Quan Hệ</th>
                                                                            <th className="px-6 py-3 text-sm font-bold uppercase text-right">Tồn Kho</th>
                                                                            <th className="px-6 py-3 text-sm font-bold uppercase text-right">Nợ (BO)</th>
                                                                            <th className="px-6 py-3 text-sm font-bold uppercase text-center">Thao tác</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100">
                                                                        {row.details.map((detail) => (
                                                                            <tr key={detail.partNumber} className="hover:bg-gray-50 transition-colors h-14">
                                                                                <td className="px-6 py-3">
                                                                                    <div 
                                                                                        onClick={(e) => { e.stopPropagation(); onPartClick && onPartClick(detail.partNumber); }}
                                                                                        className="text-base font-bold text-gray-700 font-mono cursor-pointer hover:text-blue-600 hover:underline underline-offset-4 decoration-dashed decoration-2"
                                                                                    >
                                                                                        {detail.partNumber}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-3">
                                                                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                                                                                        <ArrowRight size={16} className="text-gray-300"/> 
                                                                                        <span>Thay bởi <strong className="text-gray-700">{row.currentPart}</strong></span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-3 text-right">
                                                                                    <span className="text-base font-bold text-red-600 bg-red-50 px-3 py-1 rounded border border-red-100">
                                                                                        {detail.stock}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-6 py-3 text-right">
                                                                                    <BackorderPopup items={detail.boBreakdown || []}>
                                                                                        <span className={`text-base font-bold cursor-help ${detail.bo > 0 ? 'text-red-600 hover:text-red-800 border-b border-dashed border-red-300' : 'text-gray-300'}`}>
                                                                                            {detail.bo > 0 ? detail.bo : '-'}
                                                                                        </span>
                                                                                    </BackorderPopup>
                                                                                </td>
                                                                                <td className="px-6 py-3 text-center">
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); onPartClick && onPartClick(detail.partNumber); }}
                                                                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all mx-auto"
                                                                                        title="Xem chi tiết"
                                                                                    >
                                                                                        <Eye size={18} />
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
