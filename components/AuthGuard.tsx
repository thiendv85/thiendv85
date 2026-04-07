// ─────────────────────────────────────────────────────────────────────────────
// AuthGuard — Declarative authorization wrapper for approval pages
// ─────────────────────────────────────────────────────────────────────────────

import React, { ReactNode } from 'react';
import { UserRole } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { useLanguage } from '../utils/i18n';

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
    const { t } = useLanguage();
    const { hasApprovalRole, canApproveLevel, isLoading } = useApprovalAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="flex items-center gap-3 text-slate-400">
                    <i className="fas fa-spinner fa-spin text-xl" />
                    <span className="font-bold text-sm">{t('auth_checking')}</span>
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
                        <i className="fas fa-shield-halved text-2xl text-amber-500" />
                    </div>
                    <h2 className="text-lg font-black text-amber-900 mb-2">{t('auth_denied')}</h2>
                    <p className="text-sm text-amber-700 leading-relaxed">
                        {t('auth_no_approval_access')}
                    </p>
                    <p className="text-xs text-amber-500 mt-3">
                        {t('auth_contact_admin')}
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
                    <i className="fas fa-lock text-slate-300 text-2xl mb-3" />
                    <p className="text-sm font-bold text-slate-600">
                        {t('auth_no_level_access').replace('{0}', String(requiredLevel))}
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
