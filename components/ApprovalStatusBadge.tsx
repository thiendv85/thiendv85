import React from 'react';
import { ApprovalStatus } from '../types/inventory';
import { useLanguage } from '../utils/i18n';

const STYLE_CONFIG: Record<ApprovalStatus, { icon: string; cls: string }> = {
    pending:     { icon: 'fa-clock',           cls: 'bg-amber-500/15 border-amber-400/40 text-amber-300' },
    in_progress: { icon: 'fa-spinner fa-spin', cls: 'bg-blue-500/15 border-blue-400/40 text-blue-300' },
    approved:    { icon: 'fa-circle-check',    cls: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' },
    rejected:    { icon: 'fa-circle-xmark',    cls: 'bg-rose-500/15 border-rose-400/40 text-rose-300' },
    unlocked:    { icon: 'fa-lock-open',       cls: 'bg-orange-500/15 border-orange-400/40 text-orange-300' },
    returned:    { icon: 'fa-rotate-left',     cls: 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300' },
};

const LABEL_KEYS: Record<ApprovalStatus, string> = {
    pending: 'approval_status_pending',
    in_progress: 'approval_status_in_progress',
    approved: 'approval_status_approved',
    rejected: 'approval_status_rejected',
    unlocked: 'approval_status_unlocked',
    returned: 'approval_status_returned',
};

interface Props {
    status: ApprovalStatus;
    size?: 'xs' | 'sm' | 'md';
}

export const ApprovalStatusBadge = ({ status, size = 'md' }: Props) => {
    const { t } = useLanguage();
    const { icon, cls } = STYLE_CONFIG[status] ?? STYLE_CONFIG.pending;
    const labelKey = LABEL_KEYS[status] ?? LABEL_KEYS.pending;

    const sizeConfig = {
        xs: 'text-[7px] px-1 py-0',
        sm: 'text-[9px] px-2 py-0.5',
        md: 'text-[10px] px-2 py-0.5'
    };

    const sizeCls = sizeConfig[size];

    return (
        <span className={`inline-flex items-center gap-1 border rounded-md font-black uppercase tracking-widest ${sizeCls} ${cls}`}>
            <i className={`fas ${icon} text-[7px]`} />
            {t(labelKey as any)}
        </span>
    );
};
