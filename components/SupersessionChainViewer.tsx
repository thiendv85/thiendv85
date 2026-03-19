
import React, { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';
import { SupersessionGraph, calculateConsolidatedInventory } from '../utils/supersessionGraph';
import { ArrowRight, Package, Info, Link, ArrowLeftRight } from 'lucide-react';

interface SupersessionChainViewerProps {
    partNumber: string;
    graph: SupersessionGraph;
    items: InventoryItem[];
    onPartClick?: (partNumber: string) => void;
}

export const SupersessionChainViewer: React.FC<SupersessionChainViewerProps> = ({
    partNumber,
    graph,
    items,
    onPartClick
}) => {
    // 1. Calculate Data using robust getter
    const { chainData, consolidated } = useMemo(() => {
        const chain = graph.getChain(partNumber);
        const metrics = calculateConsolidatedInventory(partNumber, items, graph);
        return { chainData: chain, consolidated: metrics };
    }, [partNumber, graph, items]);

    // 2. Empty State
    if (!chainData || chainData.allParts.length <= 1) {
        return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center h-full flex flex-col items-center justify-center min-h-[120px]">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mb-2 shadow-sm text-slate-300 border border-slate-100">
                    <Package size={16} />
                </div>
                <h4 className="text-2xs font-black text-slate-700 uppercase tracking-wide mb-0.5">Mã Độc Lập</h4>
                <p className="text-2xs text-slate-500 font-medium max-w-[150px]">Mã {partNumber} không có lịch sử thay thế.</p>
            </div>
        );
    }

    // 3. Sort for Visualization (Topological Order)
    // Use the order defined in chainData.allParts which follows the traversal (Oldest -> Newest)
    const nodeOrderMap = new Map<string, number>();
    chainData.allParts.forEach((p, i) => nodeOrderMap.set(p, i));

    const sortedNodes = [...consolidated.breakdown].sort((a, b) => {
        const idxA = nodeOrderMap.get(a.partNumber) ?? 999;
        const idxB = nodeOrderMap.get(b.partNumber) ?? 999;
        return idxA - idxB;
    });

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col animate-fadeIn w-full">
            {/* Ultra Compact Header */}
            <div className="bg-white border-b border-slate-100 px-3 py-2 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-purple-50 p-1 rounded-md text-purple-600">
                        <Link size={12} />
                    </div>
                    <h3 className="text-2xs font-black text-slate-700 uppercase tracking-wider">
                        Supersession Chain
                    </h3>
                </div>

                <div className="flex items-center gap-3 text-2xs">
                    <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <span className="font-bold text-slate-400 uppercase">Tổng tồn:</span>
                        <span className="font-black text-slate-900">{consolidated.totalStock.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <span className="font-bold text-slate-400 uppercase">Giá trị:</span>
                        <span className="font-black text-blue-700">
                            {new Intl.NumberFormat('vi-VN', { notation: "compact" }).format(consolidated.totalValue)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Ultra Compact Horizontal Scroll Area */}
            <div className="flex-1 overflow-x-auto p-3 bg-slate-50/30 flex items-center min-h-[140px] custom-scrollbar">
                <div className="flex items-center min-w-max mx-auto gap-0.5">
                    {sortedNodes.map((node, index) => {
                        const isLast = index === sortedNodes.length - 1;
                        const isSelected = node.partNumber === partNumber;
                        const itemDetails = items.find(i => i.ItemCode === node.partNumber);
                        const hasStock = node.stock > 0;

                        // Determine interchangeability of the LINK starting from this node to the next
                        // We check the edge: Node -> NextNode
                        const isInterchangeable = graph.interchangeable.get(node.partNumber) || false;

                        return (
                            <React.Fragment key={node.partNumber}>
                                {/* Compact Node Card */}
                                <div 
                                    onClick={() => onPartClick && onPartClick(node.partNumber)}
                                    className={`
                                        relative group flex flex-col items-center w-28 flex-shrink-0 transition-all cursor-pointer select-none
                                        ${isSelected ? 'scale-105 z-10' : 'hover:-translate-y-1 z-0'}
                                    `}
                                >
                                    <div className={`
                                        w-full bg-white rounded-lg border p-2 text-center shadow-sm transition-all relative overflow-hidden flex flex-col gap-0.5
                                        ${node.isCurrent 
                                            ? 'border-emerald-500 shadow-emerald-100 ring-1 ring-emerald-50' 
                                            : isSelected 
                                                ? 'border-blue-400 ring-1 ring-blue-50'
                                                : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                                        }
                                    `}>
                                        {/* Status Badge */}
                                        {node.isCurrent && (
                                            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-2xs font-black px-1 py-0.5 rounded-bl-sm uppercase tracking-wider leading-none">
                                                Active
                                            </div>
                                        )}

                                        {/* Part Number */}
                                        <div className={`font-mono text-xs font-black truncate leading-tight mt-1 ${node.isCurrent ? 'text-emerald-900' : 'text-slate-700'}`}>
                                            {node.partNumber}
                                        </div>
                                        
                                        {/* Product Name */}
                                        <div className="text-2xs text-slate-400 font-medium truncate w-full px-1" title={itemDetails?.ItemName}>
                                            {itemDetails?.ItemName || 'N/A'}
                                        </div>

                                        {/* Stock Pill */}
                                        <div className={`
                                            flex items-center justify-center gap-1 py-0.5 rounded text-2xs font-bold border mt-1
                                            ${hasStock 
                                                ? 'bg-slate-50 border-slate-200 text-slate-800' 
                                                : 'bg-white border-dashed border-slate-100 text-slate-300'}
                                        `}>
                                            <Package size={8} className={hasStock ? "text-blue-500" : "text-slate-300"} />
                                            {node.stock.toLocaleString()}
                                        </div>
                                    </div>
                                    
                                    {/* Obsolete Label (Hover only) */}
                                    {!node.isCurrent && (
                                        <div className="absolute -bottom-3 text-2xs font-bold text-slate-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            Old Part
                                        </div>
                                    )}
                                </div>

                                {/* Compact Connector Arrow */}
                                {!isLast && (
                                    <div className="flex flex-col items-center justify-center w-10 -mx-1 z-0 relative flex-shrink-0">
                                        <div className={`h-[2px] w-full absolute top-1/2 -translate-y-1/2 ${isInterchangeable ? 'bg-emerald-300' : 'bg-slate-200'}`}></div>
                                        <div className={`
                                            relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-2xs border shadow-sm
                                            ${isInterchangeable 
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-600' 
                                                : 'bg-white border-slate-200 text-slate-300'}
                                        `} title={isInterchangeable ? "Thay thế 2 chiều (Lẫn nhau)" : "Thay thế 1 chiều (Cũ -> Mới)"}>
                                            {isInterchangeable ? <ArrowLeftRight size={10} /> : <ArrowRight size={10} />}
                                        </div>
                                        {isInterchangeable && (
                                            <div className="absolute -bottom-4 text-2xs font-black text-emerald-600 bg-emerald-50 px-1 rounded uppercase tracking-tighter border border-emerald-100">
                                                2 Chiều
                                            </div>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            
            {/* Mini Footer */}
            <div className="bg-white px-3 py-1.5 border-t border-slate-100 flex justify-between items-center text-2xs">
                <div className="flex items-center gap-3 text-slate-400">
                    <span className="flex items-center gap-1"><Info size={8} /> Lịch sử: Trái (Cũ) → Phải (Mới)</span>
                    <span className="flex items-center gap-1"><ArrowLeftRight size={8} className="text-emerald-500" /> = Thay thế lẫn nhau</span>
                </div>
                {consolidated.currentPart && (
                    <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-500 uppercase">Current:</span>
                        <span className="font-mono font-black text-blue-600 bg-blue-50 px-1 rounded">{consolidated.currentPart}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
