import React from 'react';
import { useRowExplanation } from '../../hooks/useRowExplanation';
import { TrendBadge } from '../TrendBadge';
import { StockProgressBar } from '../StockProgressBar';
import { DealerStockPopup } from '../DealerStockPopup';

interface Props {
    key?: string;
    ctx: any;
    idx: number;
    globalIdx: number;
    safePage: number;
    isSelected: boolean;
    localQty: { air: number; sea: number };
    origQty: { air: number; sea: number };
    onToggle: (code: string) => void;
    onSetQty: (code: string, type: 'air' | 'sea', val: string) => void;
    onInspect: (ctx: any) => void;
    currencyVND: Intl.NumberFormat;
}

export const OrderItemRow = ({ 
    ctx, idx, globalIdx, safePage, isSelected, localQty, origQty, 
    onToggle, onSetQty, onInspect, currencyVND 
}: Props) => {
    
    const changed = localQty.air !== origQty.air || localQty.sea !== origQty.sea;
    const currentQty = localQty.air + localQty.sea;
    const rowValue = (ctx.unitCost || 0) * currentQty;

    // Plain-language Explanation Hook
    const explanation = useRowExplanation(ctx, origQty, localQty, isSelected);

    return (
        <tr key={ctx.itemCode}
            onClick={() => onInspect(ctx)}
            className={`transition-all duration-300 group cursor-pointer border-b border-slate-50 hover:bg-blue-50/40 ${!isSelected ? 'opacity-40 grayscale-[0.5]' : changed ? 'bg-amber-50/10' : ''}`}>
            
            <td className="px-3 py-3 text-center sticky left-0 z-10 bg-inherit" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-1">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggle(ctx.itemCode)} className="w-4 h-4 cursor-pointer accent-blue-600 rounded" />
                    <div className="text-[10px] text-slate-400 font-black">{globalIdx + 1}</div>
                </div>
            </td>

            <td className="px-3 py-2 sticky left-10 z-10 bg-inherit border-r border-slate-100">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-900 text-base font-mono tracking-tight">{ctx.itemCode}</span>
                        <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                            {ctx.priorityBucket || 'P3'}
                        </span>
                        {ctx.loisGroup && (
                            <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${ctx.loisGroup === '1' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                L{ctx.loisGroup}
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-slate-600 font-bold leading-tight mt-0.5 line-clamp-2 max-w-[220px]" title={ctx.itemName}>
                        {ctx.itemName}
                    </div>

                    {/* Row Reason Hint (New) */}
                    <div className="mt-1 flex items-center gap-1.5 bg-slate-100/50 px-2 py-0.5 rounded-md border border-slate-200/50 w-fit group-hover:border-slate-300 transition-all" title={explanation.detail}>
                        <i className={`fas ${explanation.action === 'reduce' ? 'fa-arrow-down text-rose-400' : explanation.action === 'increase' ? 'fa-arrow-up text-emerald-400' : 'fa-check text-blue-400'} text-[8px]`} />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tight">{explanation.reason}</span>
                    </div>

                    {/* Row Comparison Hint (Phase 2 Polish) */}
                    {changed && (
                        <div className="mt-1.5 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 text-[9px] font-black w-fit shadow-sm">
                                <i className="fas fa-pen-nib text-[8px]" />
                                <span>Proposed: <span className="opacity-50 line-through">{origQty.air + origQty.sea}</span> → Adjusted: <span className="text-amber-900 font-bold">{currentQty}</span></span>
                            </div>
                        </div>
                    )}
                </div>
            </td>

                <div className="flex flex-col items-center gap-1.5">
                    {ctx.incomingCurrentMonth > 0 ? (
                        <div className="flex flex-col items-center leading-none">
                            <span className="font-black text-blue-700 text-sm">+{ctx.incomingCurrentMonth.toLocaleString()}</span>
                            <span className="text-blue-400 font-bold text-[9px] uppercase">Tháng này</span>
                        </div>
                    ) : (
                        <span className="text-slate-300 font-bold text-xs">—</span>
                    )}
                    
                    {(ctx.totalPO || 0) > 0 && (
                        <div className="inline-flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shadow-sm">
                            <i className="fas fa-ship text-indigo-400 text-[9px]" />
                            <span className="text-[10px] font-black text-indigo-600">PO: {ctx.totalPO.toLocaleString()}</span>
                        </div>
                    )}
                </div>


            <td className="px-3 py-2">
                <div className="flex flex-col gap-1.5 min-w-[180px]">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                            <TrendBadge trend={ctx.trendFlag} className="!px-1 !py-0 !text-[8px]" />
                            <span className={`text-[10px] font-black ${ctx.mos < 1 ? 'text-rose-600' : 'text-slate-700'}`}>
                                {ctx.mos?.toFixed(1)}M
                            </span>
                        </div>
                        <div className="text-[9px] font-black text-slate-500">
                            Tồn: <span className="text-slate-800">{ctx.available?.toLocaleString()}</span>
                        </div>
                    </div>
                    <StockProgressBar
                        current={ctx.available || 0}
                        rop={ctx.rop || 0}
                        max={ctx.stockMax || 0}
                        ss={ctx.safetyStock || 0}
                        onOrder={ctx.totalPO || 0}
                        incoming={ctx.incomingCurrentMonth || 0}
                        incomingNext={ctx.incomingNextMonth || 0}
                        backorder={ctx.backorder || 0}
                        breakdown={ctx.backorderBreakdown}
                        draftAdd={currentQty}
                        baseFc={ctx.baseForecast || 0}
                        compact={true}
                    />
                </div>
            </td>

            <td className="px-3 py-2 text-center">
                <div className="text-xs font-bold text-slate-400">FC: <span className="text-emerald-700 font-black">{(ctx.baseForecast || 0).toLocaleString()}</span></div>
            </td>

            <td className="px-2 py-2 bg-rose-50/20 text-center border-x border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-1">
                    {localQty.air !== origQty.air && (
                        <div className="text-[9px] font-bold text-slate-400 line-through">Draft: {origQty.air}</div>
                    )}
                    <input type="number" value={localQty.air || ''} 
                        onChange={e => onSetQty(ctx.itemCode, 'air', e.target.value)}
                        className={`w-20 text-center font-black text-base border rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-rose-200 transition-all bg-white text-rose-700 shadow-sm ${localQty.air !== origQty.air ? 'border-amber-400 ring-2 ring-amber-100/50' : 'border-rose-200'}`} />
                </div>
            </td>

            <td className="px-2 py-2 bg-blue-50/20 text-center border-r border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-1">
                    {localQty.sea !== origQty.sea && (
                        <div className="text-[9px] font-bold text-slate-400 line-through">Draft: {origQty.sea}</div>
                    )}
                    <input type="number" value={localQty.sea || ''} 
                        onChange={e => onSetQty(ctx.itemCode, 'sea', e.target.value)}
                        className={`w-20 text-center font-black text-base border rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-blue-200 transition-all bg-white text-blue-700 shadow-sm ${localQty.sea !== origQty.sea ? 'border-amber-400 ring-2 ring-amber-100/50' : 'border-blue-200'}`} />
                </div>
            </td>

            <td className="px-3 py-2 max-w-[150px]">
                {(ctx.warnings || []).slice(0, 1).map((w: string, i: number) => (
                    <div key={i} className="text-[10px] text-rose-600 font-black leading-tight flex items-center gap-1">
                        <i className="fas fa-triangle-exclamation" /> {w}
                    </div>
                ))}
            </td>

            <td className="px-3 py-2 text-right font-black text-slate-900 bg-slate-50/30 border-l border-slate-100 text-base">
                {currencyVND.format(rowValue)}
            </td>

            <td className="px-3 py-2 sticky right-0 z-10 bg-inherit border-l border-slate-100 text-center" onClick={e => e.stopPropagation()}>
                <button onClick={() => onInspect(ctx)} className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                    <i className="fas fa-magnifying-glass-chart text-xs" />
                </button>
            </td>
        </tr>
    );
};
