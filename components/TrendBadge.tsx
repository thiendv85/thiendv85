
import React from 'react';
import { useLanguage } from '../utils/i18n';

import { FaIcon } from './Icon';
interface TrendBadgeProps {
    trend?: string;
    className?: string;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({ trend = 'Stable', className = '' }) => {
    const { t } = useLanguage();
    
    // Normalize to standard internal keys
    const normalizedTrend = (trend || 'Stable').toLowerCase();
    
    let icon = 'minus';
    let colorClass = 'text-slate-500 bg-slate-50 border-slate-100';
    let labelKey: any = 'trend_stable';

    if (normalizedTrend === 'up') {
        icon = 'arrow-trend-up';
        colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-100';
        labelKey = 'trend_up';
    } else if (normalizedTrend === 'down') {
        icon = 'arrow-trend-down';
        colorClass = 'text-rose-700 bg-rose-50 border-rose-100';
        labelKey = 'trend_down';
    }

    return (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1 border ${colorClass} ${className}`}>
            <FaIcon className={`fas fa-${icon}`} /> {t(labelKey)}
        </span>
    );
};
