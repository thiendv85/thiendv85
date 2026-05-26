import React from 'react';
import { FaIcon } from './Icon';
import { StockProgressBar } from './StockProgressBar';
import { SalesMomentum } from './SalesMomentum';
import { TrendBadge } from './TrendBadge';

export interface InspectionPopupProps {
    item: any;
    localQtys: Record<string, { air: number; sea: number }>;
    onClose: () => void;
}

export function InspectionPopup({ item, localQtys, onClose }: InspectionPopupProps) {
    if (!item) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fadeIn"
                onClick={onClose}
            />
            <div className="relative w-full max-w-[1000px] bg-white rounded-[32px] shadow-2xl overflow-hidden animate-slideUp flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-2xl">
                            <FaIcon className="fas fa-magnifying-glass-chart text-blue-400 text-xl" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="font-black text-2xl font-mono tracking-tight">
                                    {item.itemCode}
                                </span>
                                <span
                                    className={`px-2 py-0.5 rounded-lg text-xs font-black ${item.priorityBucket === 'P1' ? 'bg-rose-500 text-white' : 'bg-white/20 text-slate-300'}`}
                                >
                                    {item.priorityBucket || 'P3'}
                                </span>
                            </div>
                            <div className="text-slate-400 font-bold text-sm mt-0.5">
                                {item.itemName}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                    >
                        <FaIcon className="fas fa-xmark text-lg" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 space-y-10 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Stock Logic */}
                        <div className="space-y-6">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full" /> Logic Tồn kho & Cung
                                ứng
                            </h3>
                            <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200/60 shadow-inner">
                                <StockProgressBar
                                    current={item.available}
                                    rop={item.rop}
                                    max={item.stockMax || 1}
                                    ss={item.safetyStock}
                                    onOrder={item.totalPO}
                                    incoming={item.incomingCurrentMonth}
                                    backorder={item.backorder}
                                    breakdown={item.backorderBreakdown || []}
                                    draftAdd={
                                        (localQtys[item.itemCode]?.air || 0) +
                                        (localQtys[item.itemCode]?.sea || 0)
                                    }
                                    baseFc={item.baseForecast}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100/50">
                                    <div className="text-[10px] text-rose-500 font-black uppercase mb-1">
                                        Safety Stock
                                    </div>
                                    <div className="text-lg font-black text-rose-700">
                                        {(item.safetyStock || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100/50">
                                    <div className="text-[10px] text-amber-500 font-black uppercase mb-1">
                                        Re-Order Point
                                    </div>
                                    <div className="text-lg font-black text-amber-700">
                                        {(item.rop || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50">
                                    <div className="text-[10px] text-emerald-500 font-black uppercase mb-1">
                                        Stock Max
                                    </div>
                                    <div className="text-lg font-black text-emerald-700">
                                        {(item.stockMax || 0).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Demand & Momentum */}
                        <div className="space-y-6">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-blue-500 rounded-full" /> Nhu cầu & Xu hướng
                            </h3>
                            <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200/60 h-[280px] flex items-center justify-center shadow-inner">
                                <SalesMomentum
                                    values={[
                                        item.avgQty24M,
                                        item.avgQty12M,
                                        item.avgQty6M,
                                        item.avgQty3M,
                                    ]}
                                    history={item.salesHistory}
                                    forecast={item.baseForecast}
                                />
                            </div>
                            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] text-blue-500 font-black uppercase">
                                        Xu hướng dự báo
                                    </div>
                                    <div className="text-sm font-black text-blue-800 mt-1 flex items-center gap-2">
                                        <TrendBadge trend={item.trendFlag} />
                                        {item.trendFlag === 'up'
                                            ? 'Tăng trưởng'
                                            : item.trendFlag === 'down'
                                              ? 'Giảm dần'
                                              : 'Ổn định'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-blue-500 font-black uppercase">
                                        Dự báo (FC)
                                    </div>
                                    <div className="text-xl font-black text-blue-900">
                                        {(item.baseForecast || 0).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                    >
                        Hoàn tất kiểm tra
                    </button>
                </div>
            </div>
        </div>
    );
}
