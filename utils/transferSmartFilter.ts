import { InventoryItem } from '../types/inventory';
import { TransferEnrichment } from './transferEngine';

const BATCH_FIXED_TRIP_COST = 300_000;

export interface SmartFilterPolicy {
    minTransferValue: number;
    donorMinMOSAfterGive: number;
    roundToSNP: boolean;
}

export const DEFAULT_SMART_FILTER: SmartFilterPolicy = {
    minTransferValue: 50_000,
    donorMinMOSAfterGive: 0.8,
    roundToSNP: true,
};

export interface FilteredTransferItem {
    item: InventoryItem;
    transfer: TransferEnrichment;
    roundedQty: number;
    transferValue: number;
    direction: 'NB_TO_BB' | 'BB_TO_NB';
}

export interface TransferBatch {
    direction: 'NB_TO_BB' | 'BB_TO_NB';
    items: FilteredTransferItem[];
    totalQty: number;
    totalValue: number;
    totalNetBenefit: number;
    skuCount: number;
}

export interface SmartFilterResult {
    nbToBb: TransferBatch;
    bbToNb: TransferBatch;
    excluded: { item: InventoryItem; reason: string }[];
    stats: {
        totalSKU: number;
        totalQty: number;
        totalValue: number;
        totalNetBenefit: number;
        avgMOSImprovement: number;
        boCoverageRate: number;
        top5ByValue: FilteredTransferItem[];
    };
}

function roundToSNP(qty: number, snp: number): number {
    if (snp <= 1) return Math.floor(qty);
    return Math.round(qty / snp) * snp;
}

function applyBatchTripCost(items: FilteredTransferItem[]): FilteredTransferItem[] {
    if (items.length === 0) return items;
    const totalBenefit = items.reduce((s, i) => s + (i.transfer.transferNetBenefit || 0), 0);
    if (totalBenefit <= BATCH_FIXED_TRIP_COST) {
        let sorted = [...items].sort((a, b) =>
            (a.transfer.transferNetBenefit || 0) - (b.transfer.transferNetBenefit || 0)
        );
        let runningBenefit = totalBenefit;
        while (sorted.length > 0 && runningBenefit <= BATCH_FIXED_TRIP_COST) {
            const dropped = sorted.shift()!;
            runningBenefit -= (dropped.transfer.transferNetBenefit || 0);
        }
        return sorted;
    }
    return items;
}

export function applySmartFilter(
    items: InventoryItem[],
    transferMap: Map<string, TransferEnrichment>,
    policy: SmartFilterPolicy = DEFAULT_SMART_FILTER
): SmartFilterResult {
    const nbToBbItems: FilteredTransferItem[] = [];
    const bbToNbItems: FilteredTransferItem[] = [];
    const excluded: { item: InventoryItem; reason: string }[] = [];

    let mosImprovementSum = 0;
    let mosImprovementCount = 0;
    let boSkuTotal = 0;
    let boCoveredCount = 0;

    for (const item of items) {
        const t = transferMap.get(item.ItemCode);
        if (!t || t.transferDirection === 'NONE' || t.transferQty === 0) continue;

        const unitCost = item.computed?.unitCost || item.UnitCost_PP || 0;
        const snp = item.SNP || 1;

        let qty = t.transferQty;
        if (policy.roundToSNP && snp > 1) {
            qty = roundToSNP(qty, snp);
        }
        if (qty <= 0) {
            excluded.push({ item, reason: `SNP rounding → 0 (SNP=${snp})` });
            continue;
        }

        const value = qty * unitCost;
        if (value < policy.minTransferValue) {
            excluded.push({ item, reason: `Giá trị ${Math.round(value).toLocaleString()}đ < ${policy.minTransferValue.toLocaleString()}đ` });
            continue;
        }

        if (t.donorMOSAfterGive !== null && t.donorMOSAfterGive < policy.donorMinMOSAfterGive) {
            excluded.push({ item, reason: `Donor MOS sau chuyển ${t.donorMOSAfterGive.toFixed(1)} < ${policy.donorMinMOSAfterGive}` });
            continue;
        }

        const direction = t.transferDirection as 'NB_TO_BB' | 'BB_TO_NB';
        const filtered: FilteredTransferItem = {
            item,
            transfer: { ...t, transferQty: qty },
            roundedQty: qty,
            transferValue: value,
            direction,
        };

        if (direction === 'NB_TO_BB') nbToBbItems.push(filtered);
        else bbToNbItems.push(filtered);

        if (t.receiverMOSAfterReceive !== null && t.donorMOSAfterGive !== null) {
            const tr = item.computed?.transfer;
            if (tr) {
                const receiverMOSBefore = direction === 'NB_TO_BB' ? tr.mosBB : tr.mosNB;
                const delta = (t.receiverMOSAfterReceive || 0) - receiverMOSBefore;
                mosImprovementSum += delta;
                mosImprovementCount++;
            }
        }

        const hasBO = (item.Backorder_NB || 0) > 0 || (item.Backorder_BB || 0) > 0;
        if (hasBO) {
            boSkuTotal++;
            if (t.reasonCodes.includes('CRITICAL_SHORTAGE_COVERED')) boCoveredCount++;
        }
    }

    const finalNBtoBB = applyBatchTripCost(nbToBbItems);
    const finalBBtoNB = applyBatchTripCost(bbToNbItems);

    const makeBatch = (batchItems: FilteredTransferItem[], dir: 'NB_TO_BB' | 'BB_TO_NB'): TransferBatch => {
        const sorted = batchItems.sort((a, b) => b.transferValue - a.transferValue);
        const rawBenefit = sorted.reduce((s, i) => s + (i.transfer.transferNetBenefit || 0), 0);
        return {
            direction: dir,
            items: sorted,
            totalQty: sorted.reduce((s, i) => s + i.roundedQty, 0),
            totalValue: sorted.reduce((s, i) => s + i.transferValue, 0),
            totalNetBenefit: sorted.length > 0 ? rawBenefit - BATCH_FIXED_TRIP_COST : 0,
            skuCount: sorted.length,
        };
    };

    const allItems = [...finalNBtoBB, ...finalBBtoNB].sort((a, b) => b.transferValue - a.transferValue);

    const rawTotalBenefit = allItems.reduce((s, i) => s + (i.transfer.transferNetBenefit || 0), 0);
    const batchCount = (finalNBtoBB.length > 0 ? 1 : 0) + (finalBBtoNB.length > 0 ? 1 : 0);

    return {
        nbToBb: makeBatch(finalNBtoBB, 'NB_TO_BB'),
        bbToNb: makeBatch(finalBBtoNB, 'BB_TO_NB'),
        excluded,
        stats: {
            totalSKU: allItems.length,
            totalQty: allItems.reduce((s, i) => s + i.roundedQty, 0),
            totalValue: allItems.reduce((s, i) => s + i.transferValue, 0),
            totalNetBenefit: rawTotalBenefit - batchCount * BATCH_FIXED_TRIP_COST,
            avgMOSImprovement: mosImprovementCount > 0 ? mosImprovementSum / mosImprovementCount : 0,
            boCoverageRate: boSkuTotal > 0 ? boCoveredCount / boSkuTotal : 0,
            top5ByValue: allItems.slice(0, 5),
        },
    };
}
