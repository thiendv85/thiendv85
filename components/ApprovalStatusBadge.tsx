import React from 'react';
import { ApprovalStatus } from '../types/inventory';

const CONFIG: Record<ApprovalStatus, { label: string; icon: string; cls: string }> = {
    pending:     { label: 'Chờ duyệt',   icon: 'fa-clock',           cls: 'bg-amber-500/15 border-amber-400/40 text-amber-300' },
    in_progress: { label: 'Đang duyệt',  icon: 'fa-spinner fa-spin', cls: 'bg-blue-500/15 border-blue-400/40 text-blue-300' },
    approved:    { label: 'Đã duyệt',    icon: 'fa-circle-check',    cls: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' },
    rejected:    { label: 'Từ chối',     icon: 'fa-circle-xmark',    cls: 'bg-rose-500/15 border-rose-400/40 text-rose-300' },
    unlocked:    { label: 'Đã mở khóa', icon: 'fa-lock-open',       cls: 'bg-orange-500/15 border-orange-400/40 text-orange-300' },
};

interface Props {
    status: ApprovalStatus;
    size?: 'sm' | 'md';
}

export const ApprovalStatusBadge = ({ status, size = 'md' }: Props) => {
    const { label, icon, cls } = CONFIG[status] ?? CONFIG.pending;
    const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
    return (
        <span className={`inline-flex items-center gap-1 border rounded-lg px-2 py-0.5 font-black uppercase tracking-widest ${textSize} ${cls}`}>
            <i className={`fas ${icon} text-[8px]`} />
            {label}
        </span>
    );
};
