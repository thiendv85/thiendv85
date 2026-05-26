import { useState, useMemo, useCallback } from 'react';
import { InventoryItem, SourceProfile } from '../types/inventory';
import { enrichItemWithCostTransfer, TransferEnrichment } from '../utils/transferEngine';
import { applySmartFilter, SmartFilterResult, SmartFilterPolicy, DEFAULT_SMART_FILTER } from '../utils/transferSmartFilter';
import { downloadTransferCSV } from '../utils/transferExport';
import { saveToCloudStorage, loadFromCloudStorage } from '../utils/supabase';

export interface TransferPlanState {
    filterResult: SmartFilterResult;
    transferMap: Map<string, TransferEnrichment>;
    selectedCodes: Set<string>;
    isSaving: boolean;
    isLoading: boolean;
    lastSaved: string | null;
}

function buildCloudKey(brand: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `transfer_plan_${brand}_${today}`;
}

export function useTransferPlan(
    data: InventoryItem[],
    enrichedData: InventoryItem[] | undefined,
    policy: SmartFilterPolicy = DEFAULT_SMART_FILTER,
) {
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    const { filterResult, transferMap } = useMemo(() => {
        const baseList = enrichedData || data;
        const tMap = new Map<string, TransferEnrichment>();

        for (const item of baseList) {
            const enrichment = enrichItemWithCostTransfer(item);
            tMap.set(item.ItemCode, enrichment);
        }

        const result = applySmartFilter(baseList, tMap, policy);
        return { filterResult: result, transferMap: tMap };
    }, [data, enrichedData, policy]);

    const toggleSelect = useCallback((code: string) => {
        setSelectedCodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        const allCodes = [
            ...filterResult.nbToBb.items,
            ...filterResult.bbToNb.items,
        ].map(fi => fi.item.ItemCode);

        setSelectedCodes(prev =>
            prev.size === allCodes.length ? new Set() : new Set(allCodes)
        );
    }, [filterResult]);

    const clearSelection = useCallback(() => setSelectedCodes(new Set()), []);

    const exportCSV = useCallback(() => {
        downloadTransferCSV({
            nbToBb: filterResult.nbToBb,
            bbToNb: filterResult.bbToNb,
            selectedCodes: selectedCodes.size > 0 ? selectedCodes : undefined,
        });
    }, [filterResult, selectedCodes]);

    const saveCloud = useCallback(async (brand: string) => {
        setIsSaving(true);
        try {
            const key = buildCloudKey(brand);
            const payload = {
                nbToBb: filterResult.nbToBb.items.map(fi => ({
                    code: fi.item.ItemCode,
                    qty: fi.roundedQty,
                    direction: fi.direction,
                    value: fi.transferValue,
                })),
                bbToNb: filterResult.bbToNb.items.map(fi => ({
                    code: fi.item.ItemCode,
                    qty: fi.roundedQty,
                    direction: fi.direction,
                    value: fi.transferValue,
                })),
                stats: filterResult.stats,
                savedAt: new Date().toISOString(),
            };
            const ok = await saveToCloudStorage(key, payload);
            if (ok) setLastSaved(new Date().toLocaleTimeString('vi-VN'));
            return ok;
        } finally {
            setIsSaving(false);
        }
    }, [filterResult]);

    const loadCloud = useCallback(async (brand: string) => {
        setIsLoading(true);
        try {
            const key = buildCloudKey(brand);
            const payload = await loadFromCloudStorage(key);
            return payload;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        filterResult,
        transferMap,
        selectedCodes,
        isSaving,
        isLoading,
        lastSaved,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        exportCSV,
        saveCloud,
        loadCloud,
    };
}
