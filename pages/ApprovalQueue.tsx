import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { OrderReviewModal } from '../components/OrderReviewModal';
import {
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestActions,
    listProfiles,
    deleteApprovalRequests,
    updateRequestStatus,
    fetchRequestById
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';

type TabFilter = 'pending' | 'mine' | 'all';

export const ApprovalQueue = ({ onLoadRequest }: { onLoadRequest?: (req: ApprovalRequest) => void }) => {
    const { user, profile } = useAuth();
    const { hasApprovalRole, allowedLevels, canApproveLevel } = useApprovalAuth();
    const [activeTab, setActiveTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['approved', 'rejected', 'returned']));
    const [confirmModal, setConfirmModal] = useState<{ type: 'cancel' | 'delete', ids: string[] } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'submitted_at', direction: 'desc' as 'asc' | 'desc' });
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'loading' | 'amber' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'loading' | 'amber' = 'success') => {
        setToast({ msg, type });
        if (type !== 'loading') setTimeout(() => setToast(prev => prev?.msg === msg ? null : prev), 3000);
    };

    const loadRequests = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let dataPromise = activeTab === 'pending' ? fetchPendingForApprover(user.id, allowedLevels) : activeTab === 'mine' ? fetchMyRequests(user.id) : fetchAllRequests();
            const [dataRaw, profiles] = await Promise.all([dataPromise, listProfiles()]);
            const pMap: Record<string, string> = {};
            profiles.forEach(p => pMap[p.id] = p.full_name || p.email || p.id);
            setUsersMap(pMap);
            setRequests(dataRaw);
        } catch (e) { showToast("Lỗi nạp dữ liệu", "error"); }
        finally { setIsLoading(false); }
    }, [user, activeTab, allowedLevels]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    const openDetail = async (req: ApprovalRequest) => {
        const full = await fetchRequestById(req.id);
        const acts = await fetchRequestActions(req.id);
        if (full) setSelected({ req: full, actions: acts });
    };

    const handleAction = async (requestId: string, action: 'approved' | 'rejected') => {
        if (!user) return;
        setIsProcessing(requestId);
        showToast("Đang xử lý...", "loading");
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            const result = await processApprovalAction(requestId, user.id, action);
            if (result.success) { showToast("Thành công", "success"); await loadRequests(); }
            else showToast("Thất bại", "error");
        } catch (err) { showToast("Lỗi hệ thống", "error"); }
        finally { setIsProcessing(null); }
    };

    const handleBulkAction = async (action: 'approved' | 'rejected' | 'cancelled' | 'delete') => {
        if (!user || selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        if (action === 'delete') { setConfirmModal({ type: 'delete', ids }); return; }
        if (action === 'cancelled') { setConfirmModal({ type: 'cancel', ids }); return; }
        showToast("Đang xử lý hàng loạt...", "loading");
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            let success = 0;
            for (const id of ids) { if ((await processApprovalAction(id, user.id, action as 'approved' | 'rejected')).success) success++; }
            showToast(`Hoàn tất: ${success}/${ids.length}`, "success");
            setSelectedIds(new Set()); await loadRequests();
        } catch (e) { showToast("Lỗi xử lý", "error"); }
    };

    const filteredAndSortedRequests = useMemo(() => {
        let res = requests.filter(r => {
            if (activeTab === 'pending') return ['pending', 'in_progress'].includes(r.status);
            if (activeTab === 'mine') return r.submitted_by === user?.id;
            return true;
        });
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            res = res.filter(r => r.draft_name.toLowerCase().includes(t) || (r.brand || '').toLowerCase().includes(t));
        }
        res.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        return res;
    }, [requests, activeTab, searchTerm, user?.id]);

    const groupedRequests = useMemo(() => {
        const groups: Record<string, ApprovalRequest[]> = {};
        filteredAndSortedRequests.forEach(r => { if (!groups[r.status]) groups[r.status] = []; groups[r.status].push(r); });
        return groups;
    }, [filteredAndSortedRequests]);

    const STATUS_UI: Record<string, any> = {
        pending: { label: 'Chờ duyệt', icon: 'fa-clock', cls: 'text-amber-600 bg-amber-50', border: 'border-amber-200' },
        in_progress: { label: 'Đang xử lý', icon: 'fa-spinner fa-spin', cls: 'text-blue-600 bg-blue-50', border: 'border-blue-200' },
        approved: { label: 'Đã duyệt', icon: 'fa-check-circle', cls: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200' },
        rejected: { label: 'Từ chối', icon: 'fa-times-circle', cls: 'text-rose-600 bg-rose-50', border: 'border-rose-200' }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f8fafc] overflow-hidden relative">
            {/* Header */}
            <div className="shrink-0 bg-slate-900 text-white p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black">Phê duyệt Đặt hàng</h1>
                        <p className="text-xs opacity-50">Hệ thống quản trị và phê duyệt tập trung</p>
                    </div>
                    <div className="flex gap-2">
                        {TABS.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === t.id ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/50'}`}>
                                <i className={`fas ${t.icon} mr-2`} />{t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-auto p-8">
                {isLoading ? (
                    <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
                ) : (
                    <div className="space-y-10">
                        {Object.keys(groupedRequests).map(status => (
                            <div key={status} className="space-y-4">
                                <div className="flex items-center gap-2 border-b pb-2">
                                    <span className={`w-3 h-3 rounded-full ${STATUS_UI[status]?.cls || 'bg-slate-300'}`} />
                                    <h3 className="text-xs font-black uppercase tracking-widest">{STATUS_UI[status]?.label || status}</h3>
                                    <span className="text-[10px] text-slate-400 font-bold">({groupedRequests[status].length})</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {groupedRequests[status].map(req => (
                                        <div key={req.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between hover:shadow-lg transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><i className="fas fa-file-invoice" /></div>
                                                <div>
                                                    <div className="font-black text-slate-800">{req.draft_name}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">{req.brand} • Cấp {req.current_level}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => { if(onLoadRequest) onLoadRequest(req); else openDetail(req); }} className="h-9 px-4 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-600 active:scale-95 transition-all flex items-center gap-2">
                                                    <i className="fas fa-external-link-alt" /> Mở Đơn
                                                </button>
                                                {(req.status === 'pending' || req.status === 'in_progress') && canApproveLevel(req.current_level) && (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleAction(req.id, 'approved')} className="h-9 px-4 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-2">
                                                            {isProcessing === req.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />} Duyệt
                                                        </button>
                                                        <button onClick={() => handleAction(req.id, 'rejected')} className="h-9 w-9 bg-slate-100 text-slate-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center">
                                                            <i className="fas fa-times" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-[30px] shadow-2xl flex items-center gap-8 z-50 animate-bounceIn">
                    <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black">{selectedIds.size}</div><div className="text-[10px] font-black uppercase">Đang chọn</div></div>
                    <div className="flex gap-4">
                        <button onClick={() => handleBulkAction('approved')} className="px-6 py-2 bg-emerald-500 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600">Duyệt</button>
                        <button onClick={() => setSelectedIds(new Set())} className="text-white/50 text-[10px] font-black uppercase underline">Hủy</button>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-fadeIn">
                    <div className={`px-6 py-3 rounded-full shadow-2xl text-white font-black text-xs uppercase tracking-widest ${toast.type === 'error' ? 'bg-rose-500' : 'bg-slate-800'}`}>
                        {toast.msg}
                    </div>
                </div>
            )}

            {/* Modals */}
            {selected && <OrderReviewModal request={selected.req} usersMap={usersMap} onClose={() => setSelected(null)} onRefresh={loadRequests} />}
        </div>
    );
};

const TABS: { id: TabFilter; label: string; icon: string }[] = [
    { id: 'pending', label: 'Cần duyệt', icon: 'fa-clock' },
    { id: 'mine', label: 'Của tôi', icon: 'fa-user' },
    { id: 'all', label: 'Tất cả', icon: 'fa-layer-group' }
];
