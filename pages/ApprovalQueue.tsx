import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { ApprovalStatusBadge } from '../components/ApprovalStatusBadge';
import { OrderReviewModal } from '../components/OrderReviewModal';
import { Typography } from '../components/Typography';
import {
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestById,
    fetchRequestActions,
    listProfiles,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';

type TabFilter = 'pending' | 'mine' | 'all';

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ApprovalQueue = () => {
    const { user, profile } = useAuth();
    const { hasApprovalRole, allowedLevels } = useApprovalAuth();
    const [tab, setTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);

    const loadRequests = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let dataPromise;
            if (tab === 'pending') dataPromise = fetchPendingForApprover(user.id, allowedLevels.length > 0 ? allowedLevels : undefined);
            else if (tab === 'mine') dataPromise = fetchMyRequests(user.id);
            else dataPromise = fetchAllRequests();

            const [dataRaw, profiles] = await Promise.all([
                dataPromise,
                listProfiles()
            ]);

            const pMap: Record<string, string> = {};
            profiles.forEach(p => pMap[p.id] = p.full_name || p.email || p.id);
            setUsersMap(pMap);

            const statusOrder: Record<string, number> = {
                pending: 1,
                in_progress: 2,
                returned: 3,
                approved: 4,
                rejected: 5
            };

            const sortedData = dataRaw.sort((a, b) => {
                const s1 = statusOrder[a.status] || 99;
                const s2 = statusOrder[b.status] || 99;
                if (s1 !== s2) return s1 - s2;
                return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
            });

            setRequests(sortedData);
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
        <div className="flex flex-col h-full space-y-6 pb-24 animate-fadeIn">
            {/* 1. HEADER SECTION */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-violet-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl shadow-blue-900/20">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                           <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-inner">
                               <i className="fas fa-check-double text-blue-200"></i>
                           </div>
                           <Typography variant="h1" className="text-white text-2xl font-black tracking-tight flex items-center gap-2">
                               Phê duyệt Đặt hàng
                           </Typography>
                        </div>
                        <div className="flex items-center gap-3 ml-[52px]">
                            <Typography variant="body" className="text-blue-100/80 font-medium">
                                Quản lý và phê duyệt các yêu cầu đặt hàng.
                            </Typography>
                            {hasApprovalRole && allowedLevels.length > 0 && (
                                <span className="text-[10px] font-black bg-white/15 border border-white/20 px-2.5 py-1 rounded-lg text-blue-200 uppercase tracking-widest">
                                    <i className="fas fa-shield-halved mr-1" />
                                    Level {allowedLevels.join(', ')}
                                </span>
                            )}
                            {profile?.department && (
                                <span className="text-[10px] font-black bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg text-blue-300 uppercase tracking-widest">
                                    <i className="fas fa-building mr-1" />
                                    {profile.department}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1 bg-black/20 backdrop-blur-md p-1 md:p-1.5 rounded-2xl border border-white/10">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={`px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                                        tab === t.id 
                                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                                        : 'text-blue-200/70 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <button 
                            onClick={loadRequests} 
                            disabled={isLoading}
                            className={`h-[38px] md:h-[42px] px-4 rounded-xl bg-white/10 text-blue-100 hover:bg-white/20 hover:text-white border border-white/20 transition-all flex items-center justify-center backdrop-blur-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Làm mới"
                        >
                            <i className={`fas fa-arrows-rotate ${isLoading ? 'fa-spin' : ''}`}></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden flex-1">
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
                                <th className="px-4 py-3 text-left font-black">Người gửi</th>
                                <th className="px-4 py-3 text-center font-black">SKU</th>
                                <th className="px-4 py-3 text-center font-black">Level</th>
                                <th className="px-4 py-3 text-center font-black">Trạng thái</th>
                                <th className="px-4 py-3 text-left font-black">Ngày gửi</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let currentStatus = '';
                                const rows: React.ReactNode[] = [];

                                requests.forEach(req => {
                                    if (req.status !== currentStatus) {
                                        currentStatus = req.status;

                                        let icon = 'fa-circle-dot';
                                        let bg = 'bg-slate-50';
                                        let text = 'text-slate-600';
                                        let label = currentStatus;

                                        let borderL = 'border-slate-400';
                                        if (currentStatus === 'pending') { icon = 'fa-clock'; bg = 'bg-amber-100'; text = 'text-amber-800'; label = 'Cần duyệt (Pending)'; borderL = 'border-amber-400'; }
                                        else if (currentStatus === 'in_progress') { icon = 'fa-spinner fa-spin'; bg = 'bg-blue-100'; text = 'text-blue-800'; label = 'Đang xử lý (In Progress)'; borderL = 'border-blue-400'; }
                                        else if (currentStatus === 'returned') { icon = 'fa-rotate-left'; bg = 'bg-purple-100'; text = 'text-purple-800'; label = 'Bị trả lại (Returned)'; borderL = 'border-purple-400'; }
                                        else if (currentStatus === 'approved') { icon = 'fa-check-circle'; bg = 'bg-emerald-100'; text = 'text-emerald-800'; label = 'Đã duyệt (Approved)'; borderL = 'border-emerald-400'; }
                                        else if (currentStatus === 'rejected') { icon = 'fa-times-circle'; bg = 'bg-rose-100'; text = 'text-rose-800'; label = 'Bị từ chối (Rejected)'; borderL = 'border-rose-400'; }

                                        rows.push(
                                            <tr key={`group-${currentStatus}`} className={`bg-slate-100/90 border-y border-slate-300 shadow-sm border-l-4 ${borderL}`}>
                                                <td colSpan={8} className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg} ${text} shadow-sm border border-black/5`}>
                                                            <i className={`fas ${icon} text-[11px]`}></i>
                                                        </div>
                                                        <span className={`text-sm font-black uppercase tracking-widest ${text}`}>{label}</span>
                                                        <div className="h-5 w-px bg-slate-300 mx-3"></div>
                                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                                                            {requests.filter(r => r.status === currentStatus).length} Yêu cầu
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    const qs = req.snapshot_data?.quantities || {};
                                    const skuCount = Object.values(qs as Record<string, { air: number; sea: number }>)
                                        .filter(q => q.air > 0 || q.sea > 0).length;

                                    let bgHover = 'hover:bg-slate-50/80';
                                    let borderL = 'border-l-transparent';
                                    let rowBg = 'bg-white';
                                    if (req.status === 'pending') { borderL = 'border-l-amber-400'; bgHover = 'hover:bg-amber-50/80'; rowBg = 'bg-amber-50/20'; }
                                    else if (req.status === 'in_progress') { borderL = 'border-l-blue-400'; bgHover = 'hover:bg-blue-50'; rowBg = 'bg-blue-50/20'; }
                                    else if (req.status === 'returned') { borderL = 'border-l-purple-400'; bgHover = 'hover:bg-purple-50'; rowBg = 'bg-purple-50/20'; }
                                    else if (req.status === 'approved') { borderL = 'border-l-emerald-400'; bgHover = 'hover:bg-emerald-50'; rowBg = 'bg-emerald-50/20'; }
                                    else if (req.status === 'rejected') { borderL = 'border-l-rose-400'; bgHover = 'hover:bg-rose-50'; rowBg = 'bg-rose-50/20'; }

                                    rows.push(
                                        <tr key={req.id} className={`border-t border-slate-100 ${rowBg} ${bgHover} transition-colors cursor-pointer border-l-4 ${borderL} group`} onClick={() => openDetail(req)}>
                                            <td className="px-5 py-3.5 font-black text-slate-800 text-[13px] group-hover:text-blue-700 transition-colors">{req.draft_name}</td>
                                            <td className="px-4 py-3.5 text-slate-600 font-bold">{req.brand || '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center text-[10px] font-bold">
                                                        <i className="fas fa-user" />
                                                    </div>
                                                    <span className="text-slate-800 font-bold text-xs">{usersMap[req.submitted_by] || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <span className="bg-slate-100 text-slate-700 text-[11px] font-black px-2.5 py-1 rounded shadow-sm border border-slate-200">{skuCount}</span>
                                            </td>
                                            <td className="px-4 py-3.5 text-center text-slate-700 font-black">Lvl {req.current_level}</td>
                                            <td className="px-4 py-3.5 text-center"><ApprovalStatusBadge status={req.status} size="sm" /></td>
                                            <td className="px-4 py-3.5 text-slate-500 text-[11px] font-bold whitespace-nowrap"><i className="far fa-clock mr-1.5 opacity-70"></i>{new Date(req.submitted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                            <td className="px-4 py-3.5 text-right">
                                                <span className="bg-white border border-slate-200 text-slate-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 shadow-sm px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap">
                                                    Xem <i className="fas fa-chevron-right ml-1 opacity-70 text-[10px]" />
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                });

                                return rows;
                            })()}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <OrderReviewModal
                    request={selected.req}
                    actions={selected.actions}
                    usersMap={usersMap}
                    onClose={() => setSelected(null)}
                    onRefresh={loadRequests}
                />
            )}
        </div>
    );
};
