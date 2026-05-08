import React from 'react';
import { ApprovalStatus } from '../types/inventory';
import { FaIcon } from './Icon';

const CONFIG: Record<ApprovalStatus, { label: string; icon: string; cls: string }> = {
    pending:     { label: 'Chờ duyệt',   icon: 'fa-clock',           cls: 'bg-amber-500/15 border-amber-400/40 text-amber-300' },
    in_progress: { label: 'Đang duyệt',  icon: 'fa-spinner fa-spin', cls: 'bg-blue-500/15 border-blue-400/40 text-blue-300' },
    approved:    { label: 'Đã duyệt',    icon: 'fa-circle-check',    cls: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' },
    rejected:    { label: 'Từ chối',     icon: 'fa-circle-xmark',    cls: 'bg-rose-500/15 border-rose-400/40 text-rose-300' },
    unlocked:    { label: 'Đã mở khóa', icon: 'fa-lock-open',       cls: 'bg-orange-500/15 border-orange-400/40 text-orange-300' },
    returned:    { label: 'Trả lại',     icon: 'fa-rotate-left',     cls: 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300' },
    cancelled:   { label: 'Đã hủy',      icon: 'fa-ban',             cls: 'bg-slate-500/15 border-slate-400/40 text-slate-300' },
    archived:    { label: 'Lưu trữ',     icon: 'fa-box-archive',     cls: 'bg-slate-500/15 border-slate-400/40 text-slate-300' },
};

interface Props {
    status: ApprovalStatus;
    size?: 'xs' | 'sm' | 'md';
}

export const ApprovalStatusBadge = ({ status, size = 'md' }: Props) => {
    const { label, icon, cls } = CONFIG[status] ?? CONFIG.pending;
    
    const sizeConfig = {
        xs: 'text-[7px] px-1 py-0',
        sm: 'text-[9px] px-2 py-0.5',
        md: 'text-[10px] px-2 py-0.5'
    };
    
    const sizeCls = sizeConfig[size];

    return (
        <span className={`inline-flex items-center gap-1 border rounded-md font-black uppercase tracking-widest ${sizeCls} ${cls}`}>
            <FaIcon className={`fas ${icon} text-[7px]`} />
            {label}
        </span>
    );
};
