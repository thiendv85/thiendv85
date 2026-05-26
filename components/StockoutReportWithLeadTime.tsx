
import React, { useMemo, useState } from 'react';
import { InventoryItem } from '../types/inventory';
import { StockoutForecastWithLeadTimeService, StockoutForecastResult } from '../utils/StockoutForecastWithLeadTime';
import { StockoutForecastWithLeadTimeWidget } from './StockoutForecastWithLeadTimeWidget';
import { MetricCard } from './MetricCard';
import { useLanguage } from '../utils/i18n';

import { FaIcon } from './Icon';
interface ReportProps {
    data: InventoryItem[];
    onAction?: (sku: string, qty: number, method: 'AIR' | 'SEA') => void;
}

export const StockoutReportWithLeadTime = ({ data, onAction }: ReportProps) => {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'SAFE'>('CRITICAL');

    // 1. Run Analysis Logic
    const analysisResults = useMemo(() => {
        return StockoutForecastWithLeadTimeService.analyzeBatch(data);
    }, [data]);

    // 2. Aggregate Stats
    const stats = useMemo(() => {
        const s = {
            total: analysisResults.length,
            critical: 0,
            warning: 0,
            safe: 0,
            qtyAir: 0,
            qtySea: 0
        };

        analysisResults.forEach(r => {
            if (r.status === 'CRITICAL') {
                s.critical++;
                s.qtyAir += r.suggestedQty;
            } else if (r.status === 'WARNING') {
                s.warning++;
                s.qtySea += r.suggestedQty;
            } else {
                s.safe++;
            }
        });
        return s;
    }, [analysisResults]);

    // 3. Filter View
    const filteredResults = useMemo(() => {
        if (filter === 'ALL') return analysisResults;
        return analysisResults.filter(r => r.status === filter);
    }, [analysisResults, filter]);

    // Sort by urgency (Days until stockout ascending)
    const sortedResults = useMemo(() => {
        return [...filteredResults].sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    }, [filteredResults]);

    return (
        <div className="space-y-8">
            {/* Header & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard 
                    label="CRITICAL (AIR)" 
                    value={stats.critical.toString()} 
                    subValue={`Qty: ${stats.qtyAir.toLocaleString()}`} 
                    icon="fa-plane-departure" 
                    color="rose" 
                    isActive={filter === 'CRITICAL'}
                    onClick={() => setFilter('CRITICAL')}
                />
                <MetricCard 
                    label="WARNING (SEA)" 
                    value={stats.warning.toString()} 
                    subValue={`Qty: ${stats.qtySea.toLocaleString()}`} 
                    icon="fa-ship" 
                    color="amber" 
                    isActive={filter === 'WARNING'}
                    onClick={() => setFilter('WARNING')}
                />
                <MetricCard 
                    label="SAFE" 
                    value={stats.safe.toString()} 
                    subValue="Stock OK" 
                    icon="fa-shield-check" 
                    color="emerald" 
                    isActive={filter === 'SAFE'}
                    onClick={() => setFilter('SAFE')}
                />
                <div className="bg-slate-800 text-white p-5 rounded-2xl flex flex-col justify-center shadow-lg">
                    <div className="text-2xs font-black uppercase tracking-widest text-slate-400 mb-1">Total Order Qty</div>
                    <div className="text-3xl font-black">{ (stats.qtyAir + stats.qtySea).toLocaleString() }</div>
                    <div className="text-2xs font-bold text-slate-400 mt-1">Units (Air + Sea)</div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-slate-800 uppercase flex items-center gap-2">
                        <FaIcon className="fas fa-calendar-check text-blue-600" /> Lead Time Analysis
                    </h3>
                    <div className="lg-segmented">
                        {['ALL', 'CRITICAL', 'WARNING', 'SAFE'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as any)}
                                aria-pressed={filter === f}
                                className={filter === f ? 'lg-active' : ''}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {sortedResults.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <FaIcon className="fas fa-check-circle text-4xl text-slate-300 mb-4" />
                        <p className="text-slate-500 font-bold uppercase text-xs">No items found in this category</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {sortedResults.map(res => (
                            <StockoutForecastWithLeadTimeWidget 
                                key={res.sku} 
                                analysis={res} 
                                onAction={onAction}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
