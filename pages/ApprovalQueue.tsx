import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../utils/authContext';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { OrderReviewModal } from '../components/OrderReviewModal';
import { Typography } from '../components/Typography';
import {
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestById,
    fetchRequestActions,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';

type TabFilter = 'pending' | 'mine' | 'all';

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ApprovalQueue = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);

    const loadRequests = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let data: ApprovalRequest[] = [];
            if (tab === 'pending') data = await fetchPendingForApprover(user.id);
            else if (tab === 'mine') data = await fetchMyRequests(user.id);
            else data = await fetchAllRequests();
            setRequests(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [user, tab]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    const openDetail = async (req: ApprovalRequest) => {
        const full = await fetchRequestById(req.id);
        const acts = await fetchRequestActions(req.id);
        if (full) setSelected({ req: full, actions: acts });
    };

    const TABS: { id: TabFilter; label: string }[] = [
        { id: 'pending', label: 'Cần duyệt' },
        { id: 'mine', label: 'Của tôi' },
        { id: 'all', label: 'Tất cả' },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Typography variant="h2" className="text-slate-800">Phê duyệt Đặt hàng</Typography>
                    <Typography variant="body" className="text-slate-500 mt-0.5">Quản lý và phê duyệt các yêu cầu đặt hàng.</Typography>
                </div>
                <button onClick={loadRequests} className="text-slate-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50">
                    <i className="fas fa-arrows-rotate text-sm" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <i className="fas fa-circle-notch fa-spin text-2xl" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                        <i className="fas fa-inbox text-3xl" />
                        <span className="text-sm font-medium">Không có yêu cầu nào.</span>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest">
                                <th className="px-4 py-3 text-left font-black">Tên Draft</th>
                                <th className="px-4 py-3 text-left font-black">Brand</th>
                                <th className="px-4 py-3 text-center font-black">SKU</th>
                                <th className="px-4 py-3 text-center font-black">Level</th>
                                <th className="px-4 py-3 text-center font-black">Trạng thái</th>
                                <th className="px-4 py-3 text-left font-black">Ngày gửi</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => {
                                const qs = req.snapshot_data?.quantities || {};
                                const skuCount = Object.values(qs as Record<string, { air: number; sea: number }>)
                                    .filter(q => q.air > 0 || q.sea > 0).length;
                                return (
                                    <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => openDetail(req)}>
                                        <td className="px-4 py-3 font-bold text-slate-800">{req.draft_name}</td>
                                        <td className="px-4 py-3 text-slate-500">{req.brand || '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded">{skuCount}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-500 font-bold">{req.current_level}</td>
                                        <td className="px-4 py-3 text-center"><ApprovalStatusBadge status={req.status} size="sm" /></td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{new Date(req.submitted_at).toLocaleDateString('vi-VN')}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-blue-500 text-xs font-black uppercase tracking-widest">
                                                Xem & Duyệt <i className="fas fa-chevron-right ml-1" />
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <OrderReviewModal
                    request={selected.req}
                    actions={selected.actions}
                    onClose={() => setSelected(null)}
                    onRefresh={loadRequests}
                />
            )}
        </div>
    );
};
