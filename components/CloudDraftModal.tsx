import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Typography } from './Typography';
import { listOrderDrafts, saveOrderDraft, loadFromCloudStorage, fetchAllRequests } from '../utils/supabase';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { ApprovalStatus } from '../types/inventory';

interface CloudDraftModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDraft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> };
    onLoadDraft: (draft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> }) => void;
}

export const CloudDraftModal = ({ isOpen, onClose, currentDraft, onLoadDraft }: CloudDraftModalProps) => {
    const BRANDS = ['Kia', 'Mazda', 'Peugeot', 'BMW'] as const;
    const [activeTab, setActiveTab] = useState<'LOAD' | 'SAVE'>('LOAD');
    const [drafts, setDrafts] = useState<{ id: string, updated_at: string }[]>([]);
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
        if (isOpen && activeTab === 'LOAD') {
            fetchDrafts();
        }
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

    const handleSave = async () => {
        if (!draftName.trim()) return alert("Vui lòng nhập Tên dự thảo");

        const totalItems = Object.values(currentDraft.quantities).filter(v => v.air + v.sea > 0).length;
        if (totalItems === 0) return alert("Dự thảo hiện tại đang trống. Vui lòng tạo dự thảo trước khi lưu.");

        setIsLoading(true);
        const id = `order_draft_${draftBrand}_${draftName.trim()}`;
        const payload = { brand: draftBrand, draftData: currentDraft };

        const success = await saveOrderDraft(id, payload);
        setIsLoading(false);

        if (success) {
            alert(`Đã lưu bản nháp "${draftName}" (${draftBrand}) thành công!`);
            setDraftName('');
            onClose();
        } else {
            alert("Lỗi khi lưu lên Cloud.");
        }
    };

    const handleLoad = async (id: string, brand: string, name: string) => {
        setIsLoading(true);
        const data = await loadFromCloudStorage(id);
        setIsLoading(false);

        if (!data) return alert("Không thể tải dữ liệu.");

        onLoadDraft(data.draftData);
        alert("✅ Tải dự thảo thành công!");
        onClose();
    };

    // Filter logic
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

        const updatedAt = new Date(d.updated_at);
        const diffDays = (new Date().getTime() - updatedAt.getTime()) / (1000 * 3600 * 24);
        const matchesDate = filterDays === 0 || diffDays <= filterDays;

        return matchesBrand && matchesSearch && matchesDate;
    });

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[scaleIn_0.2s_ease-out]">
                <div className="bg-gradient-professional px-6 py-5 border-b border-white/10 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3 text-white">
                        <i className="fas fa-cloud text-xl text-blue-300"></i>
                        <Typography variant="h2" className="text-white !text-xl">Cloud Drafts</Typography>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-rose-500 hover:text-white transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="flex grid grid-cols-2 bg-slate-50 border-b border-slate-200">
                    <button onClick={() => setActiveTab('LOAD')} className={`py-3 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'LOAD' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        Tải Về
                    </button>
                    <button onClick={() => setActiveTab('SAVE')} className={`py-3 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'SAVE' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        Lưu Mới
                    </button>
                </div>

                <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
                    {activeTab === 'LOAD' && (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="All">Tất cả thương hiệu</option>
                                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                    <option value="Khác">Phổ thông / Khác</option>
                                </select>
                                <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value={7}>7 ngày qua</option>
                                    <option value={30}>30 ngày qua</option>
                                    <option value={90}>90 ngày qua</option>
                                    <option value={0}>Toàn bộ thời gian</option>
                                </select>
                            </div>
                            <div className="relative mb-4">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input type="text" placeholder="Tìm tên dự thảo..." value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-blue-500" />
                            </div>

                            <div className="flex justify-between items-center mb-4">
                                <Typography variant="label" className="text-slate-500 uppercase tracking-widest text-[10px] font-black">
                                    Dự thảo của tôi ({filteredDrafts.length})
                                </Typography>
                                <button onClick={fetchDrafts} disabled={isLoading} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
                                    <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i> Làm mới
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                                    <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                                    <span className="text-xs font-bold uppercase tracking-widest">Đang tải...</span>
                                </div>
                            ) : filteredDrafts.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <i className="fas fa-folder-open text-3xl mb-3 text-slate-300"></i>
                                    <Typography variant="body" className="block text-xs">Không tìm thấy dự thảo phù hợp.</Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                    {filteredDrafts.map(d => {
                                        const dateDisplay = new Date(d.updated_at).toLocaleString('vi-VN');
                                        const parts = d.id.split('_');
                                        let b = 'Khác';
                                        let n = d.id.replace('order_draft_', '');
                                        if (parts.length >= 4 && BRANDS.includes(parts[2] as any)) {
                                            b = parts[2];
                                            n = parts.slice(3).join('_');
                                        }
                                        return (
                                            <div key={d.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${b === 'Kia' ? 'bg-rose-100 text-rose-600' : b === 'BMW' ? 'bg-blue-100 text-blue-600' : b === 'Mazda' ? 'bg-blue-50 text-slate-600' : b === 'Peugeot' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{b}</span>
                                                        <Typography variant="body" className="font-black text-slate-800 truncate text-sm">{n}</Typography>
                                                        {approvalStatusMap[n] && <ApprovalStatusBadge status={approvalStatusMap[n]} size="sm" />}
                                                    </div>
                                                    <Typography variant="label" className="text-slate-400 block text-[10px]"><i className="far fa-clock"></i> {dateDisplay}</Typography>
                                                </div>
                                                <button onClick={() => handleLoad(d.id, b, n)}
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

                    {activeTab === 'SAVE' && (
                        <div className="space-y-4">
                            <div>
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">Thương hiệu</Typography>
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
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">Tên dự thảo</Typography>
                                <input type="text" value={draftName} onChange={e => setDraftName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                                    placeholder="Ví dụ: Du_Thao_Thang_4"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                                <Typography variant="label" className="text-slate-400 block mt-2 leading-tight text-[11px]">
                                    Dự thảo chỉ hiển thị với tài khoản của bạn. Dữ liệu được mã hoá theo phiên đăng nhập.
                                </Typography>
                            </div>
                            <button onClick={handleSave} disabled={isLoading}
                                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2">
                                {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
                                Lưu Lên Cloud
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
