
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, KittingDefinition, MonthlyData } from './types/inventory';
import { SupersessionMapping, SupersessionGraph } from './utils/supersessionGraph';
import { FileUpload } from './pages/FileUpload';
import { Dashboard } from './pages/Dashboard';
import { SkuDetail } from './pages/SkuDetail';
import { Ordering } from './pages/Ordering';
// DemandIntelligence is now a sub-tab of Dashboard (imported there)
import { RepairPackageOptimizer } from './components/RepairPackageOptimizer';
// import { BackorderProcessing } from './pages/BackorderProcessing';
// SupersessionManagement is now a sub-tab of Dashboard (imported there)
import { SettingsPage, loadAppSettings, saveAppSettings, AppSettings } from './pages/Settings';
import { UpdateLog } from './pages/UpdateLog';
import { InventoryDistribution } from './pages/InventoryDistribution';
import { LanguageProvider, useLanguage } from './utils/i18n';
import { AuthProvider, useAuth } from './utils/authContext';
import { LoginScreen } from './pages/LoginScreen';
import { ResetPasswordScreen } from './pages/ResetPasswordScreen';
import { ApprovalQueue } from './pages/ApprovalQueue';
import { Typography } from './components/Typography';
import { resolveItemProfile } from './utils/inventoryEngine';
import { mergeMonthlyIntoItems } from './utils/csvParser';
import { loadFromCloudStorage, loadLatestMonthlyData } from './utils/supabase';
import { useDevice } from './hooks/useDevice';
import { 
    cacheMonthlyData, 
    getCachedMonthlyData, 
    cacheUploadedData, 
    getCachedUploadedData, 
    clearCachedUploadedData 
} from './utils/db';

const DataSelectionModal = React.lazy(() => import('./components/DataSelectionModal').then(m => ({ default: m.DataSelectionModal })));
const SupersessionEditModal = React.lazy(() => import('./components/SupersessionEditModal').then(m => ({ default: m.SupersessionEditModal })));

// simple error boundary for debugging
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
    constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center font-mono">
                    <h1 className="text-2xl font-bold mb-4 text-rose-500">RUNTIME ERROR DETECTED</h1>
                    <pre className="bg-slate-800 p-4 rounded-xl border border-slate-700 max-w-full overflow-auto text-xs mb-4">
                        {this.state.error?.toString()}
                        {"\n\n"}
                        {this.state.error?.stack}
                    </pre>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 rounded-lg font-bold">RELOAD APP</button>
                </div>
            );
        }
        return this.props.children;
    }
}

const AppContent = () => {
    const { isMobile } = useDevice();
    const [data, setData] = useState<InventoryItem[]>([]);
    const [kittingDefs, setKittingDefs] = useState<KittingDefinition[]>([]);
    // Monthly coefficient data (File B) — loaded from Supabase on boot
    const [monthlyData, setMonthlyData] = useState<Record<string, MonthlyData> | null>(null);
    const [monthlyDataDate, setMonthlyDataDate] = useState<string | null>(null);
    const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);
    const [isDataModalOpen, setIsDataModalOpen] = useState(false);
    
    // Auto-sync: Re-apply monthly coefficients whenever the selection changes
    useEffect(() => {
        if (data.length > 0 && monthlyData) {
            setData(prev => mergeMonthlyIntoItems(prev, monthlyData));
        }
    }, [monthlyData]);

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

    const { session, isLoading: authLoading, profile, signOut, needsPasswordReset } = useAuth();

    // Keep all hooks before conditional returns (Rules of Hooks)
    const [view, setView] = useState<'upload' | 'dashboard' | 'ordering' | 'backorder' | 'transfer' | 'log' | 'kitting' | 'settings' | 'approval-queue'>('upload');
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [initialParams, setInitialParams] = useState<{ lt: number; sp: number; ssp: number } | undefined>(undefined);
    const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);

    // Rule: async-parallel — Parallelize independent cloud fetches
    useEffect(() => {
        const fetchCloudDefaults = async () => {
            try {
                const [configData, ssData, kittingData] = await Promise.all([
                    loadFromCloudStorage('global_config'),
                    loadFromCloudStorage('supersession_draft'),
                    loadFromCloudStorage('kitting_draft')
                ]);

                if (configData) setAppSettings(prev => ({ ...prev, ...configData }));
                if (ssData && Array.isArray(ssData)) setSupersessionMappings(ssData);
                if (kittingData && Array.isArray(kittingData)) setKittingDefs(kittingData);

                // Load monthly coefficient data (File B)
                setIsMonthlyLoading(true);

                // Try loading from cache first
                const cachedMonthly = await getCachedMonthlyData();
                let lastTimestamp: string | undefined = undefined;

                if (cachedMonthly) {
                    setMonthlyData(cachedMonthly.data);
                    setMonthlyDataDate(cachedMonthly.date);
                    lastTimestamp = cachedMonthly.updatedAt;
                    setIsMonthlyLoading(false);
                }

                const monthly = await loadLatestMonthlyData(lastTimestamp);
                
                if (monthly && !monthly.isUpToDate && monthly.data) {
                    const updatedAtDate = monthly.updatedAt.slice(0, 10);
                    // Update state and cache
                    setMonthlyData(monthly.data);
                    setMonthlyDataDate(updatedAtDate);
                    await cacheMonthlyData(monthly.data, updatedAtDate, monthly.updatedAt);
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

    const hasRepairedRef = useRef(false);
    useEffect(() => {
        if (hasRepairedRef.current) return;
        
        // Auto-repair brand in source profiles if missing
        const needsRepair = appSettings.sourceProfiles.some(p => !p.brand);
        
        // Migration: Ensure OEM and CXD profiles exist for Kia
        const hasOEM = appSettings.sourceProfiles.some(p => p.id === 'OEM');
        const hasCXD = appSettings.sourceProfiles.some(p => p.id === 'CXD');
        const needsProfileMigration = !hasOEM || !hasCXD;

        if (needsRepair || needsProfileMigration) {
            console.log("App: Repairing settings profiles...");
            hasRepairedRef.current = true;
            
            // 1. Detect dominant brand from data if available, otherwise default to Kia for legacy
            const dominantBrand = data.length > 0 
                ? (Array.from(new Set(data.map(i => i.BrandName).filter(Boolean))).sort((a,b) => 
                    data.filter(i => i.BrandName === b).length - data.filter(i => i.BrandName === a).length
                  )[0] || 'Kia')
                : 'Kia';

            let updatedProfiles = appSettings.sourceProfiles.map(p => ({
                ...p,
                brand: p.brand || (p.id === 'BMWASIA' ? 'BMW' : dominantBrand as any)
            }));

            // 2. Ensure OEM/CXD exist for the dominant brand if not present
            const hasOEMForBrand = updatedProfiles.some(p => p.id === 'OEM' && p.brand === dominantBrand);
            const hasCXDForBrand = updatedProfiles.some(p => p.id === 'CXD' && p.brand === dominantBrand);

            if (!hasOEMForBrand) {
                const defOEM = { id: 'OEM', brand: dominantBrand as any, name: 'OEM chưa xác định', lt: 90, sp: 30, ssp: 15 };
                updatedProfiles.push(defOEM);
            }
            if (!hasCXDForBrand) {
                const defCXD = { id: 'CXD', brand: dominantBrand as any, name: 'Chưa xác định', lt: 90, sp: 30, ssp: 15 };
                updatedProfiles.push(defCXD);
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
        const params = { lt, sp, ssp };
        setInitialParams(params);

        // Persistent cache for uploaded data
        cacheUploadedData(uploadedData, params);

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
        clearCachedUploadedData(); // Clear cache when explicitly exiting
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

    // Load cached uploaded data on startup
    useEffect(() => {
        const restoreData = async () => {
            const cached = await getCachedUploadedData();
            if (cached && cached.data && cached.data.length > 0) {
                setData(cached.data);
                setInitialParams(cached.params);
                setView('dashboard');
            }
        };
        restoreData();
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
    console.log("App: Auth State - Session:", session ? "YES" : "NO", "Profile:", profile ? profile.role : "NONE");

    if (!session) {
        console.log("App: Redirecting to LoginScreen");
        return <LoginScreen />;
    }
    if (needsPasswordReset) {
        console.log("App: Redirecting to ResetPasswordScreen");
        return <ResetPasswordScreen />;
    }

    if (view === 'upload') return (
        <FileUpload
            onData={handleDataUpload}
            monthlyData={monthlyData}
            isMonthlyLoading={isMonthlyLoading}
            monthlyDataDate={monthlyDataDate}
            sourceProfiles={appSettings.sourceProfiles}
            activeSourceId={appSettings.activeSourceId}
        />
    );

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] relative font-sans text-slate-800 overflow-x-clip">
            <header className="bg-gradient-professional border-b border-white/10 px-3 md:px-5 py-2 fixed top-0 left-0 right-0 z-50 shadow-glass print:hidden h-[56px] md:h-[64px] flex items-center">
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
                    {/* Monthly Data Status Badge & Data Selector */}
                    <div className="hidden md:flex items-center gap-2">
                        {isMonthlyLoading ? (
                            <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 text-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse">
                                <i className="fas fa-sync fa-spin text-blue-400 text-xs" />
                                <span className="hidden xl:inline">Đang đồng bộ tháng...</span>
                                <span className="xl:hidden">...</span>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setIsDataModalOpen(true)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${
                                    monthlyDataDate 
                                        ? 'bg-emerald-600/20 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-600/30' 
                                        : 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
                                }`}
                                title={monthlyDataDate ? `Dữ liệu tháng: ${monthlyDataDate} — Click để chọn bản khác` : "Chưa có dữ liệu tháng — Click để chọn"}
                            >
                                <i className={monthlyDataDate ? "fas fa-database" : "fas fa-triangle-exclamation text-amber-300"}></i>
                                <span className="hidden xl:inline">
                                    {monthlyDataDate ? `Dữ liệu Tháng: ${monthlyDataDate.split('-').reverse().join('/')}` : 'Chưa có d/l tháng'}
                                </span>
                                <span className="xl:hidden">
                                    {monthlyDataDate ? monthlyDataDate.split('-').reverse().join('/') : '!'}
                                </span>
                                <i className="fas fa-chevron-down text-[8px] opacity-50 ml-0.5" />
                            </button>
                        )}
                    </div>

                    <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar backdrop-blur-md shadow-inner">
                        {[
                            { id: 'dashboard', label: t('nav_dashboard'), icon: 'fa-chart-simple' },
                            { id: 'ordering', label: t('nav_ordering'), icon: 'fa-cart-shopping' },
                            { id: 'transfer', label: t('nav_transfer'), icon: 'fa-right-left' },
                            { id: 'kitting', label: t('nav_kitting'), icon: 'fa-boxes-stacked' },
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

                    <div className="flex items-center gap-1.5 md:gap-4 shrink-0">
                        <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10 hidden sm:flex">
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
                            className={`p-2 rounded-lg transition-all ${view === 'settings' ? 'bg-purple-100/20 text-purple-400' : 'text-slate-400 hover:text-purple-400 hover:bg-purple-500/20'}`}
                        >
                            <i className="fas fa-sliders text-base md:text-lg" />
                        </button>
                        <button onClick={() => { handleExit(); signOut(); }} title={`${profile?.full_name || 'User'} — Đăng xuất`} className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg"><i className="fas fa-power-off text-base md:text-lg"></i></button>
                    </div>
                </div>
            </header >

            <main className={`flex-1 max-w-[1920px] w-full mx-auto p-3 md:p-5 page-content-hd mt-[56px] md:mt-[64px] ${isMobile ? 'has-bottom-nav' : ''}`}>
                {view === 'dashboard' && <Dashboard data={data} onItemSelect={handleSelectItem} initialParams={initialParams} initialState={pageStates.current.dashboard} onSaveState={(s) => pageStates.current.dashboard = s} draftData={sharedDraft} graph={supersessionGraph} appSettings={appSettings} onUpdateSettings={(s) => { setAppSettings(s); saveAppSettings(s); }} supersessionProps={{
                    mappings: supersessionMappings,
                    onUpdateMappings: setSupersessionMappings,
                    onAddMapping: () => { setEditingSsMapping(null); setIsSsModalOpen(true); },
                    onEditMapping: (m) => { setEditingSsMapping(m); setIsSsModalOpen(true); },
                }} />}
                {view === 'ordering' && <Ordering data={data} onItemSelect={handleSelectItem} initialParams={initialParams} initialState={pageStates.current.ordering} onSaveState={(s) => pageStates.current.ordering = s} sharedDraft={sharedDraft} onUpdateDraft={setSharedDraft} graph={supersessionGraph} appSettings={appSettings} onUpdateSettings={(s) => { setAppSettings(s); saveAppSettings(s); }} />}
                { view === 'transfer' && <InventoryDistribution data={data} onItemSelect={handleSelectItem} appSettings={appSettings} />}
                { view === 'log' && <UpdateLog />}
                {view === 'kitting' && <RepairPackageOptimizer data={data} onItemSelect={handleSelectItem} initialState={pageStates.current.kitting} onSaveState={(s) => pageStates.current.kitting = s} draftData={sharedDraft} onUpdateDraft={setSharedDraft} kittingDefs={kittingDefs} onKittingDefsChange={setKittingDefs} />}
                {view === 'settings' && <SettingsPage settings={appSettings} onSave={(s) => { setAppSettings(s); saveAppSettings(s); }} />}
                {view === 'approval-queue' && <ApprovalQueue />}
            </main>

            {/* === BOTTOM TAB BAR — Mobile only === */}
            {isMobile && (
                <nav className="bottom-nav-bar fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] flex items-stretch" style={{ height: 56 }}>
                    {[
                        { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-simple' },
                        { id: 'ordering', label: 'Đặt hàng', icon: 'fa-cart-shopping' },
                        { id: 'transfer', label: 'Phân bổ', icon: 'fa-right-left' },
                        { id: 'kitting', label: 'Kitting', icon: 'fa-boxes-stacked' },
                        ...(profile?.role && ['admin', 'approver'].includes(profile.role)
                            ? [{ id: 'approval-queue', label: 'Duyệt', icon: 'fa-clipboard-check' }]
                            : []),
                    ].map((nav) => {
                        const isActive = view === nav.id;
                        return (
                            <button
                                key={nav.id}
                                onClick={() => setView(nav.id as any)}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
                                    isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <i className={`fas ${nav.icon} text-base ${isActive ? 'text-blue-600' : ''}`} />
                                <span className={`text-[9px] font-black uppercase tracking-tight leading-none ${
                                    isActive ? 'text-blue-600' : 'text-slate-400'
                                }`}>{nav.label}</span>
                                {isActive && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-t-full" />}
                            </button>
                        );
                    })}
                </nav>
            )}

            <footer className={`max-w-[1920px] w-full mx-auto px-5 py-4 mt-auto border-t border-slate-200/50 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-xs ${isMobile ? 'mb-20' : ''}`}>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">System Online</span>
                    </div>
                    <span className="opacity-30">|</span>
                    <span className="font-medium">ATP Supply Chain v14.0 — Executive Intelligence</span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex gap-4">
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Documentation</span>
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Support</span>
                        <span className="hover:text-blue-500 cursor-pointer transition-colors">Privacy</span>
                    </div>
                    <span className="opacity-30 hidden md:inline">|</span>
                    <span className="text-slate-500 font-bold">© 2026 Auto Parts Governance</span>
                </div>
            </footer>

            <React.Suspense fallback={null}>
                <DataSelectionModal 
                    isOpen={isDataModalOpen}
                    onClose={() => setIsDataModalOpen(false)}
                    currentMonthlyDate={monthlyDataDate}
                    userRole={profile?.role}
                    userDepartment={profile?.department}
                    onSelectInventory={handleDataUpload}
                    onSelectMonthly={async (monthData, monthDate, updatedAt) => {
                        const mData = monthData as Record<string, MonthlyData>;
                        setMonthlyData(mData);
                        setMonthlyDataDate(monthDate);
                        await cacheMonthlyData(mData, monthDate, updatedAt);
                    }}
                    sourceProfiles={appSettings.sourceProfiles}
                    activeSourceId={appSettings.activeSourceId}
                />

                <SupersessionEditModal
                    isOpen={isSsModalOpen}
                    onClose={() => setIsSsModalOpen(false)}
                    onSave={handleSaveSsMapping}
                    initialData={editingSsMapping}
                    existingMappings={supersessionMappings}
                    items={data}
                />
            </React.Suspense>

            {selectedItem && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 print:hidden overflow-hidden">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={handleCloseDetail}></div>
                    <div className="relative w-full max-w-[1500px] h-[90vh] bg-[#F8FAFC] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn border border-white/20">
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
                </div>,
                document.body
            )}
        </div >
    );
};

const App = () => (
    <ErrorBoundary>
        <AuthProvider>
            <LanguageProvider>
                <AppContent />
            </LanguageProvider>
        </AuthProvider>
    </ErrorBoundary>
);
export default App;
