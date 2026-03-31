
import React, { useState, useEffect } from 'react';
import { X, Cloud, Database, Calendar, Download, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import { Typography } from './Typography';
import { SnapshotMetadataRow, listSnapshots, loadSnapshot, listMonthlyDataSnapshots, loadSpecificMonthlyData, deleteSnapshot } from '../utils/supabase';
import { InventoryItem } from '../types/inventory';

const extractBrandFromDepartment = (dep?: string | null): string | null => {
    if (!dep) return null;
    const d = dep.toLowerCase();
    if (d.includes('kia')) return 'Kia';
    if (d.includes('mazda')) return 'Mazda';
    if (d.includes('peugeot') || d.includes('peu') || d.includes('stellantis')) return 'Stellantis';
    if (d.includes('bmw')) return 'BMW';
    if (d.includes('mini')) return 'MINI';
    return dep;
};

interface DataSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectInventory: (data: InventoryItem[], filename: string) => void;
    onSelectMonthly: (data: Record<string, any>, date: string, updatedAt: string) => void;
    currentMonthlyDate?: string | null;
    userRole?: string;
    userDepartment?: string;
}

export const DataSelectionModal: React.FC<DataSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelectInventory,
    onSelectMonthly,
    currentMonthlyDate,
    userRole,
    userDepartment
}) => {
    const [tab, setTab] = useState<'inventory' | 'monthly'>('inventory');
    const [snapshots, setSnapshots] = useState<SnapshotMetadataRow[]>([]);
    const [monthlySnapshots, setMonthlySnapshots] = useState<{ id: string; updated_at: string }[]>([]);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            if (tab === 'inventory') {
                const isAdmin = userRole === 'admin';
                const userBrand = isAdmin ? null : extractBrandFromDepartment(userDepartment);

                const fetchLimit = selectedBrand && selectedBrand !== 'ALL' ? 50 : 100;
                
                // SEPARATION OF LOGIC:
                // Admins can use the UI filter. Non-admins are strictly locked to their extracted brand.
                let brandFilter: string | null = null;
                if (!isAdmin) {
                    brandFilter = userBrand;
                } else {
                    brandFilter = (selectedBrand && selectedBrand !== 'ALL') ? selectedBrand : null;
                }

                const list = await listSnapshots(fetchLimit, brandFilter);
                setSnapshots(list);

                // Expose the brand filter pills ONLY to admins
                if (isAdmin) {
                    if (!selectedBrand || selectedBrand === 'ALL') {
                        const brands = Array.from(new Set(list.map(s => s.brand).filter(Boolean))) as string[];
                        setAvailableBrands(['ALL', ...brands]);
                    }
                } else {
                    setAvailableBrands([]);
                }
            } else {
                const list = await listMonthlyDataSnapshots();
                setMonthlySnapshots(list);
            }
        } catch (err) {
            setError('Không thể tải danh sách dữ liệu từ Cloud.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            // Reset brand when opening or switching tabs if not already set
            if (tab === 'monthly') setSelectedBrand(null);
            fetchData();
        }
    }, [isOpen, tab, selectedBrand]);

    if (!isOpen) return null;

    const handleLoadInventory = async (snap: SnapshotMetadataRow) => {
        setLoadingId(snap.id);
        setError(null);
        try {
            const data = await loadSnapshot(snap.storage_path);
            if (data && data.length > 0) {
                onSelectInventory(data, snap.filename);
                onClose();
            } else {
                setError('Không thể tải bản sao lưu này.');
            }
        } catch (err) {
            setError('Lỗi khi tải dữ liệu.');
        } finally {
            setLoadingId(null);
        }
    };

    const handleDeleteSnapshot = async (snap: SnapshotMetadataRow) => {
        if (!window.confirm(`Bạn có chắc chắn muốn xóa bản sao lưu "${snap.filename}"? Hành động này không thể hoàn tác.`)) return;
        
        setLoadingId(snap.id);
        setError(null);
        try {
            const success = await deleteSnapshot(snap.id, snap.storage_path);
            if (success) {
                setSnapshots(prev => prev.filter(s => s.id !== snap.id));
            } else {
                setError('Xóa bản sao lưu thất bại.');
            }
        } catch (err) {
            setError('Lỗi khi xóa dữ liệu.');
        } finally {
            setLoadingId(null);
        }
    };

    const handleLoadMonthly = async (monthVersion: string) => {
        setLoadingId(monthVersion);
        setError(null);
        try {
            const result = await loadSpecificMonthlyData(monthVersion);
            if (result && result.data) {
                onSelectMonthly(result.data, monthVersion, result.updatedAt);
                onClose();
            } else {
                setError('Không thể tải phiên bản dữ liệu tháng này.');
            }
        } catch (err) {
            setError('Lỗi khi tải dữ liệu tháng.');
        } finally {
            setLoadingId(null);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-white/20">
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <Cloud size={20} />
                        </div>
                        <div>
                            <Typography variant="h2">Truy xuất Dữ liệu Cloud</Typography>
                            <Typography variant="label" className="mt-0.5">Chọn bản sao lưu hoặc dữ liệu tháng để làm việc</Typography>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 w-10 h-10 rounded-full transition-all flex items-center justify-center"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex p-2 bg-slate-100/50 m-6 mb-0 rounded-2xl border border-slate-100">
                    <button
                        onClick={() => setTab('inventory')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            tab === 'inventory'
                                ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Database size={16} />
                        Lịch sử Tồn kho (File A)
                    </button>
                    <button
                        onClick={() => setTab('monthly')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            tab === 'monthly'
                                ? 'bg-white text-emerald-600 shadow-md ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Calendar size={16} />
                        Dữ liệu Tháng (File B)
                    </button>
                </div>

                {/* Brand Filter (Inventory only) */}
                {tab === 'inventory' && availableBrands.length > 1 && (
                    <div className="px-6 mt-4">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1 shrink-0">Lọc hãng:</span>
                            {availableBrands.map(brand => {
                                const isAll = brand === 'ALL';
                                const isActive = isAll ? selectedBrand === null : selectedBrand === brand;
                                return (
                                    <button
                                        key={brand}
                                        onClick={() => setSelectedBrand(isAll ? null : brand)}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                                            isActive
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                                : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'
                                        }`}
                                    >
                                        {brand}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className={`p-6 ${tab === 'inventory' && availableBrands.length > 1 ? 'pt-2' : ''} h-[400px] overflow-hidden flex flex-col`}>
                    {error && (
                        <div className="mb-4 flex gap-3 items-center text-sm font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-shake">
                            <AlertCircle size={20} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                                <RefreshCw className="animate-spin" size={32} />
                                <Typography variant="label">Đang tải danh sách...</Typography>
                            </div>
                        ) : tab === 'inventory' ? (
                            snapshots.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <Database size={48} className="mb-4" />
                                    <Typography variant="label">Không tìm thấy bản sao lưu nào</Typography>
                                </div>
                            ) : snapshots.map(snap => (
                                <div key={snap.id} className="group flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Typography variant="h3" className="truncate text-slate-800">
                                                {snap.filename}
                                            </Typography>
                                            {snap.brand && (
                                                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[9px] font-black uppercase">
                                                    {snap.brand}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-slate-400 text-2xs font-bold">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={10} /> {formatDate(snap.upload_date)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Database size={10} /> {snap.row_count.toLocaleString()} SKUs
                                            </span>
                                            {snap.uploader_name && (
                                                <span className="truncate">By: {snap.uploader_name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {userRole === 'admin' && (
                                            <button
                                                onClick={() => handleDeleteSnapshot(snap)}
                                                disabled={loadingId === snap.id}
                                                title="Xóa bản sao lưu"
                                                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                                    loadingId === snap.id
                                                        ? 'bg-rose-100 text-rose-600'
                                                        : 'bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 shadow-sm'
                                                }`}
                                            >
                                                {loadingId === snap.id ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleLoadInventory(snap)}
                                            disabled={loadingId === snap.id}
                                            title="Tải dữ liệu này"
                                            className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                                loadingId === snap.id
                                                    ? 'bg-blue-100 text-blue-600'
                                                    : 'bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 shadow-sm'
                                            }`}
                                        >
                                            {loadingId === snap.id ? <RefreshCw className="animate-spin" size={20} /> : <Download size={20} />}
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            monthlySnapshots.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <Calendar size={48} className="mb-4" />
                                    <Typography variant="label">Không tìm thấy dữ liệu tháng nào</Typography>
                                </div>
                            ) : monthlySnapshots.map(m => {
                                const isActive = currentMonthlyDate === m.id;
                                return (
                                    <div key={m.id} className={`group flex items-center gap-4 border rounded-2xl p-4 transition-all ${
                                        isActive 
                                            ? 'bg-emerald-50 border-emerald-300' 
                                            : 'bg-slate-50 border-slate-100 hover:border-emerald-400 hover:bg-emerald-50/30'
                                    }`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Typography variant="h3" className={isActive ? 'text-emerald-800' : 'text-slate-800'}>
                                                    Tháng {m.id.split('-').reverse().join('/')}
                                                </Typography>
                                                {isActive && (
                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[9px] font-black uppercase shadow-sm">
                                                        Đang dùng
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400 text-2xs font-bold">
                                                <span className="flex items-center gap-1">
                                                    <RefreshCw size={10} /> Cập nhật: {formatDate(m.updated_at)}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleLoadMonthly(m.id)}
                                            disabled={loadingId === m.id || isActive}
                                            className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                                loadingId === m.id
                                                    ? 'bg-emerald-100 text-emerald-600'
                                                    : isActive 
                                                        ? 'bg-emerald-100 text-emerald-600 border border-emerald-200 cursor-default'
                                                        : 'bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 shadow-sm'
                                            }`}
                                        >
                                            {loadingId === m.id ? <RefreshCw className="animate-spin" size={20} /> : isActive ? <Database size={20} /> : <Download size={20} />}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end rounded-b-[32px]">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-all font-sans"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
};
