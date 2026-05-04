// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW: Types, Constants & Validation Maps
// ─────────────────────────────────────────────────────────────────────────────

import { ApprovalStatus } from './inventory';
import { UserRole } from '../utils/authContext';

// ── Valid State Transitions ──────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
    pending:     ['in_progress', 'rejected', 'returned', 'cancelled'],
    in_progress: ['in_progress', 'approved', 'rejected', 'returned', 'cancelled'],
    approved:    ['unlocked', 'archived'],
    rejected:    [],           // terminal — submitter must create new request
    unlocked:    ['pending'],  // resubmit flow
    returned:    ['pending', 'cancelled'],  // submitter fixes and resubmits
    cancelled:   [],           // terminal
    archived:    [],           // terminal
};

// ── Status Display Info ──────────────────────────────────────────────────────

export const STATUS_INFO: Record<ApprovalStatus, {
    label: string;
    description: string;
    icon: string;
    color: string;
    bgColor: string;
    textColor: string;
}> = {
    pending: {
        label: 'Cần duyệt',
        description: 'Đơn đang chờ phê duyệt',
        icon: 'fa-clock',
        color: 'amber',
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-900',
    },
    in_progress: {
        label: 'Đang xử lý',
        description: 'Đơn đang được xem xét',
        icon: 'fa-spinner',
        color: 'blue',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-900',
    },
    approved: {
        label: 'Đã duyệt',
        description: 'Đơn đã được phê duyệt',
        icon: 'fa-circle-check',
        color: 'emerald',
        bgColor: 'bg-emerald-100',
        textColor: 'text-emerald-900',
    },
    rejected: {
        label: 'Bị từ chối',
        description: 'Đơn đã bị từ chối',
        icon: 'fa-circle-xmark',
        color: 'rose',
        bgColor: 'bg-rose-100',
        textColor: 'text-rose-900',
    },
    unlocked: {
        label: 'Đã mở khóa',
        description: 'Đơn đã được mở khóa để chỉnh sửa',
        icon: 'fa-lock-open',
        color: 'orange',
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-900',
    },
    returned: {
        label: 'Cần sửa',
        description: 'Đơn được trả lại để sửa',
        icon: 'fa-rotate-left',
        color: 'purple',
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-900',
    },
    cancelled: {
        label: 'Đã hủy',
        description: 'Đơn đã bị hủy',
        icon: 'fa-ban',
        color: 'slate',
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-900',
    },
    archived: {
        label: 'Đã lưu trữ',
        description: 'Đơn đã được lưu trữ',
        icon: 'fa-box-archive',
        color: 'slate',
        bgColor: 'bg-slate-50',
        textColor: 'text-slate-700',
    },
};

// ── Action Requirements (for reason enforcement) ─────────────────────────────

export type ApprovalActionType = 'approved' | 'rejected' | 'returned' | 'commented';

export interface ActionRequirement {
    reasonRequired: boolean;
    minReasonLength: number;
    maxReasonLength: number;
    label: string;
    placeholder: string;
}

export const ACTION_REQUIREMENTS: Record<ApprovalActionType, ActionRequirement> = {
    approved: {
        reasonRequired: false,
        minReasonLength: 0,
        maxReasonLength: 500,
        label: 'Phê duyệt',
        placeholder: 'Ghi chú (tùy chọn)...',
    },
    rejected: {
        reasonRequired: true,
        minReasonLength: 10,
        maxReasonLength: 500,
        label: 'Từ chối',
        placeholder: 'Ví dụ: Vượt quá ngân sách tháng. Liên hệ CFO để request thêm budget.',
    },
    returned: {
        reasonRequired: true,
        minReasonLength: 10,
        maxReasonLength: 500,
        label: 'Trả lại',
        placeholder: 'Chi tiết những gì cần sửa. Ví dụ: Cần update SKU từ ABC123 → ABC124',
    },
    commented: {
        reasonRequired: false,
        minReasonLength: 0,
        maxReasonLength: 500,
        label: 'Bình luận',
        placeholder: 'Thêm bình luận...',
    },
};
