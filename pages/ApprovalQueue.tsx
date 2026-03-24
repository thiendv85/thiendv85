import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    listProfiles,
} from '../utils/supabase';
import { ApprovalRequest, ApprovalAction } from '../types/inventory';

type TabFilter = 'pending' | 'mine' | 'all';

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ApprovalQueue = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabFilter>('pending');
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<{ req: ApprovalRequest; actions: ApprovalAction[] } | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['approved', 'rejected', 'returned']));
    
    // Phase 1 & 2 Search/Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'submitted_at', direction: 'desc' as 'asc' | 'desc' });
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    
    // Phase 2 Selection & Toast States
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'loading' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'loading' = 'success') => {
        setToast({ msg, type });
        if (type !== 'loading') {
            setTimeout(() => setToast(prev => (prev?.msg === msg ? null : prev)), 3000);
        }
    };

    const loadRequests = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let dataPromise;
            if (activeTab === 'pending') dataPromise = fetchPendingForApprover(user.id);
            else if (activeTab === 'mine') dataPromise = fetchMyRequests(user.id);
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
            showToast("Lỗi khi nạp dữ liệu", "error");
        } finally {
            setIsLoading(false);
        }
    }, [user, activeTab]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    const openDetail = async (req: ApprovalRequest) => {
        const full = await fetchRequestById(req.id);
        const acts = await fetchRequestActions(req.id);
        if (full) setSelected({ req: full, actions: acts });
    };

    const toggleSection = (status: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(status)) next.delete(status);
            else next.add(status);
            return next;
        });
    };

    const handleAction = async (requestId: string, action: 'approved' | 'rejected') => {
        if (!user) return;
        setIsProcessing(requestId);
        showToast(`Đang ${action === 'approved' ? 'duyệt' : 'từ chối'}...`, 'loading');
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            const result = await processApprovalAction(requestId, user.id, action);
            if (result.success) {
                showToast(`Đã ${action === 'approved' ? 'phê duyệt' : 'từ chối'} đơn hàng`, 'success');
                await loadRequests();
            } else {
                showToast("Không thể thực hiện thao tác", "error");
            }
        } catch (err) {
            console.error("Action error:", err);
            showToast("Lỗi hệ thống", "error");
        } finally {
            setIsProcessing(null);
        }
    };

    const handleBulkAction = async (action: 'approved' | 'rejected') => {
        if (!user || selectedIds.size === 0) return;
        const idsArray = Array.from(selectedIds);
        showToast(`Đang xử lý ${idsArray.length} đơn hàng...`, 'loading');
        
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            let successCount = 0;
            
            for (const id of idsArray) {
                const res = await processApprovalAction(id, user.id, action);
                if (res.success) successCount++;
            }
            
            showToast(`Hoàn tất: ${successCount}/${idsArray.length} thành công`, successCount === idsArray.length ? 'success' : 'error');
            setSelectedIds(new Set());
            await loadRequests();
        } catch (err) {
            showToast("Lỗi xử lý hàng loạt", "error");
        }
    };

    const toggleSelectAll = (ids: string[]) => {
        const next = new Set(selectedIds);
        const allAlreadySelected = ids.every(id => next.has(id));
        if (allAlreadySelected) ids.forEach(id => next.delete(id));
        else ids.forEach(id => next.add(id));
        setSelectedIds(next);
    };

    const toggleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const TABS: { id: TabFilter; label: string; icon: string }[] = [
        { id: 'pending', label: 'Cần duyệt', icon: 'fa-clock' },
        { id: 'mine', label: 'Của tôi', icon: 'fa-user' },
        { id: 'all', label: 'Tất cả', icon: 'fa-layer-group' },
    ];

    const filteredAndSortedRequests = useMemo(() => {
        let result = [...requests];

        if (activeTab === 'pending') {
            result = result.filter(r => ['pending', 'in_progress'].includes(r.status));
        } else if (activeTab === 'mine') {
            result = result.filter(r => r.submitted_by === user?.id);
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(r => 
                r.draft_name.toLowerCase().includes(term) ||
                (r.brand || '').toLowerCase().includes(term) ||
                (usersMap[r.submitted_by] || '').toLowerCase().includes(term)
            );
        }

        if (filterLevel) {
            result = result.filter(r => r.current_level === parseInt(filterLevel));
        }

        if (dateRange.from) {
            result = result.filter(r => new Date(r.submitted_at) >= new Date(dateRange.from));
        }
        if (dateRange.to) {
            const end = new Date(dateRange.to);
            end.setHours(23, 59, 59, 999);
            result = result.filter(r => new Date(r.submitted_at) <= end);
        }

        result.sort((a, b) => {
            let aVal: any = a[sortConfig.key as keyof ApprovalRequest];
            let bVal: any = b[sortConfig.key as keyof ApprovalRequest];
            if (sortConfig.key === 'submitted_at') {
                aVal = new Date(aVal || 0).getTime();
                bVal = new Date(bVal || 0).getTime();
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [requests, activeTab, searchTerm, filterLevel, dateRange, sortConfig, user?.id, usersMap]);

    const groupedRequests = useMemo(() => {
        return filteredAndSortedRequests.reduce((acc, req) => {
            const status = req.status;
            if (!acc[status]) acc[status] = [];
            acc[status].push(req);
            return acc;
        }, {} as Record<string, ApprovalRequest[]>);
    }, [filteredAndSortedRequests]);

    const stats = useMemo(() => ({
        pending: requests.filter(r => r.status === 'pending').length,
        inProgress: requests.filter(r => r.status === 'in_progress').length,
        approved: requests.filter(r => r.status === 'approved').length,
        rejected: requests.filter(r => r.status === 'rejected').length,
        total: requests.length
    }), [requests]);

    const STATUS_UI: Record<string, { label: string; icon: string; cls: string; border: string }> = {
        pending: { label: 'Cần duyệt (Pending)', icon: 'fa-clock', cls: 'text-amber-600 bg-amber-50', border: 'border-amber-200' },
        in_progress: { label: 'Đang xử lý (In Progress)', icon: 'fa-spinner fa-spin', cls: 'text-blue-600 bg-blue-50', border: 'border-blue-200' },
        returned: { label: 'Bị trả lại (Returned)', icon: 'fa-rotate-left', cls: 'text-purple-600 bg-purple-50', border: 'border-purple-200' },
        approved: { label: 'Đã duyệt (Approved)', icon: 'fa-check-circle', cls: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200' },
        rejected: { label: 'Bị từ chối (Rejected)', icon: 'fa-times-circle', cls: 'text-rose-600 bg-rose-50', border: 'border-rose-200' },
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f8fafc] overflow-hidden relative">
            {/* ═══ 1. VIBRANT PREMIUM HEADER ══════════════════════════════════ */}
            <div className="shrink-0 relative px-8 pt-10 pb-16 text-white overflow-hidden shadow-2xl"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f2744 100%)' }}>
                
                <div className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 70%, #6366f1 0%, transparent 50%)' }} />
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                           <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-2xl">
                               <i className="fas fa-check-double text-blue-400 text-xl"></i>
                           </div>
                           <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md">
                               Phê duyệt Đặt hàng
                           </h1>
                        </div>
                        <p className="text-blue-100/70 font-bold ml-16 text-sm uppercase tracking-widest opacity-80">
                            Executive Governance Dashboard
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-white/5 backdrop-blur-2xl p-1.5 rounded-[22px] border border-white/10 shadow-inner">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className={`relative px-6 py-2.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 group ${
                                        activeTab === t.id ? 'bg-white text-slate-900 shadow-xl scale-[1.02]' : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <i className={`fas ${t.icon} text-[10px] ${activeTab === t.id ? 'text-blue-600' : 'opacity-50'}`} />
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <button onClick={loadRequests} disabled={isLoading} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center backdrop-blur-xl group">
                            <i className={`fas fa-arrows-rotate text-blue-400 group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'fa-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="mt-10 grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard label="Tổng cộng" value={stats.total} icon="fa-boxes-packing" color="blue" />
                    <StatCard label="Cần duyệt" value={stats.pending} icon="fa-hourglass-half" color="amber" />
                    <StatCard label="Đang xử lý" value={stats.inProgress} icon="fa-spinner" color="indigo" />
                    <StatCard label="Đã duyệt" value={stats.approved} icon="fa-check-double" color="emerald" />
                    <StatCard label="Từ chối" value={stats.rejected} icon="fa-ban" color="rose" />
                </div>
            </div>

            {/* ═══ 2. TOOLBELT & ADVANCED FILTERS ═════════════════════════════ */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-8 py-5 flex flex-col gap-4 shadow-sm z-20">
                <div className="flex flex-col lg:flex-row gap-4 items-center">
                    <div className="flex-1 relative w-full">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input 
                            type="text"
                            placeholder="Tìm theo tên Draft, thương hiệu hoặc người gửi..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex items-center gap-3 shrink-0 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                        <button 
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`px-5 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center gap-2 ${isFilterOpen ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            <i className="fas fa-filter"></i> Bộ lọc {isFilterOpen ? 'đang mở' : ''}
                        </button>
                        <select 
                            value={sortConfig.key}
                            onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value }))}
                            className="bg-slate-100 px-5 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-600 outline-none hover:bg-slate-200"
                        >
                            <option value="submitted_at">Mới nhất</option>
                            <option value="draft_name">Tên Draft</option>
                            <option value="brand">Thương hiệu</option>
                        </select>
                        <button 
                            onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                            className="p-3.5 bg-slate-100 rounded-2xl hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                            <i className={`fas fa-sort-amount-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        </button>
                    </div>
                </div>

                {/* Advanced Filter Drawer */}
                {isFilterOpen && (
                    <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slideDown shadow-inner">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cấp độ phê duyệt</label>
                            <select 
                                value={filterLevel}
                                onChange={(e) => setFilterLevel(e.target.value)}
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            >
                                <option value="">Tất cả các cấp</option>
                                <option value="1">Cấp 1 (Regional)</option>
                                <option value="2">Cấp 2 (National)</option>
                                <option value="3">Cấp 3 (Executive)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Từ ngày</label>
                            <input 
                                type="date"
                                value={dateRange.from}
                                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Đến ngày</label>
                            <input 
                                type="date"
                                value={dateRange.to}
                                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                            <button 
                                onClick={() => { setFilterLevel(''); setDateRange({ from: '', to: '' }); }}
                                className="absolute right-0 top-0 text-[10px] font-black text-blue-600 uppercase hover:underline"
                            >
                                Reset bộ lọc
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ 3. MAIN LISTING ═══════════════════════════════════════════ */}
            <div className="flex-1 overflow-auto px-8 py-8 custom-scrollbar bg-slate-50/50 min-h-[500px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] italic animate-pulse">Initializing Governance Engine...</span>
                    </div>
                ) : filteredAndSortedRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-6 animate-fadeIn">
                        <div className="w-28 h-28 bg-white rounded-[40px] border-4 border-dashed border-slate-200 flex items-center justify-center shadow-inner">
                            <i className="fas fa-search text-5xl text-slate-200" />
                        </div>
                        <div className="text-center max-w-sm">
                            <h3 className="text-slate-800 font-black text-xl">Không tìm thấy yêu cầu</h3>
                            <p className="text-slate-400 font-bold text-sm mt-2">Hãy thử nới lỏng các tiêu chí tìm kiếm hoặc bộ lọc nâng cao.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-16">
                        {Object.keys(STATUS_UI).filter(s => groupedRequests[s]).map(status => {
                            const config = STATUS_UI[status];
                            const isCollapsed = collapsedSections.has(status);
                            const list = groupedRequests[status];
                            const allSelected = list.every(r => selectedIds.has(r.id));

                            return (
                                <div key={status} className="group/section relative">
                                    <div 
                                        onClick={() => toggleSection(status)}
                                        className={`sticky top-0 z-30 flex items-center justify-between py-5 group cursor-pointer border-b-2 transition-all ${config.border} bg-white/80 backdrop-blur-xl mb-8 rounded-t-3xl px-4`}
                                    >
                                        <div className="flex items-center gap-6">
                                            {/* Select All Checkbox */}
                                            <div 
                                                onClick={(e) => { e.stopPropagation(); toggleSelectAll(list.map(r => r.id)); }}
                                                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${allSelected && list.length > 0 ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 hover:border-blue-400'}`}
                                            >
                                                {allSelected && list.length > 0 && <i className="fas fa-check text-white text-[10px]" />}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md border border-black/5 ${config.cls}`}>
                                                    <i className={`fas ${config.icon} text-lg`}></i>
                                                </div>
                                                <div>
                                                    <h3 className={`text-base font-black uppercase tracking-widest ${config.cls.split(' ')[0]}`}>{config.label}</h3>
                                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{list.length} Yêu cầu trong danh sách</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isCollapsed ? 'bg-slate-100 text-slate-400 shadow-inner' : 'bg-slate-900 text-white shadow-2xl scale-110'}`}>
                                            <i className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'} text-xs transform transition-transform duration-500 ${isCollapsed ? '' : 'rotate-180'}`} />
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="flex flex-col gap-5 animate-slideUp">
                                            {list.map(req => {
                                                const isSel = selectedIds.has(req.id);
                                                const qs = req.snapshot_data?.quantities || {};
                                                const skuCount = Object.values(qs as Record<string, any>).filter(q => q.air > 0 || q.sea > 0).length;
                                                const isThisProcessing = isProcessing === req.id;
                                                
                                                return (
                                                    <div 
                                                        key={req.id} 
                                                        className={`relative bg-white border-2 rounded-[32px] p-6 flex flex-col xl:flex-row items-center justify-between gap-8 transition-all hover:shadow-3xl group animate-fadeIn ${isSel ? 'border-blue-500 shadow-blue-500/10 scale-[1.01] z-10' : 'border-slate-100 hover:border-blue-200'}`}
                                                    >
                                                        <div className="flex items-center gap-6 flex-1 min-w-0">
                                                            {/* Checkbox */}
                                                            <div 
                                                                onClick={() => toggleSelectOne(req.id)}
                                                                className={`w-7 h-7 rounded-xl border-2 shrink-0 flex items-center justify-center cursor-pointer transition-all ${isSel ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/40' : 'bg-slate-50 border-slate-200 hover:border-blue-400 group-hover:bg-blue-50'}`}
                                                            >
                                                                {isSel && <i className="fas fa-check text-white text-xs" />}
                                                            </div>
                                                            <div className="flex items-center gap-5 flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(req)}>
                                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all shadow-sm ${isSel ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-500 group-hover:text-white'}`}>
                                                                    <i className="fas fa-file-invoice text-2xl" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-xl font-black text-slate-900 truncate tracking-tight group-hover:text-blue-700 transition-colors">
                                                                        {req.draft_name}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 mt-1.5">
                                                                        <span className="text-[11px] bg-slate-900 text-white px-3 py-1 rounded-full font-black uppercase tracking-wider">{req.brand || 'NO BRAND'}</span>
                                                                        <span className="text-[11px] bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-black uppercase tracking-wider border border-blue-100">Cấp {req.current_level}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-10 px-8 border-x border-slate-100 shrink-0 hidden md:flex">
                                                            <div className="text-center">
                                                                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">SKU Impact</div>
                                                                <div className="text-2xl font-black text-slate-800">{skuCount}</div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Tiến độ</div>
                                                                <ApprovalStatusBadge status={req.status} size="lg" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 shrink-0">
                                                            <div className="text-right">
                                                                <div className="text-sm font-black text-slate-800">{usersMap[req.submitted_by] || 'Unknown'}</div>
                                                                <div className="text-xs font-bold text-slate-400 flex items-center justify-end gap-1.5 mt-1">
                                                                    <i className="far fa-calendar-alt" /> {new Date(req.submitted_at).toLocaleDateString('vi-VN')}
                                                                </div>
                                                            </div>
                                                            <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-white shadow-xl flex items-center justify-center text-slate-400 ring-4 ring-slate-50 relative">
                                                                <i className="fas fa-user text-lg" />
                                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full"></div>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 flex items-center gap-3">
                                                            {req.status === 'pending' || req.status === 'in_progress' ? (
                                                                <>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(req.id, 'approved'); }}
                                                                        disabled={isThisProcessing !== null}
                                                                        className="h-12 px-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] transition-all shadow-xl shadow-emerald-500/30 flex items-center gap-2 hover:scale-105"
                                                                    >
                                                                        {isThisProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check"></i>}
                                                                        Duyệt nhanh
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(req.id, 'rejected'); }}
                                                                        disabled={isThisProcessing !== null}
                                                                        className="h-12 w-12 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 rounded-2xl border border-rose-200 transition-all flex items-center justify-center shadow-sm"
                                                                    >
                                                                        <i className="fas fa-times"></i>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button 
                                                                    onClick={() => openDetail(req)}
                                                                    className="h-12 px-6 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-slate-200"
                                                                >
                                                                    Chi tiết <i className="fas fa-chevron-right text-[10px]"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══ 4. FLOATING BULK ACTION BAR ═══════════════════════════════ */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-bounceIn">
                    <div className="bg-slate-900/90 backdrop-blur-2xl px-8 py-5 rounded-[40px] border border-white/20 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] flex items-center gap-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg ring-4 ring-blue-500/30">
                                {selectedIds.size}
                            </div>
                            <div>
                                <div className="text-[11px] font-black text-blue-400 uppercase tracking-widest">Đang lựa chọn</div>
                                <div className="text-white font-black text-sm">Action hàng loạt</div>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-white/10" />
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => handleBulkAction('approved')}
                                className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                            >
                                <i className="fas fa-check-double mr-2"></i> Duyệt tất cả
                            </button>
                            <button 
                                onClick={() => handleBulkAction('rejected')}
                                className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 active:scale-95"
                            >
                                <i className="fas fa-times-circle mr-2"></i> Từ chối
                            </button>
                            <button 
                                onClick={() => setSelectedIds(new Set())}
                                className="text-white/60 hover:text-white font-black text-[10px] uppercase tracking-widest px-4"
                            >
                                Hủy bỏ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 5. GLOBAL TOAST ════════════════════════════════════════════ */}
            {toast && (
                <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-fadeIn">
                    <div className={`px-6 py-4 rounded-full shadow-2xl border backdrop-blur-xl flex items-center gap-3 transition-all ${
                        toast.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 
                        toast.type === 'error' ? 'bg-rose-500/90 border-rose-400 text-white' : 
                        'bg-blue-600/90 border-blue-400 text-white'
                    }`}>
                        {toast.type === 'loading' ? <i className="fas fa-circle-notch fa-spin" /> : 
                         toast.type === 'success' ? <i className="fas fa-check-circle" /> : 
                         <i className="fas fa-exclamation-triangle" />}
                        <span className="font-black text-sm uppercase tracking-wider">{toast.msg}</span>
                    </div>
                </div>
            )}

            {/* Modal Layer */}
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

const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) => {
    const colors: Record<string, string> = {
        blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
        amber: 'from-amber-400 to-amber-500 shadow-amber-500/20',
        indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-500/20',
        emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/20',
        rose: 'from-rose-500 to-rose-600 shadow-rose-500/20'
    };
    
    return (
        <div className={`bg-gradient-to-br ${colors[color]} rounded-[28px] p-6 text-white shadow-xl transition-all hover:scale-[1.03] duration-300 relative overflow-hidden group`}>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <i className={`fas ${icon} text-5xl transform rotate-12`}></i>
            </div>
            <div className="relative z-10">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">{label}</div>
                <div className="text-4xl font-black drop-shadow-sm">{value}</div>
            </div>
        </div>
    );
};
