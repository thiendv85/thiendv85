import { describe, it, expect } from 'vitest';
import { validatePreApproval } from '../approval-rules';
import type { ApprovalRequest } from '../../types/inventory';

function makeRequest(overrides: any = {}): ApprovalRequest {
    return {
        id: 'req-1',
        draft_name: 'Test',
        brand: 'Kia',
        workflow_id: 'wf-1',
        current_level: 1,
        status: 'pending',
        submitted_by: 'user-1',
        submitted_at: '2026-01-01',
        version: 1,
        snapshot_data: {
            quantities: {},
            inventory_context: [],
            submitted_at: '2026-01-01',
            app_version: '16',
            ...overrides.snapshot_data,
        },
        ...overrides,
    } as ApprovalRequest;
}

function makeCtx(code: string, overrides: any = {}) {
    return {
        itemCode: code,
        unitCost: 10000,
        mos: 2,
        available: 50,
        baseForecast: 10,
        ...overrides,
    };
}

describe('validatePreApproval', () => {
    it('passes with empty snapshot', () => {
        const req = makeRequest({ snapshot_data: null });
        const result = validatePreApproval(req);
        expect(result.passed).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('passes with no quantities', () => {
        const req = makeRequest();
        const result = validatePreApproval(req);
        expect(result.passed).toBe(true);
    });

    it('warns on budget threshold (>500M VND)', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 100, sea: 0 } },
                inventory_context: [makeCtx('ABC', { unitCost: 6_000_000 })], // 100*6M = 600M
            },
        });
        const result = validatePreApproval(req);
        const budgetWarn = result.warnings.find(w => w.code === 'BUDGET_HIGH');
        expect(budgetWarn).toBeDefined();
        expect(budgetWarn!.severity).toBe('warning');
    });

    it('no budget warning when under threshold', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 10, sea: 0 } },
                inventory_context: [makeCtx('ABC', { unitCost: 1000 })],
            },
        });
        const result = validatePreApproval(req);
        expect(result.warnings.find(w => w.code === 'BUDGET_HIGH')).toBeUndefined();
    });

    it('warns on excess MOS (>6 months)', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 5, sea: 0 } },
                inventory_context: [makeCtx('ABC', { mos: 8 })],
            },
        });
        const result = validatePreApproval(req);
        const excessWarn = result.warnings.find(w => w.code === 'EXCESS_MOS');
        expect(excessWarn).toBeDefined();
        expect(excessWarn!.itemCode).toBe('ABC');
    });

    it('info on critical stock (MOS < 0.5)', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 5, sea: 0 } },
                inventory_context: [makeCtx('ABC', { mos: 0.2, baseForecast: 10 })],
            },
        });
        const result = validatePreApproval(req);
        const critWarn = result.warnings.find(w => w.code === 'CRITICAL_STOCK');
        expect(critWarn).toBeDefined();
        expect(critWarn!.severity).toBe('info');
    });

    it('info on OOS not ordered', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 0, sea: 0 } },
                inventory_context: [makeCtx('ABC', { available: -5, baseForecast: 10 })],
            },
        });
        const result = validatePreApproval(req);
        const oosWarn = result.warnings.find(w => w.code === 'OOS_NOT_ORDERED');
        expect(oosWarn).toBeDefined();
    });

    it('warns on large single-item order (>100M VND)', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 50, sea: 0 } },
                inventory_context: [makeCtx('ABC', { unitCost: 3_000_000 })], // 50*3M = 150M
            },
        });
        const result = validatePreApproval(req);
        const largeWarn = result.warnings.find(w => w.code === 'LARGE_ITEM_ORDER');
        expect(largeWarn).toBeDefined();
    });

    it('passes = true when only warnings (no errors)', () => {
        const req = makeRequest({
            snapshot_data: {
                quantities: { ABC: { air: 100, sea: 0 } },
                inventory_context: [makeCtx('ABC', { unitCost: 6_000_000, mos: 8 })],
            },
        });
        const result = validatePreApproval(req);
        expect(result.passed).toBe(true); // warnings don't block
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});
