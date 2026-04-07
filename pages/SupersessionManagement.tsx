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
import { saveToCloudStorage, loadFromCloudStorage, verifyAdminPin } from '../utils/supabase';

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
        const pin = prompt(t('ss_mgmt_enter_pin'));
        if (pin === null) return;
        if (!verifyAdminPin(pin)) {
            alert(t('ss_mgmt_wrong_pin'));
            return;
        }

        setIsSavingCloud(true);
        const success = await saveToCloudStorage('supersession_draft', mappings);
        setIsSavingCloud(false);
        if (success) {
            alert(t('ss_mgmt_cloud_saved'));
        } else {
            alert(t('ss_mgmt_cloud_save_error'));
        }
    };

    const handleLoadFromCloud = async () => {
        setIsLoadingCloud(true);
        const data = await loadFromCloudStorage('supersession_draft');
        setIsLoadingCloud(false);
        if (data && Array.isArray(data)) {
            onUpdateMappings(data);
            alert(t('ss_mgmt_cloud_loaded'));
        } else {
            alert(t('ss_mgmt_cloud_load_error'));
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
        if (window.confirm(`${t('ss_confirm_delete_mapping')} ${mappingToDelete.oldPart} -> ${mappingToDelete.newPart}?`)) {
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
        <div className="flex flex-col h-full space-y-4 pb-24 animate-fadeIn">
            {/* 1. COMPACT HEADER — title + stats + tabs + actions */}
            <div className="bg-gradient-to-r from-purple-800 via-violet-800 to-indigo-900 rounded-2xl text-white relative overflow-hidden border border-white/10 shadow-glass">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40"></div>
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-400/10 rounded-full blur-[60px] pointer-events-none"></div>

                {/* Top row: title + stats + action buttons */}
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

                    {/* Inline stats */}
                    {mappings.length > 0 && (
                        <div className="flex items-center gap-2 mx-4">
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <i className="fas fa-link text-purple-300 text-[10px]"></i>
                                <span className="text-[10px] font-black text-white/50 uppercase">Mapping</span>
                                <span className="text-sm font-black text-white">{stats.totalMappings.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <i className="fas fa-diagram-project text-emerald-300 text-[10px]"></i>
                                <span className="text-[10px] font-black text-white/50 uppercase">{t('ss_mgmt_chain')}</span>
                                <span className="text-sm font-black text-white">{stats.totalChains.toLocaleString()}</span>
                            </div>
                            {stats.errors > 0 && (
                                <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-400/30 px-3 py-1.5 rounded-lg">
                                    <i className="fas fa-triangle-exclamation text-rose-300 text-[10px]"></i>
                                    <span className="text-sm font-black text-rose-300">{stats.errors}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                                <span className="text-[10px] font-black text-white/50 uppercase">Depth</span>
                                <span className="text-sm font-black text-purple-200">{stats.maxDepth}</span>
                            </div>
                        </div>
                    )}

                    {/* Action buttons — compact */}
                    <div className="flex items-center gap-1.5">
                        <button onClick={onAddMapping} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-colors">
                            <Plus size={13} /> {t('ss_mgmt_add')}
                        </button>
                        <button onClick={handleLoadFromCloud} disabled={isLoadingCloud} title={t('ss_mgmt_load_cloud_title')} className="w-8 h-8 flex items-center justify-center bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 rounded-lg transition-all">
                            <i className={`fas ${isLoadingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'} text-xs`} />
                        </button>
                        <button onClick={() => setShowUpload(!showUpload)} title={showUpload ? t('ss_mgmt_cancel') : t('ss_mgmt_import_local')} className={`w-8 h-8 flex items-center justify-center border rounded-lg transition-all ${showUpload ? 'bg-white/20 border-white/30 text-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'}`}>
                            {showUpload ? <X size={13} /> : <Upload size={13} />}
                        </button>
                        {mappings.length > 0 && (<>
                            <button onClick={handleSaveToCloud} disabled={isSavingCloud} title={t('ss_mgmt_save_cloud_title')} className="w-8 h-8 flex items-center justify-center bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 rounded-lg transition-all">
                                <i className={`fas ${isSavingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-xs`} />
                            </button>
                            <button onClick={handleExport} title={t('ss_mgmt_export_local')} className="w-8 h-8 flex items-center justify-center bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 rounded-lg transition-all">
                                <Download size={13} />
                            </button>
                            <button onClick={handleClear} title={t('ss_clear')} className="w-8 h-8 flex items-center justify-center bg-white/10 border border-white/20 text-white/70 hover:bg-rose-500/40 hover:border-rose-400/30 rounded-lg transition-all">
                                <Trash2 size={13} />
                            </button>
                        </>)}
                    </div>
                </div>

                {/* Bottom row: sub-tabs */}
                {mappings.length > 0 && !showUpload && (
                    <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-1">
                        <button
                            onClick={() => setActiveTab('MAPPING')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                ${activeTab === 'MAPPING'
                                    ? 'bg-white/15 text-white border border-white/25 shadow-inner'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                        >
                            <List size={11} className={activeTab === 'MAPPING' ? 'text-purple-300' : ''} /> {t('ss_mgmt_mapping_tab')}
                        </button>
                        <button
                            onClick={() => setActiveTab('OLD_STOCK')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap
                                ${activeTab === 'OLD_STOCK'
                                    ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30 shadow-inner'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}
                        >
                            <History size={11} className={activeTab === 'OLD_STOCK' ? 'text-rose-300' : ''} /> {t('ss_mgmt_old_stock_tab')}
                            {stats.errors > 0 && <span className="bg-rose-500/40 text-rose-200 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5">{stats.errors}</span>}
                        </button>
                    </div>
                )}
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
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">{t('ss_mgmt_no_data')}</h3>
                        <p className="text-slate-500 text-sm font-medium max-w-md mb-8">
                            {t('ss_mgmt_no_data_desc')}
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
