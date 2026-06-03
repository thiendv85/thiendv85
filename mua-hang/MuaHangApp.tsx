import React from 'react';
import { AuthProvider, useAuth } from '../utils/authContext';
import { LanguageProvider } from '../utils/i18n';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoginScreen } from '../pages/LoginScreen';
import { FaIcon } from '../components/Icon';

// App "Mua hàng" — entry/deploy riêng cho đội mua. Tái dùng lõi execution-tracking của V16.
// Chia sẻ dữ liệu qua chung Supabase. Login auto theo role.
const ExecutionTracking = React.lazy(() => import('../pages/ExecutionTracking'));

const Spinner = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <FaIcon className="fas fa-circle-notch fa-spin text-blue-400 text-3xl" />
    </div>
);

// Vai được vào app Mua hàng. (Chưa có role 'buyer' riêng → tạm cho admin/planner/approver.)
const BUYER_ROLES = ['admin', 'planner', 'approver'];

const Content = () => {
    const { session, isLoading, profile } = useAuth();

    if (isLoading) return <Spinner />;
    if (!session) return <LoginScreen />;

    const role = profile?.role;
    if (!role || !BUYER_ROLES.includes(role)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500 p-6">
                <FaIcon className="fas fa-lock text-3xl text-slate-400" />
                <p className="font-semibold">Không có quyền vào ứng dụng Mua hàng.</p>
                <p className="text-sm">Liên hệ quản trị để được cấp quyền đội mua.</p>
            </div>
        );
    }

    return (
        <React.Suspense fallback={<Spinner />}>
            <ExecutionTracking />
        </React.Suspense>
    );
};

export default function MuaHangApp() {
    return (
        <ErrorBoundary>
            <LanguageProvider>
                <AuthProvider>
                    <Content />
                </AuthProvider>
            </LanguageProvider>
        </ErrorBoundary>
    );
}
