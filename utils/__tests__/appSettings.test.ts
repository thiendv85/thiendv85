import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppSettings, saveAppSettings } from '../appSettings';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('loadAppSettings', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    it('returns defaults when nothing stored', () => {
        const settings = loadAppSettings();
        expect(settings.activeSourceId).toBe('NB');
        expect(settings.currency).toBe('VND');
        expect(settings.language).toBe('vi');
        expect(settings.sourceProfiles.length).toBeGreaterThan(0);
    });

    it('merges stored partial settings with defaults', () => {
        localStorageMock.setItem(
            'atp_app_settings',
            JSON.stringify({
                currency: 'EUR',
                language: 'en',
            }),
        );
        const settings = loadAppSettings();
        expect(settings.currency).toBe('EUR');
        expect(settings.language).toBe('en');
        // Defaults preserved
        expect(settings.activeSourceId).toBe('NB');
        expect(settings.exportDecimalPrecision).toBe(2);
    });

    it('returns defaults on corrupted JSON', () => {
        localStorageMock.setItem('atp_app_settings', '{corrupted json!!!');
        const settings = loadAppSettings();
        expect(settings.activeSourceId).toBe('NB');
        expect(settings.currency).toBe('VND');
    });

    it('migrates legacy bmwLeadTime to sourceProfiles', () => {
        localStorageMock.setItem(
            'atp_app_settings',
            JSON.stringify({
                bmwLeadTime: 45,
                bmwSafetyPeriod: 10,
                bmwSafetyStockPeriod: 5,
            }),
        );
        const settings = loadAppSettings();
        const bmw = settings.sourceProfiles.find(p => p.id === 'BMWASIA');
        expect(bmw).toBeDefined();
        expect(bmw!.lt).toBe(45);
        expect(bmw!.sp).toBe(10);
        expect(bmw!.ssp).toBe(5);
    });
});

describe('saveAppSettings', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    it('saves settings to localStorage', () => {
        const settings = loadAppSettings();
        saveAppSettings(settings);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('atp_app_settings', expect.any(String));
    });

    it('round-trips settings correctly', () => {
        const original = loadAppSettings();
        original.currency = 'EUR';
        original.language = 'en';
        saveAppSettings(original);

        const loaded = loadAppSettings();
        expect(loaded.currency).toBe('EUR');
        expect(loaded.language).toBe('en');
    });
});
