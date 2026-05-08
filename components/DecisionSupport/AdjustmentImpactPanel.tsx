import React from 'react';
import { DecisionSummary } from '../../hooks/useDecisionSupport';
import { FaIcon } from '../Icon';

interface Props {
    summary: DecisionSummary;
}

const currencyVND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const AdjustmentImpactPanel = ({ summary }: Props) => {
    const { metrics } = summary;

    const MetricCard = ({ title, before, after, delta, unit = '', inverse = false }: any) => {
        const isBetter = inverse ? delta <= 0 : delta >= 0;
        const color = delta === 0 ? 'text-slate-400' : isBetter ? 'text-emerald-600' : 'text-rose-600';
        const icon = delta === 0 ? 'fa-minus' : delta > 0 ? 'fa-arrow-up' : 'fa-arrow-down';

        return (
            <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex flex-col gap-3 group hover:border-blue-100 transition-all">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</div>
                <div className="flex items-end justify-between gap-4">
                    <div className="flex flex-col">
                        <div className="text-xs font-bold text-slate-300 line-through mb-0.5">
                            {typeof before === 'number' && title.includes('Value') ? currencyVND.format(before) : before}{unit}
                        </div>
                        <div className="text-xl font-black text-slate-800 tracking-tight">
                            {typeof after === 'number' && title.includes('Value') ? currencyVND.format(after) : after}{unit}
                        </div>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1.5 ${color} bg-current/5`}>
                        <FaIcon className={`fas ${icon}`} />
                        {Math.abs(delta).toLocaleString()}{unit}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-slate-50/50 p-8 border-b border-slate-200">
            <div className="max-w-[1400px] mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-6 bg-blue-600 rounded-full" />
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em]">Effect of Your Adjustments</h3>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                        Real-time Simulation
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
                    <MetricCard title="Total Order Value" before={metrics.value.before} after={metrics.value.after} delta={metrics.value.delta} inverse={true} />
                    <MetricCard title="Stockout Risk (OOS)" before={metrics.oos.before} after={metrics.oos.after} delta={metrics.oos.delta} inverse={true} />
                    <MetricCard title="Low Safety Items" before={metrics.risk.before} after={metrics.risk.after} delta={metrics.risk.delta} inverse={true} />

                    <MetricCard title="Backorder Exposure" before={metrics.bo.before} after={metrics.bo.after} delta={metrics.bo.delta} inverse={true} />
                    <MetricCard title="Average MOS" before={metrics.avgMos.before.toFixed(1)} after={metrics.avgMos.after.toFixed(1)} delta={metrics.avgMos.delta.toFixed(1)} unit="M" />
                </div>
            </div>
        </div>
    );
};
