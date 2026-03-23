
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { InventoryItem, KittingDefinition, MonthlyData } from './types/inventory';
import { SupersessionMapping, SupersessionGraph } from './utils/supersessionGraph';
import { FileUpload } from './pages/FileUpload';
import { Dashboard } from './pages/Dashboard';
import { SkuDetail } from './pages/SkuDetail';
import { Ordering } from './pages/Ordering';
import { DemandIntelligence } from './pages/DemandIntelligence';
import { RepairPackageOptimizer } from './components/RepairPackageOptimizer';
// import { BackorderProcessing } from './pages/BackorderProcessing';
import { SupersessionManagement } from './pages/SupersessionManagement';
import { SupersessionEditModal } from './components/SupersessionEditModal';
import { SettingsPage, loadAppSettings, saveAppSettings, AppSettings } from './pages/Settings';
import { UpdateLog } from './pages/UpdateLog';
import { InventoryDistribution } from './pages/InventoryDistribution';
import { LanguageProvider, useLanguage } from './utils/i18n';
import { AuthProvider, useAuth } from './utils/authContext';
import { LoginScreen } from './pages/LoginScreen';
import { ApprovalQueue } from './pages/ApprovalQueue';
import { Typography } from './components/Typography';
import { resolveItemProfile } from './utils/inventoryEngine';
import { loadFromCloudStorage, loadLatestMonthlyData } from './utils/supabase';

const AppContent = () => {
    const [data, setData] = useState<InventoryItem[]>([]);
    const [kittingDefs, setKittingDefs] = useState<KittingDefinition[]>([]);
    // Monthly coefficient data (File B) — loaded from Supabase on boot
    const [monthlyData, setMonthlyData] = useState<Record<string, MonthlyData> | null>(null);
    const [monthlyDataDate, setMonthlyDataDate] = useState<string | null>(null);
    const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);

    const [supersessionMappings, setSupersessionMappings] = useState<SupersessionMapping[]>(() => {
        try {
            const saved = localStorage.getItem('supersessionMappings');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load supersession mappings", e);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('supersessionMappings', JSON.stringify(supersessionMappings));
    }, [supersessionMappings]);

    const supersessionGraph = useMemo(() => {
        if (data.length === 0) return new SupersessionGraph([]);
        const itemCodes = data.map(i => i.ItemCode);
        return new SupersessionGraph(supersessionMappings, itemCodes);
    }, [data, supersessionMappings]);

    const { session, isLoading: authLoading, profile, signOut } = useAuth();

    // Keep all hooks before conditional returns (Rules of Hooks)
    const [view, setView] = useState<'upload' | 'dashboard' | 'ordering' | 'backorder' | 'demand-intel' | 'log' | 'kitting' | 'supersession' | 'settings' | 'approval-queue'>('upload');
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [initialParams, setInitialParams] = useState<{ lt: number; sp: number; ssp: number } | undefined>(undefined);
    const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);

    // Tự động tải dữ liệu từ Cloud khi khởi động App
    useEffect(() => {
        const fetchCloudDefaults = async () => {
            try {
                const configData = await loadFromCloudStorage('global_config');
                if (configData) setAppSettings(prev => ({ ...prev, ...configData }));

                const ssData = await loadFromCloudStorage('supersession_draft');
                if (ssData && Array.isArray(ssData)) setSupersessionMappings(ssData);

                const kittingData = await loadFromCloudStorage('kitting_draft');
                if (kittingData && Array.isArray(kittingData)) setKittingDefs(kittingData);

                // Load monthly coefficient data (File B)
                setIsMonthlyLoading(true);
                const monthly = await loadLatestMonthlyData();
                if (monthly?.data) {
                    setMonthlyData(monthly.data);
                    setMonthlyDataDate(monthly.updatedAt.slice(0, 10));
                }
                setIsMonthlyLoading(false);
            } catch (err) {
                console.error("Lỗi khi tải từ Cloud:", err);
            }
        };
        fetchCloudDefaults();
    }, []);

    // Supersession Edit Modal state
    const [isSsModalOpen, setIsSsModalOpen] = useState(false);
    const [editingSsMapping, setEditingSsMapping] = useState<SupersessionMapping | null>(null);

    const { t, language, setLanguage } = useLanguage();

    const [sharedDraft, setSharedDraft] = useState<{
        quantities: Record<string, { air: number, sea: number }>;
        notes: Record<string, string>;
    }>({ quantities: {}, notes: {} });

    useEffect(() => {
        // Auto-repair brand in source profiles if missing
        const needsRepair = appSettings.sourceProfiles.some(p => !p.brand);
        
        // Migration: Ensure OEM and CXD profiles exist for Kia
        const hasOEM = appSettings.sourceProfiles.some(p => p.id === 'OEM');
        const hasCXD = appSettings.sourceProfiles.some(p => p.id === 'CXD');
        const needsProfileMigration = !hasOEM || !hasCXD;

        if (needsRepair || needsProfileMigration) {
            let updatedProfiles = appSettings.sourceProfiles.map(p => ({
                ...p,
                brand: p.brand || (p.id === 'BMWASIA' ? 'BMW' : 'Kia')
            }));

            if (!hasOEM) {
                updatedProfiles.push({ id: 'OEM', brand: 'Kia', name: 'OEM chưa xác định', lt: 90, sp: 30, ssp: 15 });
            }
            if (!hasCXD) {
                updatedProfiles.push({ id: 'CXD', brand: 'Kia', name: 'Chưa xác định', lt: 90, sp: 30, ssp: 15 });
            }

            const repaired: AppSettings = {
                ...appSettings,
                sourceProfiles: updatedProfiles
            };
            setAppSettings(repaired);
            saveAppSettings(repaired);
        }
    }, [appSettings]);

    const pageStates = useRef({
        dashboard: null as any,
        ordering: null as any,
        backorder: null as any,
        demand: null as any,
        kitting: null as any
    });

    useEffect(() => {
        if (pageStates.current.kitting?.kittingDefs) {
            setKittingDefs(pageStates.current.kitting.kittingDefs);
        }
    }, []);

    const handleDataUpload = (uploadedData: InventoryItem[], filename: string, sourceId?: string) => {
        setData(uploadedData);

        let resolvedProfile = appSettings.sourceProfiles.find(p => p.id === sourceId);

        // If no explicit sourceId from upload, use centralized detection from first item
        if (!resolvedProfile && uploadedData.length > 0) {
            resolvedProfile = resolveItemProfile(uploadedData[0], appSettings.sourceProfiles);
        }

        // Fallback to active source or first profile
        const profile = resolvedProfile ?? (appSettings.sourceProfiles.find(p => p.id === appSettings.activeSourceId) ?? appSettings.sourceProfiles[0]);

        const lt = profile?.lt ?? 90;
        const sp = profile?.sp ?? 30;
        const ssp = profile?.ssp ?? 15;
        setInitialParams({ lt, sp, ssp });

        // Reset page states to ensure clean initialization with new data
        pageStates.current = {
            dashboard: null,
            ordering: null,
            backorder: null,
            demand: null,
            kitting: null
        };
        setKittingDefs([]);
        setSharedDraft({ quantities: {}, notes: {} });
        setView('dashboard');
    };

    const handleSelectItem = (item: InventoryItem) => setSelectedItem(item);
    const handleCloseDetail = () => setSelectedItem(null);

    const handleExit = () => {
        setData([]);
        setKittingDefs([]);
        setSelectedItem(null);
        setView('upload');
        setInitialParams(undefined);
    };

    const handleNavigateToPackage = (code: string) => {
        pageStates.current.kitting = {
            ...pageStates.current.kitting,
            viewMode: 'OPTIMIZER',
            searchTerm: code,
            kittingDefs: kittingDefs
        };
        setSelectedItem(null);
        setView('kitting');
    };

    useEffect(() => {
        (window as any).navigateToLog = () => setView('log');
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseDetail(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleSaveSsMapping = (oldPart: string, newPart: string, interchangeable: boolean) => {
        const newMappings = [...supersessionMappings];
        if (editingSsMapping) {
            const index = newMappings.findIndex(m => m.oldPart === editingSsMapping.oldPart && m.newPart === editingSsMapping.newPart);
            if (index > -1) newMappings[index] = { oldPart, newPart, interchangeable };
        } else {
            newMappings.push({ oldPart, newPart, interchangeable });
        }
        setSupersessionMappings(newMappings);
    };

    // Auth guard — after all hooks
    if (authLoading) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <i className="fas fa-circle-notch fa-spin text-blue-400 text-3xl"></i>
        </div>
    );
    if (!session) return <LoginScreen />;

    if (view === 'upload') return (
        <FileUpload
            onData={handleDataUpload}
            monthlyData={monthlyData}
            isMonthlyLoading={isMonthlyLoading}
            monthlyDataDate={monthlyDataDate}
        />
    );

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] relative font-sans text-slate-800 overflow-x-clip">
            <header className="bg-gradient-professional border-b border-white/10 px-3 md:px-5 py-2 sticky top-0 z-40 shadow-glass print:hidden">
                <div className="max-w-[1920px] mx-auto flex justify-between items-center gap-2">
                    <div className="flex items-center space-x-2 md:space-x-3 cursor-pointer group shrink-0" onClick={() => setView('dashboard')}>
                        <div className="bg-white/10 backdrop-blur-md text-white w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center border border-white/20 shadow-lg group-hover:scale-105 transition-transform">
                            <i className="fas fa-cubes text-sm md:text-lg text-blue-400"></i>
                        </div>
                        <div className="hidden lg:block">
                            <Typography variant="label" className="text-white !leading-none group-hover:text-blue-400 transition-colors font-bold uppercase tracking-widest">
                                {t('app_title')}
                            </Typography>
                            <Typography variant="label" className="text-[#F5F5F5] mt-0.5 !text-[9px] block opacity-80 font-medium supply-chain-data">
                                {t('app_subtitle')}
                            </Typography>
                        </div>
                    </div>
                    {/* Monthly Data Status Badge */}
                    <div className="hidden md:flex items-center">
                        {isMonthlyLoading ? (
                            <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 text-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse">
                                <i className="fas fa-sync fa-spin text-blue-400 text-xs" />
                                <span className="hidden xl:inline">Đang đồng bộ tháng...</span>
                                <span className="xl:hidden">...</span>
                            </div>
                        ) : monthlyDataDate ? (
                            <div title={`Dữ liệu tháng: ${monthlyDataDate}`} className="bg-emerald-600/20 border border-emerald-400/30 text-emerald-300 px-2 py-1 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                <i className="fas fa-database"></i>
                                <span className="hidden xl:inline">Dữ liệu Tháng: {monthlyDataDate ? monthlyDataDate.split('-').reverse().join('/') : 'OK'}</span>
                                <span className="xl:hidden">{monthlyDataDate ? monthlyDataDate.split('-').reverse().join('/') : 'OK'}</span>
                            </div>
                        ) : (
                            <div title="Chưa tải dữ liệu tháng — vào Settings → Hệ thống → Upload File Monthly" className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 text-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold cursor-default">
                                <i className="fas fa-triangle-exclamation text-amber-300 text-xs" />
                                <span className="hidden xl:inline">Chưa có d/l tháng</span>
                                <span className="xl:hidden">!</span>
                            </div>
                        )}
                    </div>

                    <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar backdrop-blur-md shadow-inner">
                        {[
                            { id: 'dashboard', label: t('nav_dashboard'), icon: 'fa-chart-simple' },
                            { id: 'ordering', label: t('nav_ordering'), icon: 'fa-cart-shopping' },
                            { id: 'demand-intel', label: t('nav_demand'), icon: 'fa-brain' },
                            { id: 'transfer', label: t('nav_transfer'), icon: 'fa-right-left' },
                            { id: 'kitting', label: t('nav_kitting'), icon: 'fa-boxes-stacked' },
                            { id: 'supersession', label: t('nav_supersession'), icon: 'fa-arrows-rotate' },
                            ...(profile?.role && ['admin', 'approver'].includes(profile.role)
                                ? [{ id: 'approval-queue', label: 'Phê duyệt', icon: 'fa-clipboard-check' }]
                                : []),
                        ].map((nav) => {
                            const isActive = view === nav.id;
                            return (
                                <button
                                    key={nav.id}
                                    onClick={() => setView(nav.id as any)}
                                    className={`
                                        px-2.5 md:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0
                                        ${isActive
                                            ? 'bg-white text-blue-700 shadow-[0_4px_12px_rgba(59,130,246,0.15)] ring-1 ring-blue-50/50 font-bold scale-[1.02]'
                                            : 'text-white/70 hover:bg-white/10 hover:text-white'}
                                    `}
                                >
                                    <i className={`fas ${nav.icon} text-xs ${isActive ? 'text-blue-600' : ''}`}></i>
                                    <Typography variant="label" className={`hidden md:inline text-[10px] xl:text-xs ${isActive ? 'text-blue-700' : 'text-white/60'}`}>
                                        {nav.label}
                                    </Typography>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
                            <button onClick={() => setLanguage('vi')} className={`w-8 h-7 rounded-md transition-all flex items-center justify-center ${language === 'vi' ? 'bg-white shadow-sm' : ''}`}>
                                <Typography variant="label" className={language === 'vi' ? 'text-rose-600' : 'text-slate-400'}>VI</Typography>
                            </button>
                            <button onClick={() => setLanguage('en')} className={`w-8 h-7 rounded-md transition-all flex items-center justify-center ${language === 'en' ? 'bg-white shadow-sm' : ''}`}>
                                <Typography variant="label" className={language === 'en' ? 'text-blue-600' : 'text-slate-400'}>EN</Typography>
                            </button>
                        </div>
                        <button
                            onClick={() => setView('settings')}
                            title="Cấu hình hệ thống"
                            className={`p-2 rounded-lg transition-all ${view === 'settings' ? 'bg-purple-100 text-purple-600' : 'text-slate-400 hover:text-purple-500 hover:bg-purple-50'}`}
                        >
                            <i className="fas fa-sliders text-base md:text-lg" />
                        </button>
                        <button onClick={() => { handleExit(); signOut(); }} title={`${profile?.full_name || 'User'} — Đăng xuất`} className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg"><i className="fas fa-power-off text-base md:text-lg"></i></button>
                    </div>
                </div>
            </header >

            <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 md:p-5 page-content-hd">
                {view === 'dashboard' && <Dashboard data={data} onItemSelect={handleSelectItem} initialParams={initialParams} initialState={pageStates.current.dashboard} onSaveState={(s) => pageStates.current.dashboard = s} draftData={sharedDraft} graph={supersessionGraph} appSettings={appSettings} />}
                {view === 'ordering' && <Ordering data={data} onItemSelect={handleSelectItem} initialParams={initialParams} initialState={pageStates.current.ordering} onSaveState={(s) => pageStates.current.ordering = s} sharedDraft={sharedDraft} onUpdateDraft={setSharedDraft} graph={supersessionGraph} appSettings={appSettings} />}
                { view === 'demand-intel' && <DemandIntelligence data={data} onItemSelect={handleSelectItem} initialState={pageStates.current.demand} onSaveState={(s) => pageStates.current.demand = s} draftData={sharedDraft} onUpdateDraft={setSharedDraft} />}
                { view === 'transfer' && <InventoryDistribution data={data} onItemSelect={handleSelectItem} appSettings={appSettings} />}
                { view === 'log' && <UpdateLog />}
                {view === 'kitting' && <RepairPackageOptimizer data={data} onItemSelect={handleSelectItem} initialState={pageStates.current.kitting} onSaveState={(s) => pageStates.current.kitting = s} draftData={sharedDraft} onUpdateDraft={setSharedDraft} kittingDefs={kittingDefs} onKittingDefsChange={setKittingDefs} />}
                {view === 'supersession' && <SupersessionManagement
                    data={data}
                    mappings={supersessionMappings}
                    onUpdateMappings={setSupersessionMappings}
                    onItemSelect={handleSelectItem}
                    onAddMapping={() => { setEditingSsMapping(null); setIsSsModalOpen(true); }}
                    onEditMapping={(m) => { setEditingSsMapping(m); setIsSsModalOpen(true); }}
                />}
                {view === 'settings' && <SettingsPage settings={appSettings} onSave={(s) => { setAppSettings(s); saveAppSettings(s); }} />}
                {view === 'approval-queue' && <ApprovalQueue />}
            </main>

            <SupersessionEditModal
                isOpen={isSsModalOpen}
                onClose={() => setIsSsModalOpen(false)}
                onSave={handleSaveSsMapping}
                initialData={editingSsMapping}
                existingMappings={supersessionMappings}
                items={data}
            />

            {
                selectedItem && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 print:hidden overflow-hidden">
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={handleCloseDetail}></div>
                        <div className="relative w-full max-w-[1500px] h-[92vh] sm:h-[95vh] bg-[#F8FAFC] rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn border border-white/20">
                            <SkuDetail
                                item={selectedItem}
                                allData={data}
                                onClose={handleCloseDetail}
                                onItemSelect={handleSelectItem}
                                kittingDefs={kittingDefs}
                                onNavigateToPackage={handleNavigateToPackage}
                                graph={supersessionGraph}
                            />
                        </div>
                    </div>
                )
            }
        </div >
    );
};

const App = () => (<AuthProvider><LanguageProvider><AppContent /></LanguageProvider></AuthProvider>);
export default App;
