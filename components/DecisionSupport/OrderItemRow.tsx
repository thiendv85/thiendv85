import React from 'react';
import { useLanguage } from '../../utils/i18n';
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
    const { t } = useLanguage();
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
                        <span className="font-black text-slate-900 text-sm font-mono tracking-tight">{ctx.itemCode}</span>
                        <span className={`px-1 py-0.5 rounded font-black text-[8px] ${ctx.priorityBucket === 'P1' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                            {ctx.priorityBucket || 'P3'}
                        </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold leading-tight truncate max-w-[180px]" title={ctx.itemName}>
                        {ctx.itemName}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-black text-slate-600">
                            {t('stock_label')} {ctx.available?.toLocaleString()}
                        </div>
                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-black ${ctx.mos < 1 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {ctx.mos?.toFixed(1)}M
                        </div>
                        <TrendBadge trend={ctx.trendFlag} className="!px-1 !py-0 !text-[8px]" />
                    </div>
                </div>
            </td>

            <td className="px-3 py-2 text-center">
                <div className="flex flex-col items-center gap-1">
                    {localQty.air > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black uppercase flex items-center gap-1">
                            <i className="fas fa-plane-up text-[8px]" /> Air
                        </span>
                    )}
                    {localQty.sea > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-black uppercase flex items-center gap-1">
                            <i className="fas fa-ship text-[8px]" /> Sea
                        </span>
                    )}
                    {localQty.air === 0 && localQty.sea === 0 && <span className="text-slate-300">—</span>}
                </div>
            </td>

            <td className="px-2 py-2 bg-indigo-50/10 text-center border-x border-slate-50">
                <span className="text-sm font-black text-indigo-700">{ctx.qtyNB || 0}</span>
            </td>

            <td className="px-2 py-2 bg-blue-50/10 text-center border-r border-slate-50">
                <span className="text-sm font-black text-blue-700">{ctx.qtyBB || 0}</span>
            </td>

            <td className="px-2 py-2 bg-slate-50/50 text-center font-black border-r border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-1">
                    {currentQty !== (origQty.air + origQty.sea) && (
                        <div className="text-[9px] font-bold text-slate-400 line-through">Draft: {origQty.air + origQty.sea}</div>
                    )}
                    <input type="number" 
                        value={currentQty || ''} 
                        onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            const diff = val - localQty.air;
                            onSetQty(ctx.itemCode, 'sea', Math.max(0, diff).toString());
                        }}
                        className={`w-16 text-center font-black text-sm border rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-slate-200 transition-all bg-white text-slate-800 shadow-sm ${currentQty !== (origQty.air + origQty.sea) ? 'border-amber-400 ring-2 ring-amber-100/50' : 'border-slate-200'}`} />
                </div>
            </td>

            <td className="px-3 py-2 text-right">
                <span className="text-xs font-black text-slate-600">
                    {currencyVND.format(ctx.unitCost || 0)}
                </span>
            </td>

            <td className="px-3 py-2 min-w-[150px]">
                <div className="flex flex-col gap-1">
                    {(ctx.warnings || []).slice(0, 1).map((w: string, i: number) => (
                        <div key={i} className="text-[9px] text-rose-600 font-black leading-tight flex items-center gap-1">
                            <i className="fas fa-triangle-exclamation" /> {w}
                        </div>
                    ))}
                    {ctx.notes && <div className="text-[10px] text-slate-500 font-bold italic line-clamp-1">{ctx.notes}</div>}
                </div>
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
