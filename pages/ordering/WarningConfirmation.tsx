import React from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem } from '../../types/inventory';
import { Typography } from '../../components/Typography';
import { FaIcon } from '../../components/Icon';

export interface ConfirmationQueueItem {
    code: string;
    type: 'air' | 'sea';
    val: number;
}

export interface WarningConfirmationProps {
    confirmationQueue: ConfirmationQueueItem[];
    enrichedMap: Map<string, InventoryItem>;
    onDismiss: () => void;
    onConfirm: () => void;
}

export const WarningConfirmation = ({
    confirmationQueue,
    enrichedMap,
    onDismiss,
    onConfirm,
}: WarningConfirmationProps) => {
    if (confirmationQueue.length === 0) return null;

    return createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onDismiss}></div>

            <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-200 p-8 max-w-lg w-full relative animate-[scaleIn_0.2s_ease-out]">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-3xl mb-6 mx-auto">
                    <FaIcon className="fas fa-triangle-exclamation" />
                </div>
                <Typography variant="h2" className="text-center text-slate-900 mb-2">
                    Kiểm tra rủi ro
                </Typography>
                <Typography variant="body" className="text-center text-slate-500 mb-6 block">
                    Mã hàng <span className="font-black text-slate-900">{confirmationQueue[0].code}</span> có các cảnh
                    báo cần lưu ý:
                </Typography>

                {/* ENRICHED METRICS SECTION */}
                {(() => {
                    const item = enrichedMap.get(confirmationQueue[0].code);
                    if (!item) return null;
                    const history = item.SalesHistory || [];
                    const last3M = history.slice(-3).reduce((a, b) => a + b, 0) / 3 || 0;
                    const avg12M = history.reduce((a, b) => a + b, 0) / (history.length || 1);
                    const slope = item.computed?.slope || 0;
                    const available = item.computed?.available || 0;
                    const po = item.TotalPO || 0;
                    const bo = item.Backorder || 0;
                    const supplyCapability = available + po - bo;

                    return (
                        <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Tồn kho / PO</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-700">{available}</span>
                                    <span className="text-slate-300">/</span>
                                    <span className="text-sm font-black text-blue-600">{po}</span>
                                </div>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase">
                                    Khả năng cung ứng (Pos)
                                </span>
                                <div
                                    className={`text-sm font-black ${supplyCapability < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                                >
                                    {supplyCapability > 0 ? '+' : ''}
                                    {supplyCapability}
                                </div>
                            </div>
                            <div className="flex flex-col pt-2 border-t border-slate-200/50">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Nợ hàng (BO)</span>
                                <span className="text-sm font-black text-rose-600">{bo}</span>
                            </div>
                            <div className="flex flex-col text-right pt-2 border-t border-slate-200/50">
                                <span className="text-[10px] font-black text-slate-400 uppercase">
                                    Xu hướng (Slope)
                                </span>
                                <div
                                    className={`text-sm font-black ${slope < -1 ? 'text-rose-600' : slope > 1 ? 'text-emerald-600' : 'text-slate-600'}`}
                                >
                                    <FaIcon
                                        className={`fas ${slope < -1 ? 'fa-arrow-trend-down' : slope > 1 ? 'fa-arrow-trend-up' : 'fa-minus'} mr-1`}
                                    />
                                    {slope.toFixed(2)}
                                </div>
                            </div>
                            <div className="flex flex-col col-span-2 pt-2 border-t border-slate-200/50">
                                <div className="grid grid-cols-5 gap-1 items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                            Avg 12M
                                        </span>
                                        <span className="text-xs font-black text-slate-700">{avg12M.toFixed(1)}</span>
                                    </div>
                                    <div className="flex flex-col text-center">
                                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">
                                            Tháng N-2
                                        </span>
                                        <span className="text-xs font-black text-blue-700">
                                            {history[history.length - 2] || 0}
                                        </span>
                                    </div>
                                    <div className="flex flex-col text-center">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                                            Tháng N-1
                                        </span>
                                        <span className="text-xs font-black text-indigo-700">
                                            {history[history.length - 1] || 0}
                                        </span>
                                    </div>
                                    <div className="flex flex-col text-center border-l border-slate-200 pl-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                            Avg 3M
                                        </span>
                                        <span className="text-xs font-black text-slate-700">{last3M.toFixed(1)}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-tighter">
                                            Forecast
                                        </span>
                                        <span className="text-xs font-black text-amber-600">
                                            {item.computed?.forecastLinReg?.toFixed(1) || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="space-y-2 mb-8 max-h-[300px] overflow-y-auto pr-2 customer-scrollbar">
                    {enrichedMap.get(confirmationQueue[0].code)?.computed?.warnings.map((w, idx) => (
                        <div
                            key={idx}
                            className={`p-4 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-sm ${
                                w.type === 'Critical'
                                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                                    : w.type === 'Warning'
                                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                                      : 'bg-blue-50 border-blue-100 text-blue-700'
                            }`}
                        >
                            <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                    w.type === 'Critical'
                                        ? 'bg-rose-100'
                                        : w.type === 'Warning'
                                          ? 'bg-amber-100'
                                          : 'bg-blue-100'
                                }`}
                            >
                                <FaIcon
                                    className={`fas ${w.type === 'Critical' ? 'fa-fire' : 'fa-triangle-exclamation'} text-xs`}
                                />
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-wider opacity-60">
                                    {w.code}
                                </div>
                                <div className="text-sm font-bold leading-tight">{w.message}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={onDismiss}
                        className="py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                    >
                        Hủy bỏ
                    </button>
                    <button onClick={onConfirm} className="lg-btn lg-btn-amber lg-btn-lg lg-btn-full py-4 px-6">
                        Xác nhận
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>,
        document.body,
    );
};
