// ─────────────────────────────────────────────────────────────────────────────
// useApprovalAuth — Custom hook for approval authorization
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useAuth } from '../utils/authContext';

export interface ApprovalAuthInfo {
    /** Whether user has any approval role (admin or approver) */
    hasApprovalRole: boolean;
    /** Levels this user can approve */
    allowedLevels: number[];
    /** Check if user can approve a specific level */
    canApproveLevel: (level: number) => boolean;
    /** Whether user can submit requests (planner or admin) */
    canSubmit: boolean;
    /** Whether user can unlock approved requests (admin only) */
    canUnlock: boolean;
    /** Whether user can view all requests */
    canViewAll: boolean;
    /** User's department */
    department: string | null;
    /** Loading state */
    isLoading: boolean;
}

export function useApprovalAuth(): ApprovalAuthInfo {
    const { profile, isLoading } = useAuth();

    return useMemo(() => {
        if (!profile) {
            return {
                hasApprovalRole: false,
                allowedLevels: [],
                canApproveLevel: () => false,
                canSubmit: false,
                canUnlock: false,
                canViewAll: false,
                department: null,
                isLoading,
            };
        }

        const isAdmin = profile.role === 'admin';
        const isApprover = profile.role === 'approver';
        const hasApprovalRole = isAdmin || isApprover;
        const allowedLevels: number[] = (profile as any).approval_levels || [];

        return {
            hasApprovalRole,
            allowedLevels,
            canApproveLevel: (level: number) => isAdmin || allowedLevels.includes(level),
            canSubmit: isAdmin || profile.role === 'planner',
            canUnlock: isAdmin,
            canViewAll: isAdmin,
            department: (profile as any).department || null,
            isLoading,
        };
    }, [profile, isLoading]);
}
