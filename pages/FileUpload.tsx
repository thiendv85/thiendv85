
import React, { useState, useRef, useEffect } from 'react';
import { InventoryItem, MonthlyData } from '../types/inventory';
import { parseCSV, parseDealerStockCSV, parseBackorderCSV } from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';
import { uploadSnapshot, listSnapshots, loadSnapshot, deleteSnapshot, getStorageUsage, SnapshotMetadataRow, normalizeBrand } from '../utils/supabase';
import { useAuth } from '../utils/authContext';


export const FileUpload = ({ onData, monthlyData, isMonthlyLoading, monthlyDataDate }: {
    onData: (data: InventoryItem[], filename: string, sourceId: string) => void;
    monthlyData?: Record<string, MonthlyData> | null;
    isMonthlyLoading?: boolean;
    monthlyDataDate?: string | null;
}) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [dealerFile, setDealerFile] = useState<File | null>(null);
    const [boFile, setBoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Auth
    const { profile } = useAuth();

    // Cloud snapshot states
    const [mode, setMode] = useState<'upload' | 'history'>('upload');
    const [snapshots, setSnapshots] = useState<SnapshotMetadataRow[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [loadingSnapshotId, setLoadingSnapshotId] = useState<string | null>(null);
    const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [storageUsed, setStorageUsed] = useState(0);

    const mainInputRef = useRef<HTMLInputElement>(null);
    const dealerInputRef = useRef<HTMLInputElement>(null);
    const boInputRef = useRef<HTMLInputElement>(null);
    const { t } = useLanguage();

    // Auto-clear upload status toast after 5s
    useEffect(() => {
        if (uploadStatus) {
            const timer = setTimeout(() => setUploadStatus(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [uploadStatus]);

    // Fetch snapshots when switching to history mode
    useEffect(() => {
        if (mode === 'history') fetchSnapshots();
    }, [mode]);

    const fetchSnapshots = async () => {
        setIsLoadingHistory(true);
        const brandFilter = profile?.role === 'admin' ? null : normalizeBrand(profile?.department);
        const list = await listSnapshots(50, brandFilter);
        setSnapshots(list);
        const usage = await getStorageUsage();
        setStorageUsed(usage.usedBytes);
        setIsLoadingHistory(false);
    };

    const handleLoadSnapshot = async (snap: SnapshotMetadataRow) => {
        setLoadingSnapshotId(snap.id);
        const data = await loadSnapshot(snap.storage_path);
        setLoadingSnapshotId(null);
        if (data && data.length > 0) {
            onData(data, snap.filename, '');
        } else {
            alert(t('upload_snapshot_error'));
        }
    };

    const handleDeleteSnapshot = async (snap: SnapshotMetadataRow) => {
        if (!confirm(`Xóa snapshot "${snap.filename}" (${snap.row_count.toLocaleString()} SKUs)?`)) return;
        const ok = await deleteSnapshot(snap.id, snap.storage_path);
        if (ok) setSnapshots(prev => prev.filter(s => s.id !== snap.id));
        else alert(t('upload_delete_error'));
    };

    const handleMainFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().endsWith('.csv')) setMainFile(file);
            else alert(t('upload_csv_only'));
        }
    };

    const parseAllFiles = async () => {
        if (!mainFile) return null;
        const readFile = (file: File) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file, 'UTF-8');
        });

        const mainText = await readFile(mainFile);
        let inventoryData = parseCSV(mainText, monthlyData ?? undefined);

        if (dealerFile) {
            const dealerText = await readFile(dealerFile);
            const dealerMap = parseDealerStockCSV(dealerText);
            inventoryData = inventoryData.map(item => {
                const details = dealerMap[item.ItemCode];
                if (details) {
                    const totalDealer = details.reduce((sum, d) => sum + d.Qty, 0);
                    return { ...item, DealerInventory: totalDealer, DealerBreakdown: details };
                }
                return item;
            });
        }

        if (boFile) {
            const boText = await readFile(boFile);
            const boMap = parseBackorderCSV(boText);
            inventoryData = inventoryData.map(item => {
                const details = boMap[item.ItemCode];
                if (details && details.length > 0) {
                    const totalBO = details.reduce((sum, d) => sum + d.Qty, 0);
                    const boNB = (item.Backorder_NB > 0) ? item.Backorder_NB : details.filter(d => d.Warehouse && (d.Warehouse.includes('NB') || d.Warehouse.includes('Nam'))).reduce((s, d) => s + d.Qty, 0);
                    const boBB = (item.Backorder_BB > 0) ? item.Backorder_BB : details.filter(d => d.Warehouse && (d.Warehouse.includes('BB') || d.Warehouse.includes('Bắc'))).reduce((s, d) => s + d.Qty, 0);
                    return { ...item, Backorder: totalBO > 0 ? totalBO : item.Backorder, Backorder_NB: boNB, Backorder_BB: boBB, BackorderBreakdown: details };
                }
                return item;
            });
        }

        return inventoryData;
    };

    const processFiles = async () => {
        if (!mainFile) return;
        setIsLoading(true);
        setUploadStatus(null);
        try {
            const inventoryData = await parseAllFiles();
            if (!inventoryData || inventoryData.length === 0) {
                alert("Không tìm thấy dữ liệu hợp lệ trong file chính.");
                return;
            }
            // Phân tích ngay (không chờ upload)
            onData(inventoryData, mainFile.name, '');

            // Upload cloud song song (non-blocking)
            uploadSnapshot(inventoryData, mainFile.name, {
                dealerFilename: dealerFile?.name,
                boFilename: boFile?.name,
            }).then(result => {
                if (result.deduplicated) {
                    setUploadStatus({ type: 'success', msg: t('upload_exists') });
                } else if (result.success) {
                    setUploadStatus({ type: 'success', msg: t('upload_saved').replace('{0}', inventoryData.length.toLocaleString()) });
                } else {
                    setUploadStatus({ type: 'error', msg: `${t('upload_cloud_warn')} ${result.error || ''}`.trim() });
                }
            }).catch(() => {
                setUploadStatus({ type: 'error', msg: t('upload_cloud_warn') });
            });
        } catch (error) {
            alert(t('upload_read_error'));
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const processFilesLocalOnly = async () => {
        if (!mainFile) return;
        setIsLoading(true);
        try {
            const inventoryData = await parseAllFiles();
            if (!inventoryData || inventoryData.length === 0) {
                alert("Không tìm thấy dữ liệu hợp lệ trong file chính.");
                return;
            }
            onData(inventoryData, mainFile.name, '');
        } catch (error) {
            alert(t('upload_read_error'));
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);

    const formatFileSize = (bytes: number | null) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-900 font-sans selection:bg-blue-500/30">

            {/* 1. BACKGROUND IMAGE LAYER */}
            <div className="absolute inset-0 z-0">
                <img
                    src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=80&w=2832&auto=format&fit=crop"
                    alt="Auto Parts Background"
                    className="w-full h-full object-cover opacity-60 mix-blend-overlay"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900/70"></div>
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]"></div>
            </div>

            {/* Upload Status Toast */}
            {uploadStatus && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 animate-fadeIn text-sm font-bold ${
                    uploadStatus.type === 'success'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                }`}>
                    <i className={`fas ${uploadStatus.type === 'success' ? 'fa-cloud-arrow-up' : 'fa-triangle-exclamation'}`} />
                    <span>{uploadStatus.msg}</span>
                    <button onClick={() => setUploadStatus(null)} className="ml-2 opacity-60 hover:opacity-100"><i className="fas fa-times" /></button>
                </div>
            )}

            {/* 2. GLASS CONTENT LAYER */}
            <div className="relative z-10 w-full max-w-6xl p-6 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

                {/* Left Column: Branding & Intro */}
                <div className="lg:col-span-7 text-white space-y-8 animate-fadeIn">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-2xs font-black uppercase tracking-widest mb-6 backdrop-blur-md shadow-glow-blue">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_#60a5fa]"></span>
                            Hệ thống Sẵn sàng
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mb-6 drop-shadow-xl">
                            Auto Parts <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 animate-gradient-x">
                                Governance
                            </span>
                        </h1>

                        <div className="flex items-center gap-3 mb-8 pl-1">
                            <div className="w-12 h-[3px] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                                Procurement & Inventory <br />
                                <span className="text-slate-500">Premium Cars Spare Parts</span>
                            </p>
                        </div>

                        <p className="text-slate-300 text-lg font-medium max-w-lg leading-relaxed border-l-4 border-slate-700/50 pl-6">
                            Hệ thống phân tích tồn kho chuyên sâu. Tối ưu hóa mức tồn kho, phát hiện rủi ro và tự động hóa quy trình đặt hàng với độ chính xác cao.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-white/5">
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-blue flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><i className="fas fa-chart-pie"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">Real-time</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Analytics</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-emerald flex items-center justify-center text-white shadow-lg shadow-emerald-500/20"><i className="fas fa-robot"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">AI Driven</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Forecast</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-rose flex items-center justify-center text-white shadow-lg shadow-rose-500/20"><i className="fas fa-shield-halved"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">Risk Control</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Governance</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Upload Card */}
                <div className="lg:col-span-5 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group min-h-[460px]">
                        {/* Decorative Glow */}
                        <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] group-hover:bg-blue-500/30 transition-all duration-1000 pointer-events-none"></div>
                        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/20 rounded-full blur-[80px] group-hover:bg-purple-500/30 transition-all duration-1000 pointer-events-none"></div>

                        <div className="relative z-10 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full"></span>
                                        {t('upload_title')}
                                    </h3>
                                    <p className="text-slate-400 text-xs font-medium mt-1 pl-3.5">
                                        {mode === 'upload' ? t('upload_subtitle') : 'Truy xuất bản sao lưu từ Cloud'}
                                    </p>
                                </div>
                                {/* Monthly Data Badge */}
                                {mode === 'upload' && (
                                    isMonthlyLoading ? (
                                        <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/40 text-blue-300 px-2.5 py-1 rounded-lg text-xs font-bold animate-pulse">
                                            <i className="fas fa-sync fa-spin" />
                                            <span>{t('upload_syncing')}</span>
                                        </div>
                                    ) : monthlyData ? (
                                        <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold">
                                            <i className="fas fa-calendar-check" />
                                            <span>Dữ liệu Tháng: {monthlyDataDate ? monthlyDataDate.split('-').reverse().join('/') : 'OK'}</span>
                                        </div>
                                    ) : (
                                        <div title="Vào Settings → Hệ thống → Upload File Monthly để kích hoạt" className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold cursor-help">
                                            <i className="fas fa-triangle-exclamation" />
                                            <span>Chưa có d/l tháng</span>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Mode Toggle */}
                            <div className="flex rounded-xl bg-black/30 border border-white/10 p-1">
                                <button
                                    onClick={() => setMode('upload')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                        mode === 'upload'
                                            ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-white border border-white/10 shadow-lg'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <i className="fas fa-upload" />
                                    {t('upload_file_btn')}
                                </button>
                                <button
                                    onClick={() => setMode('history')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                        mode === 'history'
                                            ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-white border border-white/10 shadow-lg'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <i className="fas fa-cloud" />
                                    {t('upload_cloud_btn')}
                                </button>
                            </div>

                            {/* === UPLOAD MODE === */}
                            {mode === 'upload' && (
                                <div className="space-y-4">
                                    {/* Main Input Field */}
                                    <button
                                        type="button"
                                        onDragOver={onDragOver}
                                        onDragLeave={onDragLeave}
                                        onDrop={handleMainFileDrop}
                                        onClick={() => !isMonthlyLoading && mainInputRef.current?.click()}
                                        aria-label={t('upload_main_file')}
                                        className={`
                                      relative w-full h-24 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex items-center px-6 group overflow-hidden focus:outline-none focus:ring-4 focus:ring-blue-50/50
                                      ${isDragging
                                                ? 'bg-blue-500/20 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-[1.02]'
                                                : mainFile
                                                    ? 'bg-emerald-500/10 border-emerald-500/50'
                                                    : isMonthlyLoading
                                                        ? 'bg-blue-500/5 border-blue-500/20 cursor-wait opacity-60'
                                                        : 'bg-black/20 border-white/10 hover:border-blue-400/50 hover:bg-black/30'}
                                  `}
                                    >
                                        <div className="flex-1 flex items-center gap-5 relative z-10">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all shadow-lg ${mainFile ? 'bg-gradient-emerald text-white' : isMonthlyLoading ? 'bg-blue-900/40 text-blue-400' : 'bg-white/10 border border-white/10 text-slate-400 group-hover:bg-gradient-blue group-hover:text-white'}`}>
                                                <i className={`fas ${isMonthlyLoading ? 'fa-sync fa-spin text-xl' : mainFile ? 'fa-check text-2xl' : 'fa-cloud-arrow-up text-2xl'}`}></i>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className={`text-2xs font-black uppercase tracking-widest mb-1 ${isMonthlyLoading ? 'text-blue-400' : mainFile ? 'text-emerald-400' : 'text-blue-300'}`}>
                                                    {isMonthlyLoading
                                                        ? t('upload_loading_source')
                                                        : mainFile ? 'Sẵn sàng phân tích' : 'Dữ liệu chính'}
                                                </span>
                                                <span className={`text-sm font-bold truncate transition-colors ${mainFile ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                                    {isMonthlyLoading ? t('upload_loading_wait') : mainFile ? mainFile.name : "Kéo thả file Inventory tại đây…"}
                                                </span>
                                            </div>
                                        </div>
                                        <input type="file" ref={mainInputRef} className="hidden" accept=".csv" onChange={(e) => !isMonthlyLoading && e.target.files && setMainFile(e.target.files[0])} />
                                    </button>

                                    {/* Optional Inputs Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Dealer Stock */}
                                        <button
                                            type="button"
                                            onClick={() => dealerInputRef.current?.click()}
                                            aria-label={t('upload_dealer_file')}
                                            className={`h-16 rounded-xl border flex items-center px-4 cursor-pointer transition-all relative overflow-hidden group focus:outline-none focus:ring-4 focus:ring-blue-50/50
                                          ${dealerFile
                                                    ? 'bg-blue-500/10 border-blue-500/50'
                                                    : 'bg-black/20 border-white/10 hover:border-blue-400/30 hover:bg-black/30'}
                                      `}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all ${dealerFile ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white'}`}>
                                                <i className="fas fa-store"></i>
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-2xs font-black text-slate-500 uppercase tracking-widest">{t('upload_dealer_stock')}</span>
                                                <span className={`text-xs font-bold truncate ${dealerFile ? 'text-blue-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                    {dealerFile ? dealerFile.name : t('upload_optional')}
                                                </span>
                                            </div>
                                            <input type="file" ref={dealerInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && setDealerFile(e.target.files[0])} />
                                        </button>

                                        {/* Backorder */}
                                        <button
                                            type="button"
                                            onClick={() => boInputRef.current?.click()}
                                            aria-label={t('upload_bo_file')}
                                            className={`h-16 rounded-xl border flex items-center px-4 cursor-pointer transition-all relative overflow-hidden group focus:outline-none focus:ring-4 focus:ring-rose-50/50
                                          ${boFile
                                                    ? 'bg-rose-500/10 border-rose-500/50'
                                                    : 'bg-black/20 border-white/10 hover:border-rose-400/30 hover:bg-black/30'}
                                      `}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all ${boFile ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white'}`}>
                                                <i className="fas fa-file-invoice"></i>
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-2xs font-black text-slate-500 uppercase tracking-widest">{t('upload_bo')}</span>
                                                <span className={`text-xs font-bold truncate ${boFile ? 'text-rose-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                    {boFile ? boFile.name : t('upload_optional')}
                                                </span>
                                            </div>
                                            <input type="file" ref={boInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && setBoFile(e.target.files[0])} />
                                        </button>
                                    </div>

                                    {/* Action Buttons */}
                                    <button
                                        disabled={!mainFile || isLoading || isMonthlyLoading}
                                        onClick={processFiles}
                                        className={`
                                      w-full h-14 rounded-xl font-black uppercase tracking-[0.15em] shadow-lg transition-all flex items-center justify-center gap-3 mt-4 border border-white/10 group relative overflow-hidden
                                      ${!mainFile || isLoading || isMonthlyLoading
                                                ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                                : 'bg-gradient-blue hover:shadow-glow-blue hover:scale-[1.02] text-white'}
                                  `}
                                    >
                                        {isLoading || isMonthlyLoading ? (
                                            <>
                                                <i className="fas fa-circle-notch animate-spin"></i>
                                                <span>{isMonthlyLoading ? 'Syncing Monthly...' : 'Processing...'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-cloud-arrow-up relative z-10"></i>
                                                <span className="relative z-10">Lưu & Phân Tích</span>
                                                <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform relative z-10"></i>
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        disabled={!mainFile || isLoading || isMonthlyLoading}
                                        onClick={processFilesLocalOnly}
                                        className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors py-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        {t('upload_view_only')}
                                    </button>
                                </div>
                            )}

                            {/* === CLOUD HISTORY MODE === */}
                            {mode === 'history' && (
                                <div className="space-y-3">
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xs font-black text-slate-400 uppercase tracking-widest">
                                                {snapshots.length > 0 ? `${snapshots.length} bản sao lưu` : 'Bản sao lưu Cloud'}
                                            </span>
                                            {storageUsed > 0 && (
                                                <span className="text-2xs font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded-md">
                                                    {formatFileSize(storageUsed)} / 1 GB
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={fetchSnapshots}
                                            disabled={isLoadingHistory}
                                            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5 transition-colors"
                                        >
                                            <i className={`fas fa-sync ${isLoadingHistory ? 'fa-spin' : ''}`} />
                                            Làm mới
                                        </button>
                                    </div>

                                    {/* Snapshot list — compact single-line rows */}
                                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                                        {isLoadingHistory ? (
                                            <div className="flex items-center justify-center py-12 text-slate-400">
                                                <i className="fas fa-circle-notch fa-spin text-2xl" />
                                            </div>
                                        ) : snapshots.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                                    <i className="fas fa-cloud text-slate-500 text-2xl"></i>
                                                </div>
                                                <p className="text-slate-400 text-sm font-bold">Chưa có bản sao lưu nào</p>
                                                <p className="text-slate-500 text-xs mt-1">Tải file CSV và bấm "Lưu & Phân Tích" để tạo bản sao đầu tiên</p>
                                            </div>
                                        ) : snapshots.map(snap => {
                                            const fileCount = 1 + (snap.dealer_filename ? 1 : 0) + (snap.bo_filename ? 1 : 0);
                                            const tooltip = [snap.filename, snap.dealer_filename && `Tồn SR: ${snap.dealer_filename}`, snap.bo_filename && `BO: ${snap.bo_filename}`].filter(Boolean).join('\n');
                                            return (
                                            <div key={snap.id} className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 hover:border-blue-400/30 transition-all group/item">
                                                {/* Date */}
                                                <span className="text-2xs text-slate-500 font-bold shrink-0 w-[72px]">
                                                    {formatDate(snap.upload_date)}
                                                </span>
                                                {/* Filename + file count badge */}
                                                <span className="text-xs font-bold text-white truncate flex-1 min-w-0 flex items-center gap-1.5" title={tooltip}>
                                                    {snap.filename}
                                                    {fileCount > 1 && (
                                                        <span className="shrink-0 text-[9px] font-black bg-blue-500/30 text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded">
                                                            {fileCount} files
                                                        </span>
                                                    )}
                                                </span>
                                                {/* Uploader */}
                                                {snap.uploader_name && (
                                                    <span className="text-2xs text-slate-500 font-bold shrink-0 truncate max-w-[60px]" title={snap.uploader_name}>
                                                        {snap.uploader_name}
                                                    </span>
                                                )}
                                                {/* Load button */}
                                                <button
                                                    onClick={() => handleLoadSnapshot(snap)}
                                                    disabled={loadingSnapshotId === snap.id}
                                                    className="px-2.5 py-1 rounded-md bg-blue-500/20 border border-blue-400/30 text-blue-300 text-2xs font-black hover:bg-blue-500/30 transition-all disabled:opacity-50 shrink-0"
                                                >
                                                    {loadingSnapshotId === snap.id
                                                        ? <i className="fas fa-circle-notch fa-spin" />
                                                        : <i className="fas fa-download" />
                                                    }
                                                </button>
                                                {/* Delete button */}
                                                <button
                                                    onClick={() => handleDeleteSnapshot(snap)}
                                                    className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover/item:opacity-100 shrink-0"
                                                    title="Xóa"
                                                >
                                                    <i className="fas fa-times text-2xs" />
                                                </button>
                                            </div>
                                        );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
