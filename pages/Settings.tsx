import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../utils/i18n';
import { saveToCloudStorage, loadFromCloudStorage, verifyAdminPin, saveMonthlyData, loadLatestMonthlyData, listMonthlyDataSnapshots, listProfiles, updateProfileRole, toggleUserActive, listWorkflows, createWorkflow, updateWorkflow, createUserByAdmin, adminResetPassword, listSnapshots, deleteSnapshot, getStorageUsage, SnapshotMetadataRow, deleteMonthlyData } from '../utils/supabase';
import { supabase } from '../utils/supabase';
import { parseMonthlyCSV } from '../utils/csvParser';
import { Typography } from '../components/Typography';
import { clearAllAppCache } from '../utils/db';
import { Brand, SourceProfile, AVAILABLE_BRANDS, DEFAULT_SOURCE_PROFILES, ApprovalWorkflow, WorkflowLevel } from '../types/inventory';
import { useAuth } from '../utils/authContext';
import { UserProfile, UserRole } from '../utils/authContext';

// ─── Types ────────────────────────────────────────────────────────────────────
// SourceProfile types moved to inventory.ts

export interface AppSettings {
    // Source Profiles (replaces old bmw*/default* params)
    sourceProfiles: SourceProfile[];
    activeSourceId: string;           // currently selected source profile ID

    // Display
    defaultWarehouseScope: 'All' | 'NB' | 'BB';
    defaultCostBasis: 'PP' | 'FOB';
    defaultDemandSource: '3M' | '6M' | '12M';
    currency: 'VND' | 'EUR';
    language: 'vi' | 'en';

    // Thresholds
    excessThresholdPct: number;       // % vượt max → cảnh báo dư thừa (mặc định 0)
    criticalMosThreshold: number;     // MOS < x → P0 (mặc định 0.5)
    warningMosThreshold: number;      // MOS < x → P1 (mặc định 1.5)

    // Export
    exportIncludeComputed: boolean;
    exportIncludePipeline: boolean;
    exportIncludeSalesHistory: boolean;
    exportDecimalPrecision: number;
    exportDateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
    exportSeparator: 'comma' | 'semicolon' | 'tab';
    exportEncoding: 'utf8-bom' | 'utf8';

    // Export - Column Selection (Inventory / Dashboard)
    exportColumns: {
        itemCode: boolean;
        itemName: boolean;
        typeCar: boolean;
        loisGroup: boolean;
        trendFlag: boolean;
        status: boolean;
        backorder: boolean;
        backorderNB: boolean;
        backorderBB: boolean;
        stockNB: boolean;
        stockBB: boolean;
        totalInventory: boolean;
        totalPO: boolean;
        poThisMonth: boolean;
        debtPriority: boolean;
        debtStatus: boolean;
        baseForecast: boolean;
        avgQty3M: boolean;
        avgQty6M: boolean;
        avgQty12M: boolean;
        mos: boolean;
        rop: boolean;
        stockMax: boolean;
        safetyStock: boolean;
        unitCostPP: boolean;
        unitCostFOB: boolean;
        stockValue: boolean;
        excessQty: boolean;
        excessValue: boolean;
        dealerInventory: boolean;
        note: boolean;
        snp: boolean;
    };

    // Export - Column Selection (Order Draft / Ordering page)
    orderDraftColumns: {
        itemCode: boolean;        // Mã hàng
        itemName: boolean;        // Tên hàng
        status: boolean;          // Trạng thái
        typeCar: boolean;         // Loại xe
        airQty: boolean;          // SL Đặt AIR
        seaQty: boolean;          // SL Đặt SEA
        totalQty: boolean;        // Tổng SL Đặt
        totalAmount: boolean;     // Thành tiền
        currency: boolean;        // Tiền tệ
        unitCostPP: boolean;      // Đơn giá PP (VND)
        unitCostFOB: boolean;     // Đơn giá FOB (EUR)
        unitCost: boolean;        // Đơn giá (theo costBasis)
        noteOrder: boolean;       // Ghi chú đặt hàng
        noteData: boolean;        // Ghi chú dữ liệu
        snp: boolean;             // SNP
        loisGroup: boolean;       // LOIS Group
        trendFlag: boolean;       // Trend Flag
        available: boolean;       // Tồn kho (Available)
        netDemand: boolean;       // Tồn ròng (Net Demand = Available - BO)
        dealerInventory: boolean; // Tồn đại lý
        incomingMonth: boolean;   // Hàng về tháng này
        totalPO: boolean;         // Tổng PO
        backorder: boolean;       // Nợ đơn (BO)
        debtPriority: boolean;     // Mức ưu tiên pick (P1-P5)
        debtStatus: boolean;       // Trạng thái tình trạng nợ
        suggestQty: boolean;      // SL Gợi ý đặt (hệ thống)
        suggestBOQty: boolean;    // SL Gợi ý giải BO
        safetyStock: boolean;     // Tồn an toàn (SSP)
        avgQty3M: boolean;        // AVG 3M
        avgQty6M: boolean;        // AVG 6M
        avgQty12M: boolean;       // AVG 12M
        avgQty24M: boolean;       // AVG 24M
        baseForecast: boolean;    // Base Forecast
        salesM1: boolean;         // Doanh số tháng gần nhất
        mos: boolean;             // MOS (hiện tại)
        currentCst: boolean;      // CST Hiện tại (trước đặt)
        cstAfterOrder: boolean;   // CST Sau Đặt
        rop: boolean;             // ROP
        stockMax: boolean;        // Stock Max
    };

    // LOIS KPI Targets per subgroup (for supply matrix)
    loisTargets: Record<string, {
        targetMOS: number;
        targetExcessPct: number;
    }>;

    // System
    companyName: string;
    reportTitle: string;
    autoSaveState: boolean;
    snapshotDate: string;

    // Seasonality Tuning
    seasonalityTuning: {
        useSPD: boolean;
        tetWeight: number;
        weatherWeight: number;
    };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    sourceProfiles: [...DEFAULT_SOURCE_PROFILES],
    activeSourceId: 'NB',
    defaultWarehouseScope: 'All',
    defaultCostBasis: 'PP',
    defaultDemandSource: '3M',
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
        itemCode: true, itemName: true, typeCar: true, loisGroup: true, trendFlag: true,
        status: true, backorder: true, backorderNB: false, backorderBB: false,
        stockNB: true, stockBB: true, totalInventory: true, totalPO: true, poThisMonth: true,
        debtPriority: true, debtStatus: true, baseForecast: true,
        avgQty3M: true, avgQty6M: false, avgQty12M: false, mos: true,
        rop: false, stockMax: false, safetyStock: false,
        unitCostPP: true, unitCostFOB: false, stockValue: true,
        excessQty: false, excessValue: false, dealerInventory: true,
        note: false, snp: false,
    },
    orderDraftColumns: {
        itemCode: true, itemName: true, status: false, typeCar: false,
        airQty: true, seaQty: true, totalQty: true, totalAmount: true, currency: true,
        unitCostPP: false, unitCostFOB: false, unitCost: true,
        noteOrder: true, noteData: false,
        snp: false, loisGroup: true, trendFlag: true,
        available: true, netDemand: false, dealerInventory: true,
        incomingMonth: true, totalPO: true, backorder: true,
        debtPriority: true, debtStatus: true,
        suggestQty: false, suggestBOQty: false, safetyStock: false,
        avgQty3M: true, avgQty6M: false, avgQty12M: false, avgQty24M: false, baseForecast: false,
        salesM1: false, mos: true, currentCst: false, cstAfterOrder: true,
        rop: false, stockMax: false,
    },
    loisTargets: {
        // L – Regular (by velocity)
        L1: { targetMOS: 3.5, targetExcessPct: 5 },
        L2: { targetMOS: 4.0, targetExcessPct: 7 },
        L3: { targetMOS: 4.5, targetExcessPct: 10 },
        L4: { targetMOS: 5.0, targetExcessPct: 12 },
        L5: { targetMOS: 5.5, targetExcessPct: 15 },
        L6: { targetMOS: 6.0, targetExcessPct: 18 },
        L7: { targetMOS: 7.0, targetExcessPct: 25 },
        // O – Obsolete
        O8: { targetMOS: 3.0, targetExcessPct: 10 },
        OE: { targetMOS: 1.5, targetExcessPct: 10 },
        ON: { targetMOS: 1.5, targetExcessPct: 10 },
        OA: { targetMOS: 1.0, targetExcessPct: 10 },
        OV: { targetMOS: 1.0, targetExcessPct: 10 },
        // I – Inactive
        I: { targetMOS: 0.5, targetExcessPct: 30 },
        // S – Special
        SX: { targetMOS: 6.0, targetExcessPct: 10 },
        SY: { targetMOS: 6.0, targetExcessPct: 10 },
        SZ: { targetMOS: 6.0, targetExcessPct: 10 },
        SC: { targetMOS: 6.0, targetExcessPct: 10 },
        SK: { targetMOS: 6.0, targetExcessPct: 10 },
        SD: { targetMOS: 6.0, targetExcessPct: 10 },
    },
    companyName: 'Auto Parts Governance',
    reportTitle: 'Báo cáo Tồn Kho',
    autoSaveState: true,
    snapshotDate: new Date().toISOString().split('T')[0],
    seasonalityTuning: {
        useSPD: true,
        tetWeight: 1.2,
        weatherWeight: 1.0
    }
};

const STORAGE_KEY = 'atp_app_settings';

export const loadAppSettings = (): AppSettings => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Migration: old format had bmwLeadTime but no sourceProfiles
            if (parsed.bmwLeadTime !== undefined && !parsed.sourceProfiles) {
                parsed.sourceProfiles = [...DEFAULT_SOURCE_PROFILES];
                // Apply old BMW values to BMWASIA profile
                const bmwProfile = parsed.sourceProfiles.find((p: SourceProfile) => p.id === 'BMWASIA');
                if (bmwProfile) {
                    bmwProfile.lt = parsed.bmwLeadTime;
                    bmwProfile.sp = parsed.bmwSafetyPeriod ?? 15;
                    bmwProfile.ssp = parsed.bmwSafetyStockPeriod ?? 7;
                }
                // Apply old default values to NB profile
                const nbProfile = parsed.sourceProfiles.find((p: SourceProfile) => p.id === 'NB');
                if (nbProfile) {
                    nbProfile.lt = parsed.defaultLeadTime ?? 90;
                    nbProfile.sp = parsed.defaultSafetyPeriod ?? 30;
                    nbProfile.ssp = parsed.defaultSafetyStockPeriod ?? 15;
                }
                parsed.activeSourceId = 'NB';
                delete parsed.bmwLeadTime;
                delete parsed.bmwSafetyPeriod;
                delete parsed.bmwSafetyStockPeriod;
                delete parsed.defaultLeadTime;
                delete parsed.defaultSafetyPeriod;
                delete parsed.defaultSafetyStockPeriod;
                // Migrate loisTargets: remove BMW columns
                if (parsed.loisTargets) {
                    for (const key of Object.keys(parsed.loisTargets)) {
                        delete parsed.loisTargets[key].targetMOS_BMW;
                        delete parsed.loisTargets[key].targetExcessPct_BMW;
                    }
                }
            }

            // Secondary Migration: ensure all profiles have a 'brand' field
            if (parsed.sourceProfiles && Array.isArray(parsed.sourceProfiles)) {
                parsed.sourceProfiles = parsed.sourceProfiles.map((p: any) => {
                    if (!p.brand) {
                        return { ...p, brand: p.id === 'BMWASIA' ? 'BMW' : 'Kia' };
                    }
                    return p;
                });
            }

            return { ...DEFAULT_APP_SETTINGS, ...parsed };
        }
    } catch { }
    return DEFAULT_APP_SETTINGS;
};

export const saveAppSettings = (s: AppSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const SectionCard = ({ title, icon, badge, children }: { title: string; icon: string; badge?: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <i className={`fas ${icon} text-blue-600 text-sm`} />
            </div>
            <Typography variant="label" className="text-slate-900">{title}</Typography>
            {badge && <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{badge}</span>}
        </div>
        <div className="p-6">{children}</div>
    </div>
);

const Field = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-slate-50 last:border-0">
        <div className="sm:w-56 shrink-0">
            <Typography variant="body" className="text-slate-700 font-bold">{label}</Typography>
            {sub && <Typography variant="label" className="text-slate-400 !font-medium normal-case block mt-0.5">{sub}</Typography>}
        </div>
        <div className="flex-1">{children}</div>
    </div>
);

const NumberInput = ({ value, onChange, min, max, step, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) => (
    <div className="flex items-center gap-2">
        <input
            type="number" value={value} min={min} max={max} step={step || 1}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
        />
        {unit && <span className="text-xs font-bold text-slate-400 uppercase">{unit}</span>}
    </div>
);

const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <select
        value={value} onChange={e => onChange(e.target.value)}
        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all cursor-pointer"
    >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);

const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) => (
    <div className="flex items-center gap-2">
        <button
            onClick={() => onChange(!value)}
            className={`relative w-10 h-5 rounded-full transition-all ${value ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
        {label && <span className="text-sm font-bold text-slate-600">{label}</span>}
    </div>
);

const ColCheckbox = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void; key?: React.Key }) => (
    <label className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-50 cursor-pointer group">
        <div
            onClick={() => onChange(!value)}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${value ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-blue-400'}`}
        >
            {value && <i className="fas fa-check text-white" style={{ fontSize: '9px' }} />}
        </div>
        <span className="text-xs font-bold text-slate-600 select-none">{label}</span>
    </label>
);

// ─── User Management Tab ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Admin',
    planner: 'Planner',
    approver: 'Approver',
    viewer: 'Viewer',
};

const UserManagementTab = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [workflows, setWorkflowList] = useState<ApprovalWorkflow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newWfName, setNewWfName] = useState('');
    const [newWfBrand, setNewWfBrand] = useState<string>('');
    const [newWfProposers, setNewWfProposers] = useState<string[]>([]);
    const [newWfLevels, setNewWfLevels] = useState<WorkflowLevel[]>([{ level: 1, approver_ids: [], require_all: false }]);
    const [showNewWfForm, setShowNewWfForm] = useState(false);
    const [editingWf, setEditingWf] = useState<ApprovalWorkflow | null>(null);

    // Create user form
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFullName, setNewFullName] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('viewer');
    const [createError, setCreateError] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Change password (own)
    const [showChangePw, setShowChangePw] = useState(false);
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwMsg, setPwMsg] = useState('');
    const [isChangingPw, setIsChangingPw] = useState(false);

    // Admin reset password for another user
    const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
    const [resetPw, setResetPw] = useState('');
    const [resetMsg, setResetMsg] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        const [u, w] = await Promise.all([listProfiles(), listWorkflows()]);
        setUsers(u);
        setWorkflowList(w);
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRoleChange = async (userId: string, role: UserRole) => {
        await updateProfileRole(userId, role);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    };

    const handleBrandChange = async (userId: string, brand: string | null) => {
        await supabase.from('profiles').update({ department: brand }).eq('id', userId);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, department: brand } : u));
    };

    const handleToggleActive = async (userId: string, active: boolean) => {
        await toggleUserActive(userId, !active);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !active } : u));
    };

    const handleCreateUser = async () => {
        if (!newEmail.trim() || !newPassword.trim()) return;
        setIsCreating(true);
        setCreateError('');
        const { error } = await createUserByAdmin(newEmail.trim(), newPassword, newFullName.trim(), newRole);
        setIsCreating(false);
        if (error) { setCreateError(error); return; }
        setNewEmail(''); setNewPassword(''); setNewFullName(''); setNewRole('viewer');
        setShowCreateUser(false);
        load();
    };

    const handleChangePassword = async () => {
        if (newPw.length < 6) { setPwMsg('Mật khẩu phải ít nhất 6 ký tự.'); return; }
        if (newPw !== confirmPw) { setPwMsg('Mật khẩu không khớp.'); return; }
        setIsChangingPw(true);
        const { error } = await supabase.auth.updateUser({ password: newPw });
        setIsChangingPw(false);
        if (error) { setPwMsg(error.message); return; }
        setPwMsg('✓ Đã đổi mật khẩu thành công!');
        setNewPw(''); setConfirmPw('');
        setTimeout(() => { setPwMsg(''); setShowChangePw(false); }, 2000);
    };

    const handleOpenEditWf = (wf: ApprovalWorkflow) => {
        setEditingWf(wf);
        setNewWfName(wf.name);
        setNewWfBrand(wf.brand || '');
        setNewWfProposers(wf.proposer_ids ?? []);
        setNewWfLevels(wf.levels.length > 0 ? wf.levels : [{ level: 1, approver_ids: [], require_all: false }]);
        setShowNewWfForm(true);
    };

    const handleSaveWf = async () => {
        if (!newWfName.trim() || !user) return;
        if (editingWf) {
            await updateWorkflow(editingWf.id, {
                name: newWfName.trim(),
                brand: newWfBrand || null,
                levels: newWfLevels,
                proposer_ids: newWfProposers,
            });
        } else {
            await createWorkflow({
                name: newWfName.trim(),
                brand: newWfBrand || null,
                levels: newWfLevels,
                proposer_ids: newWfProposers,
                is_active: true,
                created_by: user.id,
            });
        }
        setEditingWf(null); setNewWfName(''); setNewWfBrand(''); setNewWfProposers([]);
        setNewWfLevels([{ level: 1, approver_ids: [], require_all: false }]);
        setShowNewWfForm(false);
        load();
    };

    const handleAdminResetPassword = async () => {
        if (!resetTarget || resetPw.length < 6) { setResetMsg('Mật khẩu phải ít nhất 6 ký tự.'); return; }
        setIsResetting(true); setResetMsg('');
        const { error } = await adminResetPassword(resetTarget.id, resetPw);
        setIsResetting(false);
        if (error) { setResetMsg(error); return; }
        setResetMsg('✓ Đã đổi mật khẩu!');
        setTimeout(() => { setResetTarget(null); setResetPw(''); setResetMsg(''); }, 1500);
    };


    const handleToggleWorkflow = async (wf: ApprovalWorkflow) => {
        await updateWorkflow(wf.id, { is_active: !wf.is_active });
        load();
    };

    if (isLoading) return (
        <div className="flex items-center justify-center py-16 text-slate-400">
            <i className="fas fa-circle-notch fa-spin text-2xl" />
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn pb-24">
            {/* Users Table */}
            <SectionCard title="Danh sách người dùng" icon="fa-users">
                <div className="overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest border-b border-slate-200">
                                <th className="px-4 py-3 text-left font-black">Họ tên</th>
                                <th className="px-4 py-3 text-left font-black">Role</th>
                                <th className="px-4 py-3 text-left font-black">Brand</th>
                                <th className="px-4 py-3 text-center font-black">Trạng thái</th>
                                <th className="px-4 py-3 text-right font-black">Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold text-slate-800">{u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}</td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={u.role}
                                            onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold bg-white outline-none focus:border-blue-400"
                                        >
                                            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={u.department || ''}
                                            onChange={e => handleBrandChange(u.id, e.target.value || null)}
                                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold bg-white outline-none focus:border-blue-400"
                                        >
                                            <option value="">Tất cả</option>
                                            {AVAILABLE_BRANDS.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                            <i className={`fas ${u.is_active ? 'fa-circle-check' : 'fa-circle-xmark'} text-[8px]`} />
                                            {u.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => { setResetTarget(u); setResetPw(''); setResetMsg(''); }}
                                                className="text-xs font-black px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                                            >
                                                <i className="fas fa-key mr-1" />Đổi mật khẩu
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(u.id, u.is_active)}
                                                className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all ${u.is_active ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                            >
                                                {u.is_active ? 'Vô hiệu hoá' : 'Kích hoạt'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Admin Reset Password Modal */}
                {resetTarget && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setResetTarget(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <i className="fas fa-key text-blue-600" />
                                </div>
                                <div>
                                    <p className="font-black text-slate-800 text-sm">Đổi mật khẩu</p>
                                    <p className="text-xs text-slate-500">{resetTarget.full_name || 'Người dùng'}</p>
                                </div>
                            </div>
                            {resetMsg && (
                                <p className={`text-xs px-3 py-2 rounded-lg border ${resetMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>{resetMsg}</p>
                            )}
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu mới</label>
                                <input
                                    type="password"
                                    value={resetPw}
                                    onChange={e => setResetPw(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAdminResetPassword()}
                                    placeholder="Ít nhất 6 ký tự"
                                    autoFocus
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 font-medium"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAdminResetPassword}
                                    disabled={isResetting || resetPw.length < 6}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    {isResetting ? <><i className="fas fa-circle-notch fa-spin" /> Đang lưu...</> : <><i className="fas fa-check" /> Xác nhận</>}
                                </button>
                                <button
                                    onClick={() => setResetTarget(null)}
                                    className="px-4 py-2.5 rounded-xl text-sm font-black border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                                >
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create User Form */}
                {showCreateUser ? (
                    <div className="mt-4 p-4 border border-blue-200 bg-blue-50 rounded-xl space-y-3">
                        <Typography variant="label" className="text-blue-700 font-black uppercase tracking-widest block">Tạo tài khoản mới</Typography>
                        {createError && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{createError}</p>}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Họ tên</label>
                                <input value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="Nguyễn Văn A" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Role</label>
                                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-blue-400">
                                    {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Email</label>
                                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@company.com" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu</label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCreateUser} disabled={isCreating || !newEmail || !newPassword} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2">
                                {isCreating ? <><i className="fas fa-circle-notch fa-spin" /> Đang tạo...</> : <><i className="fas fa-user-plus" /> Tạo tài khoản</>}
                            </button>
                            <button onClick={() => { setShowCreateUser(false); setCreateError(''); }} className="px-4 py-2 rounded-lg text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50">Hủy</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowCreateUser(true)} className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-black">
                        <i className="fas fa-user-plus" /> Tạo tài khoản mới
                    </button>
                )}
            </SectionCard>

            {/* Workflows */}
            <SectionCard title="Cấu hình Workflow Phê duyệt" icon="fa-sitemap">
                <div className="space-y-2">
                    {workflows.map(wf => {
                        const getName = (id: string) => users.find(u => u.id === id)?.full_name || id.slice(0, 8);
                        return (
                        <div key={wf.id} className="border border-slate-200 rounded-xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800 text-sm">{wf.name}</span>
                                    {wf.brand && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{wf.brand}</span>}
                                    <span className="text-xs text-slate-400">{wf.levels.length} cấp phê duyệt</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleOpenEditWf(wf)}
                                        className="text-xs font-black px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-all">
                                        <i className="fas fa-pen mr-1" />Sửa
                                    </button>
                                    <button onClick={() => handleToggleWorkflow(wf)}
                                        className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all ${wf.is_active ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                        {wf.is_active ? 'Tắt' : 'Bật'}
                                    </button>
                                </div>
                            </div>
                            {/* Detail rows */}
                            <div className="divide-y divide-slate-100 px-4 py-2 space-y-1">
                                {/* Proposers */}
                                <div className="flex items-start gap-3 py-1.5">
                                    <span className="text-xs font-black text-violet-600 w-36 shrink-0 flex items-center gap-1"><i className="fas fa-user-pen" /> Người đề xuất</span>
                                    <div className="flex flex-wrap gap-1">
                                        {(wf.proposer_ids ?? []).length === 0
                                            ? <span className="text-xs text-slate-400 italic">Tất cả planner</span>
                                            : (wf.proposer_ids ?? []).map(id => (
                                                <span key={id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-bold">{getName(id)}</span>
                                            ))}
                                    </div>
                                </div>
                                {/* Each level */}
                                {wf.levels.map(lvl => (
                                    <div key={lvl.level} className="flex items-start gap-3 py-1.5">
                                        <span className="text-xs font-black text-blue-600 w-36 shrink-0 flex items-center gap-1">
                                            <i className="fas fa-check-circle" /> Cấp {lvl.level} {lvl.require_all && <span className="text-[10px] text-slate-400">(tất cả)</span>}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {lvl.approver_ids.length === 0
                                                ? <span className="text-xs text-slate-400 italic">Chưa chọn người duyệt</span>
                                                : lvl.approver_ids.map(id => (
                                                    <span key={id} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">{getName(id)}</span>
                                                ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        );
                    })}
                    {workflows.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Chưa có workflow nào.</p>}
                </div>
                {showNewWfForm ? (
                    <div className="mt-4 border border-blue-200 bg-blue-50/50 rounded-2xl p-4 space-y-4">
                        <p className="text-xs font-black text-blue-700 uppercase tracking-widest">{editingWf ? `Chỉnh sửa: ${editingWf.name}` : 'Tạo workflow mới'}</p>

                        {/* Name + Brand */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-black text-slate-500 mb-1">Tên workflow</label>
                                <input
                                    value={newWfName}
                                    onChange={e => setNewWfName(e.target.value)}
                                    placeholder="VD: Phê duyệt đặt hàng BMW"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Thương hiệu</label>
                                <select
                                    value={newWfBrand}
                                    onChange={e => setNewWfBrand(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 bg-white"
                                >
                                    <option value="">Tất cả</option>
                                    {AVAILABLE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Proposers */}
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2">NGƯỜI ĐỀ XUẤT</label>
                            <div className="flex flex-wrap gap-2">
                                {users.filter(u => u.role === 'planner' || u.role === 'admin').map(u => (
                                    <label key={u.id} className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${newWfProposers.includes(u.id) ? 'bg-violet-100 border-violet-300 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-violet-200'}`}>
                                        <input
                                            type="checkbox"
                                            checked={newWfProposers.includes(u.id)}
                                            onChange={e => setNewWfProposers(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                                            className="sr-only"
                                        />
                                        <i className="fas fa-user text-[10px]" /> {u.full_name || u.id.slice(0, 8)}
                                    </label>
                                ))}
                                {users.filter(u => u.role === 'planner' || u.role === 'admin').length === 0 && (
                                    <span className="text-xs text-slate-400 italic">Chưa có người dùng role planner/admin</span>
                                )}
                            </div>
                        </div>

                        {/* Levels builder */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-black text-slate-500">CẤP PHÊ DUYỆT</label>
                                <button
                                    type="button"
                                    onClick={() => setNewWfLevels(prev => [...prev, { level: prev.length + 1, approver_ids: [], require_all: false }])}
                                    className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                    <i className="fas fa-plus" /> Thêm cấp
                                </button>
                            </div>
                            <div className="space-y-3">
                                {newWfLevels.map((lvl, idx) => (
                                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-600">Cấp {lvl.level}</span>
                                            <div className="flex items-center gap-3">
                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={lvl.require_all}
                                                        onChange={e => setNewWfLevels(prev => prev.map((l, i) => i === idx ? { ...l, require_all: e.target.checked } : l))}
                                                        className="w-3.5 h-3.5 rounded accent-blue-600"
                                                    />
                                                    <span className="text-xs text-slate-500 font-bold">Yêu cầu tất cả duyệt</span>
                                                </label>
                                                {newWfLevels.length > 1 && (
                                                    <button type="button" onClick={() => setNewWfLevels(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })))}
                                                        className="text-rose-400 hover:text-rose-600 text-xs">
                                                        <i className="fas fa-trash" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Approver checkboxes */}
                                        <div className="flex flex-wrap gap-2">
                                            {users.filter(u => u.role === 'approver' || u.role === 'admin').map(u => (
                                                <label key={u.id} className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${lvl.approver_ids.includes(u.id) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={lvl.approver_ids.includes(u.id)}
                                                        onChange={e => setNewWfLevels(prev => prev.map((l, i) => i === idx ? {
                                                            ...l,
                                                            approver_ids: e.target.checked ? [...l.approver_ids, u.id] : l.approver_ids.filter(id => id !== u.id)
                                                        } : l))}
                                                        className="sr-only"
                                                    />
                                                    {u.full_name || u.id.slice(0, 8)}
                                                </label>
                                            ))}
                                            {users.filter(u => u.role === 'approver' || u.role === 'admin').length === 0 && (
                                                <span className="text-xs text-slate-400 italic">Chưa có người dùng role approver/admin</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSaveWf} disabled={!newWfName.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2">
                                <i className="fas fa-check" /> {editingWf ? 'Lưu thay đổi' : 'Tạo workflow'}
                            </button>
                            <button onClick={() => { setShowNewWfForm(false); setEditingWf(null); setNewWfName(''); setNewWfBrand(''); setNewWfProposers([]); setNewWfLevels([{ level: 1, approver_ids: [], require_all: false }]); }}
                                className="px-4 py-2 rounded-xl text-sm font-black border border-slate-200 text-slate-500 hover:bg-slate-50">
                                Hủy
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowNewWfForm(true)} className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-black">
                        <i className="fas fa-plus" /> Thêm workflow mới
                    </button>
                )}
            </SectionCard>

            {/* Change Password */}
            <SectionCard title="Đổi mật khẩu" icon="fa-lock">
                {!showChangePw ? (
                    <button onClick={() => setShowChangePw(true)} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm font-black border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-300 transition-all">
                        <i className="fas fa-key" /> Đổi mật khẩu của tôi
                    </button>
                ) : (
                    <div className="space-y-3 max-w-sm">
                        {pwMsg && <p className={`text-xs px-3 py-2 rounded-lg border ${pwMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>{pwMsg}</p>}
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu mới</label>
                            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Ít nhất 6 ký tự" className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">Xác nhận mật khẩu</label>
                            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Nhập lại mật khẩu mới" className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400" onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleChangePassword} disabled={isChangingPw || !newPw || !confirmPw} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2">
                                {isChangingPw ? <><i className="fas fa-circle-notch fa-spin" /> Đang lưu...</> : <><i className="fas fa-check" /> Xác nhận</>}
                            </button>
                            <button onClick={() => { setShowChangePw(false); setNewPw(''); setConfirmPw(''); setPwMsg(''); }} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50">Hủy</button>
                        </div>
                    </div>
                )}
            </SectionCard>
        </div>
    );
};

interface SnapshotManagerTabProps {
    monthlyHistory: { id: string; updated_at: string }[];
    handleDeleteMonthly: (snapshotMonth: string) => Promise<void>;
}

const SnapshotManagerTab = ({ monthlyHistory, handleDeleteMonthly }: SnapshotManagerTabProps) => {
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
        const ok = await deleteSnapshot(snap.id, snap.storage_path);
        if (ok) setSnapshots(prev => prev.filter(s => s.id !== snap.id));
        else alert('Lỗi khi xóa.');
        setDeletingId(null);
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Xóa ${selectedIds.size} snapshots đã chọn?\nDữ liệu sẽ bị xóa vĩnh viễn.`)) return;
        for (const id of selectedIds) {
            const snap = snapshots.find(s => s.id === id);
            if (snap) {
                await deleteSnapshot(snap.id, snap.storage_path);
            }
        }
        setSelectedIds(new Set());
        await fetchAll();
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
                            <i className={`fas fa-sync ${isLoading ? 'fa-spin' : ''}`} /> Làm mới
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
                                <i className="fas fa-trash" /> Xóa {selectedIds.size} đã chọn
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
                        <i className="fas fa-circle-notch fa-spin text-2xl" />
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <i className="fas fa-cloud text-4xl mb-3 opacity-30" />
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
                                                {deletingId === snap.id ? <i className="fas fa-circle-notch fa-spin" /> : <><i className="fas fa-trash mr-1" />Xóa</>}
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
                    <i className="fas fa-info-circle mr-1.5 text-blue-400" />
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
                                        <i className="fas fa-calendar-check" />
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
                                            <i className="fas fa-trash" /> Xóa bản ghi
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

// ─── Main Page ────────────────────────────────────────────────────────────────
interface SettingsPageProps {
    settings: AppSettings;
    onSave: (s: AppSettings) => void;
}

export const SettingsPage = ({ settings, onSave }: SettingsPageProps) => {
    const { t } = useLanguage();
    const [draft, setDraft] = useState<AppSettings>(settings);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<'inventory' | 'display' | 'export' | 'system' | 'users' | 'storage'>('inventory');
    const { profile: currentUserProfile } = useAuth();
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);

    // ── Monthly Data (File B) Upload State ─────────────────────────────────
    const [monthlyUploadStatus, setMonthlyUploadStatus] = useState<'idle' | 'parsing' | 'ready' | 'saving' | 'done' | 'error'>('idle');
    const [monthlyPreview, setMonthlyPreview] = useState<{ count: number; filename: string; data: Record<string, any> } | null>(null);
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
            } catch { setMonthlyUploadStatus('error'); }
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    const handleMonthlyUpload = async () => {
        if (!monthlyPreview) return;
        const pin = prompt('Nhập Admin PIN để lưu dữ liệu tháng lên Cloud:\n(Mặc định: 2026)');
        if (pin === null) return;
        if (!verifyAdminPin(pin)) { alert('❌ Mã phê duyệt không đúng!'); return; }
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
        if (!confirm(`Xóa toàn bộ dữ liệu tháng ${snapshotMonth} trên Cloud?\nHành động này không thể hoàn tác.`)) return;
        const pin = prompt('Nhập Admin PIN để xác nhận xóa:');
        if (pin === null) return;
        if (!verifyAdminPin(pin)) { alert('❌ Mã phê duyệt không đúng!'); return; }

        const ok = await deleteMonthlyData(snapshotMonth);
        if (ok) {
            alert('✅ Đã xóa dữ liệu thành công.');
            const hist = await listMonthlyDataSnapshots();
            setMonthlyHistory(hist);
            // If deleted month was the current one, clear the current date label
            const currentSnapshotMonth = new Date().toISOString().slice(0, 7);
            if (snapshotMonth === currentSnapshotMonth) setMonthlyCurrentDate(null);
        } else {
            alert('Lỗi khi xóa dữ liệu.');
        }
    };
    // ───────────────────────────────────────────────────────────────────────

    const handleSaveToCloud = async () => {
        const pin = prompt('Vui lòng nhập Mã Phê Duyệt (Admin PIN) để lưu lên Cloud:\n(Mặc định: 2026)');
        if (pin === null) return;
        if (!verifyAdminPin(pin)) {
            alert('❌ Mã phê duyệt không chính xác! Không thể lưu cấu hình.');
            return;
        }

        setIsSavingCloud(true);
        try {
            const { error } = await supabase
                .from('cloud_storage')
                .upsert({ 
                    id: 'global_config', 
                    data: draft, 
                    updated_at: new Date().toISOString() 
                });

            if (error) throw error;
            
            alert('✅ Đã lưu cấu hình lên Cloud (Supabase) thành công!');
            handleSave();
        } catch (err: any) {
            console.error('Lỗi khi lưu lên Cloud:', err);
            alert(`Lỗi khi lưu lên Cloud: ${err.message || 'Lỗi không xác định'}. Vui lòng kiểm tra lại thiết lập Database.`);
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

    const handleSave = () => {
        onSave(draft);
        saveAppSettings(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
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
                const parsed = JSON.parse(ev.target?.result as string);
                setDraft({ ...DEFAULT_APP_SETTINGS, ...parsed });
                alert('Đã nhập cấu hình thành công!');
            } catch {
                alert('File JSON không hợp lệ.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const tabs = [
        { id: 'inventory', label: 'Tham số kho', icon: 'fa-boxes-stacked' },
        { id: 'display', label: 'Hiển thị', icon: 'fa-palette' },
        { id: 'export', label: 'Xuất dữ liệu', icon: 'fa-file-export' },
        { id: 'system', label: 'Hệ thống', icon: 'fa-gear' },
        ...(currentUserProfile?.role === 'admin' ? [
            { id: 'users', label: 'Người dùng', icon: 'fa-users' },
            { id: 'storage', label: 'Quản lý Cloud', icon: 'fa-cloud' },
        ] : []),
    ] as const;

    const exportColGroups: { label: string; cols: { key: keyof AppSettings['exportColumns']; label: string }[] }[] = [
        {
            label: 'Thông tin cơ bản', cols: [
                { key: 'itemCode', label: 'Mã hàng' }, { key: 'itemName', label: 'Tên hàng' },
                { key: 'typeCar', label: 'TypeCar' }, { key: 'loisGroup', label: 'LOIS Group' },
                { key: 'trendFlag', label: 'Trend Flag' }, { key: 'status', label: 'Status' },
                { key: 'note', label: 'Ghi chú' }, { key: 'snp', label: 'SNP (Pack)' },
            ]
        },
        {
            label: 'Tồn kho & Backorder', cols: [
                { key: 'stockNB', label: 'Tồn NB (OH+DC)' }, { key: 'stockBB', label: 'Tồn BB (OH+DC)' },
                { key: 'totalInventory', label: 'Tổng tồn kho' }, { key: 'dealerInventory', label: 'Tồn đại lý' },
                { key: 'backorder', label: 'Nợ BO (Tổng)' }, { key: 'backorderNB', label: 'Nợ BO NB' },
                { key: 'backorderBB', label: 'Nợ BO BB' },
            ]
        },
        {
            label: 'Pipeline & Đặt hàng', cols: [
                { key: 'totalPO', label: 'Tổng PO' }, { key: 'poThisMonth', label: 'PO về tháng này' },
                { key: 'debtPriority', label: 'Mức ưu tiên' }, { key: 'debtStatus', label: 'Trạng thái nợ' },
            ]
        },
        {
            label: 'Dự báo & Bán hàng', cols: [
                { key: 'baseForecast', label: 'Base Forecast' }, { key: 'avgQty3M', label: 'AVG 3M' },
                { key: 'avgQty6M', label: 'AVG 6M' }, { key: 'avgQty12M', label: 'AVG 12M' },
            ]
        },
        {
            label: 'Chỉ số kho', cols: [
                { key: 'mos', label: 'MOS (tháng)' }, { key: 'rop', label: 'ROP' },
                { key: 'stockMax', label: 'Stock Max' }, { key: 'safetyStock', label: 'Safety Stock' },
                { key: 'excessQty', label: 'SL dư thừa' }, { key: 'excessValue', label: 'Giá trị dư' },
            ]
        },
        {
            label: 'Giá & Giá trị', cols: [
                { key: 'unitCostPP', label: 'Đơn giá PP (VND)' }, { key: 'unitCostFOB', label: 'Đơn giá FOB (EUR)' },
                { key: 'stockValue', label: 'Giá trị tồn kho' },
            ]
        },
    ];

    return (
        <div className="animate-fadeIn space-y-6 pb-32">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <Typography variant="h2" className="text-white tracking-tight uppercase flex items-center gap-3">
                            <i className="fas fa-sliders text-purple-400" /> Cấu hình hệ thống
                        </Typography>
                        <Typography variant="label" className="text-slate-400 mt-1 block">Tùy chỉnh thông số & xuất dữ liệu</Typography>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button onClick={handleLoadFromCloud} disabled={isLoadingCloud} className="flex items-center gap-2 bg-blue-500/30 border border-blue-400/30 text-blue-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-500/50 transition-all shadow-lg shadow-blue-500/20">
                            <i className={`fas ${isLoadingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} /> Tải Cloud
                        </button>
                        <button onClick={handleSaveToCloud} disabled={isSavingCloud} className="flex items-center gap-2 bg-emerald-500/30 border border-emerald-400/30 text-emerald-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-500/50 transition-all shadow-lg shadow-emerald-500/20">
                            <i className={`fas ${isSavingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} /> Lưu Cloud
                        </button>
                        <button onClick={handleExportConfig} className="flex items-center gap-2 bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-white/20 transition-all">
                            <i className="fas fa-file-export" /> Xuất file
                        </button>
                        <button onClick={handleReset} className="flex items-center gap-2 bg-rose-500/20 border border-rose-400/20 text-rose-300 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-rose-500/30 transition-all">
                            <i className="fas fa-rotate-left" /> Mặc định
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shrink-0 ${activeTab === tab.id
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/30 scale-105'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                    >
                        <i className={`fas ${tab.icon}`} />
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
                        <i className="fas fa-info-circle mr-2 text-sm" />
                        Khai báo tham số LT/SP/SSP cho từng nguồn hàng theo Thương hiệu. Khi upload file, chọn nguồn tương ứng.<br />
                        <div className="mt-2 flex gap-4 opacity-80">
                            <span>ROP = (LT + SSP) × demand_daily</span>
                            <span>|</span>
                            <span>Stock Max = ROP + SP × demand_daily</span>
                        </div>
                    </div>

                    {AVAILABLE_BRANDS.map(brand => {
                        const brandProfiles = draft.sourceProfiles.filter(p => (p.brand || 'Kia') === brand);
                        const brandColors: Record<Brand, string> = {
                            'Kia': 'bg-blue-600',
                            'Mazda': 'bg-rose-700',
                            'Stellantis': 'bg-indigo-700',
                            'BMW': 'bg-slate-900'
                        };

                        return (
                            <div key={brand} className="space-y-4">
                                <SectionCard title={`Thương hiệu: ${brand.toUpperCase()}`} icon={brand === 'BMW' ? 'fa-car' : 'fa-bookmark'}>
                                    {brandProfiles.length === 0 ? (
                                        <div className="py-8 text-center text-slate-400 italic text-sm">Chưa có nguồn hàng cho {brand}</div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Header row */}
                                            <div className="grid grid-cols-12 gap-2 items-center pb-2 border-b border-slate-200 text-2xs font-black text-slate-400 uppercase tracking-widest">
                                                <div className="col-span-1 text-center">Chuẩn</div>
                                                <div className="col-span-2 text-center">Ký hiệu</div>
                                                <div className="col-span-4">Tên nguồn</div>
                                                <div className="col-span-2 text-center">LT (ngày)</div>
                                                <div className="col-span-1 text-center">SP</div>
                                                <div className="col-span-1 text-center">SSP</div>
                                                <div className="col-span-1"></div>
                                            </div>
                                            {brandProfiles.map(profile => (
                                                <div key={profile.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                    {/* Active radio */}
                                                    <div className="col-span-1 flex justify-center">
                                                        <input
                                                            type="radio"
                                                            name="activeSourceId"
                                                            checked={draft.activeSourceId === profile.id}
                                                            onChange={() => setDraft(prev => ({ ...prev, activeSourceId: profile.id }))}
                                                            className="w-5 h-5 accent-blue-600 cursor-pointer"
                                                            title="Chọn làm nguồn hàng mặc định"
                                                        />
                                                    </div>
                                                    {/* Source ID Input */}
                                                    <div className="col-span-2 flex justify-center">
                                                        <input
                                                            className="w-full text-center px-1 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-xs font-black text-blue-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all uppercase tracking-widest shadow-sm"
                                                            value={profile.id}
                                                            onChange={e => {
                                                                const newId = e.target.value.toUpperCase().replace(/\s/g, '');
                                                                setDraft(prev => {
                                                                    const isCurrentlyActive = prev.activeSourceId === profile.id;
                                                                    return {
                                                                        ...prev,
                                                                        activeSourceId: isCurrentlyActive ? newId : prev.activeSourceId,
                                                                        sourceProfiles: prev.sourceProfiles.map(p =>
                                                                            (p.id === profile.id && p.brand === profile.brand) ? { ...p, id: newId } : p
                                                                        )
                                                                    };
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Name */}
                                                    <div className="col-span-4">
                                                        <input
                                                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                                                            value={profile.name}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.map(p => (p.id === profile.id && p.brand === profile.brand) ? { ...p, name: v } : p) }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* LT */}
                                                    <div className="col-span-2 flex justify-center px-1">
                                                        <input
                                                            type="number" min={1} max={365}
                                                            className="w-full text-center px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-blue-700 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.lt}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.map(p => (p.id === profile.id && p.brand === profile.brand) ? { ...p, lt: v } : p) }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* SP */}
                                                    <div className="col-span-1 flex justify-center px-1">
                                                        <input
                                                            type="number" min={1} max={180}
                                                            className="w-full text-center px-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.sp}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.map(p => (p.id === profile.id && p.brand === profile.brand) ? { ...p, sp: v } : p) }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* SSP */}
                                                    <div className="col-span-1 flex justify-center px-1">
                                                        <input
                                                            type="number" min={1} max={90}
                                                            className="w-full text-center px-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                                                            value={profile.ssp}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value) || 1;
                                                                setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.map(p => (p.id === profile.id && p.brand === profile.brand) ? { ...p, ssp: v } : p) }));
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Delete */}
                                                    <div className="col-span-1 flex justify-center">
                                                        <button
                                                            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100"
                                                            onClick={() => setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.filter(p => !(p.id === profile.id && p.brand === profile.brand)), activeSourceId: prev.activeSourceId === profile.id ? (prev.sourceProfiles.find(x => x.id !== profile.id)?.id ?? '') : prev.activeSourceId }))}
                                                            title="Xóa nguồn"
                                                        >
                                                            <i className="fas fa-trash text-xs" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-black rounded-xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                                        onClick={() => {
                                            const newId = `SRC${Date.now().toString().slice(-4)}`;
                                            setDraft(prev => ({ ...prev, sourceProfiles: [...prev.sourceProfiles, { id: newId, brand: brand, name: 'Nguồn mới', lt: 90, sp: 30, ssp: 15 }] }));
                                        }}
                                    >
                                        <i className="fas fa-plus-circle" /> Thêm nguồn cho {brand}
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
                                        <div key={profile.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <div className="col-span-1 flex justify-center">
                                                <input type="radio" checked={draft.activeSourceId === profile.id} onChange={() => setDraft(prev => ({ ...prev, activeSourceId: profile.id }))} className="w-5 h-5 accent-blue-600" />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-black text-2xs text-slate-600">{profile.id}</span>
                                            </div>
                                            <div className="col-span-3">
                                                <select
                                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                                    value={profile.brand}
                                                    onChange={e => {
                                                        const v = e.target.value as Brand;
                                                        setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.map(p => p.id === profile.id ? { ...p, brand: v } : p) }));
                                                    }}
                                                >
                                                    <option value="">Chọn Brand</option>
                                                    {AVAILABLE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-6 flex justify-end">
                                                <button onClick={() => setDraft(prev => ({ ...prev, sourceProfiles: prev.sourceProfiles.filter(p => p.id !== profile.id) }))} className="text-rose-500 p-2"><i className="fas fa-trash" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        );
                    })()}

                    <SectionCard title="Ngưỡng cảnh báo" icon="fa-triangle-exclamation">
                        <Field label="P0 – Critical MOS" sub="MOS dưới ngưỡng này → Ưu tiên P0 (Hết hàng khẩn)">
                            <NumberInput value={draft.criticalMosThreshold} onChange={v => upd('criticalMosThreshold', v)} min={0} max={5} step={0.1} unit="tháng" />
                        </Field>
                        <Field label="P1 – Warning MOS" sub="MOS dưới ngưỡng này → Ưu tiên P1 (Sắp hết)">
                            <NumberInput value={draft.warningMosThreshold} onChange={v => upd('warningMosThreshold', v)} min={0} max={12} step={0.1} unit="tháng" />
                        </Field>
                        <Field label="Ngày ghi nhận tồn kho" sub="Snapshot date dùng để tính hàng về trong tháng">
                            <input
                                type="date" value={draft.snapshotDate}
                                onChange={e => upd('snapshotDate', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Mục tiêu KPI theo nhóm LOIS" icon="fa-bullseye">
                        <div className="text-xs text-slate-500 font-bold mb-4">
                            <i className="fas fa-info-circle mr-1.5 text-blue-400" />
                            Target theo tốc độ bán và Brand Leadtime — so sánh thực tế vs kế hoạch trong bảng Ma trận cung ứng.
                        </div>
                        {(() => {
                            const inp = (key: string, field: keyof typeof draft.loisTargets[string], max: number, step: number, unit: string) => (
                                <div className="flex items-center justify-center gap-1">
                                    <input
                                        type="number" min={0} max={max} step={step}
                                        value={(draft.loisTargets[key] || {})[field] ?? 0}
                                        onChange={e => setDraft(prev => ({
                                            ...prev,
                                            loisTargets: { ...prev.loisTargets, [key]: { ...(prev.loisTargets[key] || {}), [field]: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-12 text-center px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400 transition-all text-2xs"
                                    />
                                    <span className="text-slate-400 font-bold text-3xs">{unit}</span>
                                </div>
                            );
                            const grpHdr = (label: string, bg: string) => (
                                <tr className={`${bg} border-t-2 border-slate-200`}>
                                    <td colSpan={3} className="px-3 py-1.5 font-black text-xs uppercase tracking-widest">{label}</td>
                                </tr>
                            );
                            const subRow = (key: string, label: string, desc: string) => (
                                <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/50">
                                    <td className="py-2 pr-3 pl-5">
                                        <div className="font-black text-slate-700 text-xs">{label}</div>
                                        {desc && <div className="text-slate-400 text-2xs font-bold">{desc}</div>}
                                    </td>
                                    <td className="py-2 px-1 text-center bg-blue-50/20">{inp(key, 'targetMOS', 36, 0.5, 'M')}</td>
                                    <td className="py-2 px-1 text-center bg-blue-50/20">{inp(key, 'targetExcessPct', 100, 1, '%')}</td>
                                </tr>
                            );
                            return (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-separate border-spacing-0">
                                        <thead>
                                            <tr className="text-slate-400 uppercase tracking-widest font-black text-3xs text-center">
                                                <th className="text-left pb-2 pr-3 text-2xs">Nhóm</th>
                                                <th colSpan={2} className="pb-2 px-3 bg-blue-50/50 rounded-t-lg">Mục tiêu KPI</th>
                                            </tr>
                                            <tr className="text-slate-500 font-black text-3xs border-b border-slate-100">
                                                <th className="pb-2 pr-3"></th>
                                                <th className="pb-2 px-1">MOS</th>
                                                <th className="pb-2 px-1">Excess</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {grpHdr('L – Regular (theo tốc độ bán)', 'bg-slate-50 text-slate-700')}
                                            {subRow('L1', 'L1 — Trên 300', 'Fast')}
                                            {subRow('L2', 'L2 — 101–300', '')}
                                            {subRow('L3', 'L3 — 61–100', '')}
                                            {subRow('L4', 'L4 — 25–60', 'Medium')}
                                            {subRow('L5', 'L5 — 13–24', '')}
                                            {subRow('L6', 'L6 — 7–12', 'Slow')}
                                            {subRow('L7', 'L7 — Dưới 6', 'V.Slow')}
                                            {grpHdr('O – Obsolete (lỗi thời)', 'bg-slate-50 text-slate-700')}
                                            {subRow('O8', 'O8 — LOIS 8', 'Dừng nhập')}
                                            {subRow('OE', 'OE — End of Life', '')}
                                            {subRow('ON', 'ON — Normal Obs.', '')}
                                            {subRow('OA', 'OA — Aged Obs.', '')}
                                            {subRow('OV', 'OV — Vendor Disc.', '')}
                                            {grpHdr('I – Inactive', 'bg-slate-50 text-slate-700')}
                                            {subRow('I', 'I — No Movement', '>12 tháng')}
                                            {grpHdr('S – Special (đặc thù)', 'bg-slate-50 text-slate-700')}
                                            {subRow('SX', 'SX — Đặc thù X', '')}
                                            {subRow('SY', 'SY — Đặc thù Y', '')}
                                            {subRow('SZ', 'SZ — Đặc thù Z', '')}
                                            {subRow('SC', 'SC — Đặc thù C', '')}
                                            {subRow('SK', 'SK — Đặc thù K', '')}
                                            {subRow('SD', 'SD — Đặc thù D', '')}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </SectionCard>
                </div>
            )
            }

            {/* Display Tab */}
            {activeTab === 'display' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Mặc định hiển thị" icon="fa-eye">
                        <Field label="Kho mặc định" sub="Phạm vi kho áp dụng khi mới mở app">
                            <Select value={draft.defaultWarehouseScope} onChange={v => upd('defaultWarehouseScope', v as any)}
                                options={[{ value: 'All', label: 'Tất cả (NB + BB)' }, { value: 'NB', label: 'Miền Nam (NB)' }, { value: 'BB', label: 'Miền Bắc (BB)' }]} />
                        </Field>
                        <Field label="Cơ sở giá mặc định" sub="Đơn giá dùng để tính giá trị tồn kho">
                            <Select value={draft.defaultCostBasis} onChange={v => upd('defaultCostBasis', v as any)}
                                options={[{ value: 'PP', label: 'PP (VND - Giá mua nội địa)' }, { value: 'FOB', label: 'FOB (EUR - Giá xuất xưởng)' }]} />
                        </Field>
                        <Field label="Nguồn cầu mặc định" sub="Kỳ trung bình dùng làm cơ sở tính ROP khi không có BaseForecast">
                            <Select value={draft.defaultDemandSource} onChange={v => upd('defaultDemandSource', v as any)}
                                options={[{ value: '3M', label: 'AVG 3 tháng gần nhất' }, { value: '6M', label: 'AVG 6 tháng gần nhất' }, { value: '12M', label: 'AVG 12 tháng gần nhất' }]} />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Giao diện" icon="fa-display">
                        <Field label="Ngôn ngữ mặc định">
                            <Select value={draft.language} onChange={v => upd('language', v as any)}
                                options={[{ value: 'vi', label: '🇻🇳 Tiếng Việt' }, { value: 'en', label: '🇬🇧 English' }]} />
                        </Field>
                        <Field label="Đơn vị tiền tệ hiển thị">
                            <Select value={draft.currency} onChange={v => upd('currency', v as any)}
                                options={[{ value: 'VND', label: 'VND (₫ – Việt Nam Đồng)' }, { value: 'EUR', label: 'EUR (€ – Euro)' }]} />
                        </Field>
                        <Field label="Tự động lưu trạng thái" sub="Lưu filter, cài đặt khi chuyển tab">
                            <Toggle value={draft.autoSaveState} onChange={v => upd('autoSaveState', v)} label="Bật lưu tự động" />
                        </Field>
                    </SectionCard>
                </div>
            )}

            {/* Export Tab */}
            {activeTab === 'export' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Cấu hình file xuất" icon="fa-file-csv">
                        <Field label="Ký tự phân cách" sub="Dấu phân cách giữa các cột trong file CSV">
                            <Select value={draft.exportSeparator} onChange={v => upd('exportSeparator', v as any)}
                                options={[{ value: 'comma', label: 'Dấu phẩy ( , )' }, { value: 'semicolon', label: 'Dấu chấm phẩy ( ; ) – Excel VN' }, { value: 'tab', label: 'Tab' }]} />
                        </Field>
                        <Field label="Encoding" sub="Mã hóa ký tự file CSV">
                            <Select value={draft.exportEncoding} onChange={v => upd('exportEncoding', v as any)}
                                options={[{ value: 'utf8-bom', label: 'UTF-8 với BOM (khuyến nghị – Excel đọc được dấu tiếng Việt)' }, { value: 'utf8', label: 'UTF-8 thuần' }]} />
                        </Field>
                        <Field label="Định dạng ngày" sub="Định dạng ngày tháng trong file xuất">
                            <Select value={draft.exportDateFormat} onChange={v => upd('exportDateFormat', v as any)}
                                options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (Việt Nam)' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO 8601)' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' }]} />
                        </Field>
                        <Field label="Số chữ số thập phân" sub="Độ chính xác của các số thực trong file xuất">
                            <NumberInput value={draft.exportDecimalPrecision} onChange={v => upd('exportDecimalPrecision', v)} min={0} max={6} unit="chữ số" />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Nội dung xuất" icon="fa-table-columns">
                        <Field label="Bao gồm dữ liệu tính toán" sub="MOS, ROP, Stock Max, Priority Score... (computed fields)">
                            <Toggle value={draft.exportIncludeComputed} onChange={v => upd('exportIncludeComputed', v)} label={draft.exportIncludeComputed ? 'Có' : 'Không'} />
                        </Field>
                        <Field label="Bao gồm Pipeline (PO)" sub="Danh sách PO theo từng tháng">
                            <Toggle value={draft.exportIncludePipeline} onChange={v => upd('exportIncludePipeline', v)} label={draft.exportIncludePipeline ? 'Có' : 'Không'} />
                        </Field>
                        <Field label="Bao gồm lịch sử bán hàng" sub="12 tháng SalesHistory (M0...M11)">
                            <Toggle value={draft.exportIncludeSalesHistory} onChange={v => upd('exportIncludeSalesHistory', v)} label={draft.exportIncludeSalesHistory ? 'Có' : 'Không'} />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Cột xuất dữ liệu tồn kho" icon="fa-table-list">
                        <div className="mb-4 flex items-center gap-3">
                            <button onClick={() => setDraft(prev => ({ ...prev, exportColumns: Object.fromEntries(Object.keys(prev.exportColumns).map(k => [k, true])) as any }))}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-700 transition-all">
                                <i className="fas fa-check-double mr-1" /> Chọn tất cả
                            </button>
                            <button onClick={() => setDraft(prev => ({ ...prev, exportColumns: Object.fromEntries(Object.keys(prev.exportColumns).map(k => [k, false])) as any }))}
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200">
                                <i className="fas fa-xmark mr-1" /> Bỏ tất cả
                            </button>
                            <span className="text-xs font-bold text-slate-400">
                                {Object.values(draft.exportColumns).filter(Boolean).length}/{Object.keys(draft.exportColumns).length} cột được chọn
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {exportColGroups.map(group => (
                                <div key={group.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 pb-2 border-b border-slate-200">{group.label}</div>
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
                            <i className="fas fa-info-circle text-blue-500" />
                            Chọn các cột sẽ có mặt trong file CSV khi xuất Dự thảo từ trang <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Đặt hàng</span>
                        </div>
                        <div className="mb-4 flex items-center gap-3">
                            <button onClick={() => setDraft(prev => ({ ...prev, orderDraftColumns: Object.fromEntries(Object.keys(prev.orderDraftColumns).map(k => [k, true])) as any }))}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-700 transition-all">
                                <i className="fas fa-check-double mr-1" /> Chọn tất cả
                            </button>
                            <button onClick={() => setDraft(prev => ({ ...prev, orderDraftColumns: Object.fromEntries(Object.keys(prev.orderDraftColumns).map(k => [k, false])) as any }))}
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200">
                                <i className="fas fa-xmark mr-1" /> Bỏ tất cả
                            </button>
                            <span className="text-xs font-bold text-slate-400">
                                {Object.values(draft.orderDraftColumns).filter(Boolean).length}/{Object.keys(draft.orderDraftColumns).length} cột được chọn
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {([
                                {
                                    label: 'Mã & Tên hàng', cols: [
                                        { key: 'itemCode', label: 'Mã hàng' },
                                        { key: 'itemName', label: 'Tên hàng' },
                                        { key: 'status', label: 'Trạng thái' },
                                        { key: 'typeCar', label: 'TypeCar' },
                                        { key: 'loisGroup', label: 'LOIS Group' },
                                        { key: 'trendFlag', label: 'Trend Flag' },
                                        { key: 'snp', label: 'SNP (Pack size)' },
                                    ]
                                },
                                {
                                    label: 'Số lượng & Giá trị đặt', cols: [
                                        { key: 'airQty', label: 'SL Đặt AIR' },
                                        { key: 'seaQty', label: 'SL Đặt SEA' },
                                        { key: 'totalQty', label: 'Tổng SL Đặt' },
                                        { key: 'totalAmount', label: 'Thành tiền' },
                                        { key: 'currency', label: 'Tiền tệ' },
                                        { key: 'unitCost', label: 'Đơn giá (theo CB)' },
                                        { key: 'unitCostPP', label: 'Đơn giá PP (VND)' },
                                        { key: 'unitCostFOB', label: 'Đơn giá FOB (EUR)' },
                                    ]
                                },
                                {
                                    label: 'Gợi ý & Ghi chú', cols: [
                                        { key: 'suggestQty', label: 'SL Gợi ý (SEA)' },
                                        { key: 'suggestBOQty', label: 'SL Gợi ý (BO/AIR)' },
                                        { key: 'noteOrder', label: 'Ghi chú đặt hàng' },
                                        { key: 'noteData', label: 'Ghi chú dữ liệu' },
                                    ]
                                },
                                {
                                    label: 'Tồn kho & Pipeline', cols: [
                                        { key: 'available', label: 'Tồn kho (Available)' },
                                        { key: 'netDemand', label: 'Tồn ròng (Net Demand)' },
                                        { key: 'dealerInventory', label: 'Tồn đại lý' },
                                        { key: 'safetyStock', label: 'Safety Stock' },
                                        { key: 'incomingMonth', label: 'Hàng về tháng này' },
                                        { key: 'totalPO', label: 'Tổng PO' },
                                        { key: 'backorder', label: 'Nợ đơn (BO)' },
                                        { key: 'debtPriority', label: 'Mức ưu tiên (P1-P5)' },
                                        { key: 'debtStatus', label: 'Trạng thái nợ' },
                                    ]
                                },
                                {
                                    label: 'Dự báo & Bán hàng', cols: [
                                        { key: 'salesM1', label: 'Bán tháng gần nhất (M1)' },
                                        { key: 'avgQty3M', label: 'AVG 3M' },
                                        { key: 'avgQty6M', label: 'AVG 6M' },
                                        { key: 'avgQty12M', label: 'AVG 12M' },
                                        { key: 'avgQty24M', label: 'AVG 24M' },
                                        { key: 'baseForecast', label: 'Base Forecast' },
                                    ]
                                },
                                {
                                    label: 'Chỉ số tồn kho', cols: [
                                        { key: 'mos', label: 'MOS (hiện tại)' },
                                        { key: 'currentCst', label: 'CST Hiện tại' },
                                        { key: 'cstAfterOrder', label: 'CST Sau Đặt' },
                                        { key: 'rop', label: 'ROP' },
                                        { key: 'stockMax', label: 'Stock Max' },
                                    ]
                                },
                            ] as { label: string; cols: { key: keyof AppSettings['orderDraftColumns']; label: string }[] }[]).map(group => (
                                <div key={group.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 pb-2 border-b border-slate-200">{group.label}</div>
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
                </div>
            )}

            {/* System Tab */}
            {activeTab === 'system' && (
                <div className="space-y-6 animate-fadeIn">
                    <SectionCard title="Thông tin báo cáo" icon="fa-building">
                        <Field label="Tên công ty" sub="Hiển thị trên báo cáo in">
                            <input
                                type="text" value={draft.companyName}
                                onChange={e => upd('companyName', e.target.value)}
                                className="w-full max-w-sm px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                        <Field label="Tiêu đề báo cáo" sub="Tiêu đề in trên header báo cáo PDF">
                            <input
                                type="text" value={draft.reportTitle}
                                onChange={e => upd('reportTitle', e.target.value)}
                                className="w-full max-w-sm px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                            />
                        </Field>
                    </SectionCard>

                    <SectionCard title="Quản lý cấu hình" icon="fa-database">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="font-black text-slate-800 text-sm uppercase mb-1">Dữ liệu Local</div>
                                <div className="text-xs text-slate-500 mb-3">Tải về cấu hình hiện tại để lưu trữ cục bộ</div>
                                <button onClick={handleExportConfig} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-all shadow-sm">
                                    <i className="fas fa-download" /> Tải cấu hình (.json)
                                </button>
                            </div>
                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                                <div className="font-black text-rose-800 text-sm uppercase mb-1">Đặt lại mặc định</div>
                                <div className="text-xs text-rose-600 mb-3">Xóa toàn bộ cài đặt đã chỉnh, khôi phục về giá trị gốc</div>
                                <button onClick={handleReset} className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-rose-700 transition-all shadow-sm">
                                    <i className="fas fa-rotate-left" /> Reset tất cả
                                </button>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                                <div className="font-black text-emerald-800 text-sm uppercase mb-1">Xóa bộ nhớ App</div>
                                <div className="text-xs text-emerald-700 mb-3">Xóa toàn bộ cache (IndexedDB + LocalStorage) – không xóa cài đặt</div>
                                <button
                                    onClick={async () => {
                                        if (!confirm('Xác nhận xóa toàn bộ dữ liệu cache? App sẽ tự khởi động lại.')) return;
                                        const keys = Object.keys(localStorage).filter(k => k !== STORAGE_KEY && k !== 'supersessionMappings');
                                        keys.forEach(k => localStorage.removeItem(k));
                                        await clearAllAppCache();
                                        alert('Đã xóa toàn bộ cache. Trang sẽ tải lại ngay bây giờ.');
                                        window.location.reload();
                                    }}
                                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all shadow-sm"
                                >
                                    <i className="fas fa-broom" /> Dọn cache
                                </button>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Monthly Data (File B) Upload */}
                    <SectionCard title="Dữ liệu tháng (File B – Monthly)" icon="fa-calendar-days">
                        <div className="space-y-4">
                            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 font-bold">
                                <i className="fas fa-info-circle mr-2" />
                                File B chứa: LOIS, AvgQty, Forecast, SalesHistory (M0–M11), hệ số thống kê...<br />
                                Sau khi upload, app sẽ <strong>tự tải về khi mở</strong> và merge vào file hàng ngày theo ItemCode.<br />
                                <span className="text-blue-500 mt-1 block">⚙ SafetyStock / ROP / MaxInventory được tính lại theo công thức LT Setting — không lấy thẳng từ file.</span>
                            </div>

                            {/* Current status */}
                            <div className="flex items-center gap-3">
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                                    monthlyCurrentDate
                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                        : 'bg-amber-50 border border-amber-200 text-amber-700'
                                }`}>
                                    <i className={`fas ${monthlyCurrentDate ? 'fa-calendar-check text-emerald-500' : 'fa-triangle-exclamation text-amber-500'}`} />
                                    {monthlyCurrentDate ? `Bản hiện tại: ${monthlyCurrentDate}` : 'Chưa có dữ liệu tháng trên Cloud'}
                                </div>
                            </div>

                            {/* Options */}
                            {monthlyPreview && (
                                <div className="flex items-center gap-2 px-1">
                                    <Toggle value={monthlyClearFirst} onChange={setMonthlyClearFirst} label="Xóa sạch dữ liệu tháng hiện tại trước khi đẩy lên (Khuyên dùng)" />
                                </div>
                            )}

                            {/* File Picker */}
                            <div className="flex items-center gap-3">
                                <label className="flex-1 flex items-center gap-3 h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl px-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group">
                                    <i className="fas fa-file-csv text-slate-400 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors truncate">
                                        {monthlyUploadStatus === 'parsing' ? 'Đang đọc file...' :
                                         monthlyPreview ? `${monthlyPreview.filename} (${monthlyPreview.count.toLocaleString()} mã)` :
                                         'Chọn File Monthly CSV...'}
                                    </span>
                                    <input ref={monthlyInputRef} type="file" accept=".csv" className="hidden" onChange={handleMonthlyFilePick} />
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
                                    <i className={`fas ${
                                        monthlyUploadStatus === 'saving' ? 'fa-spinner fa-spin' :
                                        monthlyUploadStatus === 'done' ? 'fa-check' : 'fa-cloud-arrow-up'
                                    }`} />
                                    {monthlyUploadStatus === 'saving' ? 'Đang lưu...' :
                                     monthlyUploadStatus === 'done' ? 'Xong!' : 'Upload'}
                                </button>
                            </div>

                            {/* History (Planners can see, but not delete here) */}
                            {monthlyHistory.length > 0 && (
                                <div>
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Lịch sử upload</div>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                         {monthlyHistory.map(h => {
                                            const vName = h.id.replace('monthly_data_', '');
                                            return (
                                                <div key={h.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                                                    <i className="fas fa-clock text-slate-400" />
                                                    <span className="font-bold text-slate-600">{vName}</span>
                                                    <span className="text-slate-400 ml-auto">{new Date(h.updated_at).toLocaleString('vi-VN')}</span>
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
                                <Typography variant="body" className="text-slate-700 font-bold">{t('version_current')}</Typography>
                                <Typography variant="h2" className="text-blue-600 font-black">v1.3.2</Typography>
                                <Typography variant="label" className="text-slate-400 mt-1 block tracking-wider uppercase">Auto Parts Governance Professional</Typography>
                            </div>
                            <div className="flex gap-3">
                                <a 
                                    href="https://nsglbc6iskyq.sg.larksuite.com/wiki/AYwiwnIqsi151wke1t8lWJTXg1f" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all flex items-center gap-2"
                                >
                                    <i className="fas fa-external-link-alt" /> Wiki
                                </a>
                                <button 
                                    onClick={() => (window as any).navigateToLog?.()}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-blue-500/20 hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <i className="fas fa-history" /> {t('version_view_log')}
                                </button>
                            </div>
                        </div>
                    </SectionCard>
                </div>
            )}

            {activeTab === 'users' && currentUserProfile?.role === 'admin' && (
                <UserManagementTab />
            )}

            {activeTab === 'storage' && currentUserProfile?.role === 'admin' && (
                <SnapshotManagerTab 
                    monthlyHistory={monthlyHistory} 
                    handleDeleteMonthly={handleDeleteMonthly}
                />
            )}

            {/* Sticky Save Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl px-6 py-4 print:hidden">
                <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
                        <i className="fas fa-circle-info text-blue-500" />
                        Cấu hình sẽ được lưu vào localStorage và áp dụng ngay khi nhấn Lưu
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setDraft(settings)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200">
                            <i className="fas fa-xmark mr-1.5" /> Hủy thay đổi
                        </button>
                        <button
                            onClick={handleSave}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 shadow-md ${saved
                                ? 'bg-emerald-600 text-white shadow-emerald-200'
                                : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-blue-300 hover:-translate-y-0.5'
                                }`}
                        >
                            <i className={`fas ${saved ? 'fa-check' : 'fa-floppy-disk'}`} />
                            {saved ? 'Đã lưu!' : 'Lưu cấu hình'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
