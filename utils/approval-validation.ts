// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL VALIDATION UTILITIES
// State transitions, reason validation, available actions
// ─────────────────────────────────────────────────────────────────────────────

import { ApprovalStatus } from '../types/inventory';
import { UserRole } from './authContext';
import { VALID_TRANSITIONS, ApprovalActionType, ACTION_REQUIREMENTS } from '../types/approval';

// ── State Transition Validation ──────────────────────────────────────────────

export interface TransitionResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate if a status transition is allowed.
 */
export function validateStateTransition(
    currentStatus: ApprovalStatus,
    targetStatus: ApprovalStatus,
    options?: {
        userRole?: UserRole;
        approvalLevels?: number[];
        requestLevel?: number;
        approvedAt?: string; // ISO date string
    }
): TransitionResult {
    // Rule 1: Check if transition is in allowed map
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
        return {
            valid: false,
            error: `Không thể chuyển từ "${currentStatus}" sang "${targetStatus}"`,
        };
    }

    // Rule 2: approved → unlocked only within 24h (if approvedAt provided)
    if (currentStatus === 'approved' && targetStatus === 'unlocked' && options?.approvedAt) {
        const hoursPassed = (Date.now() - new Date(options.approvedAt).getTime()) / (1000 * 60 * 60);
        if (hoursPassed > 24) {
            return {
                valid: false,
                error: `Không thể mở khóa sau 24 giờ (đã ${Math.round(hoursPassed)} giờ)`,
            };
        }
    }

    // Rule 3: Only authorized level can approve
    if (targetStatus === 'approved' && options?.approvalLevels && options?.requestLevel) {
        if (options.userRole !== 'admin' && !options.approvalLevels.includes(options.requestLevel)) {
            return {
                valid: false,
                error: `Chỉ có người duyệt cấp ${options.requestLevel} mới được phê duyệt`,
            };
        }
    }

    return { valid: true };
}

// ── Get Allowed Next States ──────────────────────────────────────────────────

/**
 * Get list of valid next states from current status.
 */
export function getAllowedNextStates(currentStatus: ApprovalStatus): ApprovalStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
}

// ── Get Available Actions for a User ─────────────────────────────────────────

/**
 * Determine which actions a user can perform on a request.
 */
export function getAvailableActions(
    currentStatus: ApprovalStatus,
    userRole: UserRole,
    userApprovalLevels: number[],
    requestLevel: number
): ApprovalActionType[] {
    const isApprover = userRole === 'admin' || userRole === 'approver';
    if (!isApprover) return [];

    const canApproveThisLevel = userRole === 'admin' || userApprovalLevels.includes(requestLevel);

    const actions: ApprovalActionType[] = [];

    if (['pending', 'in_progress'].includes(currentStatus)) {
        // Can always comment
        actions.push('commented');

        if (canApproveThisLevel) {
            actions.push('approved');
        }
        // Return and reject don't require level match — any approver can do it
        actions.push('returned');
        actions.push('rejected');
    }

    return actions;
}

// ── Reason Validation ────────────────────────────────────────────────────────

export interface ReasonValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate the reason/comment for an action.
 */
export function validateReason(
    action: ApprovalActionType,
    reason: string
): ReasonValidationResult {
    const req = ACTION_REQUIREMENTS[action];
    if (!req) return { valid: true };

    if (req.reasonRequired && (!reason || reason.trim().length === 0)) {
        return { valid: false, error: `Vui lòng nhập lý do ${req.label.toLowerCase()}` };
    }

    if (req.reasonRequired && reason.trim().length < req.minReasonLength) {
        return {
            valid: false,
            error: `Lý do phải có ít nhất ${req.minReasonLength} ký tự (hiện ${reason.trim().length})`,
        };
    }

    if (reason.length > req.maxReasonLength) {
        return {
            valid: false,
            error: `Lý do tối đa ${req.maxReasonLength} ký tự`,
        };
    }

    return { valid: true };
}
