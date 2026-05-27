import React, { useState, useEffect, useCallback, useRef } from 'react';
import { appSettingsSchema } from '../utils/validation';
import { useLanguage } from '../utils/i18n';
import {
    saveToCloudStorage,
    loadFromCloudStorage,
    verifyAdminPin,
    saveMonthlyData,
    loadLatestMonthlyData,
    listMonthlyDataSnapshots,
    deleteMonthlyData,
} from '../utils/supabase';
import { supabase } from '../utils/supabase';
import { parseMonthlyCSV } from '../utils/csvParser';
import { Typography } from '../components/Typography';
import { GlossaryTab } from '../components/GlossaryTab';
import { clearAllAppCache } from '../utils/db';
import { Brand, SourceProfile, AVAILABLE_BRANDS, DEFAULT_SOURCE_PROFILES, LoisProfile } from '../types/inventory';
import { useAuth } from '../utils/authContext';
import { loadAppSettings, saveAppSettings, type AppSettings } from '../utils/appSettings';

import { FaIcon } from '../components/Icon';
import { SectionCard, Field, NumberInput, Select, Toggle, ColCheckbox } from './settings/SettingsUI';
import { UserManagementTab } from './settings/UserManagementTab';
import { SnapshotManagerTab } from './settings/SnapshotManagerTab';
// Re-export so legacy imports of `from './pages/Settings'` keep working until callers migrate.
export { loadAppSettings, saveAppSettings };
export type { AppSettings };

// `AppSettings` and `loadAppSettings` / `saveAppSettings` now live in `utils/appSettings.ts`
// so callers can read/write settings without dragging in the full SettingsPage component.

export const DEFAULT_LOIS_PROFILES: LoisProfile[] = [
    {
        id: '1',
        parentGroup: 'L',
        name: '> 300 cái/năm (Fast)',
        noPlan: false,
        alertType: 'none',
        targetMOS: 3.5,
        targetExcessPct: 5,
    },
    {
        id: '2',
        parentGroup: 'L',
        name: '101 - 300 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 4.0,
        targetExcessPct: 7,
    },
    {
        id: '3',
        parentGroup: 'L',
        name: '61 - 100 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 4.5,
        targetExcessPct: 10,
    },
    {
        id: '4',
        parentGroup: 'L',
        name: '25 - 60 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 5.0,
        targetExcessPct: 12,
    },
    {
        id: '5',
        parentGroup: 'L',
        name: '13 - 24 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 5.5,
        targetExcessPct: 15,
    },
    {
        id: '6',
        parentGroup: 'L',
        name: '7 - 12 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 6.0,
        targetExcessPct: 18,
    },
    {
        id: '7',
        parentGroup: 'L',
        name: '4 - 6 cái/năm',
        noPlan: false,
        alertType: 'none',
        targetMOS: 7.0,
        targetExcessPct: 25,
    },
    {
        id: '8',
        parentGroup: 'L',
        name: '1 - 3 cái/năm (Low)',
        noPlan: false,
        alertType: 'none',
        targetMOS: 8.0,
        targetExcessPct: 30,
    },
    {
        id: 'E',
        parentGroup: 'O',
        name: 'Hàng thay thế cũ (Superseded)',
        noPlan: true,
        alertType: 'warning',
        targetMOS: 1.5,
        targetExcessPct: 10,
    },
    {
        id: 'N',
        parentGroup: 'O',
        name: 'Không bán > 6 tháng',
        noPlan: true,
        alertType: 'warning',
        targetMOS: 1.5,
        targetExcessPct: 10,
    },
    {
        id: 'A',
        parentGroup: 'O',
        name: 'Không bán 12 - 24 tháng',
        noPlan: true,
        alertType: 'critical',
        targetMOS: 1.0,
        targetExcessPct: 10,
    },
    {
        id: 'V',
        parentGroup: 'O',
        name: 'Không bán > 24 tháng (Dead)',
        noPlan: true,
        alertType: 'critical',
        targetMOS: 1.0,
        targetExcessPct: 10,
    },
    {
        id: 'I',
        parentGroup: 'I',
        name: 'Inactive (Ngưng hoạt động)',
        noPlan: true,
        alertType: 'critical',
        targetMOS: 0.5,
        targetExcessPct: 30,
    },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
    sourceProfiles: [...DEFAULT_SOURCE_PROFILES],
    activeSourceId: 'NB',
    defaultWarehouseScope: 'All',
    defaultCostBasis: 'PP',
    currency: 'VND',
    language: 'vi',
    excessThresholdPct: 0,
    criticalMosThreshold: 0.5,
    warningMosThreshold: 1.5,
    exportIncludeComputed: true,
    exportIncludePipeline: false,
    exportIncludeSalesHistory: false,
    exportDecimalPrecision: 2,
    exportDateFormat: 'DD/MM/YYYY',
    exportSeparator: 'comma',
    exportEncoding: 'utf8-bom',
    exportColumns: {
        itemCode: true,
        itemName: true,
        typeCar: true,
        loisGroup: true,
        trendFlag: true,
        status: true,
        backorder: true,
        backorderNB: false,
        backorderBB: false,
        stockNB: true,
        stockBB: true,
        dcNB: false,
        dcBB: false,
        totalInventory: true,
        totalPO: true,
        totalPO_NB: false,
        totalPO_BB: false,
        poThisMonth: true,
        poNextMonth: false,
        debtPriority: true,
        debtStatus: true,
        baseForecast: true,
        forecastNB: false,
        forecastBB: false,
        avgQty3M: true,
        avgQty6M: false,
        avgQty12M: false,
        avgQty24M: false,
        mos: true,
        rop: false,
        stockMax: false,
        safetyStock: false,
        unitCostPP: true,
        unitCostFOB: false,
        stockValue: true,
        excessQty: false,
        excessValue: false,
        dealerInventory: true,
        note: false,
        snp: false,
        sourceId: false,
        brandName: false,
        // Computed fields
        demandRateDaily: false,
        demandMonthly: false,
        available: false,
        netAvailable: false,
        cst: false,
        stockTurnRatio: false,
        fillRate: false,
        capitalEfficiency: false,
        gapOrExcess: false,
        stockoutRiskFlag: false,
        stockoutGapQty: false,
        stockoutGapValue: false,
        priorityBucket: false,
        priorityScore: false,
        // Statistical Intelligence
        cv: false,
        slope: false,
        forecastLinReg: false,
        ssi: false,
        // BO Aging breakdown
        boAgingQty30: false,
        boAgingQty60: false,
        boAgingQty90: false,
        boAgingQtyOver90: false,
        boAgingOldestDays: false,
        boAgingTotalValue: false,
        // Transfer / DRP
        transferNBtoBB: false,
        transferBBtoNB: false,
        suggestedOrderNB: false,
        suggestedOrderBB: false,
        mosNB: false,
        mosBB: false,
        // Suggested BO
        suggestedBO: false,
        isBOCritical: false,
        isStopBiz: false,
        netDemand: false,
        totalSupply: false,
    },
    backorderExportColumns: {
        // SKU-level
        itemCode: true,
        itemName: true,
        sourceId: true,
        brandName: true,
        motherGroup: true,
        typeCar: true,
        loisGroup: true,
        lt: true,
        totalBO: true,
        stockNB: true,
        stockBB: true,
        dcNB: true,
        dcBB: true,
        dealerInventory: true,
        totalPO: true,
        poThisMonth: true,
        poNextMonth: true,
        boAgingOldestDays: true,
        supplierWarning: true,
        worstAnomaly: true,
        maxAnomalyScore: true,
        abnormalOrderCount: true,
        // Extra computed
        mos: false,
        cst: false,
        rop: false,
        stockMax: false,
        safetyStock: false,
        avgQty3M: false,
        avgQty6M: false,
        baseForecast: false,
        unitCostPP: false,
        unitCostFOB: false,
        stockValue: false,
        demandRateDaily: false,
        priorityBucket: false,
        cv: false,
        slope: false,
        ssi: false,
        boAgingQty30: false,
        boAgingQty60: false,
        boAgingQty90: false,
        boAgingQtyOver90: false,
        boAgingTotalValue: false,
        suggestedBO: false,
        netDemand: false,
        totalSupply: false,
        // Order-level (always included per row)
        docNo: true,
        docDate: true,
        orderType: true,
        orderQty: true,
        warehouse: true,
        branchCode: true,
        branchCodeReceipt: true,
        region: true,
        branchName: true,
        showroom: true,
        khoNo: true,
        typeCar_order: true,
        eta: true,
        note: true,
        daysOpen: true,
        daysOverdueLT: true,
        orderAnomaly: true,
        orderScore: true,
        orderReasons: true,
    },
    orderDraftColumns: {
        itemCode: true,
        itemName: true,
        status: false,
        typeCar: false,
        airQty: true,
        seaQty: true,
        totalQty: true,
        totalAmount: true,
        currency: true,
        unitCostPP: false,
        unitCostFOB: false,
        unitCost: true,
        noteOrder: true,
        noteData: false,
        snp: false,
        loisGroup: true,
        trendFlag: true,
        available: true,
        netDemand: false,
        dealerInventory: true,
        incomingMonth: true,
        totalPO: true,
        backorder: true,
        debtPriority: true,
        debtStatus: true,
        suggestQty: false,
        suggestBOQty: false,
        safetyStock: false,
        avgQty3M: true,
        avgQty6M: false,
        avgQty12M: false,
        avgQty24M: false,
        baseForecast: false,
        salesM1: false,
        mos: true,
        currentCst: false,
        cstAfterOrder: true,
        rop: false,
        stockMax: false,
    },
    loisProfiles: [...DEFAULT_LOIS_PROFILES],
    companyName: 'Auto Parts Governance',
    reportTitle: 'Báo cáo Tồn Kho',
    autoSaveState: true,
    snapshotDate: new Date().toISOString().split('T')[0],
    seasonalityTuning: {
        useSPD: true,
        tetWeight: 1.2,
        weatherWeight: 1.0,
    },
};

const STORAGE_KEY = 'atp_app_settings';
// loadAppSettings / saveAppSettings live in utils/appSettings.ts and are re-exported above.

// ─── User Management Tab → pages/settings/UserManagementTab.tsx
// ─── Snapshot Manager Tab → pages/settings/SnapshotManagerTab.tsx
// ─── UI Primitives → pages/settings/SettingsUI.tsx

// (extracted components removed — see imports above)

// ─── Main Page ────────────────────────────────────────────────────────────────
interface SettingsPageProps {
    settings: AppSettings;
    onSave: (s: AppSettings) => void;
}

export const SettingsPage = ({ settings, onSave }: SettingsPageProps) => {
    const { t } = useLanguage();
    const [draft, setDraft] = useState<AppSettings>(settings);
    const [saved, setSaved] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [adminPinInput, setAdminPinInput] = useState('');
    const [activeTab, setActiveTab] = useState<
        'inventory' | 'display' | 'export' | 'system' | 'users' | 'storage' | 'glossary'
    >('inventory');
    const { profile: currentUserProfile } = useAuth();
    const isAdmin = currentUserProfile?.role === 'admin';
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);

    // ── Monthly Data (File B) Upload State ─────────────────────────────────
    const [monthlyUploadStatus, setMonthlyUploadStatus] = useState<
        'idle' | 'parsing' | 'ready' | 'saving' | 'done' | 'error'
    >('idle');
    const [monthlyPreview, setMonthlyPreview] = useState<{
        count: number;
        filename: string;
        data: Record<string, any>;
    } | null>(null);
    const [monthlyHistory, setMonthlyHistory] = useState<{ id: string; updated_at: string }[]>([]);
    const [monthlyCurrentDate, setMonthlyCurrentDate] = useState<string | null>(null);
    const [monthlyClearFirst, setMonthlyClearFirst] = useState(false);
    const monthlyInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Load current monthly data info and history on Settings open
        (async () => {
            const latest = await loadLatestMonthlyData();
            if (latest) setMonthlyCurrentDate(latest.updatedAt.slice(0, 10));
            const hist = await listMonthlyDataSnapshots();
            setMonthlyHistory(hist);
        })();
    }, []);

    const handleMonthlyFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setMonthlyUploadStatus('parsing');
        setMonthlyPreview(null);
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const text = ev.target?.result as string;
                const parsed = parseMonthlyCSV(text);
                const count = Object.keys(parsed).length;
                if (count === 0) {
                    alert('Không tìm thấy dữ liệu trong file. Kiểm tra cột ItemCode.');
                    setMonthlyUploadStatus('error');
                    return;
                }
                setMonthlyPreview({ count, filename: file.name, data: parsed });
                setMonthlyUploadStatus('ready');
            } catch {
                setMonthlyUploadStatus('error');
            }
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    const handleMonthlyUpload = async () => {
        if (!monthlyPreview) return;
        const pin = prompt('Nhập Admin PIN để lưu dữ liệu tháng lên Cloud:\n(Mặc định: 2026)');
        if (pin === null) return;
        if (!(await verifyAdminPin(pin))) {
            alert('❌ Mã phê duyệt không đúng!');
            return;
        }
        setMonthlyUploadStatus('saving');
        const ok = await saveMonthlyData(monthlyPreview.data, { clearFirst: monthlyClearFirst });
        if (ok) {
            const today = new Date().toISOString().slice(0, 10);
            setMonthlyCurrentDate(today);
            const hist = await listMonthlyDataSnapshots();
            setMonthlyHistory(hist);
            setMonthlyPreview(null);
            setMonthlyUploadStatus('done');
            setTimeout(() => setMonthlyUploadStatus('idle'), 2000);
        } else {
            alert('Lỗi khi lưu lên Cloud.');
            setMonthlyUploadStatus('error');
        }
    };

    const handleDeleteMonthly = async (snapshotMonth: string) => {
        if (!confirm(`Xóa toàn bộ dữ liệu tháng ${snapshotMonth} trên Cloud?\nHành động này không thể hoàn tác.`))
            return;
        const pin = prompt('Nhập Admin PIN để xác nhận xóa:');
        if (pin === null) return;
        if (!(await verifyAdminPin(pin))) {
            alert('❌ Mã phê duyệt không đúng!');
            return;
        }

        const result = await deleteMonthlyData(snapshotMonth);
        if (result.success) {
            alert('✅ Đã xóa dữ liệu thành công.');
            const hist = await listMonthlyDataSnapshots();
            setMonthlyHistory(hist);
            // If deleted month was the current one, clear the current date label
            const currentSnapshotMonth = new Date().toISOString().slice(0, 7);
            if (snapshotMonth === currentSnapshotMonth) setMonthlyCurrentDate(null);
        } else {
            alert(`❌ Lỗi khi xóa: ${result.error || 'Không xác định'}`);
        }
    };
    // ───────────────────────────────────────────────────────────────────────

    const handleSaveToCloud = async () => {
        if (!adminPinInput) {
            alert('Vui lòng nhập Mã Phê Duyệt (Mã PIN Admin) để lưu lên Cloud!');
            return;
        }
        if (!(await verifyAdminPin(adminPinInput))) {
            alert('❌ Mã phê duyệt không chính xác! Không thể lưu cấu hình.');
            setAdminPinInput('');
            return;
        }

        setIsSavingCloud(true);
        try {
            const { error } = await supabase.from('cloud_storage').upsert({
                id: 'global_config',
                data: draft,
                updated_at: new Date().toISOString(),
            });

            if (error) throw error;

            alert('✅ Đã lưu cấu hình lên Cloud (Supabase) thành công!');
            handleSave();
        } catch (err: any) {
            alert(
                `Lỗi khi lưu lên Cloud: ${err.message || 'Lỗi không xác định'}. Vui lòng kiểm tra lại thiết lập Database.`,
            );
        } finally {
            setIsSavingCloud(false);
        }
    };

    const handleLoadFromCloud = async () => {
        setIsLoadingCloud(true);
        const data = await loadFromCloudStorage('global_config');
        setIsLoadingCloud(false);
        if (data) {
            setDraft({ ...DEFAULT_APP_SETTINGS, ...data });
            alert('Đã tải cấu hình từ Cloud thành công!');
        } else {
            alert('Không tìm thấy bản lưu cấu hình trên Cloud hoặc có lỗi.');
        }
    };

    const upd = useCallback(<K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
        setDraft(prev => ({ ...prev, [key]: val }));
    }, []);

    const updCol = useCallback((col: keyof AppSettings['exportColumns'], val: boolean) => {
        setDraft(prev => ({ ...prev, exportColumns: { ...prev.exportColumns, [col]: val } }));
    }, []);

    const updOrderCol = useCallback((col: keyof AppSettings['orderDraftColumns'], val: boolean) => {
        setDraft(prev => ({ ...prev, orderDraftColumns: { ...prev.orderDraftColumns, [col]: val } }));
    }, []);

    const updBOCol = useCallback((col: keyof AppSettings['backorderExportColumns'], val: boolean) => {
        setDraft(prev => ({ ...prev, backorderExportColumns: { ...prev.backorderExportColumns, [col]: val } }));
    }, []);

    const handleSave = () => {
        onSave(draft);
        saveAppSettings(draft);
        setSaved(true);
        setShowToast(true);
        setTimeout(() => {
            setSaved(false);
            setShowToast(false);
        }, 3000);
    };

    const handleReset = () => {
        if (window.confirm('Đặt lại tất cả cấu hình về mặc định?')) {
            setDraft(DEFAULT_APP_SETTINGS);
        }
    };

    const handleExportConfig = () => {
        const json = JSON.stringify(draft, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atp-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const raw = JSON.parse(ev.target?.result as string);
                const result = appSettingsSchema.safeParse({ ...DEFAULT_APP_SETTINGS, ...raw });
                if (result.success) {
                    setDraft(result.data as typeof draft);
                    alert('Đã nhập cấu hình thành công!');
                } else {
                    const msgs = result.error.issues
                        .slice(0, 3)
                        .map(i => `${i.path.join('.')}: ${i.message}`)
                        .join('\n');
                    alert(`Cấu hình không hợp lệ:\n${msgs}`);
                }
            } catch {
                alert('File JSON không hợp lệ.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    type TabId = 'inventory' | 'display' | 'export' | 'system' | 'users' | 'storage' | 'glossary';
    const tabs: { id: TabId; label: string; icon: string }[] = [
        { id: 'inventory', label: 'Tham số kho', icon: 'fa-boxes-stacked' },
        { id: 'display', label: 'Hiển thị', icon: 'fa-palette' },
        { id: 'export', label: 'Xuất dữ liệu', icon: 'fa-file-export' },
        { id: 'system', label: 'Hệ thống', icon: 'fa-gear' },
        { id: 'glossary', label: 'Thuật ngữ & Công thức', icon: 'fa-book-open' },
        ...(currentUserProfile?.role === 'admin'
            ? ([
                  { id: 'users', label: 'Người dùng', icon: 'fa-users' },
                  { id: 'storage', label: 'Quản lý Cloud', icon: 'fa-cloud' },
              ] as const)
            : []),
    ];

    const exportColGroups: { label: string; cols: { key: keyof AppSettings['exportColumns']; label: string }[] }[] = [
        {
            label: 'Thông tin cơ bản',
            cols: [
                { key: 'itemCode', label: 'Mã hàng' },
                { key: 'itemName', label: 'Tên hàng' },
                { key: 'typeCar', label: 'TypeCar' },
                { key: 'loisGroup', label: 'LOIS Group' },
                { key: 'trendFlag', label: 'Trend Flag' },
                { key: 'status', label: 'Status' },
                { key: 'note', label: 'Ghi chú' },
                { key: 'snp', label: 'SNP (Pack)' },
                { key: 'sourceId', label: 'Nguồn hàng' },
                { key: 'brandName', label: 'Thương hiệu' },
            ],
        },
        {
            label: 'Tồn kho & Backorder',
            cols: [
                { key: 'stockNB', label: 'Tồn NB' },
                { key: 'stockBB', label: 'Tồn BB' },
                { key: 'dcNB', label: 'DC NB' },
                { key: 'dcBB', label: 'DC BB' },
                { key: 'totalInventory', label: 'Tổng tồn kho' },
                { key: 'dealerInventory', label: 'Tồn đại lý' },
                { key: 'backorder', label: 'Nợ BO (Tổng)' },
                { key: 'backorderNB', label: 'Nợ BO NB' },
                { key: 'backorderBB', label: 'Nợ BO BB' },
                { key: 'netDemand', label: 'Net Demand' },
                { key: 'totalSupply', label: 'Total Supply' },
            ],
        },
        {
            label: 'Pipeline & Đặt hàng',
            cols: [
                { key: 'totalPO', label: 'Tổng PO' },
                { key: 'totalPO_NB', label: 'PO NB' },
                { key: 'totalPO_BB', label: 'PO BB' },
                { key: 'poThisMonth', label: 'PO về tháng này' },
                { key: 'poNextMonth', label: 'PO về tháng sau' },
                { key: 'debtPriority', label: 'Mức ưu tiên' },
                { key: 'debtStatus', label: 'Trạng thái nợ' },
            ],
        },
        {
            label: 'Dự báo & Bán hàng',
            cols: [
                { key: 'baseForecast', label: 'Base Forecast' },
                { key: 'forecastNB', label: 'Forecast NB' },
                { key: 'forecastBB', label: 'Forecast BB' },
                { key: 'avgQty3M', label: 'AVG 3M' },
                { key: 'avgQty6M', label: 'AVG 6M' },
                { key: 'avgQty12M', label: 'AVG 12M' },
                { key: 'avgQty24M', label: 'AVG 24M' },
                { key: 'demandRateDaily', label: 'Demand/ngày' },
                { key: 'demandMonthly', label: 'Demand/tháng' },
            ],
        },
        {
            label: 'Chỉ số kho',
            cols: [
                { key: 'mos', label: 'MOS (tháng)' },
                { key: 'cst', label: 'CST' },
                { key: 'rop', label: 'ROP' },
                { key: 'stockMax', label: 'Stock Max' },
                { key: 'safetyStock', label: 'Safety Stock' },
                { key: 'available', label: 'Available' },
                { key: 'netAvailable', label: 'Net Available' },
                { key: 'excessQty', label: 'SL dư thừa' },
                { key: 'excessValue', label: 'Giá trị dư' },
                { key: 'stockTurnRatio', label: 'Stock Turn Ratio' },
                { key: 'fillRate', label: 'Fill Rate' },
                { key: 'capitalEfficiency', label: 'Capital Efficiency' },
                { key: 'gapOrExcess', label: 'Gap / Excess' },
                { key: 'stockoutRiskFlag', label: 'Stockout Risk' },
                { key: 'stockoutGapQty', label: 'Stockout Gap Qty' },
                { key: 'stockoutGapValue', label: 'Stockout Gap Value' },
                { key: 'priorityBucket', label: 'Priority Bucket' },
                { key: 'priorityScore', label: 'Priority Score' },
                { key: 'isStopBiz', label: 'Stop Biz' },
            ],
        },
        {
            label: 'Giá & Giá trị',
            cols: [
                { key: 'unitCostPP', label: 'Đơn giá PP (VND)' },
                { key: 'unitCostFOB', label: 'Đơn giá FOB (EUR)' },
                { key: 'stockValue', label: 'Giá trị tồn kho' },
            ],
        },
        {
            label: 'Thống kê & Dự báo nâng cao',
            cols: [
                { key: 'cv', label: 'CV (Hệ số biến thiên)' },
                { key: 'slope', label: 'Slope (Xu hướng)' },
                { key: 'forecastLinReg', label: 'Forecast LinReg' },
                { key: 'ssi', label: 'SSI (Mùa vụ)' },
            ],
        },
        {
            label: 'BO Aging',
            cols: [
                { key: 'boAgingQty30', label: 'Nợ ≤30 ngày' },
                { key: 'boAgingQty60', label: 'Nợ 31-60 ngày' },
                { key: 'boAgingQty90', label: 'Nợ 61-90 ngày' },
                { key: 'boAgingQtyOver90', label: 'Nợ >90 ngày' },
                { key: 'boAgingOldestDays', label: 'Nợ lâu nhất (ngày)' },
                { key: 'boAgingTotalValue', label: 'Giá trị nợ tổng' },
            ],
        },
        {
            label: 'Transfer / DRP',
            cols: [
                { key: 'transferNBtoBB', label: 'Transfer NB→BB' },
                { key: 'transferBBtoNB', label: 'Transfer BB→NB' },
                { key: 'suggestedOrderNB', label: 'Gợi ý đặt NB' },
                { key: 'suggestedOrderBB', label: 'Gợi ý đặt BB' },
                { key: 'mosNB', label: 'MOS NB' },
                { key: 'mosBB', label: 'MOS BB' },
                { key: 'suggestedBO', label: 'Suggested BO' },
                { key: 'isBOCritical', label: 'BO Critical' },
            ],
        },
    ];

    return (
        <div className="animate-fadeIn space-y-6 pb-32 relative">
            {showToast && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-fadeInUp">
                    <div className="bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border border-white/10 backdrop-blur-xl">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                            <FaIcon className="fas fa-check-double text-emerald-400 text-lg" />
                        </div>
                        <div>
                            <p className="font-black uppercase tracking-widest text-xs text-emerald-400">Thành công</p>
                            <p className="text-sm font-bold text-slate-100">Cấu hình đã được lưu vào trình duyệt!</p>
                        </div>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <Typography
                            variant="h2"
                            className="text-white tracking-tight uppercase flex items-center gap-3"
                        >
                            <FaIcon className="fas fa-sliders text-purple-400" /> Cấu hình hệ thống
                        </Typography>
                        <Typography variant="label" className="text-slate-400 mt-1 block">
                            Tùy chỉnh thông số & xuất dữ liệu
                        </Typography>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-5 py-2 text-xs lg-btn lg-btn-blue"
                        >
                            <FaIcon className={`fas ${saved ? 'fa-check' : 'fa-floppy-disk'}`} />{' '}
                            {saved ? 'Đã lưu!' : 'Lưu Máy này'}
                        </button>
                        <button
                            onClick={handleLoadFromCloud}
                            disabled={isLoadingCloud}
                            className="flex items-center gap-2 bg-blue-500/30 border border-blue-400/30 text-blue-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-500/50 transition-all shadow-lg shadow-blue-500/20"
                        >
                            <FaIcon
                                className={`fas ${isLoadingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`}
                            />{' '}
                            Tải Cloud
                        </button>
                        <button
                            onClick={handleSaveToCloud}
                            disabled={isSavingCloud}
                            className="flex items-center gap-2 bg-emerald-500/30 border border-emerald-400/30 text-emerald-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-500/50 transition-all shadow-lg shadow-emerald-500/20"
                        >
                            <FaIcon className={`fas ${isSavingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />{' '}
                            Lưu Cloud
                        </button>
                        <button
                            onClick={handleExportConfig}
                            className="flex items-center gap-2 bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-white/20 transition-all"
                        >
                            <FaIcon className="fas fa-file-export" /> Xuất file
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Nav */}
            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shrink-0 ${
                            activeTab === tab.id
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/30 scale-105'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        <FaIcon className={`fas ${tab.icon}`} />
                        <Typography variant="label" className={activeTab === tab.id ? 'text-white' : 'text-slate-500'}>
                            {tab.label}
                        </Typography>
                    </button>
                ))}
            </div>

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
                <div className="space-y-8 animate-fadeIn">
                    <div className="mb-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 text-xs text-blue-700 font-bold shadow-sm">
                        <FaIcon className="fas fa-info-circle mr-2 text-sm" />
                        Khai báo tham số LT/SP/SSP cho từng nguồn hàng theo Thương hiệu. Khi upload file, chọn nguồn
                        tương ứng.
                        <br />
                        <div className="mt-2 flex gap-4 opacity-80">
                            <span>ROP = (LT + SSP) × demand_daily</span>
                            <span>|</span>
                            <span>Stock Max = ROP + SP × demand_daily</span>
                        </div>
                    </div>

                    {AVAILABLE_BRANDS.map(brand => {
                        const brandProfiles = draft.sourceProfiles.filter(p => (p.brand || 'Kia') === brand);
                        const brandColors: Record<Brand, string> = {
                            Kia: 'bg-blue-600',
                            Mazda: 'bg-rose-700',
                            Stellantis: 'bg-indigo-700',
                            BMW: 'bg-slate-900',
                        };

                        return (
                            <div key={brand} className="space-y-4">
                                <SectionCard
                                    title={`Thương hiệu: ${brand.toUpperCase()}`}
                                    icon={brand === 'BMW' ? 'fa-car' : 'fa-bookmark'}
                                >
                                    {brandProfiles.length === 0 ? (
                                        <div className="py-8 text-center text-slate-400 italic text-sm">
                                            Chưa có nguồn hàng cho {brand}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Header row */}
                                            <div className="grid grid-cols-12 gap-2 items-center pb-2 border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <div className="col-span-1 text-center">Chuẩn</div>
                                                <div className="col-span-1 text-center">Ký hiệu</div>
                                                <div className="col-span-3">Tên nguồn hàng</div>
                                                <div className="col-span-3">Nhóm mẹ (Analytics)</div>
                                                <div className="col-span-1 text-center">LT</div>
                                                <div className="col-span-1 text-center">SP</div>
                                                <div className="col-span-1 text-center">SSP</div>
                                                <div className="col-span-1"></div>
                                            </div>
                                            {brandProfiles.map((profile, idx) => (
                                                <div
                                                    key={`${brand}-${idx}`}
                                                    className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                                                >
                                                    {/* Active radio */}
                                                    <div className="col-span-1 flex justify-center">
                                                        <input
                                                            type="radio"
                                                            name="activeSourceId"
                                                            checked={draft.activeSourceId === profile.id}
                                                            onChange={() =>
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    activeSourceId: profile.id,
                                                                }))
                                                            }
                                                            className="w-5 h-5 accent-blue-600 cursor-pointer"
                                                            title="Chọn làm nguồn hàng mặc định"
                                                            aria-label={`Chọn ${profile.id || 'profile ' + idx} làm nguồn hàng mặc định`}
                                                        />
                                                    </div>
                                                    {/* Source ID Input */}
                                                    <div className="col-span-1 flex justify-center">
                                                        <input
                                                            className="w-full text-center px-1 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-black text-blue-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all uppercase tracking-tight shadow-sm"
                                                            value={profile.id}
                                                            onChange={e => {
                                                                const newId = e.target.value
                                                                    .toUpperCase()
                                                                    .replace(/\s/g, '');
                                                                setDraft(prev => {
                                                                    const isCurrentlyActive =
                                                                        prev.activeSourceId === profile.id;
                                                                    return {
                                                                        ...prev,
                                                                        activeSourceId: isCurrentlyActive
                                                                            ? newId
                                                                            : prev.activeSourceId,
                                                                        sourceProfiles: prev.sourceProfiles.map(p =>
                                                                            p.id === profile.id &&
                                                                            p.brand === profile.brand
                                                                                ? { ...p, id: newId }
                                                                                : p,
                                                                        ),
                                                                    };
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Name */}
                                                    <div className="col-span-3">
                                                        <input
                                                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                                                            value={profile.name}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    sourceProfiles: prev.sourceProfiles.map(p =>
                                                                        p.id === profile.id && p.brand === profile.brand
                                                                            ? { ...p, name: v }
                                                                            : p,
                                                                    ),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Mother Group */}
                                                    <div className="col-span-3">
                                                        <input
                                                            className="w-full px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-xl text-[11px] font-black text-purple-700 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-50 transition-all placeholder:text-purple-300"
                                                            value={profile.motherGroup || ''}
                                                            placeholder="VD: HÀN QUỐC"
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    sourceProfiles: prev.sourceProfiles.map(p =>
                                                                        p.id === profile.id && p.brand === profile.brand
                                                                            ? { ...p, motherGroup: v }
                                                                            : p,
                                                                    ),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* LT */}
                                                    <div className="col-span-1 flex justify-center px-1">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={365}
                                                            className="w-full text-center px-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-black text-blue-700 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.lt}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    sourceProfiles: prev.sourceProfiles.map(p =>
                                                                        p.id === profile.id && p.brand === profile.brand
                                                                            ? { ...p, lt: v }
                                                                            : p,
                                                                    ),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* SP */}
                                                    <div className="col-span-1 flex justify-center px-1">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={180}
                                                            className="w-full text-center px-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.sp}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    sourceProfiles: prev.sourceProfiles.map(p =>
                                                                        p.id === profile.id && p.brand === profile.brand
                                                                            ? { ...p, sp: v }
                                                                            : p,
                                                                    ),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* SSP */}
                                                    <div className="col-span-1 flex justify-center px-1">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={90}
                                                            className="w-full text-center px-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.ssp}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({
                                                                    ...prev,
                                                                    sourceProfiles: prev.sourceProfiles.map(p =>
                                                                        p.id === profile.id && p.brand === profile.brand
                                                                            ? { ...p, ssp: v }
                                                                            : p,
                                                                    ),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Delete */}
                                                    <div className="col-span-1 flex justify-center">
                                                        {isAdmin && (
                                                            <button
                                                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100"
                                                                onClick={() =>
                                                                    setDraft(prev => ({
                                                                        ...prev,
                                                                        sourceProfiles: prev.sourceProfiles.filter(
                                                                            p =>
                                                                                !(
                                                                                    p.id === profile.id &&
                                                                                    p.brand === profile.brand
                                                                                ),
                                                                        ),
                                                                        activeSourceId:
                                                                            prev.activeSourceId === profile.id
                                                                                ? (prev.sourceProfiles.find(
                                                                                      x => x.id !== profile.id,
                                                                                  )?.id ?? '')
                                                                                : prev.activeSourceId,
                                                                    }))
                                                                }
                                                                title="Xóa nguồn"
                                                            >
                                                                <FaIcon className="fas fa-trash text-xs" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-black rounded-xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                                        onClick={() => {
                                            const newId = `SRC${Date.now().toString().slice(-4)}`;
                                            setDraft(prev => ({
                                                ...prev,
                                                sourceProfiles: [
                                                    ...prev.sourceProfiles,
                                                    {
                                                        id: newId,
                                                        brand: brand,
                                                        name: 'Nguồn mới',
                                                        lt: 90,
                                                        sp: 30,
                                                        ssp: 15,
                                                    },
                                                ],
                                            }));
                                        }}
                                    >
                                        <FaIcon className="fas fa-plus-circle" /> Thêm nguồn cho {brand}
                                    </button>
                                </SectionCard>
                            </div>
                        );
                    })}

                    {/* Catch-all for any profiles with invalid brand */}
                    {(() => {
                        const extra = draft.sourceProfiles.filter(p => !AVAILABLE_BRANDS.includes(p.brand));
                        if (extra.length === 0) return null;
                        return (
                            <SectionCard title="Nguồn hàng khác" icon="fa-layer-group">
                                <div className="space-y-4">
                                    {extra.map(profile => (
                                        <div
                                            key={profile.id}
                                            className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                                        >
                                            <div className="col-span-1 flex justify-center">
                                                <input
                                                    type="radio"
                                                    checked={draft.activeSourceId === profile.id}
                                                    onChange={() =>
                                                        setDraft(prev => ({ ...prev, activeSourceId: profile.id }))
                                                    }
                                                    className="w-5 h-5 accent-blue-600"
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-black text-2xs text-slate-600">
                                                    {profile.id}
                                                </span>
                                            </div>
                                            <div className="col-span-3">
                                                <select
                                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                                    value={profile.brand}
                                                    onChange={e => {
                                                        const v = e.target.value as Brand;
                                                        setDraft(prev => ({
                                                            ...prev,
                                                            sourceProfiles: prev.sourceProfiles.map(p =>
                                                                p.id === profile.id ? { ...p, brand: v } : p,
                                                            ),
                                                        }));
                                                    }}
                                                >
                                                    <option value="">Chọn Brand</option>
                                                    {AVAILABLE_BRANDS.map(b => (
                                                        <option key={b} value={b}>
                                                            {b}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-6 flex justify-end">
                                                {isAdmin && (
                                                    <button
                                                        onClick={() =>
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                sourceProfiles: prev.sourceProfiles.filter(
                                                                    p => p.id !== profile.id,
                                                                ),
                                                            }))
                                                        }
                                                        className="text-rose-500 p-2"
                                                    >
                                                        <FaIcon className="fas fa-trash" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        );
                    })()}

                    <SectionCard title="Ngưỡng cảnh báo" icon="fa-triangle-exclamation">
                        <Field label="P0 – Critical MOS" sub="MOS dưới ngưỡng này → Ưu tiên P0 (Hết hàng khẩn)">
                            <NumberInput
                                value={draft.criticalMosThreshold}
                                onChange={v => upd('criticalMosThreshold', v)}
                                min={0}
                                max={5}
                                step={0.1}
                                unit="tháng"
                            />
                        </Field>
                        <Field label="P1 – Warning MOS" sub="MOS dưới ngưỡng này → Ưu tiên P1 (Sắp hết)">
                            <NumberInput
                                value={draft.warningMosThreshold}
                                onChange={v => upd('warningMosThreshold', v)}
                                min={0}
                                max={12}
                                step={0.1}
                                unit="tháng"
                            />
                        </Field>
                        <Field label="Ngày ghi nhận tồn kho" sub="Snapshot date dùng để tính hàng về trong tháng">
                            <input
                                type="date"
                                value={draft.snapshotDate}
                                onChange={e => upd('snapshotDate', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Cấu trúc Nhóm LOIS" icon="fa-bullseye">
                        <div className="text-xs text-slate-500 font-bold mb-4">
                            <FaIcon className="fas fa-info-circle mr-1.5 text-blue-400" />
                            Khai báo nhóm Mẹ (L, O, U...) và các nhóm Con. Tích chọn "Chặn đặt" để ngừng lập kế hoạch
                            cho nhóm đó.
                        </div>

                        {(() => {
                            const parentGroups = Array.from(new Set(draft.loisProfiles.map(p => p.parentGroup)));

                            return (
                                <div className="space-y-8">
                                    {parentGroups.map(parentGroup => {
                                        const children = draft.loisProfiles.filter(p => p.parentGroup === parentGroup);
                                        return (
                                            <div key={parentGroup} className="space-y-2">
                                                <div className="flex items-center gap-3 px-1">
                                                    <input
                                                        className="bg-transparent border-b-2 border-slate-200 text-sm font-black text-slate-800 outline-none focus:border-blue-400 transition-all uppercase px-1"
                                                        value={parentGroup}
                                                        onChange={e => {
                                                            const newVal = e.target.value.toUpperCase();
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                loisProfiles: prev.loisProfiles.map(p =>
                                                                    p.parentGroup === parentGroup
                                                                        ? { ...p, parentGroup: newVal }
                                                                        : p,
                                                                ),
                                                            }));
                                                        }}
                                                    />
                                                    <span className="text-3xs font-black text-slate-400 uppercase tracking-widest">
                                                        NHÓM MẸ
                                                    </span>
                                                    <div className="flex-1 border-b border-dashed border-slate-100 h-1"></div>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-slate-400 uppercase tracking-widest font-black text-3xs text-center border-b border-slate-100">
                                                                <th className="text-left py-2">Mã Con</th>
                                                                <th className="text-left py-2">Tên định nghĩa</th>
                                                                <th className="py-2">Chặn đặt</th>
                                                                <th className="py-2">Cảnh báo</th>
                                                                <th className="py-2">Target MOS</th>
                                                                <th className="py-2">Excess %</th>
                                                                <th className="py-2"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {children.map((profile, idx) => (
                                                                <tr
                                                                    key={profile.id}
                                                                    className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                                                                >
                                                                    <td className="py-2 pr-2">
                                                                        <input
                                                                            className="w-16 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400 text-center"
                                                                            value={profile.id}
                                                                            onChange={e => {
                                                                                const v = e.target.value.toUpperCase();
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? { ...p, id: v }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 pr-2">
                                                                        <input
                                                                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:border-blue-400"
                                                                            value={profile.name}
                                                                            onChange={e => {
                                                                                const v = e.target.value;
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? { ...p, name: v }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 text-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={profile.noPlan}
                                                                            onChange={e => {
                                                                                const v = e.target.checked;
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? { ...p, noPlan: v }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                            className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                                                                            aria-label={`Đánh dấu không có kế hoạch cho ${profile.id || 'profile'}`}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 px-1">
                                                                        <select
                                                                            className={`w-full px-1.5 py-1 rounded-lg text-3xs font-black uppercase tracking-tighter border ${
                                                                                profile.alertType === 'critical'
                                                                                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                                                                                    : profile.alertType === 'warning'
                                                                                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                                                                                      : profile.alertType === 'info'
                                                                                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                                                        : 'bg-slate-50 border-slate-200 text-slate-500'
                                                                            }`}
                                                                            value={profile.alertType}
                                                                            onChange={e => {
                                                                                const v = e.target.value as any;
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? { ...p, alertType: v }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                        >
                                                                            <option value="none">None</option>
                                                                            <option value="info">Info</option>
                                                                            <option value="warning">Warning</option>
                                                                            <option value="critical">Critical</option>
                                                                        </select>
                                                                    </td>
                                                                    <td className="py-2 px-1">
                                                                        <input
                                                                            type="number"
                                                                            step={0.5}
                                                                            className="w-20 text-center px-1 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400"
                                                                            value={profile.targetMOS}
                                                                            onChange={e => {
                                                                                const v =
                                                                                    parseFloat(e.target.value) || 0;
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? { ...p, targetMOS: v }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 px-1">
                                                                        <input
                                                                            type="number"
                                                                            step={1}
                                                                            className="w-20 text-center px-1 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400"
                                                                            value={profile.targetExcessPct}
                                                                            onChange={e => {
                                                                                const v =
                                                                                    parseFloat(e.target.value) || 0;
                                                                                setDraft(prev => ({
                                                                                    ...prev,
                                                                                    loisProfiles: prev.loisProfiles.map(
                                                                                        p =>
                                                                                            p.id === profile.id
                                                                                                ? {
                                                                                                      ...p,
                                                                                                      targetExcessPct:
                                                                                                          v,
                                                                                                  }
                                                                                                : p,
                                                                                    ),
                                                                                }));
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 text-right">
                                                                        {isAdmin && (
                                                                            <button
                                                                                onClick={() =>
                                                                                    setDraft(prev => ({
                                                                                        ...prev,
                                                                                        loisProfiles:
                                                                                            prev.loisProfiles.filter(
                                                                                                p =>
                                                                                                    p.id !== profile.id,
                                                                                            ),
                                                                                    }))
                                                                                }
                                                                                className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                                                                                title="Xóa nhóm con"
                                                                            >
                                                                                <FaIcon className="fas fa-trash-alt" />
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <button
                                                    className="mt-2 text-3xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg transition-all"
                                                    onClick={() => {
                                                        const nextId = `${parentGroup}${children.length + 1}`;
                                                        setDraft(prev => ({
                                                            ...prev,
                                                            loisProfiles: [
                                                                ...prev.loisProfiles,
                                                                {
                                                                    id: nextId,
                                                                    parentGroup: parentGroup,
                                                                    name: 'Nhóm mới',
                                                                    noPlan: false,
                                                                    alertType: 'none',
                                                                    targetMOS: 3,
                                                                    targetExcessPct: 10,
                                                                },
                                                            ],
                                                        }));
                                                    }}
                                                >
                                                    <FaIcon className="fas fa-plus" /> THÊM NHÓM CON CHO {parentGroup}
                                                </button>
                                            </div>
                                        );
                                    })}

                                    <button
                                        className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-black hover:bg-slate-50 hover:border-blue-300 hover:text-blue-500 transition-all flex flex-col items-center gap-2 group"
                                        onClick={() => {
                                            const newParent = 'NEW';
                                            setDraft(prev => ({
                                                ...prev,
                                                loisProfiles: [
                                                    ...prev.loisProfiles,
                                                    {
                                                        id: (prev.loisProfiles.length + 1).toString(),
                                                        parentGroup: newParent,
                                                        name: 'Nhóm mới',
                                                        noPlan: false,
                                                        alertType: 'none',
                                                        targetMOS: 3,
                                                        targetExcessPct: 10,
                                                    },
                                                ],
                                            }));
                                        }}
                                    >
                                        <FaIcon className="fas fa-plus-circle text-xl group-hover:scale-110 transition-transform" />
                                        THÊM NHÓM MẸ MỚI
                                    </button>
                                </div>
                            );
                        })()}
                    </SectionCard>
                </div>
            )}

            {/* Display Tab */}
            {activeTab === 'display' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Mặc định hiển thị" icon="fa-eye">
                        <Field label="Kho mặc định" sub="Phạm vi kho áp dụng khi mới mở app">
                            <Select
                                value={draft.defaultWarehouseScope}
                                onChange={v => upd('defaultWarehouseScope', v as any)}
                                options={[
                                    { value: 'All', label: 'Tất cả (NB + BB)' },
                                    { value: 'NB', label: 'Miền Nam (NB)' },
                                    { value: 'BB', label: 'Miền Bắc (BB)' },
                                ]}
                            />
                        </Field>
                        <Field label="Cơ sở giá mặc định" sub="Đơn giá dùng để tính giá trị tồn kho">
                            <Select
                                value={draft.defaultCostBasis}
                                onChange={v => upd('defaultCostBasis', v as any)}
                                options={[
                                    { value: 'PP', label: 'PP (VND - Giá mua nội địa)' },
                                    { value: 'FOB', label: 'FOB (EUR - Giá xuất xưởng)' },
                                ]}
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Giao diện" icon="fa-display">
                        <Field label="Ngôn ngữ mặc định">
                            <Select
                                value={draft.language}
                                onChange={v => upd('language', v as any)}
                                options={[
                                    { value: 'vi', label: '🇻🇳 Tiếng Việt' },
                                    { value: 'en', label: '🇬🇧 English' },
                                ]}
                            />
                        </Field>
                        <Field label="Đơn vị tiền tệ hiển thị">
                            <Select
                                value={draft.currency}
                                onChange={v => upd('currency', v as any)}
                                options={[
                                    { value: 'VND', label: 'VND (₫ – Việt Nam Đồng)' },
                                    { value: 'EUR', label: 'EUR (€ – Euro)' },
                                ]}
                            />
                        </Field>
                        <Field label="Tự động lưu trạng thái" sub="Lưu filter, cài đặt khi chuyển tab">
                            <Toggle
                                value={draft.autoSaveState}
                                onChange={v => upd('autoSaveState', v)}
                                label="Bật lưu tự động"
                            />
                        </Field>
                    </SectionCard>
                </div>
            )}

            {/* Export Tab */}
            {activeTab === 'export' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Cấu hình file xuất" icon="fa-file-csv">
                        <Field label="Ký tự phân cách" sub="Dấu phân cách giữa các cột trong file CSV">
                            <Select
                                value={draft.exportSeparator}
                                onChange={v => upd('exportSeparator', v as any)}
                                options={[
                                    { value: 'comma', label: 'Dấu phẩy ( , )' },
                                    { value: 'semicolon', label: 'Dấu chấm phẩy ( ; ) – Excel VN' },
                                    { value: 'tab', label: 'Tab' },
                                ]}
                            />
                        </Field>
                        <Field label="Encoding" sub="Mã hóa ký tự file CSV">
                            <Select
                                value={draft.exportEncoding}
                                onChange={v => upd('exportEncoding', v as any)}
                                options={[
                                    {
                                        value: 'utf8-bom',
                                        label: 'UTF-8 với BOM (khuyến nghị – Excel đọc được dấu tiếng Việt)',
                                    },
                                    { value: 'utf8', label: 'UTF-8 thuần' },
                                ]}
                            />
                        </Field>
                        <Field label="Định dạng ngày" sub="Định dạng ngày tháng trong file xuất">
                            <Select
                                value={draft.exportDateFormat}
                                onChange={v => upd('exportDateFormat', v as any)}
                                options={[
                                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (Việt Nam)' },
                                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO 8601)' },
                                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
                                ]}
                            />
                        </Field>
                        <Field label="Số chữ số thập phân" sub="Độ chính xác của các số thực trong file xuất">
                            <NumberInput
                                value={draft.exportDecimalPrecision}
                                onChange={v => upd('exportDecimalPrecision', v)}
                                min={0}
                                max={6}
                                unit="chữ số"
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Nội dung xuất" icon="fa-table-columns">
                        <Field
                            label="Bao gồm dữ liệu tính toán"
                            sub="MOS, ROP, Stock Max, Priority Score... (computed fields)"
                        >
                            <Toggle
                                value={draft.exportIncludeComputed}
                                onChange={v => upd('exportIncludeComputed', v)}
                                label={draft.exportIncludeComputed ? 'Có' : 'Không'}
                            />
                        </Field>
                        <Field label="Bao gồm Pipeline (PO)" sub="Danh sách PO theo từng tháng">
                            <Toggle
                                value={draft.exportIncludePipeline}
                                onChange={v => upd('exportIncludePipeline', v)}
                                label={draft.exportIncludePipeline ? 'Có' : 'Không'}
                            />
                        </Field>
                        <Field label="Bao gồm lịch sử bán hàng" sub="12 tháng SalesHistory (M0...M11)">
                            <Toggle
                                value={draft.exportIncludeSalesHistory}
                                onChange={v => upd('exportIncludeSalesHistory', v)}
                                label={draft.exportIncludeSalesHistory ? 'Có' : 'Không'}
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Cột xuất dữ liệu tồn kho" icon="fa-table-list">
                        <div className="mb-4 flex items-center gap-3">
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        exportColumns: Object.fromEntries(
                                            Object.keys(prev.exportColumns).map(k => [k, true]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 text-xs lg-btn lg-btn-sm lg-btn-blue"
                            >
                                <FaIcon className="fas fa-check-double mr-1" /> Chọn tất cả
                            </button>
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        exportColumns: Object.fromEntries(
                                            Object.keys(prev.exportColumns).map(k => [k, false]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                            >
                                <FaIcon className="fas fa-xmark mr-1" /> Bỏ tất cả
                            </button>
                            <span className="text-xs font-bold text-slate-400">
                                {Object.values(draft.exportColumns).filter(Boolean).length}/
                                {Object.keys(draft.exportColumns).length} cột được chọn
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {exportColGroups.map(group => (
                                <div key={group.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 pb-2 border-b border-slate-200">
                                        {group.label}
                                    </div>
                                    {group.cols.map((col, ci) => (
                                        <ColCheckbox
                                            key={ci}
                                            label={col.label}
                                            value={draft.exportColumns[col.key]}
                                            onChange={v => updCol(col.key, v)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Cột xuất Dự thảo Đặt hàng" icon="fa-cart-shopping">
                        <div className="mb-3 text-xs text-slate-500 font-bold flex items-center gap-2">
                            <FaIcon className="fas fa-info-circle text-blue-500" />
                            Chọn các cột sẽ có mặt trong file CSV khi xuất Dự thảo từ trang{' '}
                            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                Đặt hàng
                            </span>
                        </div>
                        <div className="mb-4 flex items-center gap-3">
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        orderDraftColumns: Object.fromEntries(
                                            Object.keys(prev.orderDraftColumns).map(k => [k, true]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 text-xs lg-btn lg-btn-sm lg-btn-blue"
                            >
                                <FaIcon className="fas fa-check-double mr-1" /> Chọn tất cả
                            </button>
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        orderDraftColumns: Object.fromEntries(
                                            Object.keys(prev.orderDraftColumns).map(k => [k, false]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                            >
                                <FaIcon className="fas fa-xmark mr-1" /> Bỏ tất cả
                            </button>
                            <span className="text-xs font-bold text-slate-400">
                                {Object.values(draft.orderDraftColumns).filter(Boolean).length}/
                                {Object.keys(draft.orderDraftColumns).length} cột được chọn
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(
                                [
                                    {
                                        label: 'Mã & Tên hàng',
                                        cols: [
                                            { key: 'itemCode', label: 'Mã hàng' },
                                            { key: 'itemName', label: 'Tên hàng' },
                                            { key: 'status', label: 'Trạng thái' },
                                            { key: 'typeCar', label: 'TypeCar' },
                                            { key: 'loisGroup', label: 'LOIS Group' },
                                            { key: 'trendFlag', label: 'Trend Flag' },
                                            { key: 'snp', label: 'SNP (Pack size)' },
                                        ],
                                    },
                                    {
                                        label: 'Số lượng & Giá trị đặt',
                                        cols: [
                                            { key: 'airQty', label: 'SL Đặt AIR' },
                                            { key: 'seaQty', label: 'SL Đặt SEA' },
                                            { key: 'totalQty', label: 'Tổng SL Đặt' },
                                            { key: 'totalAmount', label: 'Thành tiền' },
                                            { key: 'currency', label: 'Tiền tệ' },
                                            { key: 'unitCost', label: 'Đơn giá (theo CB)' },
                                            { key: 'unitCostPP', label: 'Đơn giá PP (VND)' },
                                            { key: 'unitCostFOB', label: 'Đơn giá FOB (EUR)' },
                                        ],
                                    },
                                    {
                                        label: 'Gợi ý & Ghi chú',
                                        cols: [
                                            { key: 'suggestQty', label: 'SL Gợi ý (SEA)' },
                                            { key: 'suggestBOQty', label: 'SL Gợi ý (BO/AIR)' },
                                            { key: 'noteOrder', label: 'Ghi chú đặt hàng' },
                                            { key: 'noteData', label: 'Ghi chú dữ liệu' },
                                        ],
                                    },
                                    {
                                        label: 'Tồn kho & Pipeline',
                                        cols: [
                                            { key: 'available', label: 'Tồn kho (Available)' },
                                            { key: 'netDemand', label: 'Tồn ròng (Net Demand)' },
                                            { key: 'dealerInventory', label: 'Tồn đại lý' },
                                            { key: 'safetyStock', label: 'Safety Stock' },
                                            { key: 'incomingMonth', label: 'Hàng về tháng này' },
                                            { key: 'totalPO', label: 'Tổng PO' },
                                            { key: 'backorder', label: 'Nợ đơn (BO)' },
                                            { key: 'debtPriority', label: 'Mức ưu tiên (P1-P5)' },
                                            { key: 'debtStatus', label: 'Trạng thái nợ' },
                                        ],
                                    },
                                    {
                                        label: 'Dự báo & Bán hàng',
                                        cols: [
                                            { key: 'salesM1', label: 'Bán tháng gần nhất (M1)' },
                                            { key: 'avgQty3M', label: 'AVG 3M' },
                                            { key: 'avgQty6M', label: 'AVG 6M' },
                                            { key: 'avgQty12M', label: 'AVG 12M' },
                                            { key: 'avgQty24M', label: 'AVG 24M' },
                                            { key: 'baseForecast', label: 'Base Forecast' },
                                        ],
                                    },
                                    {
                                        label: 'Chỉ số tồn kho',
                                        cols: [
                                            { key: 'mos', label: 'MOS (hiện tại)' },
                                            { key: 'currentCst', label: 'CST Hiện tại' },
                                            { key: 'cstAfterOrder', label: 'CST Sau Đặt' },
                                            { key: 'rop', label: 'ROP' },
                                            { key: 'stockMax', label: 'Stock Max' },
                                        ],
                                    },
                                ] as {
                                    label: string;
                                    cols: { key: keyof AppSettings['orderDraftColumns']; label: string }[];
                                }[]
                            ).map(group => (
                                <div key={group.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 pb-2 border-b border-slate-200">
                                        {group.label}
                                    </div>
                                    {group.cols.map((col, ci) => (
                                        <ColCheckbox
                                            key={ci}
                                            label={col.label}
                                            value={draft.orderDraftColumns[col.key]}
                                            onChange={v => updOrderCol(col.key, v)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Cột xuất Hàng nợ (Backorder)" icon="fa-triangle-exclamation">
                        <div className="mb-3 text-xs text-slate-500 font-bold flex items-center gap-2">
                            <FaIcon className="fas fa-info-circle text-orange-500" />
                            Chọn các cột sẽ có mặt trong file Excel khi xuất từ trang{' '}
                            <span className="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                                Hàng nợ
                            </span>
                        </div>
                        <div className="mb-4 flex items-center gap-3">
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        backorderExportColumns: Object.fromEntries(
                                            Object.keys(prev.backorderExportColumns).map(k => [k, true]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 text-xs lg-btn lg-btn-sm lg-btn-blue"
                            >
                                <FaIcon className="fas fa-check-double mr-1" /> Chọn tất cả
                            </button>
                            <button
                                onClick={() =>
                                    setDraft(prev => ({
                                        ...prev,
                                        backorderExportColumns: Object.fromEntries(
                                            Object.keys(prev.backorderExportColumns).map(k => [k, false]),
                                        ) as any,
                                    }))
                                }
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                            >
                                <FaIcon className="fas fa-xmark mr-1" /> Bỏ tất cả
                            </button>
                            <span className="text-xs font-bold text-slate-400">
                                {Object.values(draft.backorderExportColumns).filter(Boolean).length}/
                                {Object.keys(draft.backorderExportColumns).length} cột được chọn
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(
                                [
                                    {
                                        label: 'SKU — Cơ bản',
                                        cols: [
                                            { key: 'itemCode', label: 'Mã hàng' },
                                            { key: 'itemName', label: 'Tên hàng' },
                                            { key: 'sourceId', label: 'Nguồn' },
                                            { key: 'brandName', label: 'Thương hiệu' },
                                            { key: 'motherGroup', label: 'Nhóm mẹ' },
                                            { key: 'typeCar', label: 'Loại xe' },
                                            { key: 'loisGroup', label: 'LOIS' },
                                            { key: 'lt', label: 'LT (ngày)' },
                                        ],
                                    },
                                    {
                                        label: 'SKU — Tồn & Nợ',
                                        cols: [
                                            { key: 'totalBO', label: 'Tổng nợ' },
                                            { key: 'stockNB', label: 'Tồn NB' },
                                            { key: 'stockBB', label: 'Tồn BB' },
                                            { key: 'dcNB', label: 'DC NB' },
                                            { key: 'dcBB', label: 'DC BB' },
                                            { key: 'dealerInventory', label: 'Tồn đại lý' },
                                            { key: 'totalPO', label: 'Tổng PO' },
                                            { key: 'poThisMonth', label: 'PO tháng này' },
                                            { key: 'poNextMonth', label: 'PO tháng sau' },
                                            { key: 'netDemand', label: 'Net Demand' },
                                            { key: 'totalSupply', label: 'Total Supply' },
                                        ],
                                    },
                                    {
                                        label: 'SKU — Bất thường & Aging',
                                        cols: [
                                            { key: 'boAgingOldestDays', label: 'Nợ lâu nhất' },
                                            { key: 'supplierWarning', label: 'Cảnh báo NCC' },
                                            { key: 'worstAnomaly', label: 'Bất thường nhất' },
                                            { key: 'maxAnomalyScore', label: 'Score tối đa' },
                                            { key: 'abnormalOrderCount', label: 'SL đơn bất thường' },
                                            { key: 'boAgingQty30', label: 'Nợ ≤30 ngày' },
                                            { key: 'boAgingQty60', label: 'Nợ 31-60 ngày' },
                                            { key: 'boAgingQty90', label: 'Nợ 61-90 ngày' },
                                            { key: 'boAgingQtyOver90', label: 'Nợ >90 ngày' },
                                            { key: 'boAgingTotalValue', label: 'Giá trị nợ tổng' },
                                        ],
                                    },
                                    {
                                        label: 'SKU — Chỉ số nâng cao',
                                        cols: [
                                            { key: 'mos', label: 'MOS' },
                                            { key: 'cst', label: 'CST' },
                                            { key: 'rop', label: 'ROP' },
                                            { key: 'stockMax', label: 'Stock Max' },
                                            { key: 'safetyStock', label: 'Safety Stock' },
                                            { key: 'avgQty3M', label: 'AVG 3M' },
                                            { key: 'avgQty6M', label: 'AVG 6M' },
                                            { key: 'baseForecast', label: 'Base Forecast' },
                                            { key: 'unitCostPP', label: 'Đơn giá PP' },
                                            { key: 'unitCostFOB', label: 'Đơn giá FOB' },
                                            { key: 'stockValue', label: 'Giá trị tồn' },
                                            { key: 'demandRateDaily', label: 'Demand/ngày' },
                                            { key: 'priorityBucket', label: 'Priority' },
                                            { key: 'cv', label: 'CV' },
                                            { key: 'slope', label: 'Slope' },
                                            { key: 'ssi', label: 'SSI' },
                                            { key: 'suggestedBO', label: 'Suggested BO' },
                                        ],
                                    },
                                    {
                                        label: 'Đơn hàng — Chi tiết',
                                        cols: [
                                            { key: 'docNo', label: 'Số đơn (DocNo)' },
                                            { key: 'docDate', label: 'Ngày đặt' },
                                            { key: 'orderType', label: 'Loại đơn' },
                                            { key: 'orderQty', label: 'SL đơn' },
                                            { key: 'warehouse', label: 'Kho' },
                                            { key: 'branchCode', label: 'BranchCode' },
                                            { key: 'branchCodeReceipt', label: 'BranchCodeReceipt' },
                                            { key: 'region', label: 'Khu vực NB/BB' },
                                            { key: 'branchName', label: 'Chi nhánh' },
                                            { key: 'showroom', label: 'Showroom' },
                                            { key: 'khoNo', label: 'KhoNo' },
                                            { key: 'typeCar_order', label: 'Loại xe đơn' },
                                            { key: 'eta', label: 'ETA' },
                                            { key: 'note', label: 'Ghi chú' },
                                        ],
                                    },
                                    {
                                        label: 'Đơn hàng — Phân tích',
                                        cols: [
                                            { key: 'daysOpen', label: 'Tuổi đơn (ngày)' },
                                            { key: 'daysOverdueLT', label: 'Trễ so LT (ngày)' },
                                            { key: 'orderAnomaly', label: 'Mức bất thường' },
                                            { key: 'orderScore', label: 'Score đơn' },
                                            { key: 'orderReasons', label: 'Lý do' },
                                        ],
                                    },
                                ] as {
                                    label: string;
                                    cols: { key: keyof AppSettings['backorderExportColumns']; label: string }[];
                                }[]
                            ).map(group => (
                                <div key={group.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 pb-2 border-b border-slate-200">
                                        {group.label}
                                    </div>
                                    {group.cols.map((col, ci) => (
                                        <ColCheckbox
                                            key={ci}
                                            label={col.label}
                                            value={draft.backorderExportColumns[col.key]}
                                            onChange={v => updBOCol(col.key, v)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* System Tab */}
            {activeTab === 'system' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Thông tin báo cáo" icon="fa-building">
                        <Field label="Tên công ty" sub="Hiển thị trên báo cáo in">
                            <input
                                type="text"
                                value={draft.companyName}
                                onChange={e => upd('companyName', e.target.value)}
                                className="w-full max-w-sm px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                        <Field label="Tiêu đề báo cáo" sub="Tiêu đề in trên header báo cáo PDF">
                            <input
                                type="text"
                                value={draft.reportTitle}
                                onChange={e => upd('reportTitle', e.target.value)}
                                className="w-full max-w-sm px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Quản lý cấu hình" icon="fa-database">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="font-black text-slate-800 text-sm uppercase mb-1">Dữ liệu Local</div>
                                <div className="text-xs text-slate-500 mb-3">
                                    Tải về cấu hình hiện tại để lưu trữ cục bộ
                                </div>
                                <button
                                    onClick={handleExportConfig}
                                    className="flex items-center gap-2 px-4 py-2 text-xs lg-btn lg-btn-blue"
                                >
                                    <FaIcon className="fas fa-download" /> Tải cấu hình (.json)
                                </button>
                            </div>
                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                                <div className="font-black text-rose-800 text-sm uppercase mb-1">Đặt lại mặc định</div>
                                <div className="text-xs text-rose-600 mb-3">
                                    Xóa toàn bộ cài đặt đã chỉnh, khôi phục về giá trị gốc
                                </div>
                                <button
                                    onClick={handleReset}
                                    disabled={!isAdmin}
                                    className="flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-40 lg-btn lg-btn-danger"
                                >
                                    <FaIcon className="fas fa-rotate-left" /> Reset tất cả
                                </button>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                                <div className="font-black text-emerald-800 text-sm uppercase mb-1">Xóa bộ nhớ App</div>
                                <div className="text-xs text-emerald-700 mb-3">
                                    Xóa toàn bộ cache (IndexedDB + LocalStorage) – không xóa cài đặt
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!confirm('Xác nhận xóa toàn bộ dữ liệu cache? App sẽ tự khởi động lại.'))
                                            return;
                                        const keys = Object.keys(localStorage).filter(
                                            k => k !== STORAGE_KEY && k !== 'supersessionMappings',
                                        );
                                        keys.forEach(k => localStorage.removeItem(k));
                                        await clearAllAppCache();
                                        alert('Đã xóa toàn bộ cache. Trang sẽ tải lại ngay bây giờ.');
                                        window.location.reload();
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 text-xs lg-btn lg-btn-primary"
                                >
                                    <FaIcon className="fas fa-broom" /> Dọn cache
                                </button>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Monthly Data (File B) Upload */}
                    <SectionCard title="Dữ liệu tháng (File B – Monthly)" icon="fa-calendar-days">
                        <div className="space-y-4">
                            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 font-bold">
                                <FaIcon className="fas fa-info-circle mr-2" />
                                File B chứa: LOIS, AvgQty, Forecast, SalesHistory (M0–M11), hệ số thống kê...
                                <br />
                                Sau khi upload, app sẽ <strong>tự tải về khi mở</strong> và merge vào file hàng ngày
                                theo ItemCode.
                                <br />
                                <span className="text-blue-500 mt-1 block">
                                    ⚙ SafetyStock / ROP / MaxInventory được tính lại theo công thức LT Setting — không
                                    lấy thẳng từ file.
                                </span>
                            </div>

                            {/* Current status */}
                            <div className="flex items-center gap-3">
                                <div
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                                        monthlyCurrentDate
                                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                            : 'bg-amber-50 border border-amber-200 text-amber-700'
                                    }`}
                                >
                                    <FaIcon
                                        className={`fas ${monthlyCurrentDate ? 'fa-calendar-check text-emerald-500' : 'fa-triangle-exclamation text-amber-500'}`}
                                    />
                                    {monthlyCurrentDate
                                        ? `Bản hiện tại: ${monthlyCurrentDate}`
                                        : 'Chưa có dữ liệu tháng trên Cloud'}
                                </div>
                            </div>

                            {/* Options */}
                            {monthlyPreview && (
                                <div className="flex items-center gap-2 px-1">
                                    <Toggle
                                        value={monthlyClearFirst}
                                        onChange={setMonthlyClearFirst}
                                        label="Xóa sạch dữ liệu tháng hiện tại trước khi đẩy lên (Khuyên dùng)"
                                    />
                                </div>
                            )}

                            {/* File Picker */}
                            <div className="flex items-center gap-3">
                                <label className="flex-1 flex items-center gap-3 h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl px-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group">
                                    <FaIcon className="fas fa-file-csv text-slate-400 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors truncate">
                                        {monthlyUploadStatus === 'parsing'
                                            ? 'Đang đọc file...'
                                            : monthlyPreview
                                              ? `${monthlyPreview.filename} (${monthlyPreview.count.toLocaleString()} mã)`
                                              : 'Chọn File Monthly CSV...'}
                                    </span>
                                    <input
                                        ref={monthlyInputRef}
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={handleMonthlyFilePick}
                                    />
                                </label>
                                <button
                                    onClick={handleMonthlyUpload}
                                    disabled={!monthlyPreview || monthlyUploadStatus === 'saving'}
                                    className={`h-14 px-5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${
                                        !monthlyPreview || monthlyUploadStatus === 'saving'
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            : monthlyUploadStatus === 'done'
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200'
                                    }`}
                                >
                                    <FaIcon
                                        className={`fas ${
                                            monthlyUploadStatus === 'saving'
                                                ? 'fa-spinner fa-spin'
                                                : monthlyUploadStatus === 'done'
                                                  ? 'fa-check'
                                                  : 'fa-cloud-arrow-up'
                                        }`}
                                    />
                                    {monthlyUploadStatus === 'saving'
                                        ? 'Đang lưu...'
                                        : monthlyUploadStatus === 'done'
                                          ? 'Xong!'
                                          : 'Upload'}
                                </button>
                            </div>

                            {/* History (Planners can see, but not delete here) */}
                            {monthlyHistory.length > 0 && (
                                <div>
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                                        Lịch sử upload
                                    </div>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {monthlyHistory.map(h => {
                                            const vName = h.id.replace('monthly_data_', '');
                                            return (
                                                <div
                                                    key={h.id}
                                                    className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-xs"
                                                >
                                                    <FaIcon className="fas fa-clock text-slate-400" />
                                                    <span className="font-bold text-slate-600">{vName}</span>
                                                    <span className="text-slate-400 ml-auto">
                                                        {new Date(h.updated_at).toLocaleString('vi-VN')}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title={t('version_title')} icon="fa-code-branch">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <Typography variant="body" className="text-slate-700 font-bold">
                                    {t('version_current')}
                                </Typography>
                                <Typography variant="h2" className="text-blue-600 font-black">
                                    v1.3.2
                                </Typography>
                                <Typography
                                    variant="label"
                                    className="text-slate-400 mt-1 block tracking-wider uppercase"
                                >
                                    Auto Parts Governance Professional
                                </Typography>
                            </div>
                            <div className="flex gap-3">
                                <a
                                    href="https://nsglbc6iskyq.sg.larksuite.com/wiki/AYwiwnIqsi151wke1t8lWJTXg1f"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all flex items-center gap-2"
                                >
                                    <FaIcon className="fas fa-external-link-alt" /> Wiki
                                </a>
                                <button
                                    onClick={() => (window as any).navigateToLog?.()}
                                    className="px-4 py-2 text-xs flex items-center gap-2 lg-btn lg-btn-blue"
                                >
                                    <FaIcon className="fas fa-history" /> {t('version_view_log')}
                                </button>
                            </div>
                        </div>
                    </SectionCard>
                </div>
            )}

            {activeTab === 'users' && currentUserProfile?.role === 'admin' && <UserManagementTab />}

            {activeTab === 'storage' && currentUserProfile?.role === 'admin' && (
                <SnapshotManagerTab monthlyHistory={monthlyHistory} handleDeleteMonthly={handleDeleteMonthly} />
            )}

            {activeTab === 'glossary' && <GlossaryTab />}

            {/* Sticky Save Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl px-6 py-4 print:hidden">
                <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
                        <FaIcon className="fas fa-server text-blue-500" />
                        Cấu hình được lưu và đồng bộ lên Cloud (Supabase)
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSave}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${
                                saved ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                        >
                            <FaIcon className={`fas ${saved ? 'fa-check' : 'fa-floppy-disk'}`} />
                            {saved ? 'Đã lưu!' : 'Lưu Thay đổi'}
                        </button>

                        <button
                            onClick={() => setDraft(settings)}
                            className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                        >
                            <FaIcon className="fas fa-xmark mr-1.5" /> Khôi phục
                        </button>

                        <div className="w-px h-8 bg-slate-200 mx-1" />

                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm overflow-hidden">
                            <FaIcon className="fas fa-key text-slate-400 ml-2" />
                            <input
                                type="password"
                                placeholder="Mã PIN Admin"
                                value={adminPinInput}
                                onChange={e => setAdminPinInput(e.target.value)}
                                className="w-28 px-3 py-1.5 text-xs font-bold text-slate-800 bg-transparent outline-none placeholder:font-normal"
                            />
                            <button
                                onClick={handleSaveToCloud}
                                disabled={isSavingCloud || !adminPinInput}
                                className={`px-5 py-1.5 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${
                                    isSavingCloud
                                        ? 'bg-slate-400 text-white'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-300'
                                } ${isSavingCloud || !adminPinInput ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isSavingCloud ? (
                                    <FaIcon className="fas fa-spinner fa-spin" />
                                ) : (
                                    <FaIcon className="fas fa-cloud-arrow-up" />
                                )}
                                {isSavingCloud ? 'Đang lưu...' : 'Đồng bộ Cloud'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
