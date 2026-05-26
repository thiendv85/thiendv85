// ─────────────────────────────────────────────────────────────────────────────
// PRE-APPROVAL VALIDATION RULES (Phase 7)
// Business logic checks before approval
// ─────────────────────────────────────────────────────────────────────────────

import { ApprovalRequest } from '../types/inventory';

export interface ValidationWarning {
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    itemCode?: string;
}

export interface PreApprovalResult {
    passed: boolean;
    warnings: ValidationWarning[];
}

const BUDGET_THRESHOLD = 500_000_000; // 500M VND
const HIGH_MOS_THRESHOLD = 6;         // months
const LOW_MOS_THRESHOLD = 0.5;        // months

/**
 * Validate business rules before approving a request.
 * Returns warnings (not blocking) and errors (blocking).
 */
export function validatePreApproval(request: ApprovalRequest): PreApprovalResult {
    const warnings: ValidationWarning[] = [];
    const snap = request.snapshot_data;
    if (!snap?.quantities || !snap?.inventory_context) return { passed: true, warnings: [] };

    // ── Rule 1: Budget threshold ─────────────────────────────────────────────
    let totalValue = 0;
    Object.entries(snap.quantities).forEach(([code, qty]) => {
        const ctx = snap.inventory_context.find(c => c.itemCode === code);
        if (ctx) {
            totalValue += (ctx.unitCost || 0) * ((qty.air || 0) + (qty.sea || 0));
        }
    });

    if (totalValue > BUDGET_THRESHOLD) {
        warnings.push({
            code: 'BUDGET_HIGH',
            message: `Tổng giá trị đơn: ${(totalValue / 1e6).toFixed(1)}M VND (vượt ngưỡng ${(BUDGET_THRESHOLD / 1e6).toFixed(0)}M)`,
            severity: 'warning',
        });
    }

    // ── Rule 2: Items with excess stock (MOS > 6) being ordered ──────────────
    snap.inventory_context.forEach(ctx => {
        const qty = snap.quantities[ctx.itemCode];
        const totalQty = (qty?.air || 0) + (qty?.sea || 0);
        if (totalQty > 0 && ctx.mos > HIGH_MOS_THRESHOLD) {
            warnings.push({
                code: 'EXCESS_MOS',
                message: `${ctx.itemCode}: MOS = ${ctx.mos.toFixed(1)} tháng, tồn kho đang cao`,
                severity: 'warning',
                itemCode: ctx.itemCode,
            });
        }
    });

    // ── Rule 3: Items with critically low stock ──────────────────────────────
    const criticalItems = snap.inventory_context.filter(ctx => {
        const qty = snap.quantities[ctx.itemCode];
        const totalQty = (qty?.air || 0) + (qty?.sea || 0);
        return totalQty > 0 && ctx.mos < LOW_MOS_THRESHOLD && ctx.baseForecast > 0.02;
    });

    if (criticalItems.length > 0) {
        warnings.push({
            code: 'CRITICAL_STOCK',
            message: `${criticalItems.length} mã hàng tồn kho cực thấp (MOS < ${LOW_MOS_THRESHOLD})`,
            severity: 'info',
        });
    }

    // ── Rule 4: OOS items not being ordered ──────────────────────────────────
    const oosNotOrdered = snap.inventory_context.filter(ctx => {
        const qty = snap.quantities[ctx.itemCode];
        const totalQty = (qty?.air || 0) + (qty?.sea || 0);
        return ctx.available <= 0 && ctx.baseForecast > 0.02 && totalQty === 0;
    });

    if (oosNotOrdered.length > 0) {
        warnings.push({
            code: 'OOS_NOT_ORDERED',
            message: `${oosNotOrdered.length} mã hết hàng (OOS) nhưng không đặt: ${oosNotOrdered.slice(0, 3).map(c => c.itemCode).join(', ')}${oosNotOrdered.length > 3 ? '...' : ''}`,
            severity: 'info',
        });
    }

    // ── Rule 5: Large single-item orders ─────────────────────────────────────
    snap.inventory_context.forEach(ctx => {
        const qty = snap.quantities[ctx.itemCode];
        const totalQty = (qty?.air || 0) + (qty?.sea || 0);
        const itemValue = (ctx.unitCost || 0) * totalQty;
        if (itemValue > 100_000_000) { // Single item > 100M VND
            warnings.push({
                code: 'LARGE_ITEM_ORDER',
                message: `${ctx.itemCode}: ${(itemValue / 1e6).toFixed(1)}M VND cho đơn lẻ`,
                severity: 'warning',
                itemCode: ctx.itemCode,
            });
        }
    });

    const hasErrors = warnings.filter(w => w.severity === 'error').length > 0;
    return { passed: !hasErrors, warnings };
}
