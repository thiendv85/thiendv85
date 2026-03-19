
import React from 'react';
import { InventoryItem, getDebtStatus, DEBT_STATUS_OPTIONS } from '../types/inventory';
import { Typography } from './Typography';

export const DebtStatusBadge = ({ item, className = '' }: { item: InventoryItem, className?: string }) => {
    const status = getDebtStatus(item);
    const option = DEBT_STATUS_OPTIONS.find(o => o.id === status);

    const colors: Record<string, string> = {
        'normal': 'bg-slate-50 text-slate-500 border-slate-200',
        'stock_cover': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'month_cover': 'bg-blue-50 text-blue-700 border-blue-200',
        'po_cover': 'bg-indigo-50 text-indigo-700 border-indigo-200',
        'deficit_po': 'bg-amber-50 text-amber-700 border-amber-200',
        'deficit_no_po': 'bg-rose-50 text-rose-700 border-rose-200',
    };

    return (
        <Typography variant="label" className={`px-2.5 py-1 rounded-lg border shadow-sm font-black uppercase tracking-wider ${colors[status] || colors.normal} ${className}`}>
            {option?.label || status}
        </Typography>
    );
};
