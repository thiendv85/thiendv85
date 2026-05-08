// ─────────────────────────────────────────────────────────────────────────────
// AuthGuard — Declarative authorization wrapper for approval pages
// ─────────────────────────────────────────────────────────────────────────────

import React, { ReactNode } from 'react';
import { UserRole } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';

import { FaIcon } from './Icon';
interface AuthGuardProps {
    /** Required roles to access this content */
    requiredRoles?: UserRole[];
    /** Required approval level (optional, for level-specific guards) */
    requiredLevel?: number;
    /** Custom fallback when unauthorized */
    fallback?: ReactNode;
    children: ReactNode;
}

export const AuthGuard = ({ requiredRoles, requiredLevel, fallback, children }: AuthGuardProps) => {
    const { hasApprovalRole, canApproveLevel, isLoading } = useApprovalAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="flex items-center gap-3 text-slate-400">
                    <FaIcon className="fas fa-spinner fa-spin text-xl"  />
                    <span className="font-bold text-sm">Đang kiểm tra quyền truy cập...</span>
                </div>
            </div>
        );
    }

    // Check approval role
    if (!hasApprovalRole) {
        return fallback ? <>{fallback}</> : (
            <div className="flex items-center justify-center p-12">
                <div className="max-w-md bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaIcon className="fas fa-shield-halved text-2xl text-amber-500"  />
                    </div>
                    <h2 className="text-lg font-black text-amber-900 mb-2">Truy cập bị từ chối</h2>
                    <p className="text-sm text-amber-700 leading-relaxed">
                        Bạn không có quyền truy cập trang phê duyệt đơn hàng.
                    </p>
                    <p className="text-xs text-amber-500 mt-3">
                        Liên hệ quản trị viên để được cấp quyền.
                    </p>
                </div>
            </div>
        );
    }

    // Check specific level if required
    if (requiredLevel !== undefined && !canApproveLevel(requiredLevel)) {
        return fallback ? <>{fallback}</> : (
            <div className="flex items-center justify-center p-8">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center max-w-sm">
                    <FaIcon className="fas fa-lock text-slate-300 text-2xl mb-3"  />
                    <p className="text-sm font-bold text-slate-600">
                        Bạn không có quyền duyệt cấp {requiredLevel}.
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
