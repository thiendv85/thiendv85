/**
 * ZOD VALIDATION SCHEMAS — Runtime validation for external data boundaries
 *
 * Three boundaries:
 * 1. CSV parsed rows (inventory, dealer stock, backorder, monthly, supersession)
 * 2. App settings (localStorage, imported JSON)
 * 3. Supabase responses (approval requests, profiles, snapshots)
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Coerce value to number, fallback to 0 */
const numOrZero = z.coerce.number().catch(0);

/** Coerce value to number, fallback to null */
const numOrNull = z.coerce.number().nullable().catch(null);

/** Non-empty trimmed string */
const requiredStr = z.string().trim().min(1, 'Required field');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CSV ROW SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export const inventoryRowSchema = z
    .object({
        ItemCode: requiredStr,
        ItemName: z.string().default(''),
        TypeCar: z.string().default(''),
        LOISGroup: z.string().default(''),
        TrendFlag: z.string().default(''),
        Status: z.string().default(''),
        Note: z.string().default(''),
        SNP: numOrZero,
        QuantityInventory_NB: numOrZero,
        QuantityInventory_BB: numOrZero,
        QuantityDC_NB: numOrZero,
        QuantityDC_BB: numOrZero,
        Backorder: numOrZero,
        Backorder_NB: numOrZero,
        Backorder_BB: numOrZero,
        DealerInventory: numOrZero,
        TotalInventory: numOrZero,
        TotalDC: numOrZero,
        TotalPO: numOrZero,
        TotalSupply: numOrZero,
        NetDemand: numOrZero,
        SourceId: z.string().optional(),
        BrandName: z.string().optional(),
        AvgQty3M: numOrZero,
        AvgQty6M: numOrZero,
        AvgQty12M: numOrZero,
        AvgQty24M: numOrZero,
        BaseForecast: numOrZero,
        Forecast_NB: numOrZero.optional(),
        Forecast_BB: numOrZero.optional(),
        SalesHistory: z.array(z.number()).default([]),
        Pipeline: z.record(z.string(), z.number()).default({}),
        UnitCost_PP: numOrZero,
        UnitCost_FOB: numOrZero,
    })
    .passthrough(); // allow extra fields

export type ValidatedInventoryRow = z.infer<typeof inventoryRowSchema>;

export const dealerDetailSchema = z.object({
    BranchName: z.string().default(''),
    Showroom: z.string().default(''),
    Qty: numOrZero,
});

export const backorderDetailSchema = z
    .object({
        ItemCode: requiredStr,
        ItemName: z.string().default(''),
        DocDate: z.string().default(''),
        DocNo: z.string().default(''),
        Qty: numOrZero,
        Warehouse: z.string().default(''),
        BranchCode: z.string().optional(),
        BranchName: z.string().optional(),
        BranchCodeReceipt: z.string().optional(),
        OrderType: z.string().optional(),
        TypeCar: z.string().optional(),
        KhoNo: z.string().optional(),
        Note: z.string().optional(),
        Showroom: z.string().optional(),
        ETA: z.string().optional(),
    })
    .passthrough();

export const supersessionMappingSchema = z
    .object({
        oldPartNumber: requiredStr,
        newPartNumber: requiredStr,
        effectiveDate: z.string().optional(),
        notes: z.string().optional(),
    })
    .passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// 2. APP SETTINGS SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

const sourceProfileSchema = z.object({
    id: requiredStr,
    brand: z.enum(['Kia', 'Mazda', 'Stellantis', 'BMW']),
    name: z.string(),
    lt: z.number().min(0).max(365),
    sp: z.number().min(0).max(365),
    ssp: z.number().min(0).max(365),
    motherGroup: z.string().optional(),
});

const loisProfileSchema = z.object({
    id: requiredStr,
    parentGroup: z.string(),
    name: z.string(),
    noPlan: z.boolean(),
    alertType: z.enum(['none', 'info', 'warning', 'critical']),
    targetMOS: z.number().min(0),
    targetExcessPct: z.number().min(0),
});

export const appSettingsSchema = z
    .object({
        sourceProfiles: z.array(sourceProfileSchema).min(1),
        activeSourceId: z.string(),
        defaultWarehouseScope: z.enum(['All', 'NB', 'BB']),
        defaultCostBasis: z.enum(['PP', 'FOB']),
        currency: z.enum(['VND', 'EUR']),
        language: z.enum(['vi', 'en']),
        excessThresholdPct: z.number().min(0).max(100),
        criticalMosThreshold: z.number().min(0),
        warningMosThreshold: z.number().min(0),
        exportIncludeComputed: z.boolean(),
        exportIncludePipeline: z.boolean(),
        exportIncludeSalesHistory: z.boolean(),
        exportDecimalPrecision: z.number().int().min(0).max(6),
        exportDateFormat: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']),
        exportSeparator: z.enum(['comma', 'semicolon', 'tab']),
        exportEncoding: z.enum(['utf8-bom', 'utf8']),
        exportColumns: z.record(z.string(), z.boolean()),
        orderDraftColumns: z.record(z.string(), z.boolean()),
        backorderExportColumns: z.record(z.string(), z.boolean()),
        loisProfiles: z.array(loisProfileSchema),
        companyName: z.string(),
        reportTitle: z.string(),
        autoSaveState: z.boolean(),
        snapshotDate: z.string(),
        seasonalityTuning: z.object({
            useSPD: z.boolean(),
            tetWeight: z.number().min(0).max(5),
            weatherWeight: z.number().min(0).max(5),
        }),
    })
    .passthrough(); // allow forward-compat fields

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUPABASE RESPONSE SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export const profileRowSchema = z.object({
    id: requiredStr,
    full_name: z.string().nullable().optional(),
    role: z.enum(['admin', 'manager', 'viewer']).catch('viewer'),
    email: z.string().email().optional().nullable(),
    brand: z.string().nullable().optional(),
});

export const approvalRequestSchema = z
    .object({
        id: requiredStr,
        draft_name: z.string(),
        brand: z.string().nullable(),
        workflow_id: z.string(),
        current_level: z.number().int().min(1),
        status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).catch('pending'),
        submitted_by: z.string(),
        submitted_at: z.string(),
        version: z.number().int().min(1),
        deadline: z.string().nullable().optional(),
        summary: z
            .object({
                skuCount: z.number(),
                totalQty: z.number(),
                totalValue: z.number(),
            })
            .nullable()
            .optional(),
        snapshot_data: z.unknown().optional(), // complex nested, validated separately when decompressed
    })
    .passthrough();

export const snapshotMetadataSchema = z
    .object({
        id: requiredStr,
        filename: z.string(),
        storage_path: z.string(),
        upload_date: z.string(),
        brand: z.string().nullable().optional(),
        row_count: z.number().nullable().optional(),
        file_size_bytes: z.number().nullable().optional(),
        uploader_name: z.string().nullable().optional(),
    })
    .passthrough();

export const workflowSchema = z
    .object({
        id: requiredStr,
        name: z.string(),
        brand: z.string().nullable(),
        levels: z
            .array(
                z.object({
                    level: z.number().int(),
                    approver_ids: z.array(z.string()),
                }),
            )
            .min(1),
        is_active: z.boolean(),
    })
    .passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationResult<T> =
    | {
          success: true;
          data: T;
      }
    | {
          success: false;
          errors: string[];
      };

/**
 * Validate data against schema. Returns typed result or error messages.
 * Use at system boundaries (CSV parse output, localStorage read, Supabase response).
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    };
}

/**
 * Validate array of items, filtering out invalid ones.
 * Returns valid items + count of rejected items.
 */
export function validateArray<T>(
    schema: z.ZodType<T>,
    items: unknown[],
): {
    valid: T[];
    rejected: number;
    firstErrors?: string[];
} {
    const valid: T[] = [];
    let rejected = 0;
    let firstErrors: string[] | undefined;

    for (const item of items) {
        const result = schema.safeParse(item);
        if (result.success) {
            valid.push(result.data);
        } else {
            rejected++;
            if (!firstErrors) {
                firstErrors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            }
        }
    }

    return { valid, rejected, firstErrors };
}

/**
 * Safe JSON parse with schema validation.
 * Use for localStorage reads and imported JSON files.
 */
export function safeJsonParse<T>(schema: z.ZodType<T>, raw: string): ValidationResult<T> {
    try {
        const parsed = JSON.parse(raw);
        return validate(schema, parsed);
    } catch {
        return { success: false, errors: ['Invalid JSON'] };
    }
}
