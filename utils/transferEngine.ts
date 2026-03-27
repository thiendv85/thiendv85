/**
 * TRANSFER ENGINE — Cost-Aware Lateral Transshipment (2 Warehouses: NB ↔ BB)
 * ===========================================================================
 * Replaces rule-based MOS transfer with cost-benefit analysis:
 * - Projected stock at arrival time (not just current stock)
 * - Protection stock for donor (donor doesn't starve)
 * - Fixed trip cost amortized across units
 * - Partial pooling: critical + buffer benefit with serviceRiskDiscount
 * - Explainability: reasonCodes, reasonText for every decision
 *
 * Default costs auto-derived from unitCost — no user input needed.
 */

import { InventoryItem } from '../types/inventory';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type WarehouseCode = 'NB' | 'BB';
export type TransferDirection = 'NB_TO_BB' | 'BB_TO_NB' | 'NONE';

export interface WarehouseCostProfile {
    holdingCostPerUnitPerDay: number;  // ~0.07%/day of unitCost
    shortageCostPerUnit: number;       // ~30% of unitCost
    transferCostPerUnit: number;       // ~5% of unitCost
}

export interface TransferPolicy {
    horizonDays: number;                   // Evaluation horizon (default 30)
    transferLeadTimeDays: number;          // Transit time NB↔BB (default 3)
    inboundUsableRatioBeforeArrival: number; // PO arriving during transit (default 0.25)
    donorMinCoverDays: number;             // Donor must keep this many days (default 45)
    donorMinMOSToGive: number;             // Donor must have at least this MOS to be eligible (default 3)
    receiverTargetCoverDays: number;       // Receiver wants this many days (default 30)
    minTransferQty: number;                // Min qty to justify a transfer (default 5)
    roundLot: number;                      // Round to nearest lot (default 1)
    fixedTripCost: number;                 // Fixed cost per trip in VNĐ (default 300000)
    serviceRiskDiscount: number;           // Discount on buffer benefit (default 0.25)
}

export const DEFAULT_TRANSFER_POLICY: TransferPolicy = {
    horizonDays: 30,
    transferLeadTimeDays: 3,
    inboundUsableRatioBeforeArrival: 0.25,
    donorMinCoverDays: 23,              // Donor phải giữ ít nhất 0.75 tháng (~23 ngày)
    donorMinMOSToGive: 1.5,             // Donor phải có >= 1.5M mới được cho
    receiverTargetCoverDays: 30,
    minTransferQty: 5,
    roundLot: 1,
    fixedTripCost: 300_000,
    serviceRiskDiscount: 0.25,
};

export interface WarehouseState {
    physicalStock: number;       // OH + DC - BO
    incomingPO: number;          // Total PO in pipeline
    demandPerDay: number;        // Daily demand rate for this warehouse
    backorder: number;           // Current backorder qty
}

export interface TwoWarehouseState {
    NB: WarehouseState;
    BB: WarehouseState;
    unitCost: number;
    snp: number;
}

export interface WarehouseProjection {
    demandPerDay: number;
    demandDuringTransit: number;
    inboundDuringTransit: number;
    projectedAvailableAtArrival: number;  // Stock when transfer would arrive
    protectionStock: number;               // Minimum stock donor must keep
    targetStock: number;                   // What receiver wants
    surplusToGive: number;                 // Max donor can give (may be 0)
    shortageToProtection: number;          // How much receiver is below protection
    shortageToTarget: number;              // How much receiver is below target
    mosAtArrival: number;                  // MOS at arrival time
}

export interface DirectionEvaluation {
    direction: TransferDirection;
    donor: WarehouseCode;
    receiver: WarehouseCode;
    transferQty: number;
    criticalUnitsCovered: number;
    bufferUnitsCovered: number;
    shortageBenefit: number;
    serviceRiskBenefit: number;
    holdingDeltaBenefit: number;
    totalBenefit: number;
    totalCost: number;
    netBenefit: number;
    donorMOSAfterGive: number;
    receiverMOSAfterReceive: number;
    reasonCodes: string[];
    reasonText: string;
    viable: boolean;
}

export interface TransferDecision {
    bestDirection: TransferDirection;
    transferQty: number;
    transferNBtoBB: number;
    transferBBtoNB: number;
    netBenefit: number;
    totalBenefit: number;
    totalCost: number;
    donorMOSAfterGive: number | null;
    receiverMOSAfterReceive: number | null;
    reasonCodes: string[];
    reasonText: string;
    evaluations: { nbToBb: DirectionEvaluation; bbToNb: DirectionEvaluation };
}

/** Enrichment result for UI consumption */
export interface TransferEnrichment {
    transferDirection: TransferDirection;
    transferQty: number;
    transferNBtoBB: number;
    transferBBtoNB: number;
    transferBenefit: number;
    transferCost: number;
    transferNetBenefit: number;
    donorMOSAfterGive: number | null;
    receiverMOSAfterReceive: number | null;
    reasonCodes: string[];
    reasonText: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COST PROFILE DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

export function deriveDefaultCostProfiles(unitCost: number): {
    NB: WarehouseCostProfile;
    BB: WarehouseCostProfile;
} {
    const profile: WarehouseCostProfile = {
        holdingCostPerUnitPerDay: unitCost * 0.0007,   // ~25%/year
        shortageCostPerUnit: unitCost * 0.3,            // 30% of value
        transferCostPerUnit: unitCost * 0.05,           // 5% of value
    };
    return { NB: { ...profile }, BB: { ...profile } };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTION
// ─────────────────────────────────────────────────────────────────────────────

export function buildProjection(
    state: WarehouseState,
    policy: TransferPolicy
): WarehouseProjection {
    const { physicalStock, incomingPO, demandPerDay } = state;
    const demandDuringTransit = demandPerDay * policy.transferLeadTimeDays;
    const inboundDuringTransit = incomingPO * policy.inboundUsableRatioBeforeArrival;

    const projectedAvailableAtArrival = Math.max(0,
        physicalStock - demandDuringTransit + inboundDuringTransit
    );

    const protectionStock = demandPerDay * policy.donorMinCoverDays;
    const targetStock = demandPerDay * policy.receiverTargetCoverDays;

    const surplusToGive = Math.max(0, projectedAvailableAtArrival - protectionStock);
    const shortageToProtection = Math.max(0, protectionStock - projectedAvailableAtArrival);
    const shortageToTarget = Math.max(0, targetStock - projectedAvailableAtArrival);

    const mosAtArrival = demandPerDay > 0
        ? projectedAvailableAtArrival / (demandPerDay * 30)
        : 99;

    return {
        demandPerDay,
        demandDuringTransit,
        inboundDuringTransit,
        projectedAvailableAtArrival,
        protectionStock,
        targetStock,
        surplusToGive,
        shortageToProtection,
        shortageToTarget,
        mosAtArrival,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTION EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

function evaluateDirection(
    donor: WarehouseCode,
    receiver: WarehouseCode,
    donorProj: WarehouseProjection,
    receiverProj: WarehouseProjection,
    costProfiles: Record<WarehouseCode, WarehouseCostProfile>,
    policy: TransferPolicy,
    snp: number
): DirectionEvaluation {
    const direction: TransferDirection = donor === 'NB' ? 'NB_TO_BB' : 'BB_TO_NB';
    const reasonCodes: string[] = [];

    // GUARD: Donor must have minimum MOS to be eligible as donor
    if (donorProj.mosAtArrival < policy.donorMinMOSToGive) {
        return {
            direction,
            donor,
            receiver,
            transferQty: 0,
            criticalUnitsCovered: 0,
            bufferUnitsCovered: 0,
            shortageBenefit: 0,
            serviceRiskBenefit: 0,
            holdingDeltaBenefit: 0,
            totalBenefit: 0,
            totalCost: 0,
            netBenefit: 0,
            donorMOSAfterGive: donorProj.mosAtArrival,
            receiverMOSAfterReceive: receiverProj.mosAtArrival,
            reasonCodes: ['DONOR_INSUFFICIENT_STOCK'],
            reasonText: `Kho ${donor} chỉ còn ${donorProj.mosAtArrival.toFixed(1)}M — không đủ để cho (cần ≥${policy.donorMinMOSToGive}M)`,
            viable: false,
        };
    }

    // How much can donor give?
    const maxFromDonor = donorProj.surplusToGive;

    // How much does receiver need?
    const receiverNeed = receiverProj.shortageToTarget;

    // Raw qty
    let rawQty = Math.min(maxFromDonor, receiverNeed);

    // Round to lot
    if (policy.roundLot > 1) {
        rawQty = Math.round(rawQty / policy.roundLot) * policy.roundLot;
    } else {
        rawQty = Math.floor(rawQty);
    }

    // Check minimum
    if (rawQty < policy.minTransferQty) {
        return {
            direction,
            donor,
            receiver,
            transferQty: 0,
            criticalUnitsCovered: 0,
            bufferUnitsCovered: 0,
            shortageBenefit: 0,
            serviceRiskBenefit: 0,
            holdingDeltaBenefit: 0,
            totalBenefit: 0,
            totalCost: 0,
            netBenefit: 0,
            donorMOSAfterGive: donorProj.mosAtArrival,
            receiverMOSAfterReceive: receiverProj.mosAtArrival,
            reasonCodes: ['QTY_TOO_LOW'],
            reasonText: `Số lượng (${rawQty}) dưới ngưỡng tối thiểu (${policy.minTransferQty})`,
            viable: false,
        };
    }

    // Split into critical + buffer
    const criticalUnitsCovered = Math.min(rawQty, receiverProj.shortageToProtection);
    const bufferUnitsCovered = rawQty - criticalUnitsCovered;

    // Benefits
    const rCost = costProfiles[receiver];
    const dCost = costProfiles[donor];

    const shortageBenefit = criticalUnitsCovered * rCost.shortageCostPerUnit;
    const serviceRiskBenefit = bufferUnitsCovered * rCost.shortageCostPerUnit * policy.serviceRiskDiscount;

    // Holding delta: donor saves holding, receiver gains holding
    const holdingDeltaBenefit =
        rawQty * dCost.holdingCostPerUnitPerDay * policy.horizonDays -
        rawQty * rCost.holdingCostPerUnitPerDay * policy.horizonDays;
    // Usually net zero for same costs, but allows for asymmetric warehouses

    const totalBenefit = shortageBenefit + serviceRiskBenefit + Math.max(0, holdingDeltaBenefit);

    // Costs
    const unitTransferCost = rawQty * rCost.transferCostPerUnit;
    const totalCost = unitTransferCost + policy.fixedTripCost;

    const netBenefit = totalBenefit - totalCost;

    // Donor MOS after giving
    const donorStockAfter = donorProj.projectedAvailableAtArrival - rawQty;
    const donorMOSAfterGive = donorProj.demandPerDay > 0
        ? donorStockAfter / (donorProj.demandPerDay * 30)
        : 99;

    // Receiver MOS after receiving
    const receiverStockAfter = receiverProj.projectedAvailableAtArrival + rawQty;
    const receiverMOSAfterReceive = receiverProj.demandPerDay > 0
        ? receiverStockAfter / (receiverProj.demandPerDay * 30)
        : 99;

    // Reason codes
    if (criticalUnitsCovered > 0) reasonCodes.push('CRITICAL_SHORTAGE_COVERED');
    if (bufferUnitsCovered > 0) reasonCodes.push('BUFFER_IMPROVED');
    if (netBenefit > 0) reasonCodes.push('COST_BENEFICIAL');
    if (netBenefit <= 0) reasonCodes.push('COST_NOT_JUSTIFIED');
    if (donorMOSAfterGive < 0.75) reasonCodes.push('DONOR_RISK_AFTER');

    const viable = netBenefit > 0 && donorMOSAfterGive >= 0.75;

    // Reason text
    let reasonText: string;
    if (!viable) {
        if (netBenefit <= 0) {
            reasonText = `Chi phí (${Math.round(totalCost).toLocaleString()}đ) > lợi ích (${Math.round(totalBenefit).toLocaleString()}đ)`;
        } else {
            reasonText = `Kho ${donor} còn ${donorMOSAfterGive.toFixed(1)}M sau chuyển — quá rủi ro`;
        }
    } else {
        reasonText = `Chuyển ${rawQty} từ ${donor}→${receiver}: lãi ${Math.round(netBenefit).toLocaleString()}đ, ${donor} còn ${donorMOSAfterGive.toFixed(1)}M`;
    }

    return {
        direction,
        donor,
        receiver,
        transferQty: rawQty,
        criticalUnitsCovered,
        bufferUnitsCovered,
        shortageBenefit,
        serviceRiskBenefit,
        holdingDeltaBenefit,
        totalBenefit,
        totalCost,
        netBenefit,
        donorMOSAfterGive,
        receiverMOSAfterReceive,
        reasonCodes,
        reasonText,
        viable,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function computeCostAwareTransfer(
    state: TwoWarehouseState,
    profiles: Record<WarehouseCode, WarehouseCostProfile>,
    partialPolicy?: Partial<TransferPolicy>
): TransferDecision {
    const policy: TransferPolicy = { ...DEFAULT_TRANSFER_POLICY, ...partialPolicy };

    // GUARD: Cả 2 kho đều thiếu → không rebalance, cần đặt hàng mới
    const bothShort = state.NB.physicalStock <= 0 && state.BB.physicalStock <= 0;
    // GUARD: Tổng hệ thống quá thấp → transfer chỉ di chuyển vấn đề, không giải quyết
    const totalStock = state.NB.physicalStock + state.BB.physicalStock;
    const totalDailyDemand = state.NB.demandPerDay + state.BB.demandPerDay;
    const systemMOS = totalDailyDemand > 0 ? totalStock / (totalDailyDemand * 30) : 99;
    const systemTooLow = systemMOS < 1.5;

    if (bothShort || systemTooLow) {
        const reason = bothShort
            ? 'Cả 2 kho đều thiếu hàng — cần đặt hàng mới, không rebalance'
            : `Tổng hệ thống chỉ còn ${systemMOS.toFixed(1)}M — cần đặt hàng mới`;
        const emptyEval: DirectionEvaluation = {
            direction: 'NONE', donor: 'NB', receiver: 'BB', transferQty: 0,
            criticalUnitsCovered: 0, bufferUnitsCovered: 0, shortageBenefit: 0,
            serviceRiskBenefit: 0, holdingDeltaBenefit: 0, totalBenefit: 0, totalCost: 0,
            netBenefit: 0, donorMOSAfterGive: 0, receiverMOSAfterReceive: 0,
            reasonCodes: ['SYSTEM_SHORTAGE'], reasonText: reason, viable: false,
        };
        return {
            bestDirection: 'NONE', transferQty: 0, transferNBtoBB: 0, transferBBtoNB: 0,
            netBenefit: 0, totalBenefit: 0, totalCost: 0,
            donorMOSAfterGive: null, receiverMOSAfterReceive: null,
            reasonCodes: ['SYSTEM_SHORTAGE'], reasonText: reason,
            evaluations: { nbToBb: emptyEval, bbToNb: { ...emptyEval, donor: 'BB', receiver: 'NB' } },
        };
    }

    const projNB = buildProjection(state.NB, policy);
    const projBB = buildProjection(state.BB, policy);

    const nbToBb = evaluateDirection('NB', 'BB', projNB, projBB, profiles, policy, state.snp);
    const bbToNb = evaluateDirection('BB', 'NB', projBB, projNB, profiles, policy, state.snp);

    // Pick best viable direction
    let best: DirectionEvaluation;
    if (nbToBb.viable && bbToNb.viable) {
        best = nbToBb.netBenefit >= bbToNb.netBenefit ? nbToBb : bbToNb;
    } else if (nbToBb.viable) {
        best = nbToBb;
    } else if (bbToNb.viable) {
        best = bbToNb;
    } else {
        // Neither viable
        return {
            bestDirection: 'NONE',
            transferQty: 0,
            transferNBtoBB: 0,
            transferBBtoNB: 0,
            netBenefit: 0,
            totalBenefit: 0,
            totalCost: 0,
            donorMOSAfterGive: null,
            receiverMOSAfterReceive: null,
            reasonCodes: ['NO_VIABLE_TRANSFER'],
            reasonText: nbToBb.reasonText || bbToNb.reasonText || 'Không cần điều chuyển',
            evaluations: { nbToBb, bbToNb },
        };
    }

    return {
        bestDirection: best.direction,
        transferQty: best.transferQty,
        transferNBtoBB: best.direction === 'NB_TO_BB' ? best.transferQty : 0,
        transferBBtoNB: best.direction === 'BB_TO_NB' ? best.transferQty : 0,
        netBenefit: best.netBenefit,
        totalBenefit: best.totalBenefit,
        totalCost: best.totalCost,
        donorMOSAfterGive: best.donorMOSAfterGive,
        receiverMOSAfterReceive: best.receiverMOSAfterReceive,
        reasonCodes: best.reasonCodes,
        reasonText: best.reasonText,
        evaluations: { nbToBb, bbToNb },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER: InventoryItem → TransferEnrichment
// ─────────────────────────────────────────────────────────────────────────────

export function enrichItemWithCostTransfer(
    item: InventoryItem,
    partialPolicy?: Partial<TransferPolicy>
): TransferEnrichment {
    const computed = item.computed;
    if (!computed || !computed.transfer || computed.isStopBiz) {
        return {
            transferDirection: 'NONE',
            transferQty: 0,
            transferNBtoBB: 0,
            transferBBtoNB: 0,
            transferBenefit: 0,
            transferCost: 0,
            transferNetBenefit: 0,
            donorMOSAfterGive: null,
            receiverMOSAfterReceive: null,
            reasonCodes: computed?.isStopBiz ? ['STOP_BIZ'] : ['NO_COMPUTED'],
            reasonText: computed?.isStopBiz ? 'Mã ngừng kinh doanh' : 'Chưa có dữ liệu tính toán',
        };
    }

    const t = computed.transfer;
    const fcNB = item.Forecast_NB || 0;
    const fcBB = item.Forecast_BB || 0;
    const totalFC = fcNB + fcBB;
    const ratioNB = totalFC > 0 ? fcNB / totalFC : 0.5;
    const ratioBB = totalFC > 0 ? fcBB / totalFC : 0.5;

    const dailyRate = computed.demandRateDaily;

    const state: TwoWarehouseState = {
        NB: {
            physicalStock: t.physicalNB,
            incomingPO: t.incomingNB,
            demandPerDay: dailyRate * ratioNB,
            backorder: item.Backorder_NB || 0,
        },
        BB: {
            physicalStock: t.physicalBB,
            incomingPO: t.incomingBB,
            demandPerDay: dailyRate * ratioBB,
            backorder: item.Backorder_BB || 0,
        },
        unitCost: computed.unitCost,
        snp: item.SNP || 1,
    };

    const profiles = deriveDefaultCostProfiles(computed.unitCost);
    const decision = computeCostAwareTransfer(state, profiles, partialPolicy);

    return {
        transferDirection: decision.bestDirection,
        transferQty: decision.transferQty,
        transferNBtoBB: decision.transferNBtoBB,
        transferBBtoNB: decision.transferBBtoNB,
        transferBenefit: decision.totalBenefit,
        transferCost: decision.totalCost,
        transferNetBenefit: decision.netBenefit,
        donorMOSAfterGive: decision.donorMOSAfterGive,
        receiverMOSAfterReceive: decision.receiverMOSAfterReceive,
        reasonCodes: decision.reasonCodes,
        reasonText: decision.reasonText,
    };
}
