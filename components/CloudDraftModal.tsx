import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Typography } from './Typography';
import { listOrderDrafts, saveOrderDraft, loadFromCloudStorage, fetchAllRequests, fetchMyRequests } from '../utils/supabase';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { ApprovalRequest, ApprovalStatus } from '../types/inventory';
import { useAuth } from '../utils/authContext';
import { useLanguage } from '../utils/i18n';

interface CloudDraftModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDraft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> };
    onLoadDraft: (draft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> }, draftName?: string) => void;
    onLoadReturnedRequest: (request: ApprovalRequest) => void;
}

type Tab = 'LOAD' | 'RETURNED' | 'SAVE';

export const CloudDraftModal = ({ isOpen, onClose, currentDraft, onLoadDraft, onLoadReturnedRequest }: CloudDraftModalProps) => {
    const BRANDS = ['Kia', 'Mazda', 'Peugeot', 'BMW'] as const;
    const { user } = useAuth();
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<Tab>('LOAD');
    const [drafts, setDrafts] = useState<{ id: string, updated_at: string }[]>([]);
    const [returnedRequests, setReturnedRequests] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [approvalStatusMap, setApprovalStatusMap] = useState<Record<string, ApprovalStatus>>({});

    // Form states (Save)
    const [draftName, setDraftName] = useState('');
    const [draftBrand, setDraftBrand] = useState<string>('Kia');

    // Filter states (Load)
    const [filterBrand, setFilterBrand] = useState<string>('All');
    const [filterDays, setFilterDays] = useState<number>(30);
    const [filterSearch, setFilterSearch] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (activeTab === 'LOAD') fetchDrafts();
        else if (activeTab === 'RETURNED') fetchReturned();
    }, [isOpen, activeTab]);

    const fetchDrafts = async () => {
        setIsLoading(true);
        const [list, approvalReqs] = await Promise.all([listOrderDrafts(), fetchAllRequests().catch(() => [])]);
        setDrafts(list);
        const map: Record<string, ApprovalStatus> = {};
        for (const r of approvalReqs) map[r.draft_name] = r.status;
        setApprovalStatusMap(map);
        setIsLoading(false);
    };

    const fetchReturned = async () => {
        if (!user) return;
        setIsLoading(true);
        const all = await fetchMyRequests(user.id);
        setReturnedRequests(all.filter(r => r.status === 'returned'));
        setIsLoading(false);
    };

    const handleSave = async () => {
        if (!draftName.trim()) return alert(t('draft_msg_enter_name'));
        const totalItems = Object.values(currentDraft.quantities).filter(v => v.air + v.sea > 0).length;
        if (totalItems === 0) return alert(t('draft_msg_empty'));

        setIsLoading(true);
        const id = `order_draft_${draftBrand}_${draftName.trim()}`;
        const success = await saveOrderDraft(id, { brand: draftBrand, draftData: currentDraft });
        setIsLoading(false);

        if (success) {
            alert(`${t('draft_msg_save_success')} "${draftName}" (${draftBrand})`);
            setDraftName('');
            onClose();
        } else {
            alert(t('draft_msg_save_error'));
        }
    };

    const handleLoadCloud = async (id: string, name: string) => {
        setIsLoading(true);
        const data = await loadFromCloudStorage(id);
        setIsLoading(false);
        if (!data) return alert(t('draft_msg_load_error'));
        onLoadDraft(data.draftData, name);
        alert(`✅ ${t('draft_msg_load_success')}`);
        onClose();
    };

    const handleLoadReturned = (req: ApprovalRequest) => {
        onLoadReturnedRequest(req);
        onClose();
    };

    // Filter logic (LOAD tab)
    const filteredDrafts = drafts.filter(d => {
        const parts = d.id.split('_');
        let brand = 'Khác';
        let name = d.id.replace('order_draft_', '');
        if (parts.length >= 4 && BRANDS.includes(parts[2] as any)) {
            brand = parts[2];
            name = parts.slice(3).join('_');
        }
        const matchesBrand = filterBrand === 'All' || brand === filterBrand;
        const matchesSearch = name.toLowerCase().includes(filterSearch.toLowerCase());
        const diffDays = (new Date().getTime() - new Date(d.updated_at).getTime()) / (1000 * 3600 * 24);
        const matchesDate = filterDays === 0 || diffDays <= filterDays;
        return matchesBrand && matchesSearch && matchesDate;
    });

    if (!isOpen) return null;

    const TABS: { id: Tab; label: string; icon: string }[] = [
        { id: 'LOAD', label: t('draft_tab_load'), icon: 'fa-download' },
        { id: 'RETURNED', label: t('draft_tab_returned'), icon: 'fa-rotate-left' },
        { id: 'SAVE', label: t('draft_tab_save'), icon: 'fa-cloud-upload-alt' },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[scaleIn_0.2s_ease-out]">
                <div className="bg-gradient-professional px-6 py-5 border-b border-white/10 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3 text-white">
                        <i className="fas fa-cloud text-xl text-blue-300"></i>
                        <Typography variant="h2" className="text-white !text-xl">Cloud Drafts</Typography>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-rose-500 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`py-3 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === tab.id ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'} ${tab.id === 'RETURNED' && returnedRequests.length > 0 ? 'text-indigo-500' : ''}`}>
                            <i className={`fas ${tab.icon} text-[10px]`}></i>
                            {tab.label}
                            {tab.id === 'RETURNED' && returnedRequests.length > 0 && (
                                <span className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{returnedRequests.length}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">

                    {/* ── Tab: Load ── */}
                    {activeTab === 'LOAD' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="All">{t('draft_filter_all_brands')}</option>
                                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                    <option value="Khác">{t('draft_filter_other')}</option>
                                </select>
                                <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value={7}>{t('draft_filter_7d')}</option>
                                    <option value={30}>{t('draft_filter_30d')}</option>
                                    <option value={90}>{t('draft_filter_90d')}</option>
                                    <option value={0}>{t('draft_filter_all_time')}</option>
                                </select>
                            </div>
                            <div className="relative mb-4">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input type="text" placeholder={t('draft_search_placeholder')} value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-blue-500" />
                            </div>
                            <div className="flex justify-between items-center mb-4">
                                <Typography variant="label" className="text-slate-500 uppercase tracking-widest text-[10px] font-black">
                                    {t('draft_my_drafts')} ({filteredDrafts.length})
                                </Typography>
                                <button onClick={fetchDrafts} disabled={isLoading} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
                                    <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i> {t('common_refresh')}
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                                    <span className="text-xs font-bold uppercase tracking-widest">{t('common_loading')}</span>
                                </div>
                            ) : filteredDrafts.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <i className="fas fa-folder-open text-3xl mb-3 text-slate-300"></i>
                                    <Typography variant="body" className="block text-xs">{t('draft_no_match')}</Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                    {filteredDrafts.map(d => {
                                        const parts = d.id.split('_');
                                        let b = 'Khác';
                                        let n = d.id.replace('order_draft_', '');
                                        if (parts.length >= 4 && BRANDS.includes(parts[2] as any)) {
                                            b = parts[2];
                                            n = parts.slice(3).join('_');
                                        }
                                        return (
                                            <div key={d.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${b === 'Kia' ? 'bg-rose-100 text-rose-600' : b === 'BMW' ? 'bg-blue-100 text-blue-600' : b === 'Mazda' ? 'bg-blue-50 text-slate-600' : b === 'Peugeot' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{b}</span>
                                                        <Typography variant="body" className="font-black text-slate-800 truncate text-sm">{n}</Typography>
                                                        {approvalStatusMap[n] && <ApprovalStatusBadge status={approvalStatusMap[n]} size="sm" />}
                                                    </div>
                                                    <Typography variant="label" className="text-slate-400 block text-[10px]"><i className="far fa-clock"></i> {new Date(d.updated_at).toLocaleString('vi-VN')}</Typography>
                                                </div>
                                                <button onClick={() => handleLoadCloud(d.id, n)}
                                                    className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm shrink-0">
                                                    <i className="fas fa-download"></i>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Returned ── */}
                    {activeTab === 'RETURNED' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 leading-relaxed">
                                <i className="fas fa-info-circle mr-1.5"></i>
                                {t('draft_returned_info')}
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <Typography variant="label" className="text-slate-500 uppercase tracking-widest text-[10px] font-black">
                                    {t('draft_returned_orders')} ({returnedRequests.length})
                                </Typography>
                                <button onClick={fetchReturned} disabled={isLoading} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
                                    <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i> {t('common_refresh')}
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                                    <span className="text-xs font-bold uppercase tracking-widest">{t('common_loading')}</span>
                                </div>
                            ) : returnedRequests.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <i className="fas fa-check-circle text-3xl mb-3 text-emerald-300"></i>
                                    <Typography variant="body" className="block text-xs">{t('draft_no_returned')}</Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                    {returnedRequests.map(req => {
                                        const snap = req.snapshot_data;
                                        const itemCount = Object.values(snap.quantities || {}).filter((q: any) => q.air + q.sea > 0).length;
                                        return (
                                            <div key={req.id} className="p-3 border border-indigo-200 bg-indigo-50/30 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <ApprovalStatusBadge status="returned" size="sm" />
                                                            <Typography variant="body" className="font-black text-slate-800 truncate text-sm">{req.draft_name}</Typography>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                            <span><i className="fas fa-box mr-1"></i>{itemCount} {t('draft_unit_items')}</span>
                                                            <span><i className="far fa-clock mr-1"></i>{new Date(req.submitted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                            {req.brand && <span className="font-bold">{req.brand}</span>}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleLoadReturned(req)}
                                                        className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all">
                                                        <i className="fas fa-pencil"></i> {t('draft_btn_load_edit')}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Save ── */}
                    {activeTab === 'SAVE' && (
                        <div className="space-y-4">
                            <div>
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">{t('draft_label_brand')}</Typography>
                                <div className="grid grid-cols-4 gap-2">
                                    {BRANDS.map(b => (
                                        <button key={b} onClick={() => setDraftBrand(b)}
                                            className={`py-2 rounded-lg text-xs font-black transition-all border-2 ${draftBrand === b ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' : 'bg-white text-slate-500 border-slate-100 hover:border-blue-300'}`}>
                                            {b}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">{t('draft_label_name')}</Typography>
                                <input type="text" value={draftName} onChange={e => setDraftName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                                    placeholder={t('draft_name_example')}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                                <Typography variant="label" className="text-slate-400 block mt-2 leading-tight text-[11px]">
                                    {t('draft_private_note')}
                                </Typography>
                            </div>
                            <button onClick={handleSave} disabled={isLoading}
                                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2">
                                {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
                                {t('draft_btn_save_cloud')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
