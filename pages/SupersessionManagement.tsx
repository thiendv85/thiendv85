
import React, { useState, useMemo } from 'react';
import { Typography } from '../components/Typography';
import { InventoryItem } from '../types/inventory';
import { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';
import { exportSupersessionMappingCSV } from '../utils/csvParser';
import { SupersessionChainViewer } from '../components/SupersessionChainViewer';
import { MetricCard } from '../components/MetricCard';
import { SupersessionCSVUpload } from '../components/SupersessionCSVUpload';
import { SupersessionMappingsTable } from '../components/SupersessionMappingsTable';
import { SupersessionEditModal } from '../components/SupersessionEditModal';
import { OldStockAlert } from '../components/OldStockAlert'; // Imported OldStockAlert
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
    X,
    Plus
} from 'lucide-react';
import { useLanguage } from '../utils/i18n';
import { saveToCloudStorage, loadFromCloudStorage } from '../utils/supabase';
interface SupersessionManagementProps {
    data: InventoryItem[];
    mappings: SupersessionMapping[];
    onUpdateMappings: (mappings: SupersessionMapping[]) => void;
    onItemSelect?: (item: InventoryItem) => void;
    onAddMapping: () => void;
    onEditMapping: (mapping: SupersessionMapping) => void;
}

type TabMode = 'MAPPING' | 'OLD_STOCK';

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
    const [showUpload, setShowUpload] = useState(false);
    const [activeTab, setActiveTab] = useState<TabMode>('MAPPING');
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);

    const handleSaveToCloud = async () => {
        setIsSavingCloud(true);
        const success = await saveToCloudStorage('supersession_draft', mappings);
        setIsSavingCloud(false);
        if (success) {
            alert('Đã lưu Dự thảo Mã chuyển đổi lên Cloud (Supabase) thành công!');
        } else {
            alert('Lỗi khi lưu lên Cloud. Vui lòng kiểm tra thiết lập SQL Supabase.');
        }
    };

    const handleLoadFromCloud = async () => {
        setIsLoadingCloud(true);
        const data = await loadFromCloudStorage('supersession_draft');
        setIsLoadingCloud(false);
        if (data && Array.isArray(data)) {
            onUpdateMappings(data);
            alert('Đã tải Dự thảo từ Cloud thành công!');
        } else {
            alert('Không tìm thấy bản dự thảo nào trên Cloud hoặc có lỗi.');
        }
    };

    // 1. Build Graph
    const graph = useMemo(() => {
        const itemCodes = data.map(i => i.ItemCode);
        return new SupersessionGraph(mappings, itemCodes);
    }, [mappings, data]);

    // 2. Statistics
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

    const handleImportSuccess = (newGraph: SupersessionGraph, newMappings: SupersessionMapping[]) => {
        onUpdateMappings(newMappings);
        setShowUpload(false);
        setSelectedPart(null);
    };

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
        if (item) {
            onItemSelect(item);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6 pb-24 animate-fadeIn">
            {/* 1. HEADER SECTION */}
            <div className="bg-gradient-to-r from-purple-700 via-violet-800 to-indigo-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-purple-400/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <Typography variant="h1" className="flex items-center gap-3 text-white">
                            <GitMerge size={24} className="text-purple-300" />
                            {t('ss_title')}
                        </Typography>
                        <Typography variant="label" className="mt-1 text-purple-200">
                            {t('ss_subtitle')}
                        </Typography>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Toggle Upload Button */}
                        <button
                            onClick={onAddMapping}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg border border-transparent px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            <Plus size={16} /> {t('common_add_new') || 'Thêm'}
                        </button>

                        <button onClick={handleLoadFromCloud} disabled={isLoadingCloud} className="bg-blue-500/30 border border-blue-400/30 text-blue-100 hover:bg-blue-500/50 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20">
                            <i className={`fas ${isLoadingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} /> Tải Cloud
                        </button>

                        <button
                            onClick={() => setShowUpload(!showUpload)}
                            className={`
                                px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2
                                ${showUpload
                                    ? 'bg-white/20 text-white border border-white/20 hover:bg-white/30'
                                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'}
                            `}
                        >
                            {showUpload ? <><X size={16} /> Hủy</> : <><Upload size={16} /> Nhập Local</>}
                        </button>

                        {mappings.length > 0 && (
                            <>
                                <button onClick={handleSaveToCloud} disabled={isSavingCloud} className="bg-emerald-500/30 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/50 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                                    <i className={`fas ${isSavingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} /> Lưu Cloud
                                </button>
                                <button onClick={handleExport} className="bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                                    <Download size={16} /> Xuất Local
                                </button>
                                <button onClick={handleClear} className="bg-white/10 backdrop-blur-sm hover:bg-rose-500/30 text-white border border-white/20 hover:border-rose-300/30 px-4 py-2.5 rounded-xl transition-all" title={t('ss_clear')}>
                                    <Trash2 size={18} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. UPLOAD PANEL (CONDITIONAL) */}
            {showUpload && (
                <div className="animate-in slide-in-from-top-4 duration-300">
                    <SupersessionCSVUpload
                        itemCodes={data.map(i => i.ItemCode)}
                        onImportSuccess={handleImportSuccess}
                        onImportError={(errs) => alert(errs.join('\n'))}
                        onCancel={() => setShowUpload(false)}
                    />
                </div>
            )}

            {/* 3. METRICS GRID - ONLY SHOW IN MAPPING TAB TO SAVE SPACE IN ALERT VIEW */}
            {!showUpload && mappings.length > 0 && activeTab === 'MAPPING' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                        label={t('ss_total_map')}
                        value={stats.totalMappings.toLocaleString()}
                        subValue="Liên kết"
                        icon="fa-link"
                        color="blue"
                    />
                    <MetricCard
                        label={t('ss_chains')}
                        value={stats.totalChains.toLocaleString()}
                        subValue="Chuỗi thay thế"
                        icon="fa-diagram-project"
                        color="emerald"
                    />
                    <MetricCard
                        label={t('ss_validation')}
                        value={stats.errors.toString()}
                        subValue={t('ss_errors')}
                        icon="fa-triangle-exclamation"
                        color={stats.errors > 0 ? "rose" : "slate"}
                    />
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center text-center shadow-sm hover:border-purple-300 transition-colors group">
                        <Typography variant="label" className="group-hover:text-purple-500 transition-colors">Max Depth</Typography>
                        <div className="text-2xl font-black text-slate-800 mt-1">{stats.maxDepth}</div>
                        <Typography variant="label" className="mt-1 text-slate-400 capitalize">Thế hệ</Typography>
                    </div>
                </div>
            )}

            {/* 4. TABS NAVIGATION */}
            {mappings.length > 0 && !showUpload && (
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 w-fit">
                    <button
                        onClick={() => setActiveTab('MAPPING')}
                        className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2 transition-all ${activeTab === 'MAPPING' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <List size={16} /> Danh sách Mapping
                    </button>
                    <button
                        onClick={() => setActiveTab('OLD_STOCK')}
                        className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2 transition-all ${activeTab === 'OLD_STOCK' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <History size={16} /> ⚠️ Cảnh Báo Tồn Mã Cũ
                    </button>
                </div>
            )}

            {/* 5. MAIN WORKSPACE - SWITCHABLE */}
            {mappings.length > 0 && !showUpload ? (
                activeTab === 'MAPPING' ? (
                    <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-[600px] animate-fadeIn">
                        {/* LEFT PANEL: TABLE */}
                        <div className="flex-1 flex flex-col gap-4 min-w-0">
                            <div className="flex items-center gap-2 mb-1 px-1">
                                <Link size={16} className="text-blue-500" />
                                <Typography variant="h3" className="text-slate-800">
                                    {t('ss_mapping_list')}
                                </Typography>
                            </div>
                            <SupersessionMappingsTable
                                mappings={mappings}
                                graph={graph}
                                onPartClick={(part) => setSelectedPart(part)}
                                onEditMapping={onEditMapping}
                                onDeleteMapping={handleDeleteMapping}
                            />
                        </div>

                        {/* RIGHT PANEL: VISUALIZATION */}
                        <div className="xl:w-[450px] 2xl:w-[500px] flex flex-col gap-6 shrink-0">
                            {/* Error/Warning Panel */}
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

                            {/* Chain Visualizer Card */}
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
                                            <p className="text-xs font-medium text-slate-400 max-w-[220px]">
                                                {t('ss_select_desc')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    // OLD STOCK ALERT TAB
                    <div className="flex-1">
                        <OldStockAlert
                            data={data}
                            graph={graph}
                            onPartClick={handleOldStockPartClick}
                        />
                    </div>
                )
            ) : (
                // EMPTY STATE IF NO DATA
                !showUpload && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 m-4 p-12 text-center shadow-sm">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                            <GitMerge size={48} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Chưa có dữ liệu Supersession</h3>
                        <p className="text-slate-500 text-sm font-medium max-w-md mb-8">
                            Vui lòng nhập file CSV chứa thông tin thay thế mã (Mapping) để bắt đầu phân tích chuỗi thay thế và gộp tồn kho.
                        </p>
                        <button
                            onClick={() => setShowUpload(true)}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-3"
                        >
                            <Upload size={18} /> {t('ss_upload_drop')}
                        </button>
                    </div>
                )
            )}
        </div>
    );
};
