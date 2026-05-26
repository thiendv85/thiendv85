// ─────────────────────────────────────────────────────────────────────────────
// useApprovalAuth — Custom hook for approval authorization
//
// FIX 2026-05-21: Permission derived from workflow membership at runtime
// (single source of truth). profile.approval_levels treated as legacy fallback.
// Bug: admin gán user vào workflow → workflow.approver_ids cập nhật nhưng
// profile.approval_levels/role không sync → user không thấy queue / không
// nhận request đúng level. Fix bằng cách merge workflow membership.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../utils/authContext';
import { fetchWorkflowMembership } from '../utils/supabase';

export interface ApprovalAuthInfo {
    /** Whether user has any approval role (admin/approver) OR is in any workflow */
    hasApprovalRole: boolean;
    /** Levels this user can approve (union of profile + workflow membership) */
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
    /** Loading state (profile load + workflow membership fetch) */
    isLoading: boolean;
    /** True if user appears in at least one active workflow's approver_ids */
    inAnyWorkflow: boolean;
}

export function useApprovalAuth(): ApprovalAuthInfo {
    const { user, profile, isLoading: profileLoading } = useAuth();
    const [membershipLevels, setMembershipLevels] = useState<number[]>([]);
    const [inAnyWorkflow, setInAnyWorkflow] = useState(false);
    const [membershipLoading, setMembershipLoading] = useState(false);

    useEffect(() => {
        if (!user?.id) {
            setMembershipLevels([]);
            setInAnyWorkflow(false);
            return;
        }
        let cancelled = false;
        setMembershipLoading(true);
        fetchWorkflowMembership(user.id)
            .then(({ inAnyWorkflow: inWf, levels }) => {
                if (cancelled) return;
                setMembershipLevels(levels);
                setInAnyWorkflow(inWf);
            })
            .finally(() => { if (!cancelled) setMembershipLoading(false); });
        return () => { cancelled = true; };
    }, [user?.id]);

    return useMemo(() => {
        const isLoading = profileLoading || membershipLoading;
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
                inAnyWorkflow: false,
            };
        }

        const isAdmin = profile.role === 'admin';
        const isApprover = profile.role === 'approver';
        const profileLevels: number[] = (profile as any).approval_levels || [];

        // Union profile-declared levels and workflow-derived levels (fixes drift)
        const allowedLevels = Array.from(new Set([...profileLevels, ...membershipLevels])).sort((a, b) => a - b);

        // hasApprovalRole now includes workflow membership — user gán vào workflow
        // vẫn thấy queue dù profile.role = viewer
        const hasApprovalRole = isAdmin || isApprover || inAnyWorkflow;

        return {
            hasApprovalRole,
            allowedLevels,
            canApproveLevel: (level: number) => isAdmin || allowedLevels.includes(level),
            canSubmit: isAdmin || profile.role === 'planner',
            canUnlock: isAdmin,
            canViewAll: isAdmin || profile.role === 'planner',
            department: (profile as any).department || null,
            isLoading,
            inAnyWorkflow,
        };
    }, [profile, profileLoading, membershipLevels, inAnyWorkflow, membershipLoading]);
}
