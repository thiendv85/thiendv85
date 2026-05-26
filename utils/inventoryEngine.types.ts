/**
 * INVENTORY ENGINE — Type Definitions
 * ====================================
 * Shared interfaces for computeInventory parameters and results.
 */

import type { SourceProfile, LoisProfile, BackorderAging } from '../types/inventory';

export interface ComputeParams {
    lt: number;
    sp: number;
    ssp: number;
    warehouseScope: 'All' | 'NB' | 'BB';
    costBasis: 'PP' | 'FOB';
    snapshotYYMM: string;
    snapshotDate: string;
    /** Lead-time CV (σ_LT / E[LT]). Default 0.2 = 20% LT variability. */
    sigmaLT?: number;
    sourceProfiles?: SourceProfile[];
    seasonalityTuning?: {
        useSPD: boolean;
        tetWeight: number;
        weatherWeight: number;
        normalizationMethod?: 'Dynamic' | 'Fixed';
        workingDayFallback?: number;
    };
    loisProfiles?: LoisProfile[];
}

export interface SimulatedFields {
    totalStock: number;
    stockAtDelivery: number;
    stockoutRiskFlag: boolean;
    excessQty: number;
    excessValue: number;
    stockValue: number;
    stockoutGapQty: number;
    draftQty: number;
    pipelineQty: number;
    boQty: number;
    boValue: number;
    totalIncomingValue: number;
}

export interface ComputedFields {
    effectiveLT: number;
    effectiveSP: number;
    effectiveSSP: number;
    demandRateDaily: number;
    demandMonthly: number;
    available: number;
    netAvailable: number;
    dcQuantity: number;
    unitCost: number;
    safetyStock: number;
    rop: number;
    stockMax: number;
    stockoutRiskFlag: boolean;
    isStopBiz: boolean;
    excessQty: number;
    excessValue: number;
    stockValue: number;
    stockoutGapQty: number;
    stockoutGapValue: number;
    mos: number;
    cst: number;
    incomingCurrentMonth: number;
    incomingNextMonth: number;
    priorityBucket: 'P1' | 'P2' | 'P3';
    priorityScore: number;
    stockTurnRatio: number;
    fillRate: number;
    capitalEfficiency: number;
    gapOrExcess: number;
    suggestedBO: number;
    poIn30d?: number;
    urgentQty?: number;
    reserveQty?: number;
    urgentTrigger?: 'bridge_to_sea' | 'stockout_unavoidable' | 'none';
    reserveTrigger?: 'below_stockmax' | 'none';
    urgentReason?: string;
    reserveReason?: string;
    orderPriority?: 'urgent_only' | 'reserve_only' | 'both' | 'none';
    stockoutFlag?: boolean;
    stockoutQty?: number;
    capLimited?: boolean;
    classification?: 'healthy' | 'strained' | 'critical' | 'slow' | 'dead';
    ltAir?: number;
    ltSea?: number;
    isBOCritical: boolean;
    snp: number;
    ssi: number;
    simulated?: SimulatedFields;
    transfer?: {
        maxNB: number;
        maxBB: number;
        physicalNB: number;
        physicalBB: number;
        incomingNB: number;
        incomingBB: number;
        mosNB: number;
        mosBB: number;
        incomingNB_Month: number;
        incomingBB_Month: number;
        transferNBtoBB: number;
        transferBBtoNB: number;
        suggestedOrderNB: number;
        suggestedOrderBB: number;
    };
    cv: number;
    slope: number;
    forecastLinReg: number;
    warnings: {
        type: 'Critical' | 'Warning' | 'Info';
        code: string;
        message: string;
    }[];
    boAging?: BackorderAging;
}
