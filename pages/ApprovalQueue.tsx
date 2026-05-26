import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { OrderReviewModal } from '../components/OrderReviewModal';
import { WorkflowStepper } from '../components/WorkflowStepper';
import { FaIcon } from '../components/Icon';
import {
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestActions,
    fetchActionsByRequestIds,
    fetchWorkflowsByIds,
    fetchProfileDirectory,
    displayNameFromEntry,
    deleteApprovalRequests,
    updateRequestStatus,
    fetchRequestById,
    type ProfileDirectoryEntry,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction, ApprovalWorkflow } from '../types/inventory';
import { exportApprovalRequestToCSV } from '../utils/approvalExport';
import type { AppSettings } from '../utils/appSettings';

type TabFilter = 'pending' | 'mine' | 'all';

interface Props {
    onLoadRequest?: (req: ApprovalRequest) => void;
    appSettings?: AppSettings;
}

interface StatusToken {
    label: string;
    icon: string;
    stripe: string;
    chipBg: string;
    chipText: string;
    chipBorder: string;
    avatar: string;
    badgeRing: string;
}

const STATUS_UI: Record<string, StatusToken> = {
    pending: {
        label: 'Chờ duyệt', icon: 'fa-clock',
        stripe: 'bg-amber-500', chipBg: 'bg-amber-50', chipText: 'text-amber-700', chipBorder: 'border-amber-200',
        avatar: 'from-amber-500 to-amber-600', badgeRing: 'ring-amber-100',
    },
    in_progress: {
        label: 'Đang xử lý', icon: 'fa-spinner fa-spin',
        stripe: 'bg-blue-500', chipBg: 'bg-blue-50', chipText: 'text-blue-700', chipBorder: 'border-blue-200',
        avatar: 'from-blue-500 to-indigo-600', badgeRing: 'ring-blue-100',
    },
    approved: {
        label: 'Đã duyệt', icon: 'fa-circle-check',
        stripe: 'bg-emerald-500', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', chipBorder: 'border-emerald-200',
        avatar: 'from-emerald-500 to-emerald-600', badgeRing: 'ring-emerald-100',
    },
    rejected: {
        label: 'Từ chối', icon: 'fa-circle-xmark',
        stripe: 'bg-rose-500', chipBg: 'bg-rose-50', chipText: 'text-rose-700', chipBorder: 'border-rose-200',
        avatar: 'from-rose-500 to-rose-600', badgeRing: 'ring-rose-100',
    },
    returned: {
        label: 'Cần sửa', icon: 'fa-rotate-left',
        stripe: 'bg-indigo-500', chipBg: 'bg-indigo-50', chipText: 'text-indigo-700', chipBorder: 'border-indigo-200',
        avatar: 'from-indigo-500 to-purple-600', badgeRing: 'ring-indigo-100',
    },
    cancelled: {
        label: 'Đã hủy', icon: 'fa-ban',
        stripe: 'bg-slate-400', chipBg: 'bg-slate-50', chipText: 'text-slate-600', chipBorder: 'border-slate-200',
        avatar: 'from-slate-400 to-slate-500', badgeRing: 'ring-slate-100',
    },
    unlocked: {
        label: 'Đã mở khóa', icon: 'fa-lock-open',
        stripe: 'bg-orange-500', chipBg: 'bg-orange-50', chipText: 'text-orange-700', chipBorder: 'border-orange-200',
        avatar: 'from-orange-500 to-orange-600', badgeRing: 'ring-orange-100',
    },
    archived: {
        label: 'Lưu trữ', icon: 'fa-box-archive',
        stripe: 'bg-slate-300', chipBg: 'bg-slate-50', chipText: 'text-slate-500', chipBorder: 'border-slate-200',
        avatar: 'from-slate-300 to-slate-400', badgeRing: 'ring-slate-100',
    },
};

const STATUS_ORDER = ['pending', 'in_progress', 'returned', 'approved', 'rejected', 'cancelled', 'unlocked', 'archived'];

const TABS: { id: TabFilter; label: string; icon: string }[] = [
    { id: 'pending', label: 'Cần duyệt', icon: 'fa-clock' },
    { id: 'mine',    label: 'Của tôi',   icon: 'fa-user' },
    { id: 'all',     label: 'Tất cả',    icon: 'fa-layer-group' },
];

const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
};

const formatDeadline = (iso: string | null): { label: string; cls: string; icon: string } | null => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return { label: 'Quá hạn', cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'fa-triangle-exclamation' };
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return { label: `Còn ${hours}h`, cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'fa-hourglass-half' };
    const days = Math.floor(hours / 24);
    if (days <= 2) return { label: `Còn ${days} ngày`, cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'fa-hourglass-half' };
    return { label: `Còn ${days} ngày`, cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'fa-hourglass-half' };
};

const initials = (name: string) => {
    if (!name) return '?';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const shortName = (name: string) => {
    if (!name) return '—';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const ini = parts.slice(0, -1).map(p => p[0]?.toUpperCase()).join('. ');
    return `${ini}. ${last}`;
};

interface CurrentLevelInfo {
    primary: string;
    extraCount: number;
    extraNames: string[];
    requireAll: boolean;
}

const getCurrentLevelInfo = (
    req: ApprovalRequest,
    workflow: ApprovalWorkflow | undefined,
    usersMap: Record<string, string>,
): CurrentLevelInfo | null => {
    if (!workflow || !['pending', 'in_progress'].includes(req.status)) return null;
    const lvl = workflow.levels.find(l => l.level === req.current_level);
    if (!lvl || !lvl.approver_ids?.length) return null;
    const names = lvl.approver_ids.map(id => usersMap[id] || id);
    return {
        primary: names[0],
        extraCount: Math.max(0, names.length - 1),
        extraNames: names.slice(1),
        requireAll: !!lvl.require_all,
    };
};

export const ApprovalQueue = ({ onLoadRequest, appSettings }: Props) => {
    const { user, profile } = useAuth();
    const { allowedLevels, canApproveLevel } = useApprovalAuth();
    const [activeTab, setActiveTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, string>>({});
    const [workflowsMap, setWorkflowsMap] = useState<Record<string, ApprovalWorkflow>>({});
    const [actionsByReq, setActionsByReq] = useState<Record<string, ApprovalAction[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ type: 'cancel' | 'delete', ids: string[] } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
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
            const dataPromise = activeTab === 'pending'
                ? fetchPendingForApprover(user.id, allowedLevels)
                : activeTab === 'mine' ? fetchMyRequests(user.id) : fetchAllRequests();
            const [dataRaw, directory] = await Promise.all([dataPromise, fetchProfileDirectory()]);
            const dMap: Record<string, ProfileDirectoryEntry> = {};
            directory.forEach(e => { dMap[e.id] = e; });
            const pMap: Record<string, string> = {};
            directory.forEach(e => { pMap[e.id] = displayNameFromEntry(e); });
            setRequests(dataRaw);

            const wfIds = dataRaw.map(r => r.workflow_id).filter(Boolean);
            const reqIds = dataRaw.map(r => r.id);
            const [wfList, acts] = await Promise.all([
                fetchWorkflowsByIds(wfIds),
                fetchActionsByRequestIds(reqIds),
            ]);
            const wfMap: Record<string, ApprovalWorkflow> = {};
            wfList.forEach(w => { wfMap[w.id] = w; });
            setWorkflowsMap(wfMap);
            const aMap: Record<string, ApprovalAction[]> = {};
            acts.forEach(a => {
                if (!aMap[a.request_id]) aMap[a.request_id] = [];
                aMap[a.request_id].push(a);
            });
            setActionsByReq(aMap);

            // Fill placeholder cho mọi ID có thể được hiển thị (submitter/approver/actor)
            // mà directory không trả về (vd: user inactive, RPC chưa apply, v.v.)
            const referencedIds = new Set<string>();
            dataRaw.forEach(r => referencedIds.add(r.submitted_by));
            wfList.forEach(w => w.levels?.forEach(lvl => lvl.approver_ids?.forEach(id => referencedIds.add(id))));
            acts.forEach(a => referencedIds.add(a.actor_id));
            referencedIds.forEach(id => {
                if (!pMap[id]) pMap[id] = displayNameFromEntry(undefined, id);
            });
            setUsersMap(pMap);
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
            for (const id of ids) {
                if ((await processApprovalAction(id as string, user.id, action as 'approved' | 'rejected')).success) success++;
            }
            showToast(`Hoàn tất: ${success}/${ids.length}`, "success");
            setSelectedIds(new Set()); await loadRequests();
        } catch (e) { showToast("Lỗi xử lý", "error"); }
    };

    const handleDownload = async (req: ApprovalRequest) => {
        if (!['approved', 'in_progress'].includes(req.status)) {
            showToast("Chỉ tải đơn đã duyệt hoặc đang xử lý", "amber");
            return;
        }
        setDownloadingId(req.id);
        showToast("Đang tải snapshot...", "loading");
        try {
            const full = await fetchRequestById(req.id);
            if (!full || !full.snapshot_data) {
                showToast("Không tìm thấy dữ liệu snapshot", "error");
                return;
            }
            const costBasis = appSettings?.defaultCostBasis || 'PP';
            const exportOptions = appSettings ? {
                separator: (appSettings.exportSeparator === 'semicolon' ? ';'
                    : appSettings.exportSeparator === 'tab' ? '\t' : ',') as ',' | ';' | '\t',
                encoding: appSettings.exportEncoding,
                decimalPrecision: appSettings.exportDecimalPrecision,
                exportColumns: appSettings.orderDraftColumns as any,
            } : undefined;
            const ok = exportApprovalRequestToCSV(full, costBasis, exportOptions);
            if (ok) showToast("Đã tải file CSV", "success");
            else showToast("Đơn không có dòng đặt hàng nào", "amber");
        } catch (e) {
            showToast("Lỗi khi tải đơn", "error");
        } finally {
            setDownloadingId(null);
        }
    };

    const filteredAndSortedRequests = useMemo(() => {
        let res = requests.filter(r => {
            if (activeTab === 'pending') return ['pending', 'in_progress'].includes(r.status);
            if (activeTab === 'mine') return r.submitted_by === user?.id;
            return true;
        });
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            res = res.filter(r =>
                r.draft_name.toLowerCase().includes(t)
                || (r.brand || '').toLowerCase().includes(t)
                || (usersMap[r.submitted_by] || '').toLowerCase().includes(t)
            );
        }
        res.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        return res;
    }, [requests, activeTab, searchTerm, user?.id, usersMap]);

    const groupedRequests = useMemo(() => {
        const groups: Record<string, ApprovalRequest[]> = {};
        filteredAndSortedRequests.forEach(r => {
            if (!groups[r.status]) groups[r.status] = [];
            groups[r.status].push(r);
        });
        return groups;
    }, [filteredAndSortedRequests]);

    const orderedStatuses = useMemo(
        () => STATUS_ORDER.filter(s => groupedRequests[s]?.length > 0),
        [groupedRequests],
    );

    const totalCount = filteredAndSortedRequests.length;

    return (
        <div className="flex flex-col min-h-screen bg-gradient-to-b from-slate-50 to-white relative">
            {/* Editorial header */}
            <div className="shrink-0 bg-slate-900 text-white relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle at 20% 0%, rgba(59,130,246,0.25), transparent 45%), radial-gradient(circle at 80% 100%, rgba(99,102,241,0.18), transparent 50%)',
                    }}
                />
                <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
                    backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }} />

                <div className="relative px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
                    <div className="flex items-end justify-between flex-wrap gap-6">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-300/80 mb-2">
                                Approval Workspace
                            </div>
                            <h1 className="text-3xl lg:text-4xl font-black tracking-tight leading-none">
                                Phê duyệt Đặt hàng
                            </h1>
                            <p className="text-xs text-white/50 mt-2 max-w-md font-medium">
                                Toàn cảnh quy trình duyệt đa cấp — theo dõi tiến độ, người chịu trách nhiệm và hành động ngay.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative">
                                <FaIcon className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-xs"  />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Tên đơn · Brand · Người đề xuất"
                                    className="bg-white/[0.06] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/30 outline-none focus:bg-white/[0.1] focus:border-blue-400/40 w-[300px] font-medium tracking-wide transition-all"
                                />
                            </div>
                            <div className="flex bg-white/[0.04] border border-white/10 rounded-xl p-1 gap-1">
                                {TABS.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setActiveTab(t.id)}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                                            activeTab === t.id
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-white/50 hover:text-white/80'
                                        }`}
                                    >
                                        <FaIcon className={`fas ${t.icon} mr-1.5 text-[9px]`}  />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center gap-8 text-[10px] uppercase tracking-[0.3em] font-black text-white/40">
                        <span className="text-blue-300/80"><span className="text-white text-base font-black tabular-nums mr-1.5">{totalCount}</span>đơn hiển thị</span>
                        <span><span className="text-white text-base font-black tabular-nums mr-1.5">{orderedStatuses.length}</span>nhóm trạng thái</span>
                        <span className="hidden md:inline"><span className="text-white text-base font-black tabular-nums mr-1.5">{Object.keys(usersMap).length}</span>thành viên</span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10">
                    {isLoading ? (
                        <div className="flex justify-center py-32">
                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : orderedStatuses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                            <FaIcon className="fas fa-inbox text-5xl mb-4 opacity-30"  />
                            <span className="text-xs font-black uppercase tracking-[0.3em]">Không có đơn nào</span>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {orderedStatuses.map(status => {
                                const tk = STATUS_UI[status];
                                return (
                                    <section key={status}>
                                        {/* Section header — editorial label */}
                                        <header className="flex items-baseline gap-4 mb-5">
                                            <span className={`w-1.5 h-7 rounded-full ${tk?.stripe || 'bg-slate-300'}`} />
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700">
                                                {tk?.label || status}
                                            </h3>
                                            <div className="h-px flex-1 bg-slate-200" />
                                            <span className="text-[10px] font-black tabular-nums text-slate-400 tracking-widest">
                                                {String(groupedRequests[status].length).padStart(2, '0')} ĐƠN
                                            </span>
                                        </header>

                                        <div className="grid grid-cols-1 gap-5">
                                            {groupedRequests[status].map(req => (
                                                <RequestCard
                                                    key={req.id}
                                                    req={req}
                                                    workflow={workflowsMap[req.workflow_id]}
                                                    actions={actionsByReq[req.id] || []}
                                                    usersMap={usersMap}
                                                    isProcessing={isProcessing === req.id}
                                                    isDownloading={downloadingId === req.id}
                                                    canApproveLevel={canApproveLevel}
                                                    isAdmin={profile?.role === 'admin'}
                                                    onOpenDetail={openDetail}
                                                    onLoadRequest={onLoadRequest}
                                                    onDownload={handleDownload}
                                                    onAction={handleAction}
                                                    onDelete={(id) => setConfirmModal({ type: 'delete', ids: [id] })}
                                                    showToast={showToast}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
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
                            <FaIcon className={`fas ${confirmModal.type === 'delete' ? 'fa-trash-can' : 'fa-ban'} text-3xl`}  />
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
                    <div className={`px-8 py-4 rounded-[20px] shadow-2xl text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-3 backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600/90' : toast.type === 'loading' ? 'bg-blue-600/90' : toast.type === 'amber' ? 'bg-amber-600/90' : 'bg-slate-900/90'}`}>
                        {toast.type === 'loading' && <FaIcon className="fas fa-circle-notch fa-spin text-white"  />}
                        {toast.msg}
                    </div>
                </div>
            )}

            {/* Modal */}
            {selected && (
                <OrderReviewModal
                    request={selected.req}
                    actions={selected.actions}
                    usersMap={usersMap}
                    onClose={() => setSelected(null)}
                    onRefresh={loadRequests}
                />
            )}

            <style>{`
                @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes bounceIn {
                    0% { transform: translate(-50%, 100px); opacity: 0; }
                    60% { transform: translate(-50%, -10px); opacity: 1; }
                    100% { transform: translate(-50%, 0); opacity: 1; }
                }
                @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

// ─── RequestCard ──────────────────────────────────────────────────────────────
interface RequestCardProps {
    req: ApprovalRequest;
    workflow: ApprovalWorkflow | undefined;
    actions: ApprovalAction[];
    usersMap: Record<string, string>;
    isProcessing: boolean;
    isDownloading: boolean;
    canApproveLevel: (lvl: number) => boolean;
    isAdmin: boolean;
    onOpenDetail: (req: ApprovalRequest) => void;
    onLoadRequest?: (req: ApprovalRequest) => void;
    onDownload: (req: ApprovalRequest) => void;
    onAction: (id: string, action: 'approved' | 'rejected') => void;
    onDelete: (id: string) => void;
    showToast: (msg: string, type?: 'success' | 'error' | 'loading' | 'amber') => void;
}

const RequestCard = ({
    req, workflow, actions, usersMap, isProcessing, isDownloading,
    canApproveLevel, isAdmin, onOpenDetail, onLoadRequest, onDownload, onAction, onDelete, showToast,
}: RequestCardProps) => {
    const tk = STATUS_UI[req.status];
    const submitterName = usersMap[req.submitted_by] || 'N/A';
    const deadline = formatDeadline(req.deadline);
    const canDownload = ['approved', 'in_progress'].includes(req.status);
    const isApprover = (req.status === 'pending' || req.status === 'in_progress') && canApproveLevel(req.current_level);
    const totalLevels = workflow?.levels?.length || 0;
    const currentInfo = getCurrentLevelInfo(req, workflow, usersMap);
    const progressPct = totalLevels > 0
        ? Math.min(100, Math.round(((req.current_level - 1) / totalLevels) * 100))
        : 0;
    const lastAction = actions[actions.length - 1];

    const summary = req.summary;
    const hasSummary = !!summary && (summary.skuCount > 0 || summary.totalQty > 0 || summary.totalValue > 0);
    const fmtVnd = (n: number) => {
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)} Tỷ`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Tr`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(0)} N`;
        return n.toLocaleString('vi-VN');
    };
    const fmtNum = (n: number) => n.toLocaleString('vi-VN');

    return (
        <article
            className="group relative bg-white rounded-[20px] border border-slate-200/80 hover:border-slate-300 hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all overflow-hidden"
            style={{ animation: 'cardIn 0.3s ease-out' }}
        >
            {/* Status stripe — left edge */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${tk?.stripe || 'bg-slate-300'}`} />

            {/* HEAD: meta line */}
            <div className="px-7 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    <span>#{req.id.slice(0, 8)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{new Date(req.submitted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{formatRelative(req.submitted_at)}</span>
                    {req.version > 1 && (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500">v{req.version}</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <ApprovalStatusBadge status={req.status} size="sm" />
                    {deadline && (
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider border ${deadline.cls}`}>
                            <FaIcon className={`fas ${deadline.icon} mr-1`}  />{deadline.label}
                        </span>
                    )}
                </div>
            </div>

            {/* TITLE row: submitter + title */}
            <div
                onClick={() => onOpenDetail(req)}
                className="px-7 pb-5 cursor-pointer"
            >
                <div className="grid grid-cols-1 md:grid-cols-[auto_1px_1fr] gap-6 items-stretch">
                    {/* Submitter — anchored on a person */}
                    <div className="flex items-center gap-3 min-w-[220px]">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tk?.avatar || 'from-slate-400 to-slate-500'} text-white flex items-center justify-center font-black text-sm shadow-lg ring-4 ${tk?.badgeRing || 'ring-slate-100'}`}>
                            {initials(submitterName)}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Đề xuất bởi</div>
                            <div className="text-sm font-black text-slate-800 truncate" title={submitterName}>
                                {submitterName}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 font-bold tabular-nums">
                                <FaIcon className="fas fa-clock text-[8px] text-slate-400"  />
                                <span>{new Date(req.submitted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="text-slate-300">·</span>
                                <span>{new Date(req.submitted_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Vertical hairline */}
                    <div className="hidden md:block w-px bg-slate-200" />

                    {/* Order title */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {req.brand && (
                                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    {req.brand}
                                </span>
                            )}
                            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                                Lv {req.current_level}{totalLevels > 0 ? ` / ${totalLevels}` : ''}
                            </span>
                            {currentInfo && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-0.5 rounded-full">
                                    <FaIcon className="fas fa-arrow-right text-[8px]"  />
                                    Đang chờ <span className="font-black">{shortName(currentInfo.primary)}</span>
                                    {currentInfo.extraCount > 0 && (
                                        <span className="text-amber-600/80 font-bold">+{currentInfo.extraCount}</span>
                                    )}
                                    {currentInfo.requireAll && currentInfo.extraCount > 0 && (
                                        <span className="text-[8px] uppercase tracking-wider text-amber-600 ml-0.5">Tất cả</span>
                                    )}
                                </span>
                            )}
                        </div>
                        <h4
                            className="mt-1.5 text-xl md:text-2xl font-black tracking-tight leading-tight text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2"
                            title={req.draft_name}
                        >
                            {req.draft_name}
                        </h4>
                        {lastAction?.comment && (
                            <p className="mt-2 text-xs italic text-slate-500 line-clamp-2 max-w-2xl">
                                <FaIcon className="fas fa-quote-left text-slate-300 text-[8px] mr-1.5"  />
                                {lastAction.comment}
                                <span className="ml-2 text-[10px] font-black not-italic text-slate-400">
                                    — {usersMap[lastAction.actor_id] || 'N/A'}
                                </span>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI STRIP — số SKU · số lượng · giá trị */}
            <div className="px-7 py-4 border-t border-slate-200/70 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle at 80% 50%, rgba(59,130,246,0.18), transparent 55%)',
                    }}
                />
                <div className="relative grid grid-cols-3 divide-x divide-white/10">
                    <div className="px-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300/80">Số SKU</div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-2xl font-black tabular-nums leading-none">
                                {hasSummary ? fmtNum(summary!.skuCount) : '—'}
                            </span>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">mã</span>
                        </div>
                    </div>
                    <div className="px-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.28em] text-emerald-300/80">Số lượng hàng</div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-2xl font-black tabular-nums leading-none">
                                {hasSummary ? fmtNum(summary!.totalQty) : '—'}
                            </span>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">chiếc</span>
                        </div>
                    </div>
                    <div className="px-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-300/80">Giá trị đơn</div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span
                                className="text-2xl font-black tabular-nums leading-none text-amber-100"
                                title={hasSummary ? `${fmtNum(summary!.totalValue)} VNĐ` : ''}
                            >
                                {hasSummary ? fmtVnd(summary!.totalValue) : '—'}
                            </span>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">VND</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* WORKFLOW — explicit labeled section */}
            {workflow && (
                <div className="px-7 py-5 bg-slate-50/60 border-t border-slate-200/70">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">Quy trình phê duyệt</span>
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-[9px] font-black tabular-nums text-slate-400 tracking-widest">
                            {Math.min(req.current_level, totalLevels)} / {totalLevels}
                        </span>
                    </div>
                    <WorkflowStepper
                        request={req}
                        workflow={workflow}
                        actions={actions}
                        usersMap={usersMap}
                        compact
                    />
                    {totalLevels > 0 && (
                        <div className="mt-4">
                            <div className="h-1 bg-slate-200/70 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-700 ${
                                        req.status === 'rejected' ? 'bg-rose-500'
                                        : req.status === 'returned' ? 'bg-indigo-500'
                                        : req.status === 'approved' ? 'bg-emerald-500'
                                        : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${req.status === 'approved' ? 100 : progressPct}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* FOOTER — actions */}
            <footer className="px-7 py-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 bg-white">
                <div className="flex items-center gap-2">
                    <button
                        onClick={async () => {
                            if (!onLoadRequest) return;
                            showToast("Đang tải dữ liệu...", "loading");
                            try {
                                const fullReq = await fetchRequestById(req.id);
                                if (fullReq) onLoadRequest(fullReq);
                                else showToast("Không thể tải chi tiết đơn hàng", "error");
                            } catch (e) {
                                showToast("Lỗi khi tải đơn hàng", "error");
                            }
                        }}
                        className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all flex items-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                        <FaIcon className="fas fa-folder-open text-[11px]"  /> Mở đơn
                    </button>
                    <button
                        onClick={() => onDownload(req)}
                        disabled={!canDownload || isDownloading}
                        title={canDownload ? 'Tải CSV theo cấu hình cột Order Draft' : 'Chỉ tải đơn đã duyệt hoặc đang xử lý'}
                        className={`h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all flex items-center gap-2 border ${
                            canDownload
                                ? 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
                                : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        }`}
                    >
                        {isDownloading ? <FaIcon className="fas fa-spinner fa-spin text-[11px]"  /> : <FaIcon className="fas fa-file-arrow-down text-[11px]"  />}
                        Tải CSV
                    </button>
                    <button
                        onClick={() => onOpenDetail(req)}
                        className="h-9 px-3 text-slate-400 hover:text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all flex items-center gap-2"
                    >
                        <FaIcon className="fas fa-eye text-[11px]"  /> Chi tiết
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {isApprover && (
                        <>
                            <button
                                onClick={() => onAction(req.id, 'rejected')}
                                disabled={isProcessing}
                                className="h-9 px-4 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-colors flex items-center gap-2"
                            >
                                <FaIcon className="fas fa-xmark text-[11px]"  /> Từ chối
                            </button>
                            <button
                                onClick={() => onAction(req.id, 'approved')}
                                disabled={isProcessing}
                                className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all flex items-center gap-2 shadow-md shadow-emerald-200 active:scale-[0.98]"
                            >
                                {isProcessing ? <FaIcon className="fas fa-spinner fa-spin"  /> : <FaIcon className="fas fa-check-double text-[11px]"  />}
                                Duyệt đơn
                            </button>
                        </>
                    )}
                    {isAdmin && (
                        <button
                            onClick={() => onDelete(req.id)}
                            className="h-9 w-9 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors flex items-center justify-center"
                            title="Xóa vĩnh viễn"
                        >
                            <FaIcon className="fas fa-trash-can text-xs"  />
                        </button>
                    )}
                </div>
            </footer>
        </article>
    );
};
