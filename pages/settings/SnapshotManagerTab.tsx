import React, { useState, useEffect } from 'react';
import { listSnapshots, deleteSnapshot, getStorageUsage, SnapshotMetadataRow } from '../../utils/supabase';
import { FaIcon } from '../../components/Icon';
import { AVAILABLE_BRANDS } from '../../types/inventory';
import { SectionCard } from './SettingsUI';

interface SnapshotManagerTabProps {
    monthlyHistory: { id: string; updated_at: string }[];
    handleDeleteMonthly: (snapshotMonth: string) => Promise<void>;
}

export const SnapshotManagerTab = ({ monthlyHistory, handleDeleteMonthly }: SnapshotManagerTabProps) => {
    const [snapshots, setSnapshots] = useState<SnapshotMetadataRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [storageInfo, setStorageInfo] = useState({ usedBytes: 0, count: 0 });
    const [brandFilter, setBrandFilter] = useState<string>('');

    useEffect(() => { fetchAll(); }, [brandFilter]);

    const fetchAll = async () => {
        setIsLoading(true);
        const [data, usage] = await Promise.all([
            listSnapshots(200, brandFilter || null),
            getStorageUsage()
        ]);
        setSnapshots(data);
        setStorageInfo(usage);
        setIsLoading(false);
    };

    const handleDelete = async (snap: SnapshotMetadataRow) => {
        if (!confirm(`Xóa snapshot "${snap.filename}"?\nDữ liệu sẽ bị xóa vĩnh viễn khỏi Cloud.`)) return;
        setDeletingId(snap.id);
        const result = await deleteSnapshot(snap.id, snap.storage_path);
        if (result.success) {
            setSnapshots(prev => prev.filter(s => s.id !== snap.id));
            setStorageInfo(prev => ({ ...prev, count: prev.count - 1, usedBytes: prev.usedBytes - (snap.file_size_bytes || 0) }));
        } else {
            alert(`❌ Lỗi khi xóa: ${result.error || 'Không xác định'}`);
        }
        setDeletingId(null);
    };

    const handleDeleteSelected = async () => {
        const count = selectedIds.size;
        if (count === 0) return;
        if (!confirm(`Xóa ${count} snapshots đã chọn?\nDữ liệu sẽ bị xóa vĩnh viễn.`)) return;

        setIsLoading(true);
        let successCount = 0;
        let lastError = '';

        for (const id of selectedIds) {
            const snap = snapshots.find(s => s.id === id);
            if (snap) {
                const result = await deleteSnapshot(snap.id, snap.storage_path);
                if (result.success) successCount++;
                else lastError = result.error || 'Lỗi không xác định';
            }
        }

        setSelectedIds(new Set());
        await fetchAll();

        if (successCount < count) {
            alert(`Đã xóa ${successCount}/${count} file. Lỗi cuối: ${lastError}`);
        } else {
            alert(`✅ Đã xóa thành công ${successCount} file.`);
        }
        setIsLoading(false);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === snapshots.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(snapshots.map(s => s.id)));
    };

    const formatBytes = (bytes: number | null) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const totalSize = snapshots.reduce((sum, s) => sum + (s.file_size_bytes || 0), 0);

    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionCard icon="fa-cloud" title="Quản lý Snapshot Cloud" badge={`${snapshots.length} files • ${formatBytes(totalSize)}`}>
                {/* Storage Progress Bar */}
                {storageInfo.usedBytes > 0 && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-black text-slate-600">Dung lượng Cloud</span>
                            <span className="text-xs font-bold text-slate-500">{formatBytes(storageInfo.usedBytes)} / 1 GB</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${storageInfo.usedBytes > 800 * 1024 * 1024 ? 'bg-rose-500' : storageInfo.usedBytes > 500 * 1024 * 1024 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min((storageInfo.usedBytes / (1024 * 1024 * 1024)) * 100, 100)}%` }}
                            />
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                            Supabase Free Tier: 1 GB Storage • Auto-cleanup giữ tối đa 30 snapshots
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center flex-wrap gap-3">
                        <button onClick={fetchAll} disabled={isLoading} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50/30">
                            <FaIcon className={`fas fa-sync ${isLoading ? 'fa-spin' : ''}`}  /> Làm mới
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Thương hiệu:</span>
                            <select
                                value={brandFilter}
                                onChange={e => setBrandFilter(e.target.value)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 transition-all cursor-pointer"
                            >
                                <option value="">Tất cả Brand</option>
                                {AVAILABLE_BRANDS.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>

                        {selectedIds.size > 0 && (
                            <button onClick={handleDeleteSelected} className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1.5 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                                <FaIcon className="fas fa-trash"  /> Xóa {selectedIds.size} đã chọn
                            </button>
                        )}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                        Supabase Free: 1GB Storage
                    </div>
                </div>

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <FaIcon className="fas fa-circle-notch fa-spin text-2xl"  />
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <FaIcon className="fas fa-cloud text-4xl mb-3 opacity-30"  />
                        <p className="text-sm font-bold">Chưa có snapshot nào</p>
                    </div>
                ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="w-10 p-3 text-center">
                                        <input type="checkbox" checked={selectedIds.size === snapshots.length && snapshots.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" />
                                    </th>
                                    <th className="p-3 text-left font-black text-slate-600 uppercase tracking-wider">Ngày tải</th>
                                    <th className="p-3 text-left font-black text-slate-600 uppercase tracking-wider">Brand</th>
                                    <th className="p-3 text-left font-black text-slate-600 uppercase tracking-wider">Tên file</th>
                                    <th className="p-3 text-left font-black text-slate-600 uppercase tracking-wider">Người tải</th>
                                    <th className="p-3 text-right font-black text-slate-600 uppercase tracking-wider">SKUs</th>
                                    <th className="p-3 text-right font-black text-slate-600 uppercase tracking-wider">Dung lượng</th>
                                    <th className="p-3 text-center font-black text-slate-600 uppercase tracking-wider">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.map(snap => (
                                    <tr key={snap.id} className={`border-b border-slate-100 hover:bg-blue-50/50 transition-colors ${selectedIds.has(snap.id) ? 'bg-blue-50' : ''}`}>
                                        <td className="p-3 text-center">
                                            <input type="checkbox" checked={selectedIds.has(snap.id)} onChange={() => toggleSelect(snap.id)} className="rounded border-slate-300" />
                                        </td>
                                        <td className="p-3 font-bold text-slate-700">{formatDate(snap.upload_date)}</td>
                                        <td className="p-3">
                                            {snap.brand ? (
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                                                    snap.brand === 'BMW' ? 'bg-slate-900 text-white border-slate-800' :
                                                    snap.brand === 'Kia' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                    snap.brand === 'Mazda' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                    'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    {snap.brand}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 italic text-[10px]">None</span>
                                            )}
                                        </td>
                                        <td className="p-3 font-bold text-slate-900 max-w-[200px] truncate" title={snap.filename}>{snap.filename}</td>
                                        <td className="p-3 text-slate-500 font-medium">{snap.uploader_name || '—'}</td>
                                        <td className="p-3 text-right font-bold text-slate-700">{snap.row_count?.toLocaleString()}</td>
                                        <td className="p-3 text-right font-medium text-slate-500">{formatBytes(snap.file_size_bytes)}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => handleDelete(snap)}
                                                disabled={deletingId === snap.id}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all disabled:opacity-50"
                                            >
                                                {deletingId === snap.id ? <FaIcon className="fas fa-circle-notch fa-spin"  /> : <><FaIcon className="fas fa-trash mr-1"  />Xóa</>}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {/* Monthly Data History Manager (Admin Only) */}
            <SectionCard title="Quản lý Dữ liệu Tháng" icon="fa-calendar-days" badge={`${monthlyHistory.length} versions`}>
                <div className="text-xs text-slate-500 font-bold mb-4">
                    <FaIcon className="fas fa-info-circle mr-1.5 text-blue-400"  />
                    Quản lý các bản ghi Monthly SKU Data (File B) trên Cloud. Xóa dữ liệu cũ để dọn dẹp Database.
                </div>
                {monthlyHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 italic text-xs">Chưa có dữ liệu tháng nào được upload</div>
                ) : (
                    <div className="space-y-2">
                        {monthlyHistory.map(h => {
                            const vName = h.id.replace('monthly_data_', '');
                            return (
                                <div key={h.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 group hover:border-blue-200 transition-all">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                        <FaIcon className="fas fa-calendar-check"  />
                                    </div>
                                    <div>
                                        <div className="font-black text-slate-800 text-sm">{vName}</div>
                                        <div className="text-[10px] text-slate-400 font-bold">Ngày lưu: {new Date(h.updated_at).toLocaleString('vi-VN')}</div>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <button
                                            onClick={() => handleDeleteMonthly(vName)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-1.5"
                                        >
                                            <FaIcon className="fas fa-trash"  /> Xóa bản ghi
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionCard>
        </div>
    );
};
