import React, { useEffect, useState, useTransition, useMemo } from 'react';
import type { InventoryItem, KittingDefinition, MonthlyData, ApprovalRequest } from './types/inventory';
import { FileUpload } from './pages/FileUpload';
import { LoginScreen } from './pages/LoginScreen';
import { ResetPasswordScreen } from './pages/ResetPasswordScreen';
import { AuthProvider, useAuth } from './utils/authContext';
import { LanguageProvider, useLanguage } from './utils/i18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { AppModals } from './components/AppModals';
import { resolveItemProfile } from './utils/inventoryEngine';
import { mergeMonthlyIntoItems } from './utils/csvParser';
import { useDevice } from './hooks/useDevice';
import { useInventoryWorker } from './hooks/useInventoryWorker';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useSupersession } from './hooks/useSupersession';
import { useSettingsRepair } from './hooks/useSettingsRepair';
import { cacheUploadedData, getCachedUploadedData, clearCachedUploadedData, cacheMonthlyData } from './utils/db';
import { loadAppSettings, saveAppSettings, type AppSettings } from './utils/appSettings';
import { UpdateLog } from './pages/UpdateLog';

import { FaIcon } from './components/Icon';
// Heavy pages — lazy loaded for code splitting
const Dashboard = React.lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Ordering = React.lazy(() => import('./pages/Ordering').then((m) => ({ default: m.Ordering })));
const RepairPackageOptimizer = React.lazy(() =>
  import('./components/RepairPackageOptimizer').then((m) => ({ default: m.RepairPackageOptimizer }))
);
const InventoryDistribution = React.lazy(() =>
  import('./pages/InventoryDistribution').then((m) => ({ default: m.InventoryDistribution }))
);
const ApprovalQueue = React.lazy(() => import('./pages/ApprovalQueue').then((m) => ({ default: m.ApprovalQueue })));
const BackorderAnalytics = React.lazy(() =>
  import('./pages/BackorderAnalytics').then((m) => ({ default: m.BackorderAnalytics }))
);
const SettingsPage = React.lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

const PageSkeleton = () => (
  <div className="animate-pulse space-y-4 p-6">
    <div className="h-20 bg-slate-200 rounded-2xl" />
    <div className="h-12 bg-slate-100 rounded-xl" />
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 bg-slate-100 rounded-xl" />
      ))}
    </div>
    <div className="h-64 bg-slate-50 rounded-2xl" />
  </div>
);

type View =
  | 'upload'
  | 'dashboard'
  | 'ordering'
  | 'backorder'
  | 'transfer'
  | 'log'
  | 'kitting'
  | 'settings'
  | 'approval-queue';

const AuthSpinner = () => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center">
    <FaIcon className="fas fa-circle-notch fa-spin text-blue-400 text-3xl"  />
  </div>
);

const AppContent = () => {
  const { isMobile } = useDevice();
  const { session, isLoading: authLoading, profile, signOut, needsPasswordReset } = useAuth();
  const { language, setLanguage } = useLanguage();

  const [data, setData] = useState<InventoryItem[]>([]);
  const [kittingDefs, setKittingDefs] = useState<KittingDefinition[]>([]);
  const [monthlyData, setMonthlyData] = useState<Record<string, MonthlyData> | null>(null);
  const [monthlyDataDate, setMonthlyDataDate] = useState<string | null>(null);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [view, setView] = useState<View>('upload');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [initialParams, setInitialParams] = useState<{ lt: number; sp: number; ssp: number } | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [activeApprovalRequest, setActiveApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [sharedDraft, setSharedDraft] = useState<{
    quantities: Record<string, { air: number; sea: number }>;
    notes: Record<string, string>;
  }>({ quantities: {}, notes: {} });
  const [isPending, startTransition] = useTransition();

  const supersession = useSupersession(data);

  const { isMonthlyLoading } = useAppBootstrap({
    setAppSettings,
    setSupersessionMappings: supersession.setMappings,
    setKittingDefs,
    setMonthlyData,
    setMonthlyDataDate,
  });

  useSettingsRepair(appSettings, data, setAppSettings);

  // Re-apply monthly coefficients whenever monthly data updates.
  useEffect(() => {
    if (data.length > 0 && monthlyData) {
      setData((prev) => mergeMonthlyIntoItems(prev, monthlyData));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyData]);

  // Restore previous session on app boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getCachedUploadedData();
      if (cancelled) return;
      if (cached?.data && cached.data.length > 0) {
        setData(cached.data);
        setInitialParams(cached.params);
        setView('dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ESC closes the SkuDetail portal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const workerSettings = useMemo(() => {
    const activeProfile = appSettings.sourceProfiles.find((p) => p.id === appSettings.activeSourceId);
    return {
      snapshotDate: appSettings.snapshotDate || new Date().toISOString().split('T')[0],
      warehouseScope: appSettings.defaultWarehouseScope || 'All',
      costBasis: appSettings.defaultCostBasis || 'PP',
      demandSource: appSettings.defaultDemandSource || '3M',
      params: {
        lt: activeProfile?.lt ?? 90,
        sp: activeProfile?.sp ?? 30,
        ssp: activeProfile?.ssp ?? 15,
      },
      sourceProfiles: appSettings.sourceProfiles || [],
      loisProfiles: appSettings.loisProfiles || [],
      applySeasonality: appSettings.seasonalityTuning?.useSPD ?? false,
      seasonalityTuning: appSettings.seasonalityTuning,
    };
  }, [appSettings]);

  const { enrichedData, isProcessing: isEngineProcessing } = useInventoryWorker(
    data,
    workerSettings,
    sharedDraft.quantities
  );

  const handleDataUpload = (uploadedData: InventoryItem[], _filename: string, sourceId?: string) => {
    const finalData = monthlyData ? mergeMonthlyIntoItems(uploadedData, monthlyData) : uploadedData;
    setData(finalData);

    const fromUpload = sourceId ? appSettings.sourceProfiles.find((p) => p.id === sourceId) : undefined;
    const resolved =
      !fromUpload && uploadedData.length > 0
        ? resolveItemProfile(uploadedData[0], appSettings.sourceProfiles)
        : undefined;
    const profileToUse =
      fromUpload ??
      resolved?.profile ??
      appSettings.sourceProfiles.find((p) => p.id === appSettings.activeSourceId) ??
      appSettings.sourceProfiles[0];

    const params = {
      lt: profileToUse?.lt ?? 90,
      sp: profileToUse?.sp ?? 30,
      ssp: profileToUse?.ssp ?? 15,
    };
    setInitialParams(params);
    cacheUploadedData(uploadedData, params);

    setKittingDefs([]);
    setSharedDraft({ quantities: {}, notes: {} });
    setView('dashboard');
  };

  const handleExit = () => {
    setData([]);
    setKittingDefs([]);
    setSelectedItem(null);
    setView('upload');
    setInitialParams(undefined);
    clearCachedUploadedData();
  };

  const handleNavigateToPackage = (code: string) => {
    setSelectedItem(null);
    // The kitting page reads searchTerm from URL state in a future iteration.
    // For now we simply navigate; package selection is handled inside the page.
    setView('kitting');
    void code;
  };

  const updateSettings = (s: AppSettings) => {
    setAppSettings(s);
    saveAppSettings(s);
  };

  const onSelectView = (v: View) => {
    if (v !== 'ordering') setActiveApprovalRequest(null);
    startTransition(() => setView(v));
  };

  if (authLoading) return <AuthSpinner />;
  if (!session) return <LoginScreen />;
  if (needsPasswordReset) return <ResetPasswordScreen />;

  if (view === 'upload') {
    return (
      <FileUpload
        onData={handleDataUpload}
        monthlyData={monthlyData}
        isMonthlyLoading={isMonthlyLoading}
        monthlyDataDate={monthlyDataDate}
        sourceProfiles={appSettings.sourceProfiles}
        activeSourceId={appSettings.activeSourceId}
      />
    );
  }

  const supersessionProps = {
    mappings: supersession.mappings,
    onUpdateMappings: supersession.setMappings,
    onAddMapping: supersession.openAdd,
    onEditMapping: supersession.openEdit,
  };

  return (
    <AppShell
      view={view}
      isPending={isPending}
      isMobile={isMobile}
      isMonthlyLoading={isMonthlyLoading}
      monthlyDataDate={monthlyDataDate}
      profile={profile}
      language={language}
      setLanguage={setLanguage}
      onSelectView={onSelectView}
      onOpenDataModal={() => setIsDataModalOpen(true)}
      onSignOut={() => {
        handleExit();
        signOut();
      }}
    >
      <React.Suspense fallback={<PageSkeleton />}>
        {view === 'dashboard' && (
          <Dashboard
            data={data}
            enrichedData={enrichedData}
            isEngineProcessing={isEngineProcessing}
            onItemSelect={setSelectedItem}
            initialParams={initialParams}
            draftData={sharedDraft}
            graph={supersession.graph}
            appSettings={appSettings}
            onUpdateSettings={updateSettings}
            supersessionProps={supersessionProps}
          />
        )}
        {view === 'ordering' && (
          <Ordering
            data={data}
            enrichedData={enrichedData}
            isEngineProcessing={isEngineProcessing}
            onItemSelect={setSelectedItem}
            initialParams={initialParams}
            sharedDraft={sharedDraft}
            onUpdateDraft={setSharedDraft}
            graph={supersession.graph}
            appSettings={appSettings}
            onUpdateSettings={updateSettings}
            activeApprovalRequest={activeApprovalRequest}
          />
        )}
        {view === 'backorder' && (
          <BackorderAnalytics
            enrichedData={enrichedData}
            isProcessing={isEngineProcessing}
            onSkuSelect={setSelectedItem}
            graph={supersession.graph}
            sourceProfiles={appSettings.sourceProfiles}
          />
        )}
        {view === 'transfer' && (
          <InventoryDistribution
            data={data}
            enrichedData={enrichedData}
            isEngineProcessing={isEngineProcessing}
            onItemSelect={setSelectedItem}
            appSettings={appSettings}
          />
        )}
        {view === 'log' && <UpdateLog />}
        {view === 'kitting' && (
          <RepairPackageOptimizer
            data={data}
            onItemSelect={setSelectedItem}
            draftData={sharedDraft}
            onUpdateDraft={setSharedDraft}
            kittingDefs={kittingDefs}
            onKittingDefsChange={setKittingDefs}
          />
        )}
        {view === 'settings' && <SettingsPage settings={appSettings} onSave={updateSettings} />}
        {view === 'approval-queue' && (
          <ApprovalQueue
            appSettings={appSettings}
            onLoadRequest={(req) => {
              setSharedDraft({
                quantities: req.snapshot_data?.quantities || {},
                notes: req.snapshot_data?.notes || {},
              });
              setActiveApprovalRequest(req);
              startTransition(() => setView('ordering'));
            }}
          />
        )}
      </React.Suspense>

      <AppModals
        isDataModalOpen={isDataModalOpen}
        onCloseData={() => setIsDataModalOpen(false)}
        monthlyDataDate={monthlyDataDate}
        profile={profile}
        onSelectInventory={handleDataUpload}
        onSelectMonthly={async (mData, monthDate, updatedAt) => {
          setMonthlyData(mData);
          setMonthlyDataDate(monthDate);
          await cacheMonthlyData(mData, monthDate, updatedAt);
        }}
        sourceProfiles={appSettings.sourceProfiles}
        activeSourceId={appSettings.activeSourceId}
        isSsModalOpen={supersession.isModalOpen}
        onCloseSs={supersession.close}
        onSaveSs={supersession.saveMapping}
        editingSs={supersession.editing}
        ssMappings={supersession.mappings}
        data={data}
        selectedItem={selectedItem}
        onCloseDetail={() => setSelectedItem(null)}
        onItemSelect={setSelectedItem}
        kittingDefs={kittingDefs}
        onNavigateToPackage={handleNavigateToPackage}
        graph={supersession.graph}
      />
    </AppShell>
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
