/**
 * INVENTORY ENGINE WEB WORKER
 * Runs computeInventoryBatch off the main thread to eliminate UI freeze.
 * 
 * Usage: Receives {items, params, draftData} via postMessage,
 *        returns computed InventoryItem[] back.
 */

// Import the engine functions directly — Vite handles worker bundling
import { computeInventoryBatch, makeComputeParams } from './inventoryEngine';

// Listen for messages from the main thread
self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'COMPUTE_BATCH') {
        const { items, settings, draftData } = payload;
        const params = makeComputeParams(settings);
        const result = computeInventoryBatch(items, params, draftData);
        self.postMessage({ type: 'BATCH_RESULT', payload: result });
    }
};
