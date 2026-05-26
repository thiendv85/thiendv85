import { ApprovalRequest, ApprovalWorkflow } from '../../types/inventory';

export type TabFilter = 'pending' | 'mine' | 'all';

export interface StatusToken {
    label: string;
    icon: string;
    stripe: string;
    chipBg: string;
    chipText: string;
    chipBorder: string;
    avatar: string;
    badgeRing: string;
}

export const STATUS_UI: Record<string, StatusToken> = {
    pending: {
        label: 'Chờ duyệt',
        icon: 'fa-clock',
        stripe: 'bg-amber-500',
        chipBg: 'bg-amber-50',
        chipText: 'text-amber-700',
        chipBorder: 'border-amber-200',
        avatar: 'from-amber-500 to-amber-600',
        badgeRing: 'ring-amber-100',
    },
    in_progress: {
        label: 'Đang xử lý',
        icon: 'fa-spinner fa-spin',
        stripe: 'bg-blue-500',
        chipBg: 'bg-blue-50',
        chipText: 'text-blue-700',
        chipBorder: 'border-blue-200',
        avatar: 'from-blue-500 to-indigo-600',
        badgeRing: 'ring-blue-100',
    },
    approved: {
        label: 'Đã duyệt',
        icon: 'fa-circle-check',
        stripe: 'bg-emerald-500',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-700',
        chipBorder: 'border-emerald-200',
        avatar: 'from-emerald-500 to-emerald-600',
        badgeRing: 'ring-emerald-100',
    },
    rejected: {
        label: 'Từ chối',
        icon: 'fa-circle-xmark',
        stripe: 'bg-rose-500',
        chipBg: 'bg-rose-50',
        chipText: 'text-rose-700',
        chipBorder: 'border-rose-200',
        avatar: 'from-rose-500 to-rose-600',
        badgeRing: 'ring-rose-100',
    },
    returned: {
        label: 'Cần sửa',
        icon: 'fa-rotate-left',
        stripe: 'bg-indigo-500',
        chipBg: 'bg-indigo-50',
        chipText: 'text-indigo-700',
        chipBorder: 'border-indigo-200',
        avatar: 'from-indigo-500 to-purple-600',
        badgeRing: 'ring-indigo-100',
    },
    cancelled: {
        label: 'Đã hủy',
        icon: 'fa-ban',
        stripe: 'bg-slate-400',
        chipBg: 'bg-slate-50',
        chipText: 'text-slate-600',
        chipBorder: 'border-slate-200',
        avatar: 'from-slate-400 to-slate-500',
        badgeRing: 'ring-slate-100',
    },
    unlocked: {
        label: 'Đã mở khóa',
        icon: 'fa-lock-open',
        stripe: 'bg-orange-500',
        chipBg: 'bg-orange-50',
        chipText: 'text-orange-700',
        chipBorder: 'border-orange-200',
        avatar: 'from-orange-500 to-orange-600',
        badgeRing: 'ring-orange-100',
    },
    archived: {
        label: 'Lưu trữ',
        icon: 'fa-box-archive',
        stripe: 'bg-slate-300',
        chipBg: 'bg-slate-50',
        chipText: 'text-slate-500',
        chipBorder: 'border-slate-200',
        avatar: 'from-slate-300 to-slate-400',
        badgeRing: 'ring-slate-100',
    },
};

export const STATUS_ORDER = [
    'pending',
    'in_progress',
    'returned',
    'approved',
    'rejected',
    'cancelled',
    'unlocked',
    'archived',
];

export const TABS: { id: TabFilter; label: string; icon: string }[] = [
    { id: 'pending', label: 'Cần duyệt', icon: 'fa-clock' },
    { id: 'mine', label: 'Của tôi', icon: 'fa-user' },
    { id: 'all', label: 'Tất cả', icon: 'fa-layer-group' },
];

export const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
};

export const formatDeadline = (iso: string | null): { label: string; cls: string; icon: string } | null => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0)
        return { label: 'Quá hạn', cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'fa-triangle-exclamation' };
    const hours = Math.floor(ms / 3600000);
    if (hours < 24)
        return {
            label: `Còn ${hours}h`,
            cls: 'bg-amber-50 text-amber-700 border-amber-200',
            icon: 'fa-hourglass-half',
        };
    const days = Math.floor(hours / 24);
    if (days <= 2)
        return {
            label: `Còn ${days} ngày`,
            cls: 'bg-amber-50 text-amber-700 border-amber-200',
            icon: 'fa-hourglass-half',
        };
    return { label: `Còn ${days} ngày`, cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'fa-hourglass-half' };
};

export const initials = (name: string) => {
    if (!name) return '?';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const shortName = (name: string) => {
    if (!name) return '—';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const ini = parts
        .slice(0, -1)
        .map(p => p[0]?.toUpperCase())
        .join('. ');
    return `${ini}. ${last}`;
};

export interface CurrentLevelInfo {
    primary: string;
    extraCount: number;
    extraNames: string[];
    requireAll: boolean;
}

export const getCurrentLevelInfo = (
    req: ApprovalRequest,
    workflow: ApprovalWorkflow | undefined,
    usersMap: Record<string, string>,
): CurrentLevelInfo | null => {
    if (!workflow || !['pending', 'in_progress'].includes(req.status)) return null;
    const lvl = workflow.levels.find(l => l.level === req.current_level);
    if (!lvl || !lvl.approver_ids?.length) return null;
    const names = lvl.approver_ids.map(id => usersMap[id] || id);
    return {
        primary: names[0],
        extraCount: Math.max(0, names.length - 1),
        extraNames: names.slice(1),
        requireAll: !!lvl.require_all,
    };
};
