/**
 * useInventoryAnalytics — Orchestrator Hook
 * Combines demand pattern, forecast, safety stock, and risk scoring
 * into a single analysis pipeline for DemandIntelligence UI
 */

import { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';
import { classifyDemandPattern, detectAnomaly, avg, DemandPattern } from '../utils/demandPattern';
import { forecastDemand, ForecastResult } from '../utils/demandForecast';
import { computeSafetyStock, SafetyStockResult } from '../utils/safetyStock';
import { classifySeverity, Severity, ActionCode, SEVERITY_CONFIG } from '../utils/riskScoring';

export interface DemandAnalysisRow {
    item: InventoryItem;
    fullHistory: number[];
    actualM1: number;
    forecastM1: number;
    deviation: number;

    // Pattern & Anomaly
    pattern: DemandPattern;
    anomalyType: 'NORMAL' | 'SPIKE' | 'DROP';

    // Forecast
    forecastResult: ForecastResult;

    // Safety Stock
    safetyStockResult: SafetyStockResult;

    // Computed (from engine)
    available: number;
    netAvailable: number;
    mos: number;
    demandMonthly: number;
    demandRateDaily: number;

    // Enhanced thresholds
    newSS: number;
    newROP: number;
    newStockMax: number;

    // Risk
    severity: Severity;
    action: ActionCode;
    reasonCodes: string[];
    assessment: string;

    // Stats
    meanHistory: number;
    sigmaD: number;
    cv: number;
    slope: number;
    avg12M: number;

    // Context
    serviceLevel: number;
    serviceLevelLabel: string;
    leadTimeEstimated: boolean;

    // Value metrics
    excessQty: number;
    excessValue: number;
    stockoutGapQty: number;
    stockoutGapValue: number;
    totalPO: number;
    backorder: number;
    unitCost: number;
}

export interface AnalyticsMetrics {
    stockout: number;
    risk: number;
    spike: number;
    overstock: number;
    declining: number;
    normal: number;
    totalGapValue: number;
    totalExcessValue: number;
    avgForecastAccuracy: number;
}

function analyzeItem(item: InventoryItem): DemandAnalysisRow | null {
    const history = item.SalesHistory || [];
    if (history.length === 0) return null;

    const computed = item.computed;
    if (!computed) return null;

    // Normalize history to 12 months
    const fullHistory = history.length >= 12 ? history.slice(-12) : [...Array(12 - history.length).fill(0), ...history];

    const actualM1 = fullHistory[11] || 0;
    const meanHistory = avg(fullHistory);
    const avg12M = item.AvgQty12M || meanHistory;

    // ─── 1. Demand Pattern Classification ───
    const pattern = classifyDemandPattern(fullHistory);

    // ─── 2. Anomaly Detection ───
    const anomalyType = detectAnomaly(fullHistory);

    // ─── 3. Forecast ───
    const forecastResult = forecastDemand(fullHistory, pattern);

    // ─── 4. Safety Stock / ROP / MAX ───
    const safetyStockResult = computeSafetyStock(
        fullHistory,
        forecastResult.error,
        computed.effectiveLT || 90,
        computed.effectiveSP || 30,
        item.LOISGroup || '',
        computed.demandMonthly ?? 0,
    );

    // ─── 5. Risk Scoring ───
    const riskResult = classifySeverity({
        available: computed.available,
        netAvailable: computed.netAvailable ?? 0,
        demandMonthly: computed.demandMonthly ?? 0,
        mos: computed.mos,
        stockoutRiskFlag: computed.stockoutRiskFlag ?? false,
        isBOCritical: computed.isBOCritical ?? false,
        isStopBiz: computed.isStopBiz,
        excessQty: computed.excessQty,
        excessValue: computed.excessValue,
        totalPO: item.TotalPO || 0,
        backorder: item.Backorder || 0,
        suggestedBO: computed.suggestedBO || 0,
        slope: computed.slope,
        cv: computed.cv,
        forecastLinReg: computed.forecastLinReg,

        newROP: safetyStockResult.rop,
        newSS: safetyStockResult.ss,
        newStockMax: safetyStockResult.stockMax,
        stockoutGapQty: computed.stockoutGapQty,

        actualM1,
        meanHistory,
        sigmaD: safetyStockResult.sigmaD,
        avg12M,

        forecastValue: forecastResult.value,
        forecastMethod: forecastResult.method,
        forecastAccuracy: forecastResult.accuracy,

        pattern,
        anomalyType,

        serviceLevel: safetyStockResult.serviceLevel,
        serviceLevelLabel: safetyStockResult.serviceLevelLabel,
        leadTimeEstimated: safetyStockResult.leadTimeEstimated,
    });

    return {
        item,
        fullHistory,
        actualM1,
        forecastM1: forecastResult.value,
        deviation: actualM1 - forecastResult.value,

        pattern,
        anomalyType,
        forecastResult,
        safetyStockResult,

        available: computed.available,
        netAvailable: computed.netAvailable ?? 0,
        mos: computed.mos,
        demandMonthly: computed.demandMonthly ?? 0,
        demandRateDaily: computed.demandRateDaily,

        newSS: safetyStockResult.ss,
        newROP: safetyStockResult.rop,
        newStockMax: safetyStockResult.stockMax,

        severity: riskResult.severity,
        action: riskResult.action,
        reasonCodes: riskResult.reasonCodes,
        assessment: riskResult.assessment,

        meanHistory,
        sigmaD: safetyStockResult.sigmaD,
        cv: computed.cv,
        slope: computed.slope,
        avg12M,

        serviceLevel: safetyStockResult.serviceLevel,
        serviceLevelLabel: safetyStockResult.serviceLevelLabel,
        leadTimeEstimated: safetyStockResult.leadTimeEstimated,

        excessQty: computed.excessQty,
        excessValue: computed.excessValue,
        stockoutGapQty: computed.stockoutGapQty,
        stockoutGapValue: computed.stockoutGapValue,
        totalPO: item.TotalPO || 0,
        backorder: item.Backorder || 0,
        unitCost: computed.unitCost,
    };
}

/**
 * Main hook — returns analyzed data (only actionable items) + metrics
 */
export function useInventoryAnalytics(data: InventoryItem[]): {
    allAnalyzed: DemandAnalysisRow[];
    actionableData: DemandAnalysisRow[];
    metrics: AnalyticsMetrics;
} {
    return useMemo(() => {
        const allAnalyzed: DemandAnalysisRow[] = [];

        for (const item of data) {
            const row = analyzeItem(item);
            if (row) allAnalyzed.push(row);
        }

        // Separate actionable vs normal
        const actionableData = allAnalyzed.filter(r => r.severity !== 'NORMAL');

        // Compute metrics
        let stockout = 0,
            risk = 0,
            spike = 0,
            overstock = 0,
            declining = 0,
            normal = 0;
        let totalGapValue = 0,
            totalExcessValue = 0;
        let accSum = 0,
            accCount = 0;

        for (const row of allAnalyzed) {
            switch (row.severity) {
                case 'STOCKOUT':
                    stockout++;
                    totalGapValue += row.stockoutGapValue;
                    break;
                case 'RISK':
                    risk++;
                    totalGapValue += row.stockoutGapValue;
                    break;
                case 'SPIKE':
                    spike++;
                    break;
                case 'OVERSTOCK':
                    overstock++;
                    totalExcessValue += row.excessValue;
                    break;
                case 'DECLINING':
                    declining++;
                    break;
                default:
                    normal++;
            }
            if (row.forecastResult.accuracy > 0) {
                accSum += row.forecastResult.accuracy;
                accCount++;
            }
        }

        return {
            allAnalyzed,
            actionableData,
            metrics: {
                stockout,
                risk,
                spike,
                overstock,
                declining,
                normal,
                totalGapValue,
                totalExcessValue,
                avgForecastAccuracy: accCount > 0 ? accSum / accCount : 0,
            },
        };
    }, [data]);
}
