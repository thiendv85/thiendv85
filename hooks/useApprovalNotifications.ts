import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from './useApprovalAuth';
import { fetchMyRequests, fetchPendingForApprover } from '../utils/supabase';
import type { ApprovalRequest } from '../types/inventory';

export interface ApprovalNotifications {
    pendingForMe: ApprovalRequest[];
    returnedToMe: ApprovalRequest[];
    rejectedRecent: ApprovalRequest[];
    total: number;
    isLoading: boolean;
    refetch: () => Promise<void>;
}

const POLL_MS = 60_000;
const REJECTED_LOOKBACK_DAYS = 3;

export function useApprovalNotifications(): ApprovalNotifications {
    const { user, profile } = useAuth();
    const { hasApprovalRole, allowedLevels, canSubmit } = useApprovalAuth();
    const [pendingForMe, setPendingForMe] = useState<ApprovalRequest[]>([]);
    const [returnedToMe, setReturnedToMe] = useState<ApprovalRequest[]>([]);
    const [rejectedRecent, setRejectedRecent] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const inFlightRef = useRef(false);

    const refetch = useCallback(async () => {
        if (!user || inFlightRef.current) return;
        inFlightRef.current = true;
        setIsLoading(true);
        try {
            const tasks: Promise<any>[] = [];
            tasks.push(
                hasApprovalRole
                    ? fetchPendingForApprover(user.id, allowedLevels)
                    : Promise.resolve([])
            );
            tasks.push(canSubmit ? fetchMyRequests(user.id) : Promise.resolve([]));

            const [pending, mine] = await Promise.all(tasks);

            setPendingForMe((pending as ApprovalRequest[]) || []);

            const mineList = (mine as ApprovalRequest[]) || [];
            setReturnedToMe(mineList.filter(r => r.status === 'returned'));

            const cutoff = Date.now() - REJECTED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
            setRejectedRecent(
                mineList.filter(r => r.status === 'rejected' && new Date(r.submitted_at).getTime() >= cutoff)
            );
        } catch {
        } finally {
            inFlightRef.current = false;
            setIsLoading(false);
        }
    }, [user, hasApprovalRole, allowedLevels, canSubmit]);

    useEffect(() => {
        if (!user || !profile) return;
        refetch();
        const interval = setInterval(refetch, POLL_MS);
        const onFocus = () => refetch();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [user, profile, refetch]);

    return {
        pendingForMe,
        returnedToMe,
        rejectedRecent,
        total: pendingForMe.length + returnedToMe.length + rejectedRecent.length,
        isLoading,
        refetch,
    };
}
