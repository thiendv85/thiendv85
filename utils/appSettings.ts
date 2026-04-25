import { SourceProfile, DEFAULT_SOURCE_PROFILES, DEFAULT_LOIS_PROFILES, LoisProfile, Brand } from '../types/inventory';

export interface AppSettings {
    // Source Profiles
    sourceProfiles: SourceProfile[];
    activeSourceId: string;

    // Display
    defaultWarehouseScope: 'All' | 'NB' | 'BB';
    defaultCostBasis: 'PP' | 'FOB';
    defaultDemandSource: '3M' | '6M' | '12M';
    currency: 'VND' | 'EUR';
    language: 'vi' | 'en';

    // Thresholds
    excessThresholdPct: number;
    criticalMosThreshold: number;
    warningMosThreshold: number;

    // Export
    exportIncludeComputed: boolean;
    exportIncludePipeline: boolean;
    exportIncludeSalesHistory: boolean;
    exportDecimalPrecision: number;
    exportDateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
    exportSeparator: 'comma' | 'semicolon' | 'tab';
    exportEncoding: 'utf8-bom' | 'utf8';

    // Export - Columns
    exportColumns: {
        itemCode: boolean; itemName: boolean; typeCar: boolean; loisGroup: boolean; trendFlag: boolean;
        status: boolean; backorder: boolean; backorderNB: boolean; backorderBB: boolean;
        stockNB: boolean; stockBB: boolean; totalInventory: boolean; totalPO: boolean; poThisMonth: boolean;
        debtPriority: boolean; debtStatus: boolean; baseForecast: boolean;
        avgQty3M: boolean; avgQty6M: boolean; avgQty12M: boolean; mos: boolean;
        rop: boolean; stockMax: boolean; safetyStock: boolean;
        unitCostPP: boolean; unitCostFOB: boolean; stockValue: boolean;
        excessQty: boolean; excessValue: boolean; dealerInventory: boolean;
        note: boolean; snp: boolean;
    };

    orderDraftColumns: {
        itemCode: boolean; itemName: boolean; status: boolean; typeCar: boolean;
        airQty: boolean; seaQty: boolean; totalQty: boolean; totalAmount: boolean; currency: boolean;
        unitCostPP: boolean; unitCostFOB: boolean; unitCost: boolean;
        noteOrder: boolean; noteData: boolean;
        snp: boolean; loisGroup: boolean; trendFlag: boolean;
        available: boolean; netDemand: boolean; dealerInventory: boolean;
        incomingMonth: boolean; totalPO: boolean; backorder: boolean;
        debtPriority: boolean; debtStatus: boolean;
        suggestQty: boolean; suggestBOQty: boolean; safetyStock: boolean;
        avgQty3M: boolean; avgQty6M: boolean; avgQty12M: boolean; avgQty24M: boolean; baseForecast: boolean;
        salesM1: boolean; mos: boolean; currentCst: boolean; cstAfterOrder: boolean;
        rop: boolean; stockMax: boolean;
    };

    loisProfiles: LoisProfile[];
    companyName: string;
    reportTitle: string;
    autoSaveState: boolean;
    snapshotDate: string;
    warehouseScope?: 'All' | 'NB' | 'BB';
    costBasis?: 'PP' | 'FOB';
    demandSource?: '3M' | '6M' | '12M';
    params?: { lt: number; sp: number; ssp: number };
    seasonalityTuning?: {
        useSPD: boolean;
        tetWeight: number;
        weatherWeight: number;
    };
    applySeasonality?: boolean;
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
    loisProfiles: [
        { id: '1', parentGroup: 'L', name: '> 300 cái/năm (Fast)', noPlan: false, alertType: 'none', targetMOS: 3.5, targetExcessPct: 5 },
        { id: '2', parentGroup: 'L', name: '101 - 300 cái/năm', noPlan: false, alertType: 'none', targetMOS: 4.0, targetExcessPct: 7 },
        { id: '3', parentGroup: 'L', name: '61 - 100 cái/năm', noPlan: false, alertType: 'none', targetMOS: 4.5, targetExcessPct: 10 },
        { id: '4', parentGroup: 'L', name: '25 - 60 cái/năm', noPlan: false, alertType: 'none', targetMOS: 5.0, targetExcessPct: 12 },
        { id: '5', parentGroup: 'L', name: '13 - 24 cái/năm', noPlan: false, alertType: 'none', targetMOS: 5.5, targetExcessPct: 15 },
        { id: '6', parentGroup: 'L', name: '7 - 12 cái/năm', noPlan: false, alertType: 'none', targetMOS: 6.0, targetExcessPct: 18 },
        { id: '7', parentGroup: 'L', name: '4 - 6 cái/năm', noPlan: false, alertType: 'none', targetMOS: 7.0, targetExcessPct: 25 },
        { id: '8', parentGroup: 'L', name: '1 - 3 cái/năm (Low)', noPlan: false, alertType: 'none', targetMOS: 8.0, targetExcessPct: 30 },
        { id: 'E', parentGroup: 'O', name: 'Hàng thay thế cũ (Superseded)', noPlan: true, alertType: 'warning', targetMOS: 1.5, targetExcessPct: 10 },
        { id: 'N', parentGroup: 'O', name: 'Không bán > 6 tháng', noPlan: true, alertType: 'warning', targetMOS: 1.5, targetExcessPct: 10 },
        { id: 'A', parentGroup: 'O', name: 'Không bán 12 - 24 tháng', noPlan: true, alertType: 'critical', targetMOS: 1.0, targetExcessPct: 10 },
        { id: 'V', parentGroup: 'O', name: 'Không bán > 24 tháng (Dead)', noPlan: true, alertType: 'critical', targetMOS: 1.0, targetExcessPct: 10 },
        { id: 'I', parentGroup: 'I', name: 'Inactive (Ngưng hoạt động)', noPlan: true, alertType: 'critical', targetMOS: 0.5, targetExcessPct: 30 },
    ],
    companyName: 'Auto Parts Governance',
    reportTitle: 'Báo cáo Tồn Kho',
    autoSaveState: true,
    snapshotDate: new Date().toISOString().split('T')[0],
    seasonalityTuning: {
        useSPD: true,
        tetWeight: 1.2,
        weatherWeight: 1.0
    },
};

export const DEFAULT_LOIS_PROFILES: LoisProfile[] = DEFAULT_APP_SETTINGS.loisProfiles;

const STORAGE_KEY = 'atp_app_settings';

export const loadAppSettings = (): AppSettings => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Migration logic
            if (parsed.bmwLeadTime !== undefined && !parsed.sourceProfiles) {
                parsed.sourceProfiles = [...DEFAULT_SOURCE_PROFILES];
                const bmwProfile = parsed.sourceProfiles.find((p: SourceProfile) => p.id === 'BMWASIA');
                if (bmwProfile) {
                    bmwProfile.lt = parsed.bmwLeadTime;
                    bmwProfile.sp = parsed.bmwSafetyPeriod ?? 15;
                    bmwProfile.ssp = parsed.bmwSafetyStockPeriod ?? 7;
                }
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
            }

            if (parsed.sourceProfiles && Array.isArray(parsed.sourceProfiles)) {
                parsed.sourceProfiles = parsed.sourceProfiles.map((p: any) => ({
                    ...p,
                    brand: p.brand || (p.id === 'BMWASIA' ? 'BMW' : 'Kia')
                }));
            }

            return { ...DEFAULT_APP_SETTINGS, ...parsed };
        }
    } catch { }
    return DEFAULT_APP_SETTINGS;
};

export const saveAppSettings = (s: AppSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
};
