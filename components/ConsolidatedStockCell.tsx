
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { InventoryItem } from '../types/inventory';
import { SupersessionGraph, calculateConsolidatedInventory } from '../utils/supersessionGraph';
import { Layers } from 'lucide-react';
import { Typography } from './Typography';

// Inline: ConsolidatedInventoryPopup
const ConsolidatedInventoryPopup: React.FC<{ item: InventoryItem; allItems: InventoryItem[]; graph: SupersessionGraph; children: React.ReactNode }> = ({ item, allItems, graph, children }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const consolidated = useMemo(() => calculateConsolidatedInventory(item.ItemCode, allItems, graph), [item.ItemCode, allItems, graph]);

    return (
        <div className="relative inline-block" ref={ref}>
        <button 
            onClick={() => setOpen(o => !o)} 
            className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 rounded"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label="Xem chi tiết tồn kho gộp"
        >
            {children}
        </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-fadeIn">
                    <Typography variant="label" className="text-slate-500 mb-3 flex items-center gap-2">
                        <Layers size={12} /> Tồn kho gộp cả chuỗi
                    </Typography>
                    <div className="space-y-2">
                        {consolidated.breakdown.map((b) => (
                            <div key={b.partNumber} className={`flex justify-between items-center p-2 rounded-lg transition-all duration-200 ${b.partNumber === item.ItemCode ? 'bg-blue-50 border border-blue-200 shadow-sm scale-[1.02]' : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'
                                }`}>
                                <Typography variant="mono" className={`!font-extrabold tabular-nums ${b.partNumber === item.ItemCode ? 'text-blue-900' : 'text-slate-900'}`}>{b.partNumber}</Typography>
                                <Typography variant="body-sm" className={`tabular-nums ${b.partNumber === item.ItemCode ? 'text-blue-700 !font-black' : 'text-slate-700 !font-bold'}`}>{b.stock.toLocaleString()}</Typography>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <Typography variant="label" className="text-slate-500">Tổng gộp</Typography>
                        <Typography variant="body" className="!font-black text-indigo-700 text-lg tabular-nums">{consolidated.totalStock.toLocaleString()}</Typography>
                    </div>
                </div>
            )}
        </div>
    );
};

interface ConsolidatedStockCellProps {
    item: InventoryItem;
    allItems: InventoryItem[];
    graph?: SupersessionGraph;
    className?: string;
}

export const ConsolidatedStockCell: React.FC<ConsolidatedStockCellProps> = ({ item, allItems, graph, className = "" }) => {
    // 1. Lấy tồn kho vật lý của riêng SKU này
    const currentSkuStock = (item.QuantityInventory_NB || 0) + (item.QuantityInventory_BB || 0) + (item.QuantityDC_NB || 0) + (item.QuantityDC_BB || 0);

    // 2. Tính toán dữ liệu gộp
    const { totalConsolidated, hasChain } = useMemo(() => {
        if (!graph) return { totalConsolidated: currentSkuStock, hasChain: false };

        const consolidated = calculateConsolidatedInventory(item.ItemCode, allItems, graph);
        // Chỉ coi là có chuỗi nếu có ít nhất 2 SKU khác nhau trong chuỗi có tồn kho hoặc tồn tại mapping
        const isStandalone = consolidated.breakdown.length <= 1;

        return {
            totalConsolidated: consolidated.totalStock,
            hasChain: !isStandalone
        };
    }, [item.ItemCode, currentSkuStock, allItems, graph]);

    // 3. Nếu là mã đơn lẻ, hiển thị bình thường
    if (!hasChain || !graph) {
        return (
            <Typography variant="body" className={`!font-bold text-slate-900 mb-0.5 block tabular-nums ${className}`}>
                {currentSkuStock.toLocaleString()}
            </Typography>
        );
    }

    // 4. Nếu có chuỗi thay thế: Hiển thị SKU stock làm chính, badge Gộp làm phụ
    return (
        <ConsolidatedInventoryPopup item={item} allItems={allItems} graph={graph}>
            <div className={`flex flex-col items-end group ${className}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                    {/* SỐ CHÍNH: Tồn kho SKU hiện tại */}
                    <Typography variant="body" className="!font-bold text-slate-900 group-hover:text-blue-700 transition-colors tabular-nums">
                        {currentSkuStock.toLocaleString()}
                    </Typography>

                    {/* BADGE PHỤ: Tổng tồn gộp */}
                    <Typography
                        as="span"
                        variant="label"
                        className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-700 transition-all shadow-sm tabular-nums"
                        title={`Tổng tồn gộp cả chuỗi: ${totalConsolidated.toLocaleString()}`}
                    >
                        <Layers size={10} /> {totalConsolidated.toLocaleString()}
                    </Typography>
                </div>
            </div>
        </ConsolidatedInventoryPopup>
    );
};
