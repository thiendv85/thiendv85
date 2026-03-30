import { useMemo } from 'react';
import { SnapshotData } from '../types/inventory';
import { THRESHOLDS } from '../utils/decision/thresholds';

export type DecisionStatus = 'ready' | 'attention' | 'adjust' | 'not_recommended';
export type DecisionSeverity = 'critical' | 'major' | 'minor';

export interface DecisionReason {
    id: string;
    severity: DecisionSeverity;
    title: string;
    description: string;
    itemCodes?: string[];
}

export interface DecisionSummary {
    status: DecisionStatus;
    recommendation: 'approve' | 'adjust' | 'return' | 'reject';
    confidence: 'high' | 'medium' | 'low';
    reasons: DecisionReason[];
    
    // Impact Metrics
    metrics: {
        value: { before: number; after: number; delta: number; deltaPct: number };
        oos: { before: number; after: number; delta: number };
        risk: { before: number; after: number; delta: number };
        bo: { before: number; after: number; delta: number };
        airPct: { before: number; after: number; delta: number };
        avgMos: { before: number; after: number; delta: number };
    };
    
    // Summary counts
    counts: {
        totalSkus: number;
        selectedSkus: number;
        deselectedSkus: number;
        changedSkus: number;
    };
}

export const useDecisionSupport = (
    snap: SnapshotData,
    localQtys: Record<string, { air: number; sea: number }>,
    selectedItems: Set<string>,
    preApprovalResult: any | null = null
): DecisionSummary => {
    return useMemo(() => {
        const rows = snap.inventory_context;
        const origQtys = snap.quantities;

        // 1. Calculate Baseline (Before)
        let bVal = 0, bAir = 0, bSea = 0, bOos = 0, bRisk = 0, bBo = 0, bSumMos = 0;
        rows.forEach(ctx => {
            const q = origQtys[ctx.itemCode] || { air: 0, sea: 0 };
            const totalQ = q.air + q.sea;
            
            bVal += (ctx.unitCost || 0) * totalQ;
            bAir += q.air;
            bSea += q.sea;
            
            const isOos = (ctx.available || 0) <= 0 && ctx.baseForecast > 0.02;
            const isRisk = (ctx.available || 0) < (ctx.safetyStock || 0) && ctx.baseForecast > 0.02;
            const isBo = (ctx.backorder || 0) > (ctx.available || 0);
            
            if (isOos) bOos++;
            if (isRisk) bRisk++;
            if (isBo) bBo++;
            bSumMos += ctx.mos || 0;
        });

        // 2. Calculate Current Adjusted (After)
        let aVal = 0, aAir = 0, aSea = 0, aOos = 0, aRisk = 0, aBo = 0, aSumMos = 0;
        let selectedCount = 0, changedCount = 0, deselectedCount = 0;

        rows.forEach(ctx => {
            const isSelected = selectedItems.has(ctx.itemCode);
            const orig = origQtys[ctx.itemCode] || { air: 0, sea: 0 };
            const cur = isSelected ? (localQtys[ctx.itemCode] || { air: 0, sea: 0 }) : { air: 0, sea: 0 };
            const totalQ = cur.air + cur.sea;
            const origTotalQ = orig.air + orig.sea;

            if (isSelected) {
                selectedCount++;
                if (cur.air !== orig.air || cur.sea !== orig.sea) changedCount++;
            } else if (origTotalQ > 0) {
                deselectedCount++;
            }

            aVal += (ctx.unitCost || 0) * totalQ;
            aAir += cur.air;
            aSea += cur.sea;

            const projectedAvail = (ctx.available || 0) + totalQ;
            const isOosPost = projectedAvail <= 0 && ctx.baseForecast > 0.02;
            const isRiskPost = projectedAvail < (ctx.safetyStock || 0) && ctx.baseForecast > 0.02;
            const isBoPost = (ctx.backorder || 0) > projectedAvail;

            if (isOosPost) aOos++;
            if (isRiskPost) aRisk++;
            if (isBoPost) aBo++;
            
            const monthlyFc = ctx.baseForecast || 0.001;
            const estMos = projectedAvail / monthlyFc;
            aSumMos += estMos;
        });

        const bAirPct = (bAir + bSea) > 0 ? (bAir / (bAir + bSea)) : 0;
        const aAirPct = (aAir + aSea) > 0 ? (aAir / (aAir + aSea)) : 0;
        const bAvgMos = rows.length > 0 ? bSumMos / rows.length : 0;
        const aAvgMos = rows.length > 0 ? aSumMos / rows.length : 0;

        // 3. Reasons and Recommendation
        const reasons: DecisionReason[] = [];
        
        // Critical reasons from inventory logic
        const criticalWarnings = rows.filter(r => (r.warnings || []).length > 0).length;
        if (criticalWarnings > 10) {
            reasons.push({
                id: 'high_warning_density',
                severity: 'major',
                title: 'High Warning Density',
                description: `${criticalWarnings} items have active supply warnings. Review required.`
            });
        }

        // Integration with preApprovalResult (The hidden validation engine)
        if (preApprovalResult && !preApprovalResult.valid) {
            preApprovalResult.errors?.forEach((err: string, i: number) => {
                reasons.push({
                    id: `validation_error_${i}`,
                    severity: 'critical',
                    title: 'Policy Violation',
                    description: err
                });
            });
        }

        if (deselectedCount > 5) {
            reasons.push({
                id: 'significant_deselection',
                severity: 'minor',
                title: 'Significant Deselection',
                description: `You have deselected ${deselectedCount} items from the original proposal.`
            });
        }

        const valueDelta = aVal - bVal;
        if (aVal > THRESHOLDS.HIGH_VALUE_THRESHOLD) {
            reasons.push({
                id: 'high_value_order',
                severity: 'major',
                title: 'High Value Order',
                description: 'Order value exceeds standard review threshold.'
            });
        }

        let status: DecisionStatus = 'ready';
        let recommendation: 'approve' | 'adjust' | 'return' | 'reject' = 'approve';
        let confidence: 'high' | 'medium' | 'low' = 'high';

        // Decision Engine based on Thresholds
        const oosRatio = aOos / (rows.length || 1);
        const riskRatio = aRisk / (rows.length || 1);
        const blockerCount = reasons.filter(r => r.severity === 'critical').length;

        if (blockerCount > 0 || oosRatio > THRESHOLDS.MAX_OOS_RATIO_FOR_APPROVE * 2) {
            status = 'not_recommended';
            recommendation = 'reject';
            confidence = 'low';
        } else if (riskRatio > THRESHOLDS.MAX_RISK_RATIO_FOR_APPROVE || criticalWarnings > 10) {
            status = 'attention';
            recommendation = 'approve';
            confidence = 'medium';
        } else if (changedCount > 0 || deselectedCount > 0) {
            status = 'adjust';
            recommendation = 'approve';
            confidence = 'medium';
        }

        if (blockerCount > 0 && THRESHOLDS.CONFIDENCE_LOW_ON_BLOCKER) {
            confidence = 'low';
        }

        return {
            status,
            recommendation,
            confidence,
            reasons: reasons.sort((a, b) => {
                const map = { critical: 0, major: 1, minor: 2 };
                return map[a.severity] - map[b.severity];
            }),
            metrics: {
                value: { before: bVal, after: aVal, delta: aVal - bVal, deltaPct: bVal > 0 ? (aVal - bVal) / bVal : 0 },
                oos: { before: bOos, after: aOos, delta: aOos - bOos },
                risk: { before: bRisk, after: aRisk, delta: aRisk - bRisk },
                bo: { before: bBo, after: aBo, delta: aBo - bBo },
                airPct: { before: bAirPct, after: aAirPct, delta: aAirPct - bAirPct },
                avgMos: { before: bAvgMos, after: aAvgMos, delta: aAvgMos - bAvgMos },
            },
            counts: {
                totalSkus: rows.length,
                selectedSkus: selectedCount,
                deselectedSkus: deselectedCount,
                changedSkus: changedCount,
            }
        };
    }, [snap, localQtys, selectedItems, preApprovalResult]);
};
