import { describe, it, expect } from 'vitest';
import {
    inventoryRowSchema,
    backorderDetailSchema,
    appSettingsSchema,
    profileRowSchema,
    approvalRequestSchema,
    snapshotMetadataSchema,
    supersessionMappingSchema,
    validate,
    validateArray,
    safeJsonParse,
} from '../validation';

// ─── CSV Row Schemas ─────────────────────────────────────────────────────────

describe('inventoryRowSchema', () => {
    it('accepts valid inventory row', () => {
        const row = {
            ItemCode: 'YL000622ZD',
            ItemName: 'Lọc gió',
            TypeCar: 'K5',
            LOISGroup: 'L1',
            TrendFlag: 'UP',
            Status: 'Active',
            Note: '',
            SNP: 10,
            QuantityInventory_NB: 50,
            QuantityInventory_BB: 20,
            QuantityDC_NB: 5,
            QuantityDC_BB: 3,
            Backorder: 8,
            Backorder_NB: 5,
            Backorder_BB: 3,
            DealerInventory: 30,
            TotalInventory: 70,
            TotalDC: 8,
            TotalPO: 15,
            TotalSupply: 93,
            NetDemand: -85,
            AvgQty3M: 12,
            AvgQty6M: 10,
            AvgQty12M: 9,
            AvgQty24M: 8,
            BaseForecast: 11,
            SalesHistory: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            Pipeline: { '2026-01': 5 },
            UnitCost_PP: 150000,
            UnitCost_FOB: 120000,
        };
        const result = inventoryRowSchema.safeParse(row);
        expect(result.success).toBe(true);
    });

    it('rejects row without ItemCode', () => {
        const row = { ItemName: 'Test' };
        const result = inventoryRowSchema.safeParse(row);
        expect(result.success).toBe(false);
    });

    it('coerces string numbers to number', () => {
        const row = {
            ItemCode: 'ABC123',
            SNP: '10' as any,
            QuantityInventory_NB: '50.5' as any,
        };
        const result = inventoryRowSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.SNP).toBe(10);
            expect(result.data.QuantityInventory_NB).toBe(50.5);
        }
    });

    it('defaults missing numeric fields to 0', () => {
        const row = { ItemCode: 'X1' };
        const result = inventoryRowSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.Backorder).toBe(0);
            expect(result.data.UnitCost_PP).toBe(0);
            expect(result.data.SalesHistory).toEqual([]);
        }
    });

    it('preserves extra fields via passthrough', () => {
        const row = { ItemCode: 'X1', CustomField: 'hello' };
        const result = inventoryRowSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as any).CustomField).toBe('hello');
        }
    });
});

describe('backorderDetailSchema', () => {
    it('accepts valid backorder detail', () => {
        const detail = {
            ItemCode: 'YL000622ZD',
            DocDate: '25/03/2026',
            DocNo: 'PO-001',
            Qty: 5,
            Warehouse: 'WH01',
        };
        const result = backorderDetailSchema.safeParse(detail);
        expect(result.success).toBe(true);
    });

    it('rejects missing ItemCode', () => {
        const detail = { DocNo: 'PO-001', Qty: 5 };
        const result = backorderDetailSchema.safeParse(detail);
        expect(result.success).toBe(false);
    });
});

describe('supersessionMappingSchema', () => {
    it('accepts valid mapping', () => {
        const mapping = { oldPartNumber: 'OLD001', newPartNumber: 'NEW001' };
        const result = supersessionMappingSchema.safeParse(mapping);
        expect(result.success).toBe(true);
    });

    it('rejects empty part numbers', () => {
        const mapping = { oldPartNumber: '', newPartNumber: 'NEW001' };
        const result = supersessionMappingSchema.safeParse(mapping);
        expect(result.success).toBe(false);
    });
});

// ─── App Settings Schema ─────────────────────────────────────────────────────

describe('appSettingsSchema', () => {
    const validSettings = {
        sourceProfiles: [{ id: 'NB', brand: 'Kia', name: 'Nhật Bản', lt: 90, sp: 30, ssp: 15 }],
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
        exportColumns: {},
        orderDraftColumns: {},
        backorderExportColumns: {},
        loisProfiles: [],
        companyName: 'Test',
        reportTitle: 'Report',
        autoSaveState: true,
        snapshotDate: '2026-05-26',
        seasonalityTuning: { useSPD: false, tetWeight: 1.5, weatherWeight: 1.0 },
    };

    it('accepts valid settings', () => {
        const result = appSettingsSchema.safeParse(validSettings);
        expect(result.success).toBe(true);
    });

    it('rejects invalid brand in sourceProfiles', () => {
        const bad = {
            ...validSettings,
            sourceProfiles: [{ id: 'X', brand: 'InvalidBrand', name: 'Test', lt: 30, sp: 10, ssp: 5 }],
        };
        const result = appSettingsSchema.safeParse(bad);
        expect(result.success).toBe(false);
    });

    it('rejects lead time > 365', () => {
        const bad = {
            ...validSettings,
            sourceProfiles: [{ id: 'X', brand: 'Kia', name: 'Test', lt: 500, sp: 10, ssp: 5 }],
        };
        const result = appSettingsSchema.safeParse(bad);
        expect(result.success).toBe(false);
    });

    it('rejects empty sourceProfiles', () => {
        const bad = { ...validSettings, sourceProfiles: [] };
        const result = appSettingsSchema.safeParse(bad);
        expect(result.success).toBe(false);
    });
});

// ─── Supabase Response Schemas ───────────────────────────────────────────────

describe('profileRowSchema', () => {
    it('accepts valid profile', () => {
        const profile = { id: 'uuid-123', full_name: 'Nguyễn Văn A', role: 'admin', email: 'a@b.com' };
        const result = profileRowSchema.safeParse(profile);
        expect(result.success).toBe(true);
    });

    it('defaults unknown role to viewer', () => {
        const profile = { id: 'uuid-123', role: 'superadmin' };
        const result = profileRowSchema.safeParse(profile);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.role).toBe('viewer');
        }
    });

    it('rejects missing id', () => {
        const profile = { role: 'admin' };
        const result = profileRowSchema.safeParse(profile);
        expect(result.success).toBe(false);
    });
});

describe('approvalRequestSchema', () => {
    it('accepts valid approval request', () => {
        const req = {
            id: 'req-1',
            draft_name: 'Draft A',
            brand: 'Kia',
            workflow_id: 'wf-1',
            current_level: 1,
            status: 'pending',
            submitted_by: 'user-1',
            submitted_at: '2026-05-26T00:00:00Z',
            version: 1,
        };
        const result = approvalRequestSchema.safeParse(req);
        expect(result.success).toBe(true);
    });

    it('defaults unknown status to pending', () => {
        const req = {
            id: 'req-1',
            draft_name: 'Draft A',
            brand: null,
            workflow_id: 'wf-1',
            current_level: 1,
            status: 'unknown_status',
            submitted_by: 'user-1',
            submitted_at: '2026-05-26',
            version: 1,
        };
        const result = approvalRequestSchema.safeParse(req);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.status).toBe('pending');
        }
    });
});

describe('snapshotMetadataSchema', () => {
    it('accepts valid snapshot metadata', () => {
        const snap = {
            id: 'snap-1',
            filename: 'inventory_2026.csv',
            storage_path: 'snapshots/2026/file.gz',
            upload_date: '2026-05-26',
            brand: 'Kia',
            row_count: 5000,
            file_size_bytes: 1024000,
        };
        const result = snapshotMetadataSchema.safeParse(snap);
        expect(result.success).toBe(true);
    });

    it('allows null optional fields', () => {
        const snap = {
            id: 'snap-1',
            filename: 'test.csv',
            storage_path: 'path/to/file',
            upload_date: '2026-01-01',
            brand: null,
            row_count: null,
            file_size_bytes: null,
        };
        const result = snapshotMetadataSchema.safeParse(snap);
        expect(result.success).toBe(true);
    });
});

// ─── Validation Helpers ──────────────────────────────────────────────────────

describe('validate', () => {
    it('returns success with data for valid input', () => {
        const result = validate(profileRowSchema, { id: 'x', role: 'admin' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.id).toBe('x');
    });

    it('returns errors for invalid input', () => {
        const result = validate(profileRowSchema, { role: 'admin' });
        expect(result.success).toBe(false);
        expect((result as { success: false; errors: string[] }).errors.length).toBeGreaterThan(0);
    });
});

describe('validateArray', () => {
    it('filters invalid items and counts rejected', () => {
        const items = [
            { id: 'a', role: 'admin' },
            { role: 'viewer' }, // missing id
            { id: 'b', role: 'manager' },
        ];
        const result = validateArray(profileRowSchema, items);
        expect(result.valid.length).toBe(2);
        expect(result.rejected).toBe(1);
        expect(result.firstErrors).toBeDefined();
    });

    it('returns all valid when no rejects', () => {
        const items = [
            { id: 'a', role: 'admin' },
            { id: 'b', role: 'viewer' },
        ];
        const result = validateArray(profileRowSchema, items);
        expect(result.valid.length).toBe(2);
        expect(result.rejected).toBe(0);
    });
});

describe('safeJsonParse', () => {
    it('parses valid JSON and validates', () => {
        const json = JSON.stringify({ id: 'x', role: 'admin' });
        const result = safeJsonParse(profileRowSchema, json);
        expect(result.success).toBe(true);
    });

    it('returns error for invalid JSON', () => {
        const result = safeJsonParse(profileRowSchema, '{bad json');
        expect(result.success).toBe(false);
        expect((result as { success: false; errors: string[] }).errors).toContain('Invalid JSON');
    });

    it('returns error for valid JSON but invalid schema', () => {
        const json = JSON.stringify({ role: 'admin' });
        const result = safeJsonParse(profileRowSchema, json);
        expect(result.success).toBe(false);
    });
});
