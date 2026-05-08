// Lightweight settings I/O — extracted from pages/Settings.tsx so callers (App.tsx, hooks)
// can read/write app settings without dragging the whole 2000+ line SettingsPage component
// into the initial bundle. SettingsPage can now be lazy-loaded.

import type { Brand, SourceProfile, ApprovalWorkflow, LoisProfile } from '../types/inventory';
import { DEFAULT_SOURCE_PROFILES } from '../types/inventory';

export interface AppSettings {
  sourceProfiles: SourceProfile[];
  activeSourceId: string;
  defaultWarehouseScope: 'All' | 'NB' | 'BB';
  defaultCostBasis: 'PP' | 'FOB';
  defaultDemandSource: '3M' | '6M' | '12M';
  currency: 'VND' | 'EUR';
  language: 'vi' | 'en';
  excessThresholdPct: number;
  criticalMosThreshold: number;
  warningMosThreshold: number;
  exportIncludeComputed: boolean;
  exportIncludePipeline: boolean;
  exportIncludeSalesHistory: boolean;
  exportDecimalPrecision: number;
  exportDateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  exportSeparator: 'comma' | 'semicolon' | 'tab';
  exportEncoding: 'utf8-bom' | 'utf8';
  exportColumns: Record<string, boolean>;
  orderDraftColumns: Record<string, boolean>;
  loisProfiles: LoisProfile[];
  companyName: string;
  reportTitle: string;
  autoSaveState: boolean;
  snapshotDate: string;
  seasonalityTuning: {
    useSPD: boolean;
    tetWeight: number;
    weatherWeight: number;
  };
}

const STORAGE_KEY = 'atp_app_settings';

// Default value source — duplicated minimally here so App.tsx can boot without lazy-loading
// the full SettingsPage. The full DEFAULT_APP_SETTINGS lives in pages/Settings.tsx and
// initialises from this skeleton merged with the SettingsPage-only fields at runtime.
const DEFAULT_LITE: AppSettings = {
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
  exportColumns: {},
  orderDraftColumns: {},
  loisProfiles: [],
  companyName: 'Auto Parts Governance',
  reportTitle: 'Báo cáo Tồn Kho',
  autoSaveState: true,
  snapshotDate: new Date().toISOString().split('T')[0],
  seasonalityTuning: { useSPD: false, tetWeight: 1.5, weatherWeight: 1.0 },
};

export const loadAppSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_LITE;
    const parsed = JSON.parse(saved);

    // Legacy migration: bmwLeadTime → sourceProfiles
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
      for (const k of [
        'bmwLeadTime',
        'bmwSafetyPeriod',
        'bmwSafetyStockPeriod',
        'defaultLeadTime',
        'defaultSafetyPeriod',
        'defaultSafetyStockPeriod',
      ]) delete parsed[k];
    }

    if (Array.isArray(parsed.sourceProfiles)) {
      parsed.sourceProfiles = parsed.sourceProfiles.map((p: SourceProfile & { brand?: Brand }) =>
        p.brand ? p : { ...p, brand: (p.id === 'BMWASIA' ? 'BMW' : 'Kia') as Brand }
      );
    }

    return { ...DEFAULT_LITE, ...parsed };
  } catch {
    return DEFAULT_LITE;
  }
};

export const saveAppSettings = (s: AppSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
};

export type { ApprovalWorkflow };
