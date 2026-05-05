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
    } else if (type === 'COMPRESS_DATA') {
        const { data, id } = payload;
        // Run compression off the main thread to avoid UI freeze on large datasets
        const json = JSON.stringify(data);
        const blob = new Blob([new TextEncoder().encode(json)]);
        const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'));
        new Response(compressed).blob().then(compressedBlob => {
            self.postMessage({ type: 'COMPRESS_RESULT', payload: { blob: compressedBlob, id } });
        }).catch(err => {
            self.postMessage({ type: 'COMPRESS_ERROR', payload: { error: err.message, id } });
        });
    }
};
