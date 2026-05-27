import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Typography } from './Typography';
import {
    listOrderDrafts,
    saveOrderDraft,
    loadFromCloudStorage,
    fetchAllRequests,
    fetchMyRequests,
    fetchPendingForApprover,
    fetchRequestById,
} from '../utils/supabase';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { ApprovalRequest, ApprovalStatus } from '../types/inventory';
import { useAuth } from '../utils/authContext';

import { FaIcon } from './Icon';
interface CloudDraftModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDraft: { quantities: Record<string, { air: number; sea: number }>; notes: Record<string, string> };
    // draftName được truyền lại để Ordering có thể fetch approvalRequest tương ứng
    onLoadDraft: (
        draft: { quantities: Record<string, { air: number; sea: number }>; notes: Record<string, string> },
        draftName?: string,
    ) => void;
    // Load trực tiếp từ snapshot của approval request (trường hợp không lưu cloud)
    onLoadReturnedRequest: (request: ApprovalRequest) => void;
    onWaitAndSubmit?: (draftName: string) => void;
}

type Tab = 'LOAD' | 'RETURNED' | 'SAVE' | 'INBOX';

export const CloudDraftModal = ({
    isOpen,
    onClose,
    currentDraft,
    onLoadDraft,
    onLoadReturnedRequest,
    onWaitAndSubmit,
}: CloudDraftModalProps) => {
    const BRANDS = ['Kia', 'Mazda', 'Peugeot', 'BMW'] as const;
    const { user, profile } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('LOAD');
    const [drafts, setDrafts] = useState<{ id: string; updated_at: string }[]>([]);
    const [returnedRequests, setReturnedRequests] = useState<ApprovalRequest[]>([]);
    const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [approvalStatusMap, setApprovalStatusMap] = useState<Record<string, ApprovalStatus>>({});

    // Form states (Save)
    const [draftBrand, setDraftBrand] = useState<string>('Kia');

    // Filter states (Load)
    const [filterBrand, setFilterBrand] = useState<string>('All');
    const [filterDays, setFilterDays] = useState<number>(30);
    const [filterSearch, setFilterSearch] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (activeTab === 'LOAD' || activeTab === 'SAVE') fetchDrafts();
        if (activeTab === 'RETURNED') fetchReturned();
        if (activeTab === 'INBOX') fetchInbox();
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

    const fetchInbox = async () => {
        setIsLoading(true);
        const pendings = await fetchPendingForApprover();
        setPendingRequests(pendings);
        setIsLoading(false);
    };

    const generatedDraftName = React.useMemo(() => {
        const today = new Date();
        const yy = String(today.getFullYear()).slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const datePrefix = `${yy}${mm}${dd}`;

        let namePart = 'User';
        if (profile?.full_name) {
            const noTone = profile.full_name
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .replace(/[^a-zA-Z0-9 ]/g, '');
            namePart = noTone
                .split(' ')
                .filter(Boolean)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join('');
        }

        const prefix = `${datePrefix}-${namePart}`;

        let maxSeq = 0;
        drafts.forEach(d => {
            const parts = d.id.split('_');
            if (parts.length >= 4) {
                const draftCode = parts.slice(3).join('_');
                if (draftCode.startsWith(prefix + '-')) {
                    const seqStr = draftCode.split('-').pop();
                    if (seqStr && !isNaN(Number(seqStr))) {
                        const seq = parseInt(seqStr, 10);
                        if (seq > maxSeq) maxSeq = seq;
                    }
                }
            }
        });

        const nextSeq = String(maxSeq + 1).padStart(2, '0');
        return `${prefix}-${nextSeq}`;
    }, [drafts, profile]);

    const handleSave = async (autoSubmit: boolean = false) => {
        const totalItems = Object.values(currentDraft.quantities).filter(v => v.air + v.sea > 0).length;
        if (totalItems === 0) return alert('Dự thảo hiện tại đang trống. Vui lòng tạo dự thảo trước khi lưu.');

        setIsLoading(true);
        const id = `order_draft_${draftBrand}_${generatedDraftName}`;
        const success = await saveOrderDraft(id, { brand: draftBrand, draftData: currentDraft });
        setIsLoading(false);

        if (success) {
            if (autoSubmit) {
                if (onWaitAndSubmit) onWaitAndSubmit(generatedDraftName);
                onClose();
            } else {
                alert(`Đã lưu bản nháp "${generatedDraftName}" (${draftBrand}) thành công!`);
                onClose();
            }
        } else {
            alert('Lỗi khi lưu lên Cloud.');
        }
    };

    const handleLoadCloud = async (id: string, name: string) => {
        setIsLoading(true);
        const data = await loadFromCloudStorage(id);
        setIsLoading(false);
        if (!data) return alert('Không thể tải dữ liệu.');
        // Truyền draftName để Ordering tự fetch approvalRequest tương ứng
        onLoadDraft(data.draftData, name);
        alert('✅ Tải dự thảo thành công!');
        onClose();
    };

    const handleLoadAndSubmit = async (id: string, name: string) => {
        setIsLoading(true);
        const data = await loadFromCloudStorage(id);
        setIsLoading(false);
        if (!data) return alert('Không thể tải dữ liệu.');
        onLoadDraft(data.draftData, name);
        if (onWaitAndSubmit) {
            onWaitAndSubmit(name);
        }
        onClose();
    };

    const handleLoadReturned = async (req: ApprovalRequest) => {
        // Fetch full request with snapshot_data (list queries don't include it)
        setIsLoading(true);
        const fullReq = await fetchRequestById(req.id);
        setIsLoading(false);
        if (!fullReq || !fullReq.snapshot_data?.quantities) {
            alert('Không thể tải dữ liệu snapshot cho đơn này.');
            return;
        }
        onLoadReturnedRequest(fullReq);
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
        { id: 'LOAD', label: 'Tải Về', icon: 'fa-download' },
        { id: 'RETURNED', label: 'Trả lại', icon: 'fa-rotate-left' },
        { id: 'SAVE', label: 'Lưu Mới', icon: 'fa-cloud-upload-alt' },
    ];
    if (profile?.role === 'admin' || profile?.role === 'approver') {
        TABS.splice(1, 0, { id: 'INBOX', label: 'Duyệt Đơn', icon: 'fa-inbox' });
    }

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[scaleIn_0.2s_ease-out]">
                <div className="bg-gradient-professional px-6 py-5 border-b border-white/10 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3 text-white">
                        <FaIcon className="fas fa-cloud text-xl text-blue-300" />
                        <Typography variant="h2" className="text-white !text-xl">
                            Cloud Drafts
                        </Typography>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-rose-500 transition-colors"
                    >
                        <FaIcon className="fas fa-times" />
                    </button>
                </div>

                {/* Tabs */}
                <div
                    className={`grid ${TABS.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} bg-slate-50 border-b border-slate-200`}
                >
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`py-3 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === t.id ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'} ${t.id === 'RETURNED' && returnedRequests.length > 0 ? 'text-indigo-500' : ''}`}
                        >
                            <FaIcon className={`fas ${t.icon} text-[10px]`} />
                            {t.label}
                            {t.id === 'RETURNED' && returnedRequests.length > 0 && (
                                <span className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                    {returnedRequests.length}
                                </span>
                            )}
                            {t.id === 'INBOX' && pendingRequests.length > 0 && (
                                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                                    {pendingRequests.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* ── Tab: Tải Về ── */}
                    {activeTab === 'LOAD' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <select
                                    value={filterBrand}
                                    onChange={e => setFilterBrand(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500"
                                >
                                    <option value="All">Tất cả thương hiệu</option>
                                    {BRANDS.map(b => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                    <option value="Khác">Phổ thông / Khác</option>
                                </select>
                                <select
                                    value={filterDays}
                                    onChange={e => setFilterDays(Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500"
                                >
                                    <option value={7}>7 ngày qua</option>
                                    <option value={30}>30 ngày qua</option>
                                    <option value={90}>90 ngày qua</option>
                                    <option value={0}>Toàn bộ thời gian</option>
                                </select>
                            </div>
                            <div className="relative mb-4">
                                <FaIcon className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                                <input
                                    type="text"
                                    placeholder="Tìm tên dự thảo..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="flex justify-between items-center mb-4">
                                <Typography
                                    variant="label"
                                    className="text-slate-500 uppercase tracking-widest text-[10px] font-black"
                                >
                                    Dự thảo của tôi ({filteredDrafts.length})
                                </Typography>
                                <button
                                    onClick={fetchDrafts}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                    <FaIcon className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`} /> Làm mới
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <FaIcon className="fas fa-spinner fa-spin text-3xl mb-2" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Đang tải...</span>
                                </div>
                            ) : filteredDrafts.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <FaIcon className="fas fa-folder-open text-3xl mb-3 text-slate-300" />
                                    <Typography variant="body" className="block text-xs">
                                        Không tìm thấy dự thảo phù hợp.
                                    </Typography>
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
                                            <div
                                                key={d.id}
                                                className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span
                                                            className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${b === 'Kia' ? 'bg-rose-100 text-rose-600' : b === 'BMW' ? 'bg-blue-100 text-blue-600' : b === 'Mazda' ? 'bg-blue-50 text-slate-600' : b === 'Peugeot' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                                                        >
                                                            {b}
                                                        </span>
                                                        <Typography
                                                            variant="body"
                                                            className="font-black text-slate-800 truncate text-sm"
                                                        >
                                                            {n}
                                                        </Typography>
                                                        {approvalStatusMap[n] && (
                                                            <ApprovalStatusBadge
                                                                status={approvalStatusMap[n]}
                                                                size="sm"
                                                            />
                                                        )}
                                                    </div>
                                                    <Typography
                                                        variant="label"
                                                        className="text-slate-400 block text-[10px]"
                                                    >
                                                        <FaIcon className="far fa-clock" />{' '}
                                                        {new Date(d.updated_at).toLocaleString('vi-VN')}
                                                    </Typography>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!approvalStatusMap[n] && onWaitAndSubmit && (
                                                        <button
                                                            onClick={() => handleLoadAndSubmit(d.id, n)}
                                                            className="lg-btn lg-btn-primary lg-btn-icon lg-btn-sm w-10 h-10 flex items-center justify-center shrink-0"
                                                            title="Gửi Phê Duyệt"
                                                        >
                                                            <FaIcon className="fas fa-paper-plane" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleLoadCloud(d.id, n)}
                                                        className="lg-btn lg-btn-blue lg-btn-icon lg-btn-sm w-10 h-10 flex items-center justify-center shrink-0"
                                                        title="Tải Xuống"
                                                    >
                                                        <FaIcon className="fas fa-download" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Hộp thư Duyệt (INBOX) ── */}
                    {activeTab === 'INBOX' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed">
                                <FaIcon className="fas fa-clipboard-check mr-1.5" />
                                Các đơn đang chờ phê duyệt. Nhấn "Mở Đơn" để kiểm tra và tiến hành duyệt hoặc trả lại.
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <Typography
                                    variant="label"
                                    className="text-slate-500 uppercase tracking-widest text-[10px] font-black"
                                >
                                    Đơn cần duyệt ({pendingRequests.length})
                                </Typography>
                                <button
                                    onClick={fetchInbox}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                    <FaIcon className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`} /> Làm mới
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <FaIcon className="fas fa-spinner fa-spin text-3xl mb-2" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Đang tải...</span>
                                </div>
                            ) : pendingRequests.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <FaIcon className="fas fa-check-double text-3xl mb-3 text-emerald-300" />
                                    <Typography variant="body" className="block text-xs">
                                        Bạn đã duyệt hết đơn trong hàng chờ!
                                    </Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                    {pendingRequests.map(req => {
                                        const itemCount =
                                            req.summary?.skuCount ||
                                            Object.values(req.snapshot_data?.quantities || {}).filter(
                                                (q: any) => q.air + q.sea > 0,
                                            ).length;
                                        return (
                                            <div
                                                key={req.id}
                                                className="p-3 border border-rose-200 bg-rose-50/30 rounded-xl hover:border-rose-400 hover:bg-rose-50 transition-all"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <ApprovalStatusBadge status={req.status} size="sm" />
                                                            <Typography
                                                                variant="body"
                                                                className="font-black text-slate-800 truncate text-sm"
                                                            >
                                                                {req.draft_name}
                                                            </Typography>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                            <span>
                                                                <FaIcon className="fas fa-box mr-1" />
                                                                {itemCount} mã hàng
                                                            </span>
                                                            <span>
                                                                <FaIcon className="far fa-clock mr-1" />
                                                                {new Date(req.submitted_at).toLocaleString('vi-VN', {
                                                                    day: '2-digit',
                                                                    month: '2-digit',
                                                                    year: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                })}
                                                            </span>
                                                            {req.brand && (
                                                                <span className="font-bold uppercase tracking-wider">
                                                                    {req.brand}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleLoadReturned(req)}
                                                        className="lg-btn lg-btn-sm lg-btn-danger shrink-0 px-3 py-2 flex items-center gap-1.5"
                                                    >
                                                        <FaIcon className="fas fa-external-link-alt" /> Mở Đơn
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Trả lại ── */}
                    {activeTab === 'RETURNED' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 leading-relaxed">
                                <FaIcon className="fas fa-info-circle mr-1.5" />
                                Các đơn bị approver trả lại để điều chỉnh. Tải về, sửa và gửi lại mà không cần lưu nháp.
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <Typography
                                    variant="label"
                                    className="text-slate-500 uppercase tracking-widest text-[10px] font-black"
                                >
                                    Đơn cần điều chỉnh ({returnedRequests.length})
                                </Typography>
                                <button
                                    onClick={fetchReturned}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                    <FaIcon className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`} /> Làm mới
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <FaIcon className="fas fa-spinner fa-spin text-3xl mb-2" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Đang tải...</span>
                                </div>
                            ) : returnedRequests.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <FaIcon className="fas fa-check-circle text-3xl mb-3 text-emerald-300" />
                                    <Typography variant="body" className="block text-xs">
                                        Không có đơn nào bị trả lại.
                                    </Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                    {returnedRequests.map(req => {
                                        const itemCount =
                                            req.summary?.skuCount ||
                                            Object.values(req.snapshot_data?.quantities || {}).filter(
                                                (q: any) => q.air + q.sea > 0,
                                            ).length;
                                        return (
                                            <div
                                                key={req.id}
                                                className="p-3 border border-indigo-200 bg-indigo-50/30 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <ApprovalStatusBadge status="returned" size="sm" />
                                                            <Typography
                                                                variant="body"
                                                                className="font-black text-slate-800 truncate text-sm"
                                                            >
                                                                {req.draft_name}
                                                            </Typography>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                            <span>
                                                                <FaIcon className="fas fa-box mr-1" />
                                                                {itemCount} mã hàng
                                                            </span>
                                                            <span>
                                                                <FaIcon className="far fa-clock mr-1" />
                                                                {new Date(req.submitted_at).toLocaleString('vi-VN', {
                                                                    day: '2-digit',
                                                                    month: '2-digit',
                                                                    year: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                })}
                                                            </span>
                                                            {req.brand && (
                                                                <span className="font-bold">{req.brand}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleLoadReturned(req)}
                                                        className="lg-btn lg-btn-sm lg-btn-blue shrink-0 px-3 py-2 flex items-center gap-1.5"
                                                    >
                                                        <FaIcon className="fas fa-pencil" /> Tải & Sửa
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Lưu Mới ── */}
                    {activeTab === 'SAVE' && (
                        <div className="space-y-4">
                            <div>
                                <Typography
                                    variant="label"
                                    className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs"
                                >
                                    Thương hiệu
                                </Typography>
                                <div className="grid grid-cols-4 gap-2">
                                    {BRANDS.map(b => (
                                        <button
                                            key={b}
                                            onClick={() => setDraftBrand(b)}
                                            className={`py-2 rounded-lg text-xs font-black transition-all border-2 ${draftBrand === b ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' : 'bg-white text-slate-500 border-slate-100 hover:border-blue-300'}`}
                                        >
                                            {b}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <Typography
                                        variant="label"
                                        className="text-slate-500 font-bold block mb-1 uppercase tracking-wider text-xs"
                                    >
                                        Mã dự thảo (Tự động)
                                    </Typography>
                                    <div className="text-lg font-black text-blue-700 tracking-tight font-mono">
                                        {generatedDraftName}
                                    </div>
                                </div>
                                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                                    <FaIcon className="fas fa-magic" />
                                </div>
                            </div>
                            <Typography
                                variant="label"
                                className="text-slate-400 block mt-1 leading-tight text-[11px] px-1"
                            >
                                <FaIcon className="fas fa-info-circle mr-1" /> Mã dự thảo được sinh tự động dựa trên tên
                                và ngày lập.
                            </Typography>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button
                                    onClick={() => handleSave(false)}
                                    disabled={isLoading}
                                    className="bg-slate-100/80 backdrop-blur-md hover:bg-slate-200/80 text-slate-600 font-black py-4 rounded-2xl uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] border border-slate-200/50 shadow-sm"
                                >
                                    {isLoading ? (
                                        <FaIcon className="fas fa-spinner fa-spin" />
                                    ) : (
                                        <FaIcon className="fas fa-file-pen" />
                                    )}
                                    Lưu Nháp
                                </button>
                                <button
                                    onClick={() => handleSave(true)}
                                    disabled={isLoading}
                                    className="lg-btn lg-btn-primary lg-btn-lg lg-btn-full flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <FaIcon className="fas fa-spinner fa-spin" />
                                    ) : (
                                        <FaIcon className="fas fa-paper-plane" />
                                    )}
                                    Lưu & Gửi Duyệt
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};
