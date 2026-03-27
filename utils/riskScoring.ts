/**
 * Risk Scoring & Explainability Engine
 * Phân loại severity + sinh assessment text giải thích
 */

import { DemandPattern } from './demandPattern';

export type Severity = 'STOCKOUT' | 'RISK' | 'SPIKE' | 'OVERSTOCK' | 'DECLINING' | 'NORMAL';
export type ActionCode = 'ORDER_AIR' | 'EXPEDITE_PO' | 'REVIEW_FC' | 'TRANSFER_CUT' | 'HOLD_PO' | 'MONITOR';

export interface RiskResult {
    severity: Severity;
    action: ActionCode;
    reasonCodes: string[];
    assessment: string;
}

interface RiskInput {
    // From engine computed fields
    available: number;
    netAvailable: number;
    demandMonthly: number;
    mos: number;
    stockoutRiskFlag: boolean;
    isBOCritical: boolean;
    isStopBiz: boolean;
    excessQty: number;
    excessValue: number;
    totalPO: number;
    backorder: number;
    suggestedBO: number;
    slope: number;
    cv: number;
    forecastLinReg: number;

    // From safety stock calc
    newROP: number;
    newSS: number;
    newStockMax: number;
    stockoutGapQty: number;

    // From demand analysis
    actualM1: number;
    meanHistory: number;
    sigmaD: number;
    avg12M: number;

    // From forecast
    forecastValue: number;
    forecastMethod: string;
    forecastAccuracy: number;

    // From pattern & anomaly
    pattern: DemandPattern;
    anomalyType: 'NORMAL' | 'SPIKE' | 'DROP';

    // Context
    serviceLevel: number;
    serviceLevelLabel: string;
    leadTimeEstimated: boolean;
}

/**
 * Classify severity — priority order: STOCKOUT > RISK > SPIKE > OVERSTOCK > DECLINING > NORMAL
 */
export function classifySeverity(input: RiskInput): RiskResult {
    const reasons: string[] = [];

    // ─── 🔴 STOCKOUT ───
    if (
        (input.available <= 0 && input.demandMonthly > 0) ||
        input.isBOCritical ||
        (input.mos < 0.25 && input.demandMonthly > 0.5)
    ) {
        if (input.available <= 0) reasons.push('OUT_OF_STOCK');
        if (input.isBOCritical) reasons.push('BACKORDER_CRITICAL');
        if (input.mos < 0.25) reasons.push('MOS_CRITICAL');

        return {
            severity: 'STOCKOUT',
            action: 'ORDER_AIR',
            reasonCodes: reasons,
            assessment: buildStockoutAssessment(input, reasons),
        };
    }

    // ─── 🟠 RISK ───
    if (
        (input.stockoutRiskFlag && input.mos < 1.5 && !input.isStopBiz) ||
        (input.available < input.newROP && input.demandMonthly > 1 && input.available > 0 && !input.isStopBiz)
    ) {
        if (input.stockoutRiskFlag) reasons.push('BELOW_ROP_RESERVE');
        if (input.available < input.newROP) reasons.push('BELOW_NEW_ROP');
        if (input.backorder > 0) reasons.push('BACKORDER_PRESENT');

        return {
            severity: 'RISK',
            action: 'EXPEDITE_PO',
            reasonCodes: reasons,
            assessment: buildRiskAssessment(input, reasons),
        };
    }

    // ─── 🟡 SPIKE ───
    if (
        (input.anomalyType === 'SPIKE' && input.actualM1 >= 5) ||
        (input.slope > 2 && input.cv < 1.2 && input.mos < 3 && input.demandMonthly > 1)
    ) {
        if (input.anomalyType === 'SPIKE') reasons.push('DEMAND_SPIKE');
        if (input.slope > 2) reasons.push('TREND_UP');

        return {
            severity: 'SPIKE',
            action: 'REVIEW_FC',
            reasonCodes: reasons,
            assessment: buildSpikeAssessment(input, reasons),
        };
    }

    // ─── 🔵 OVERSTOCK ───
    if (
        (input.excessQty > 0 && input.mos > 6) ||
        (input.mos > 12 && input.demandMonthly > 0) ||
        (input.isStopBiz && input.available > 0)
    ) {
        if (input.excessQty > 0) reasons.push('EXCESS_STOCK');
        if (input.mos > 12) reasons.push('MOS_HIGH');
        if (input.isStopBiz) reasons.push('STOP_BIZ');

        return {
            severity: 'OVERSTOCK',
            action: 'TRANSFER_CUT',
            reasonCodes: reasons,
            assessment: buildOverstockAssessment(input, reasons),
        };
    }

    // ─── 🟢 DECLINING ───
    if (
        (input.slope < -2 && input.avg12M > 5 && input.mos > 3) ||
        (input.forecastLinReg < 0.3 * input.avg12M && input.avg12M > 10 && input.forecastLinReg >= 0)
    ) {
        if (input.slope < -2) reasons.push('TREND_DOWN');
        if (input.forecastLinReg < 0.3 * input.avg12M) reasons.push('FORECAST_DROP');

        return {
            severity: 'DECLINING',
            action: 'HOLD_PO',
            reasonCodes: reasons,
            assessment: buildDecliningAssessment(input, reasons),
        };
    }

    // ─── ⬜ NORMAL ───
    return {
        severity: 'NORMAL',
        action: 'MONITOR',
        reasonCodes: [],
        assessment: '',
    };
}

// ─── Assessment Builders ───

const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtVal = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'tr';
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k';
    return Math.round(n).toString();
};

function buildStockoutAssessment(i: RiskInput, reasons: string[]): string {
    const parts: string[] = [];
    if (reasons.includes('OUT_OF_STOCK')) parts.push('HẾT HÀNG');
    else if (reasons.includes('BACKORDER_CRITICAL')) parts.push(`BO ${fmt(i.backorder)} chưa giao`);
    else parts.push(`Còn ${i.mos.toFixed(1)}M`);

    parts.push(`— Demand ${fmt(i.demandMonthly)}/th`);
    if (i.totalPO > 0) parts.push(`PO: ${fmt(i.totalPO)}`);
    if (i.suggestedBO > 0) parts.push(`→ AIR ${fmt(i.suggestedBO)} units`);
    else parts.push(`→ Cần đặt AIR ngay`);

    return parts.join('. ');
}

function buildRiskAssessment(i: RiskInput, _reasons: string[]): string {
    const gap = Math.max(0, i.newROP - i.available);
    const parts = [
        `Còn ${i.mos.toFixed(1)}M (${fmt(i.available)} units)`,
        `— dưới ROP ${fmt(i.newROP)}`,
        `thiếu ${fmt(gap)} units`,
    ];
    if (i.totalPO > 0) parts.push(`PO đang về: ${fmt(i.totalPO)}`);
    if (i.suggestedBO > 0) parts.push(`→ Expedite hoặc AIR ${fmt(i.suggestedBO)}`);
    else parts.push(`→ Expedite PO`);

    return parts.join('. ');
}

function buildSpikeAssessment(i: RiskInput, reasons: string[]): string {
    const parts: string[] = [];
    if (reasons.includes('DEMAND_SPIKE')) {
        const pct = i.meanHistory > 0 ? Math.round(((i.actualM1 - i.meanHistory) / i.meanHistory) * 100) : 0;
        parts.push(`Bán ${fmt(i.actualM1)} vs TB ${fmt(i.meanHistory)} (+${pct}%)`);
    }
    if (reasons.includes('TREND_UP')) {
        parts.push(`Trend tăng ${i.slope.toFixed(1)}/th`);
    }
    parts.push(`CV=${i.cv.toFixed(2)}`);
    if (i.forecastLinReg > 0) parts.push(`→ Tăng FC lên ${fmt(i.forecastLinReg)}/th`);

    return parts.join('. ');
}

function buildOverstockAssessment(i: RiskInput, reasons: string[]): string {
    const parts = [`Tồn ${i.mos.toFixed(1)}M`];
    if (i.excessQty > 0) parts.push(`thừa ${fmt(i.excessQty)} units = ${fmtVal(i.excessValue)}đ`);
    if (reasons.includes('STOP_BIZ')) parts.push('(Ngừng KD)');
    if (i.totalPO > 0) parts.push(`→ Cắt PO ${fmt(i.totalPO)} units`);
    else parts.push(`→ Transfer hoặc promote`);

    return parts.join('. ');
}

function buildDecliningAssessment(i: RiskInput, _reasons: string[]): string {
    const parts = [
        `Trend giảm ${i.slope.toFixed(1)}/th`,
        `TB12M=${fmt(i.avg12M)}`,
    ];
    if (i.forecastLinReg >= 0) parts.push(`→ dự báo ${fmt(i.forecastLinReg)}`);
    parts.push(`→ Hold PO, giảm FC`);

    return parts.join('. ');
}

// ─── Severity config for UI ───

export const SEVERITY_CONFIG: Record<Severity, { label: string; labelEN: string; color: string; bgClass: string; textClass: string; borderClass: string; icon: string }> = {
    STOCKOUT: { label: 'Hết hàng', labelEN: 'Stockout', color: '#e11d48', bgClass: 'bg-rose-100', textClass: 'text-rose-700', borderClass: 'border-rose-200', icon: 'fa-circle-xmark' },
    RISK: { label: 'Rủi ro', labelEN: 'Risk', color: '#f97316', bgClass: 'bg-orange-100', textClass: 'text-orange-700', borderClass: 'border-orange-200', icon: 'fa-triangle-exclamation' },
    SPIKE: { label: 'Tăng đột biến', labelEN: 'Spike', color: '#eab308', bgClass: 'bg-amber-100', textClass: 'text-amber-700', borderClass: 'border-amber-200', icon: 'fa-arrow-trend-up' },
    OVERSTOCK: { label: 'Tồn dư', labelEN: 'Overstock', color: '#3b82f6', bgClass: 'bg-blue-100', textClass: 'text-blue-700', borderClass: 'border-blue-200', icon: 'fa-boxes-packing' },
    DECLINING: { label: 'Giảm', labelEN: 'Declining', color: '#10b981', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700', borderClass: 'border-emerald-200', icon: 'fa-arrow-trend-down' },
    NORMAL: { label: 'Bình thường', labelEN: 'Normal', color: '#94a3b8', bgClass: 'bg-slate-100', textClass: 'text-slate-500', borderClass: 'border-slate-200', icon: 'fa-check' },
};
