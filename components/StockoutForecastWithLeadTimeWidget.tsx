
import React from 'react';
import { StockoutForecastResult } from '../utils/StockoutForecastWithLeadTime';

import { FaIcon } from './Icon';
export interface WidgetProps {
    analysis: StockoutForecastResult;
    onAction?: (sku: string, qty: number, method: 'AIR' | 'SEA') => void;
}

export const StockoutForecastWithLeadTimeWidget: React.FC<WidgetProps> = ({ analysis, onAction }) => {
    // Config colors based on status
    const config = {
        CRITICAL: {
            border: 'border-rose-200',
            bg: 'bg-white',
            headerBg: 'bg-rose-50',
            text: 'text-rose-700',
            icon: 'fa-plane-slash',
            badge: 'bg-rose-600 text-white',
            barColor: 'bg-rose-500'
        },
        WARNING: {
            border: 'border-amber-200',
            bg: 'bg-white',
            headerBg: 'bg-amber-50',
            text: 'text-amber-700',
            icon: 'fa-ship',
            badge: 'bg-amber-500 text-white',
            barColor: 'bg-amber-500'
        },
        SAFE: {
            border: 'border-emerald-200',
            bg: 'bg-white',
            headerBg: 'bg-emerald-50',
            text: 'text-emerald-700',
            icon: 'fa-check-circle',
            badge: 'bg-emerald-500 text-white',
            barColor: 'bg-emerald-500'
        }
    }[analysis.status];

    // Calculate percentage for progress bar (cap at 100%)
    // Base scale on Sea Lead Time (45 days) + 20% buffer approx 54 days
    const maxScale = 60; 
    const progress = Math.min(100, (analysis.daysUntilStockout / maxScale) * 100);
    const airThreshold = (analysis.leadTimeAir / maxScale) * 100;
    const seaThreshold = (analysis.leadTimeSea / maxScale) * 100;

    return (
        <div className={`rounded-xl border ${config.border} ${config.bg} shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow`}>
            {/* Header */}
            <div className={`px-4 py-3 ${config.headerBg} flex justify-between items-start border-b ${config.border}`}>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-2xs font-black px-2 py-0.5 rounded uppercase tracking-wider ${config.badge}`}>
                            {analysis.status === 'CRITICAL' ? 'SHIP AIR' : analysis.status === 'WARNING' ? 'SHIP SEA' : 'SAFE'}
                        </span>
                        <span className="text-2xs font-bold text-slate-500 font-mono">{analysis.sku}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 truncate w-48" title={analysis.name}>{analysis.name}</div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg} ${config.text} shadow-sm`}>
                    <FaIcon className={`fas ${config.icon}`} />
                </div>
            </div>

            {/* Body */}
            <div className="p-4 flex-1 flex flex-col gap-4">
                {/* Timeline Visual */}
                <div>
                    <div className="flex justify-between text-2xs font-bold text-slate-400 mb-1 uppercase tracking-wider">
                        <span>Runway</span>
                        <span className={config.text}>{analysis.daysUntilStockout.toFixed(0)} days</span>
                    </div>
                    <div className="relative h-3 bg-slate-100 rounded-full w-full overflow-hidden">
                        {/* Markers */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-10" style={{ left: `${airThreshold}%` }} title="Air Lead Time (21d)"></div>
                        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${seaThreshold}%` }} title="Sea Lead Time (45d)"></div>
                        
                        {/* Progress */}
                        <div 
                            className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-500 ${config.barColor}`} 
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-2xs font-bold text-slate-400 mt-1">
                        <span className="text-rose-400">Air (21d)</span>
                        <span className="text-amber-500">Sea (45d)</span>
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 text-2xs">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <div className="text-slate-400 font-bold uppercase text-2xs">Stock</div>
                        <div className="font-black text-slate-700">{analysis.currentStock.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <div className="text-slate-400 font-bold uppercase text-2xs">Demand/Day</div>
                        <div className="font-black text-slate-700">{analysis.dailyDemand.toFixed(1)}</div>
                    </div>
                </div>

                {/* Recommendation Message */}
                <div className={`text-2xs font-medium leading-relaxed p-2 rounded ${config.headerBg} ${config.text} border ${config.border}`}>
                    <FaIcon className="fas fa-info-circle mr-1" /> {analysis.actionMessage}
                </div>
            </div>

            {/* Footer / Action */}
            {analysis.status !== 'SAFE' && (
                <div className="p-3 border-t border-slate-100 bg-slate-50">
                    <button 
                        onClick={() => onAction && onAction(analysis.sku, analysis.suggestedQty, analysis.shippingMethod as 'AIR'|'SEA')}
                        className={`w-full py-2 rounded-lg text-2xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95 text-white ${
                            analysis.shippingMethod === 'AIR' 
                                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                                : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                        }`}
                    >
                        <FaIcon className={`fas ${analysis.shippingMethod === 'AIR' ? 'fa-plane' : 'fa-ship'}`} />
                        Order {analysis.suggestedQty.toLocaleString()} pcs via {analysis.shippingMethod}!
                    </button>
                </div>
            )}
        </div>
    );
};
