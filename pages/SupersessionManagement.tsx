import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Typography } from '../components/Typography';
import { InventoryItem } from '../types/inventory';
import { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';
import { exportSupersessionMappingCSV } from '../utils/csvParser';
import { SupersessionChainViewer } from '../components/SupersessionChainViewer';
import { SupersessionMappingsTable } from '../components/SupersessionMappingsTable';
import { SupersessionEditModal } from '../components/SupersessionEditModal';
import { OldStockAlert } from '../components/OldStockAlert';
import { FaIcon } from '../components/Icon';
import {
    Download,
    Trash2,
    AlertTriangle,
    AlertCircle,
    Upload,
    GitMerge,
    Link,
    Network,
    List,
    History,
    Plus,
    RefreshCw,
    FileUp,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { useLanguage } from '../utils/i18n';
import {
    loadFromCloudStorage, verifyAdminPin,
    listSupersessionUploads, uploadSupersessionFile, deleteSupersessionUpload,
    loadAllSupersessionMappings, dbMappingsToApp, migrateLocalMappingsToDB,
    type SupersessionUpload,
} from '../utils/supabase';
import { parseSupersessionMappingCSV } from '../utils/csvParser';
import { PartAffinityAdmin } from './PartAffinityAdmin';

interface SupersessionManagementProps {
    data: InventoryItem[];
    mappings: SupersessionMapping[];
    onUpdateMappings: (mappings: SupersessionMapping[]) => void;
    onItemSelect?: (item: InventoryItem) => void;
    onAddMapping: () => void;
    onEditMapping: (mapping: SupersessionMapping) => void;
}

type TabMode = 'MAPPING' | 'OLD_STOCK' | 'UPLOADS' | 'AFFINITY';

type UploadResult = {
    filename: string;
    status: 'success' | 'error';
    inserted?: number;
    previousCount?: number;
    error?: string;
};

export const SupersessionManagement = ({
    data,
    mappings,
    onUpdateMappings,
    onItemSelect,
    onAddMapping,
    onEditMapping
}: SupersessionManagementProps) => {
    const { t } = useLanguage();
    const [selectedPart, setSelectedPart] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabMode>('MAPPING');
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);
    const [uploads, setUploads] = useState<SupersessionUpload[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
    const [isMigrating, setIsMigrating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refreshUploads = async () => {
        const list = await listSupersessionUploads();
        setUploads(list);
    };

    React.useEffect(() => { refreshUploads(); }, []);

    const handleMigrateToDB = async () => {
        if (mappings.length === 0) return;
        const pin = prompt('Nhập Mã Phê Duyệt (Admin PIN):');
        if (pin === null) return;
        if (!(await verifyAdminPin(pin))) { alert('Mã phê duyệt không chính xác!'); return; }

        setIsMigrating(true);
        const result = await migrateLocalMappingsToDB(mappings);
        if (result.success) {
            alert(`Đã đẩy ${result.inserted} mapping lên Database.`);
            await refreshUploads();
            await handleReloadFromDB();
        } else {
            alert(`Lỗi: ${result.error}`);
        }
        setIsMigrating(false);
    };

    const processFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        const file = files[0];

        const pin = prompt('Nhập Mã Phê Duyệt (Admin PIN):');
        if (pin === null) return;
        if (!(await verifyAdminPin(pin))) { alert('Mã phê duyệt không chính xác!'); return; }

        setIsUploading(true);
        setUploadResults([]);

        try {
            const text = await file.text();
            const parsed = parseSupersessionMappingCSV(text);
            if (parsed.length === 0) {
                setUploadResults([{ filename: file.name, status: 'error', error: 'Không có dữ liệu hợp lệ' }]);
                setIsUploading(false);
                return;
            }

            const rows = parsed.map(m => ({ old_part: m.oldPart, new_part: m.newPart, interchangeable: m.interchangeable }));
            const result = await uploadSupersessionFile(file.name, rows);

            if (result.success) {
                setUploadResults([{ filename: file.name, status: 'success', inserted: result.inserted, previousCount: result.previousCount }]);
                await refreshUploads();
                await handleReloadFromDB();
            } else {
                setUploadResults([{ filename: file.name, status: 'error', error: result.error }]);
            }
        } catch (err: any) {
            setUploadResults([{ filename: file.name, status: 'error', error: err?.message || 'Lỗi không xác định' }]);
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv') || f.name.endsWith('.txt'));
        if (files.length > 0) processFiles(files);
    }, [processFiles]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) processFiles(files);
    }, [processFiles]);

    const handleDeleteUpload = async (uploadId: string, filename: string) => {
        if (!window.confirm(`Xóa file "${filename}" và tất cả mapping liên quan?`)) return;
        const pin = prompt('Nhập Mã Phê Duyệt (Admin PIN):');
        if (pin === null) return;
        if (!(await verifyAdminPin(pin))) { alert('Mã phê duyệt không chính xác!'); return; }

        await deleteSupersessionUpload(uploadId);
        await refreshUploads();
        await handleReloadFromDB();
    };

    const handleReloadFromDB = async () => {
        setIsLoadingCloud(true);
        const rows = await loadAllSupersessionMappings();
        if (rows.length > 0) {
            onUpdateMappings(dbMappingsToApp(rows));
        } else {
            const legacy = await loadFromCloudStorage('supersession_draft');
            if (Array.isArray(legacy)) onUpdateMappings(legacy);
        }
        setIsLoadingCloud(false);
    };

    const graph = useMemo(() => {
        const itemCodes = data.map(i => i.ItemCode);
        return new SupersessionGraph(mappings, itemCodes);
    }, [mappings, data]);

    const stats = useMemo(() => {
        let maxDepth = 0;
        graph.chains.forEach(c => {
            if (c.chainDepth > maxDepth) maxDepth = c.chainDepth;
        });
        return {
            totalMappings: mappings.length,
            totalChains: graph.chains.size,
            maxDepth,
            errors: graph.validationErrors.length,
            warnings: graph.validationWarnings.length
        };
    }, [graph, mappings]);

    const handleExport = () => {
        exportSupersessionMappingCSV(mappings, `Supersession_Master_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const handleClear = () => {
        if (window.confirm(t('ss_confirm_clear'))) {
            onUpdateMappings([]);
            setSelectedPart(null);
        }
    };

    const handleDeleteMapping = (mappingToDelete: SupersessionMapping) => {
        if (window.confirm(`Bạn có chắc muốn xóa liên kết ${mappingToDelete.oldPart} -> ${mappingToDelete.newPart}?`)) {
            const newMappings = mappings.filter(m => !(m.oldPart === mappingToDelete.oldPart && m.newPart === mappingToDelete.newPart));
            onUpdateMappings(newMappings);
        }
    };

    const handleOldStockPartClick = (partNumber: string) => {
        if (!onItemSelect) return;
        const item = data.find(i => i.ItemCode === partNumber);
        if (item) onItemSelect(item);
    };

    return (
        <div className="flex flex-col h-full space-y-4 pb-24 animate-fadeIn">
            {/* HEADER */}
            <div className="bg-gradient-to-r from-purple-800 via-violet-800 to-indigo-900 rounded-2xl text-white relative overflow-hidden border border-white/10 shadow-glass">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40" />
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-400/10 rounded-full blur-[60px] pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                            <GitMerge size={16} className="text-purple-300" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-white !text-xl tracking-tight leading-none">{t('ss_title')}</Typography>
                            <Typography variant="label" className="text-purple-200/60 !text-[10px] font-medium">{t('ss_subtitle')}</Typography>
                        </div>
                    </div>

                    {mappings.length > 0 && (
                        <div className="flex items-center gap-2 mx-4">
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <FaIcon className="fas fa-link text-purple-300 text-[10px]" />
                                <span className="text-[10px] font-black text-white/50 uppercase">Mapping</span>
                                <span className="text-sm font-black text-white">{stats.totalMappings.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <FaIcon className="fas fa-diagram-project text-emerald-300 text-[10px]" />
                                <span className="text-[10px] font-black text-white/50 uppercase">Chuỗi</span>
                                <span className="text-sm font-black text-white">{stats.totalChains.toLocaleString()}</span>
                            </div>
                            {stats.errors > 0 && (
                                <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-400/30 px-3 py-1.5 rounded-lg">
                                    <FaIcon className="fas fa-triangle-exclamation text-rose-300 text-[10px]" />
                                    <span className="text-sm font-black text-rose-300">{stats.errors}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <span className="text-[10px] font-black text-white/50 uppercase">Depth</span>
                                <span className="text-sm font-black text-purple-200">{stats.maxDepth}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <button onClick={onAddMapping} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-colors">
                            <Plus size={13} /> Thêm
                        </button>
                        <button onClick={handleReloadFromDB} disabled={isLoadingCloud} className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all">
                            <RefreshCw size={12} className={isLoadingCloud ? 'animate-spin' : ''} /> Đồng bộ
                        </button>
                        {mappings.length > 0 && (
                            <>
                                <button onClick={handleExport} className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all">
                                    <Download size={12} /> Xuất CSV
                                </button>
                                <button onClick={handleClear} className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/70 hover:bg-rose-500/40 hover:border-rose-400/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all">
                                    <Trash2 size={12} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Sub-tabs */}
                <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1">
                    {mappings.length > 0 && (
                        <>
                            <button
                                onClick={() => setActiveTab('MAPPING')}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                    ${activeTab === 'MAPPING'
                                        ? 'bg-white/15 text-white border border-white/25 shadow-inner'
                                        : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                            >
                                <List size={11} className={activeTab === 'MAPPING' ? 'text-purple-300' : ''} /> Danh sách Mapping
                            </button>
                            <button
                                onClick={() => setActiveTab('OLD_STOCK')}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                    ${activeTab === 'OLD_STOCK'
                                        ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30 shadow-inner'
                                        : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                            >
                                <History size={11} className={activeTab === 'OLD_STOCK' ? 'text-rose-300' : ''} /> Cảnh báo Tồn Mã Cũ
                                {stats.errors > 0 && <span className="bg-rose-500/40 text-rose-200 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5">{stats.errors}</span>}
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => { setActiveTab('UPLOADS'); refreshUploads(); }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                            ${activeTab === 'UPLOADS'
                                ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30 shadow-inner'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                    >
                        <Upload size={11} className={activeTab === 'UPLOADS' ? 'text-blue-300' : ''} /> Upload File
                        {uploads.length > 0 && <span className="bg-blue-500/40 text-blue-200 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5">{uploads.length}</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('AFFINITY')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                            ${activeTab === 'AFFINITY'
                                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 shadow-inner'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                    >
                        <Link size={11} className={activeTab === 'AFFINITY' ? 'text-emerald-300' : ''} /> Mã liên quan
                    </button>
                </div>
            </div>

            {/* AFFINITY TAB */}
            {activeTab === 'AFFINITY' && (
                <div className="animate-fadeIn">
                    <PartAffinityAdmin embedded />
                </div>
            )}

            {/* MAIN WORKSPACE */}
            {activeTab === 'MAPPING' && mappings.length > 0 ? (
                <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-[600px] animate-fadeIn">
                    <div className="flex-1 flex flex-col gap-4 min-w-0">
                        <div className="flex items-center gap-2 mb-1 px-1">
                            <Link size={16} className="text-blue-500" />
                            <Typography variant="h3" className="text-slate-800">{t('ss_mapping_list')}</Typography>
                        </div>
                        <SupersessionMappingsTable
                            mappings={mappings}
                            graph={graph}
                            onPartClick={(part) => setSelectedPart(part)}
                            onEditMapping={onEditMapping}
                            onDeleteMapping={handleDeleteMapping}
                        />
                    </div>
                    <div className="xl:w-[450px] 2xl:w-[500px] flex flex-col gap-6 shrink-0">
                        {(stats.errors > 0 || stats.warnings > 0) && (
                            <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden flex-shrink-0">
                                <div className="px-5 py-3 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
                                    <h3 className="font-black text-rose-800 text-xs uppercase tracking-wide flex items-center gap-2">
                                        <AlertTriangle size={14} /> {t('ss_issues')}
                                    </h3>
                                    <span className="bg-white text-rose-700 px-2 py-0.5 rounded text-2xs font-black border border-rose-100">
                                        {stats.errors + stats.warnings}
                                    </span>
                                </div>
                                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                    {graph.validationErrors.map((err, i) => (
                                        <div key={`err-${i}`} className="px-4 py-3 text-xs font-bold text-rose-700 border-b border-rose-50 flex gap-2 items-start bg-rose-50/20">
                                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                            <span>{err}</span>
                                        </div>
                                    ))}
                                    {graph.validationWarnings.map((warn, i) => (
                                        <div key={`warn-${i}`} className="px-4 py-3 text-xs font-medium text-amber-700 border-b border-slate-50 flex gap-2 items-start hover:bg-amber-50/20">
                                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                                            <span>{warn}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
                                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Network size={16} className="text-purple-600" />
                                    {t('ss_chain_view')}
                                </h3>
                            </div>
                            <div className="flex-1 p-4 bg-slate-50/30 relative">
                                {selectedPart ? (
                                    <SupersessionChainViewer
                                        partNumber={selectedPart}
                                        graph={graph}
                                        items={data}
                                        onPartClick={(p) => setSelectedPart(p)}
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-200">
                                            <GitMerge size={32} className="text-slate-300" />
                                        </div>
                                        <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-1">{t('ss_select_hint')}</p>
                                        <p className="text-xs font-medium text-slate-400 max-w-[220px]">{t('ss_select_desc')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'OLD_STOCK' && mappings.length > 0 ? (
                <div className="flex-1">
                    <OldStockAlert data={data} graph={graph} onPartClick={handleOldStockPartClick} />
                </div>
            ) : activeTab === 'UPLOADS' ? (
                /* ─── UPLOADS TAB ─── */
                <div className="flex-1 space-y-4 animate-fadeIn">
                    {/* Migration banner — show when local data exists but DB is empty */}
                    {mappings.length > 0 && uploads.length === 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <AlertTriangle size={18} className="text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-amber-800">
                                        Có {mappings.length.toLocaleString()} mapping đang lưu local — chưa có trên Database
                                    </p>
                                    <p className="text-[11px] text-amber-600 mt-0.5">
                                        Đẩy dữ liệu hiện tại lên DB trước khi upload file mới để không bị mất data cũ.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleMigrateToDB}
                                disabled={isMigrating}
                                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-black transition-colors whitespace-nowrap"
                            >
                                {isMigrating ? (
                                    <><FaIcon className="fas fa-spinner fa-spin text-xs" /> Đang đẩy...</>
                                ) : (
                                    <><Upload size={14} /> Đẩy {mappings.length.toLocaleString()} mapping lên DB</>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Drag-drop upload zone */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-5">
                            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
                                <FileUp size={16} className="text-blue-500" /> Upload File Mã Thay Thế (Snapshot)
                            </h3>

                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => !isUploading && fileInputRef.current?.click()}
                                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                                    ${isUploading
                                        ? 'border-blue-300 bg-blue-50/50 cursor-wait'
                                        : isDragOver
                                            ? 'border-blue-400 bg-blue-50 scale-[1.01]'
                                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.txt"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {isUploading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                            <FaIcon className="fas fa-spinner fa-spin text-blue-500 text-xl" />
                                        </div>
                                        <p className="text-sm font-bold text-blue-600">Đang xử lý file...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDragOver ? 'bg-blue-100' : 'bg-slate-100'}`}>
                                            <Upload size={24} className={isDragOver ? 'text-blue-500' : 'text-slate-400'} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-700">
                                                Kéo thả file CSV vào đây hoặc <span className="text-blue-600 underline underline-offset-2">chọn file</span>
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                File tổng hợp tất cả mã thay thế &middot; Format: OldPartNumber | NewPartNumber | Interchangeable
                                            </p>
                                            <p className="text-[11px] text-amber-500 mt-0.5 font-semibold">
                                                File mới sẽ thay thế toàn bộ dữ liệu cũ
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Upload results */}
                            {uploadResults.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                    {uploadResults.map((r, i) => (
                                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                            {r.status === 'success'
                                                ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                : <XCircle size={14} className="text-rose-500 shrink-0" />}
                                            <span className="font-semibold">{r.filename}</span>
                                            {r.status === 'success' ? (
                                                <span className="text-emerald-600 text-[12px]">
                                                    — {r.inserted?.toLocaleString()} mapping {r.previousCount ? `(trước đó: ${r.previousCount.toLocaleString()})` : ''}
                                                </span>
                                            ) : (
                                                <span className="text-rose-600 text-[12px]">— {r.error}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Current snapshot info */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
                                <History size={14} className="text-slate-500" /> Snapshot hiện tại
                            </h3>
                            <button onClick={refreshUploads} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <RefreshCw size={12} />
                            </button>
                        </div>
                        {uploads.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                    <FileUp size={20} className="text-slate-300" />
                                </div>
                                <p className="text-sm text-slate-400">Chưa có snapshot nào.</p>
                                <p className="text-[11px] text-slate-300 mt-1">Upload file CSV tổng hợp ở trên để tạo snapshot đầu tiên.</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-2">
                                {uploads.map((u) => (
                                    <div key={u.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <FaIcon className="fas fa-file-csv text-emerald-500" />
                                            <div>
                                                <p className="font-semibold text-slate-700 text-sm">{u.filename}</p>
                                                <p className="text-[11px] text-slate-400">{new Date(u.uploaded_at).toLocaleString('vi-VN')}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-mono font-bold text-slate-600 text-sm">{u.row_count.toLocaleString()} mapping</span>
                                            <button
                                                onClick={() => handleDeleteUpload(u.id, u.filename)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* EMPTY STATE — no mappings, not on uploads tab */
                mappings.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 m-4 p-12 text-center shadow-sm">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                            <GitMerge size={48} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Chưa có dữ liệu Supersession</h3>
                        <p className="text-slate-500 text-sm font-medium max-w-md mb-8">
                            Upload file CSV chứa thông tin mã thay thế để bắt đầu phân tích chuỗi thay thế và gộp tồn kho.
                        </p>
                        <button
                            onClick={() => { setActiveTab('UPLOADS'); refreshUploads(); }}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-3"
                        >
                            <Upload size={18} /> Upload File
                        </button>
                    </div>
                )
            )}
        </div>
    );
};
