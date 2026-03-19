import React, { useState, useEffect } from 'react';
import { Typography } from './Typography';
import { listOrderDrafts, saveToCloudStorage, loadFromCloudStorage } from '../utils/supabase';

interface CloudDraftModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDraft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> };
    onLoadDraft: (draft: { quantities: Record<string, { air: number, sea: number }>, notes: Record<string, string> }) => void;
}

export const CloudDraftModal = ({ isOpen, onClose, currentDraft, onLoadDraft }: CloudDraftModalProps) => {
    const [activeTab, setActiveTab] = useState<'LOAD' | 'SAVE'>('LOAD');
    const [drafts, setDrafts] = useState<{ id: string, updated_at: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Form states
    const [draftName, setDraftName] = useState('');
    const [draftPassword, setDraftPassword] = useState('');

    useEffect(() => {
        if (isOpen && activeTab === 'LOAD') {
            fetchDrafts();
        }
    }, [isOpen, activeTab]);

    const fetchDrafts = async () => {
        setIsLoading(true);
        const list = await listOrderDrafts();
        setDrafts(list);
        setIsLoading(false);
    };

    const handleSave = async () => {
        if (!draftName.trim()) return alert("Vui lòng nhập Tên dự thảo");
        if (!draftPassword.trim()) return alert("Vui lòng nhập Mật khẩu bảo vệ");

        // Validate draft size (prevent saving empty draft)
        const totalItems = Object.values(currentDraft.quantities).filter(v => v.air + v.sea > 0).length;
        if (totalItems === 0) return alert("Dự thảo hiện tại đang trống. Vui lòng tạo dự thảo trước khi lưu.");

        setIsLoading(true);
        const id = `order_draft_${draftName.trim()}`;
        
        // Wrap payload
        const payload = {
            password: draftPassword.trim(),
            draftData: currentDraft
        };

        const success = await saveToCloudStorage(id, payload);
        setIsLoading(false);

        if (success) {
            alert(`Đã lưu bản nháp "${draftName}" thành công!`);
            onClose();
        } else {
            alert("Lỗi khi lưu lên Cloud.");
        }
    };

    const handleLoad = async (id: string) => {
        const enteredPassword = prompt(`Nhập mật khẩu cho dự thảo "${id.replace('order_draft_', '')}":`);
        if (enteredPassword === null) return; // User cancelled

        setIsLoading(true);
        const data = await loadFromCloudStorage(id);
        setIsLoading(false);

        if (!data) {
            return alert("Không thể tải dữ liệu từ Cloud.");
        }

        if (data.password !== enteredPassword) {
            return alert("❌ Mật khẩu không chính xác!");
        }

        // Success
        onLoadDraft(data.draftData);
        alert("✅ Tải dự thảo thành công!");
        onClose();
    };

    if (!isOpen) return null;

    return (
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
                    <button
                        onClick={() => setActiveTab('LOAD')}
                        className={`py-3 text-sm font-black uppercase tracking-widest transition-all ${
                            activeTab === 'LOAD' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Tải Về
                    </button>
                    <button
                        onClick={() => setActiveTab('SAVE')}
                        className={`py-3 text-sm font-black uppercase tracking-widest transition-all ${
                            activeTab === 'SAVE' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Lưu Mới
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'LOAD' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <Typography variant="h3" className="text-slate-700">Danh sách dự thảo</Typography>
                                <button onClick={fetchDrafts} disabled={isLoading} className="text-sm text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
                                    <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i> Làm mới
                                </button>
                            </div>

                            {drafts.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                                    <i className="fas fa-folder-open text-3xl mb-3 text-slate-300"></i>
                                    <Typography variant="body" className="block">Không có dự thảo nào trên Cloud.</Typography>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {drafts.map(d => {
                                        const date = new Date(d.updated_at).toLocaleString('vi-VN');
                                        const name = d.id.replace('order_draft_', '');
                                        return (
                                            <div key={d.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                                                <div>
                                                    <Typography variant="body" className="font-black text-slate-800">{name}</Typography>
                                                    <Typography variant="label" className="text-slate-400 block mt-1"><i className="far fa-clock"></i> Cập nhật: {date}</Typography>
                                                </div>
                                                <button
                                                    onClick={() => handleLoad(d.id)}
                                                    className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm group-hover:scale-110"
                                                >
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
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">Tên dự thảo</Typography>
                                <input
                                    type="text"
                                    value={draftName}
                                    onChange={e => setDraftName(e.target.value)}
                                    placeholder="Ví dụ: Du_Thao_Thang_4"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                />
                            </div>
                            <div>
                                <Typography variant="label" className="text-slate-500 font-bold block mb-2 uppercase tracking-wider text-xs">Mật khẩu bảo vệ</Typography>
                                <input
                                    type="password"
                                    value={draftPassword}
                                    onChange={e => setDraftPassword(e.target.value)}
                                    placeholder="Nhập mật khẩu tự định nghĩa"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                />
                                <Typography variant="label" className="text-slate-400 block mt-2 leading-tight">Mật khẩu này sẽ được yêu cầu khi tải lại dự thảo. Nếu quên mật khẩu, bạn sẽ không thể mở lại dự thảo này.</Typography>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
                                Lưu Lên Cloud
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
