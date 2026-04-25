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
                                        <div 
                                            key={req.id} 
                                            onClick={() => openDetail(req)}
                                            className="bg-white/80 backdrop-blur-md border border-white/50 p-6 rounded-[32px] flex items-center justify-between hover:shadow-2xl hover:shadow-blue-500/10 transition-all group cursor-pointer active:scale-[0.99] relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            
                                            <div className="flex items-center gap-6 relative z-10">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-500">
                                                    <i className="fas fa-file-invoice text-xl" />
                                                </div>
                                                <div>
                                                    <div className="font-black text-slate-800 text-lg tracking-tight group-hover:text-blue-700 transition-colors">{req.draft_name}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">{req.brand}</span>
                                                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Level {req.current_level}</span>
                                                        <span className="text-[10px] text-slate-400 font-medium">{new Date(req.submitted_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 relative z-10" onClick={e => e.stopPropagation()}>
                                                <button 
                                                    onClick={() => onLoadRequest?.(req)} 
                                                    className="h-10 px-5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-2xl text-[10px] font-black uppercase hover:shadow-lg hover:shadow-rose-500/30 active:scale-95 transition-all flex items-center gap-2 border border-rose-400/20"
                                                >
                                                    <i className="fas fa-external-link-alt" /> Mở Đơn
                                                </button>
                                                
                                                {(req.status === 'pending' || req.status === 'in_progress') && canApproveLevel(req.current_level) && (
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => handleAction(req.id, 'approved')} 
                                                            className="h-10 px-5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center gap-2 border border-emerald-400/20"
                                                        >
                                                            {isProcessing === req.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />} Duyệt
                                                        </button>
                                                        <button 
                                                            onClick={() => handleAction(req.id, 'rejected')} 
                                                            className="h-10 w-10 glass-premium text-slate-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center border border-slate-200"
                                                        >
                                                            <i className="fas fa-times" />
                                                        </button>
                                                    </div>
                                                )}

                                                {profile?.role === 'admin' && (
                                                    <button 
                                                        onClick={() => setConfirmModal({ type: 'delete', ids: [req.id] })}
                                                        className="h-10 w-10 glass-premium text-slate-300 hover:text-rose-500 rounded-2xl transition-all flex items-center justify-center border border-slate-200"
                                                        title="Xóa vĩnh viễn"
                                                    >
                                                        <i className="fas fa-trash-can" />
                                                    </button>
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
            {selectedIds.size > 0 && profile?.role === 'admin' && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-[30px] shadow-2xl flex items-center gap-8 z-50 animate-bounceIn border border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black">{selectedIds.size}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Đã chọn</div>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => handleBulkAction('approved')} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Duyệt nhanh</button>
                        <button onClick={() => setConfirmModal({ type: 'cancel', ids: Array.from(selectedIds) })} className="px-6 py-2.5 bg-slate-700 hover:bg-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Hủy đơn</button>
                        <button onClick={() => setSelectedIds(new Set())} className="text-white/40 text-[10px] font-black uppercase underline hover:text-white transition-colors">Bỏ chọn</button>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
                    <div className="relative bg-white p-8 rounded-[40px] shadow-2xl max-w-sm w-full animate-[scaleIn_0.2s_ease-out] text-center border border-slate-100">
                        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg ${confirmModal.type === 'delete' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                            <i className={`fas ${confirmModal.type === 'delete' ? 'fa-trash-can' : 'fa-ban'} text-3xl`} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2">
                            {confirmModal.type === 'delete' ? 'Xóa vĩnh viễn?' : 'Hủy đơn hàng?'}
                        </h3>
                        <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
                            {confirmModal.type === 'delete' 
                                ? `Bạn sắp xóa ${confirmModal.ids.length} đơn hàng. Hành động này không thể hoàn tác.` 
                                : `Đơn hàng sẽ chuyển sang trạng thái "Hủy". Người lập sẽ không thể gửi lại.`}
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 shadow-sm">Bỏ qua</button>
                            <button 
                                onClick={async () => {
                                    const ids = confirmModal.ids;
                                    const type = confirmModal.type;
                                    setConfirmModal(null);
                                    showToast("Đang thực hiện...", "loading");
                                    try {
                                        if (type === 'delete') {
                                            const { success } = await deleteApprovalRequests(ids);
                                            if (success) showToast(`Đã xóa ${ids.length} đơn`, "success");
                                            else showToast("Lỗi khi xóa", "error");
                                        } else {
                                            for (const id of ids) await updateRequestStatus(id, 'cancelled');
                                            showToast(`Đã hủy ${ids.length} đơn`, "success");
                                        }
                                        setSelectedIds(new Set());
                                        loadRequests();
                                    } catch (e) { showToast("Lỗi hệ thống", "error"); }
                                }}
                                className={`flex-1 py-4 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 ${confirmModal.type === 'delete' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'}`}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[120] animate-fadeIn">
                    <div className={`px-8 py-4 rounded-[20px] shadow-2xl text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-3 backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600/90' : toast.type === 'loading' ? 'bg-blue-600/90' : 'bg-slate-900/90'}`}>
                        {toast.type === 'loading' && <i className="fas fa-circle-notch fa-spin text-white" />}
                        {toast.msg}
                    </div>
                </div>
            )}

            {/* Modals */}
            {selected && <OrderReviewModal request={selected.req} usersMap={usersMap} onClose={() => setSelected(null)} onRefresh={loadRequests} />}
            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes bounceIn {
                    0% { transform: translate(-50%, 100px); opacity: 0; }
                    60% { transform: translate(-50%, -10px); opacity: 1; }
                    100% { transform: translate(-50%, 0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

const TABS: { id: TabFilter; label: string; icon: string }[] = [
    { id: 'pending', label: 'Cần duyệt', icon: 'fa-clock' },
    { id: 'mine', label: 'Của tôi', icon: 'fa-user' },
    { id: 'all', label: 'Tất cả', icon: 'fa-layer-group' }
];
