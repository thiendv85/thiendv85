/**
 * useInventoryWorker — React hook for off-main-thread inventory computation.
 * 
 * Delegates computeInventoryBatch to a Web Worker so the main thread stays free.
 * Falls back to synchronous computation if Workers are unavailable.
 * 
 * Returns:
 *   enrichedData: InventoryItem[] — the computed result
 *   isProcessing: boolean — true while worker is computing
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { InventoryItem } from '../types/inventory';
import { computeInventoryBatch, makeComputeParams } from '../utils/inventoryEngine';
import InventoryWorker from '../utils/inventoryWorker?worker';

interface WorkerInput {
    items: InventoryItem[];
    settings: any;
    draftData?: any;
}

export function useInventoryWorker(
    items: InventoryItem[] = [],
    settings: any,
    draftData?: any
): { enrichedData: InventoryItem[]; isProcessing: boolean } {
    const [enrichedData, setEnrichedData] = useState<InventoryItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef<WorkerInput | null>(null);
    const isBusyRef = useRef(false);

    // Initialize worker once
    useEffect(() => {
        try {
            workerRef.current = new InventoryWorker();

            workerRef.current.onmessage = (e: MessageEvent) => {
                const { type, payload } = e.data;
                if (type === 'BATCH_RESULT') {
                    setEnrichedData(payload);
                    setIsProcessing(false);
                    isBusyRef.current = false;

                    // If there's a pending request (debounce), process it now
                    if (pendingRef.current) {
                        const next = pendingRef.current;
                        pendingRef.current = null;
                        dispatch(next);
                    }
                }
            };

            workerRef.current.onerror = () => {
                setIsProcessing(false);
                isBusyRef.current = false;
            };
        } catch {
            // Web Workers not supported — will use fallback
            workerRef.current = null;
        }

        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    const dispatch = useCallback((input: WorkerInput) => {
        if (!workerRef.current) {
            // Fallback: synchronous computation
            const params = makeComputeParams(input.settings);
            const result = computeInventoryBatch(input.items, params, input.draftData);
            setEnrichedData(result);
            setIsProcessing(false);
            return;
        }

        isBusyRef.current = true;
        setIsProcessing(true);
        workerRef.current.postMessage({
            type: 'COMPUTE_BATCH',
            payload: {
                items: input.items,
                settings: input.settings,
                draftData: input.draftData
            }
        });
    }, []);

    // Trigger worker when inputs change
    useEffect(() => {
        if (items.length === 0) {
            setEnrichedData([]);
            setIsProcessing(false);
            return;
        }

        const input: WorkerInput = { items, settings, draftData };

        if (isBusyRef.current) {
            // Worker is busy — queue this request (debounce)
            pendingRef.current = input;
        } else {
            dispatch(input);
        }
    }, [items, settings, draftData, dispatch]);

    return { enrichedData, isProcessing };
}
