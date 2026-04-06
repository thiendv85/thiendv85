import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../utils/authContext';
import { useApprovalAuth } from '../hooks/useApprovalAuth';
import { useLanguage } from '../utils/i18n';
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
    const { t } = useLanguage();
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
            if (activeTab === 'pending') dataPromise = fetchPendingForApprover(user.id, allowedLevels.length > 0 ? allowedLevels : undefined);
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
            showToast(t('approval_toast_load_error'), "error");
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
        showToast(action === 'approved' ? t('approval_toast_approving') : t('approval_toast_rejecting'), 'loading');
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            const result = await processApprovalAction(requestId, user.id, action);
            if (result.success) {
                showToast(action === 'approved' ? t('approval_toast_approved') : t('approval_toast_rejected'), 'success');
                await loadRequests();
            } else {
                showToast(t('approval_toast_error'), "error");
            }
        } catch (err) {
            console.error("Action error:", err);
            showToast(t('approval_toast_system_error'), "error");
        } finally {
            setIsProcessing(null);
        }
    };

    const handleBulkAction = async (action: 'approved' | 'rejected') => {
        if (!user || selectedIds.size === 0) return;
        const idsArray = Array.from(selectedIds);
        showToast(`${t('approval_toast_bulk_processing')} ${idsArray.length}...`, 'loading');
        
        try {
            const { processApprovalAction } = await import('../utils/supabase');
            let successCount = 0;
            
            for (const id of idsArray) {
                const res = await processApprovalAction(id as string, user.id as string, action);
                if (res.success) successCount++;
            }
            
            showToast(`${t('approval_toast_bulk_done')}: ${successCount}/${idsArray.length} ${t('approval_toast_bulk_success')}`, successCount === idsArray.length ? 'success' : 'error');
            setSelectedIds(new Set());
            await loadRequests();
        } catch (err) {
            showToast(t('approval_toast_bulk_error'), "error");
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
        { id: 'pending', label: t('approval_tab_pending'), icon: 'fa-clock' },
        { id: 'mine', label: t('approval_tab_mine'), icon: 'fa-user' },
        { id: 'all', label: t('approval_tab_all'), icon: 'fa-layer-group' },
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
        pending: { label: t('approval_status_pending_long'), icon: 'fa-clock', cls: 'text-amber-600 bg-amber-50', border: 'border-amber-200' },
        in_progress: { label: t('approval_status_in_progress_long'), icon: 'fa-spinner fa-spin', cls: 'text-blue-600 bg-blue-50', border: 'border-blue-200' },
        returned: { label: t('approval_status_returned_long'), icon: 'fa-rotate-left', cls: 'text-purple-600 bg-purple-50', border: 'border-purple-200' },
        approved: { label: t('approval_status_approved_long'), icon: 'fa-check-circle', cls: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200' },
        rejected: { label: t('approval_status_rejected_long'), icon: 'fa-times-circle', cls: 'text-rose-600 bg-rose-50', border: 'border-rose-200' },
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f8fafc] overflow-hidden relative">
            {/* ═══ 1. COMPACT HEADER ═══════════════════════════════════════════ */}
            <div className="shrink-0 relative text-white overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f2744 100%)' }}>
                <div className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 70%, #6366f1 0%, transparent 50%)' }} />

                {/* Top row: title + stats + actions */}
                <div className="relative z-10 flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                            <i className="fas fa-check-double text-blue-400"></i>
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white leading-none">{t('approval_title')}</h1>
                            <p className="text-[10px] text-blue-100/60 font-medium mt-0.5">{t('approval_subtitle')}</p>
                        </div>
                    </div>

                    {/* Inline stat pills */}
                    <div className="flex items-center gap-2 mx-4">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                            <span className="text-[10px] font-black text-white/40 uppercase">{t('approval_stat_total')}</span>
                            <span className="text-sm font-black text-white">{stats.total}</span>
                        </div>
                        {stats.pending > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 px-3 py-1.5 rounded-lg">
                                <i className="fas fa-hourglass-half text-amber-300 text-[10px]"></i>
                                <span className="text-[10px] font-black text-amber-300 uppercase">{t('approval_stat_pending')}</span>
                                <span className="text-sm font-black text-amber-200">{stats.pending}</span>
                            </div>
                        )}
                        {stats.processing > 0 && (
                            <div className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-lg">
                                <span className="text-[10px] font-black text-indigo-300 uppercase">{t('approval_stat_processing')}</span>
                                <span className="text-sm font-black text-indigo-200">{stats.processing}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/20 px-3 py-1.5 rounded-lg">
                            <i className="fas fa-check text-emerald-300 text-[10px]"></i>
                            <span className="text-sm font-black text-emerald-200">{stats.approved}</span>
                        </div>
                        {stats.rejected > 0 && (
                            <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-400/30 px-3 py-1.5 rounded-lg">
                                <i className="fas fa-ban text-rose-300 text-[10px]"></i>
                                <span className="text-sm font-black text-rose-200">{stats.rejected}</span>
                            </div>
                        )}
                        {hasApprovalRole && allowedLevels.length > 0 && (
                            <span className="text-[10px] font-black bg-white/10 border border-white/20 px-2.5 py-1.5 rounded-lg text-blue-200 uppercase tracking-widest">
                                <i className="fas fa-shield-halved mr-1" />L{allowedLevels.join(',')}
                            </span>
                        )}
                    </div>

                    <button onClick={loadRequests} disabled={isLoading} title={t('common_refresh')} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center group">
                        <i className={`fas fa-arrows-rotate text-blue-400 text-xs group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'fa-spin' : ''}`} />
                    </button>
                </div>

                {/* Bottom row: tabs */}
                <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                ${activeTab === t.id
                                    ? 'bg-white/15 text-white border border-white/25 shadow-inner'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <i className={`fas ${t.icon} text-[10px] ${activeTab === t.id ? 'text-blue-300' : ''}`} />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ 2. TOOLBELT & ADVANCED FILTERS ═════════════════════════════ */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-8 py-3.5 flex flex-col gap-3 shadow-sm z-20">
                <div className="flex flex-col lg:flex-row gap-3 items-center">
                    <div className="flex-1 relative w-full">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input 
                            type="text"
                            placeholder={t('approval_search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[14px] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-xs font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto">
                        <button 
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`px-4 py-2.5 rounded-[14px] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${isFilterOpen ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            <i className="fas fa-filter"></i> {t('common_filters')}
                        </button>
                        <select 
                            value={sortConfig.key}
                            onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value }))}
                            className="bg-slate-100 px-4 py-2.5 rounded-[14px] font-black text-[10px] uppercase tracking-widest text-slate-600 outline-none hover:bg-slate-200"
                        >
                            <option value="submitted_at">{t('approval_sort_newest')}</option>
                            <option value="draft_name">{t('approval_sort_draft_name')}</option>
                            <option value="brand">{t('approval_sort_brand')}</option>
                        </select>
                        <button 
                            onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                            className="p-2.5 bg-slate-100 rounded-[14px] hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                            <i className={`fas fa-sort-amount-${sortConfig.direction === 'asc' ? 'up' : 'down'} text-xs`}></i>
                        </button>
                    </div>
                </div>

                {/* Advanced Filter Drawer */}
                {isFilterOpen && (
                    <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slideDown shadow-inner">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('approval_filter_level')}</label>
                            <select 
                                value={filterLevel}
                                onChange={(e) => setFilterLevel(e.target.value)}
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            >
                                <option value="">{t('approval_filter_all_levels')}</option>
                                <option value="1">{t('approval_filter_level_1')}</option>
                                <option value="2">{t('approval_filter_level_2')}</option>
                                <option value="3">{t('approval_filter_level_3')}</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('approval_filter_from')}</label>
                            <input 
                                type="date"
                                value={dateRange.from}
                                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('approval_filter_to')}</label>
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
                                {t('approval_filter_reset')}
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
                            <h3 className="text-slate-800 font-black text-xl">{t('approval_no_requests')}</h3>
                            <p className="text-slate-400 font-bold text-sm mt-2">{t('approval_no_requests_hint')}</p>
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
                                        className={`sticky top-0 z-30 flex items-center justify-between py-2.5 group cursor-pointer border-b-2 transition-all ${config.border} bg-white/80 backdrop-blur-xl mb-4 rounded-t-3xl px-6`}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Select All Checkbox */}
                                            <div 
                                                onClick={(e) => { e.stopPropagation(); toggleSelectAll(list.map(r => r.id)); }}
                                                className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${allSelected && list.length > 0 ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 hover:border-blue-400'}`}
                                            >
                                                {allSelected && list.length > 0 && <i className="fas fa-check text-white text-[7px]" />}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md border border-black/5 ${config.cls}`}>
                                                    <i className={`fas ${config.icon} text-sm`}></i>
                                                </div>
                                                <div>
                                                    <h3 className={`text-xs font-black uppercase tracking-widest ${config.cls.split(' ')[0]}`}>{config.label}</h3>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0">{list.length} {t('approval_unit_requests')}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isCollapsed ? 'bg-slate-100 text-slate-400 shadow-inner' : 'bg-slate-900 text-white shadow-2xl scale-105'}`}>
                                            <i className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'} text-[9px] transform transition-transform duration-500 ${isCollapsed ? '' : 'rotate-180'}`} />
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
                                                        className={`relative bg-white border rounded-2xl py-2.5 px-4 flex flex-col xl:flex-row items-center justify-between gap-4 transition-all hover:shadow-lg group animate-fadeIn ${isSel ? 'border-blue-500 bg-blue-50/10 shadow-blue-500/5 scale-[1.002] z-10' : 'border-slate-100 hover:border-blue-200'}`}
                                                    >
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            {/* Checkbox */}
                                                            <div 
                                                                onClick={() => toggleSelectOne(req.id)}
                                                                className={`w-4 h-4 rounded-md border-2 shrink-0 flex items-center justify-center cursor-pointer transition-all ${isSel ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-500/40' : 'bg-slate-50 border-slate-200 hover:border-blue-400 group-hover:bg-blue-50'}`}
                                                            >
                                                                 {isSel && <i className="fas fa-check text-white text-[8px]" />}
                                                            </div>
                                                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(req)}>
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all shadow-sm shrink-0 ${isSel ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-500 group-hover:text-white'}`}>
                                                                    <i className="fas fa-file-invoice text-lg" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-[15px] font-black text-slate-900 truncate tracking-tight group-hover:text-blue-700 transition-colors">
                                                                        {req.draft_name}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">{req.brand || 'NO BRAND'}</span>
                                                                        <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-100">{t('common_level')} {req.current_level}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-6 px-4 border-x border-slate-100 shrink-0 hidden md:flex">
                                                            <div className="text-center">
                                                                <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">SKU Impact</div>
                                                                <div className="text-base font-black text-slate-800">{skuCount}</div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">{t('approval_progress')}</div>
                                                                <ApprovalStatusBadge status={req.status} size="sm" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <div className="text-right">
                                                                <div className="text-xs font-black text-slate-800 leading-none">{usersMap[req.submitted_by] || 'Unknown'}</div>
                                                                <div className="text-[10px] font-bold text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                                                                    <i className="far fa-calendar-alt" /> {new Date(req.submitted_at).toLocaleDateString('vi-VN')}
                                                                </div>
                                                            </div>
                                                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-white shadow-md flex items-center justify-center text-slate-400 ring-1 ring-slate-50 relative shrink-0">
                                                                <i className="fas fa-user text-xs" />
                                                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border border-white rounded-full"></div>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 flex items-center gap-2">
                                                            {req.status === 'pending' || req.status === 'in_progress' ? (
                                                                <>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(req.id, 'approved'); }}
                                                                        disabled={isThisProcessing !== null}
                                                                        className="h-8 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5"
                                                                    >
                                                                        {isThisProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check"></i>}
                                                                        {t('approval_btn_approve')}
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(req.id, 'rejected'); }}
                                                                        disabled={isThisProcessing !== null}
                                                                        className="h-8 w-8 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl border border-rose-100 transition-all flex items-center justify-center shadow-sm"
                                                                    >
                                                                        <i className="fas fa-times text-[10px]"></i>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button 
                                                                    onClick={() => openDetail(req)}
                                                                    className="h-8 px-3.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-slate-200"
                                                                >
                                                                    {t('common_details')} <i className="fas fa-chevron-right text-[7px]"></i>
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
                    <div className="glass-premium px-8 py-5 rounded-[40px] border border-white/20 shadow-2xl flex items-center gap-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg ring-4 ring-blue-500/30">
                                {selectedIds.size}
                            </div>
                            <div>
                                <div className="text-[11px] font-black text-blue-400 uppercase tracking-widest">{t('approval_bulk_selecting')}</div>
                                <div className="text-white font-black text-sm">{t('approval_bulk_action')}</div>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-white/10" />
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => handleBulkAction('approved')}
                                className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                            >
                                <i className="fas fa-check-double mr-2"></i> {t('approval_btn_approve_all')}
                            </button>
                            <button 
                                onClick={() => handleBulkAction('rejected')}
                                className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 active:scale-95"
                            >
                                <i className="fas fa-times-circle mr-2"></i> {t('approval_btn_reject')}
                            </button>
                            <button 
                                onClick={() => setSelectedIds(new Set())}
                                className="text-white/60 hover:text-white font-black text-[10px] uppercase tracking-widest px-4"
                            >
                                {t('common_cancel')}
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
        blue: 'from-atp-primary to-[#2e3b4e] shadow-blue-900/10 border-white/10',
        amber: 'from-amber-500 to-amber-600 shadow-amber-900/10 border-white/10',
        indigo: 'from-indigo-600 to-atp-secondary shadow-indigo-900/10 border-white/10',
        emerald: 'from-emerald-600 to-atp-success shadow-emerald-900/10 border-white/10',
        rose: 'from-rose-600 to-atp-action shadow-rose-900/10 border-white/10'
    };
    
    return (
        <div className={`bg-gradient-to-br ${colors[color]} rounded-3xl py-4 px-6 text-white shadow-lg transition-all hover:scale-[1.03] duration-300 relative overflow-hidden group border shadow-premium`}>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity pointer-events-none">
                <div className="w-16 h-16 bg-white/20 rounded-full blur-2xl absolute -top-8 -right-8" />
                <i className={`fas ${icon} text-3xl transform rotate-12 transition-transform group-hover:rotate-0 duration-500`}></i>
            </div>
            <div className="relative z-10">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1.5">{label}</div>
                <div className="text-2xl font-black drop-shadow-md leading-none">{value}</div>
            </div>
        </div>
    );
};
