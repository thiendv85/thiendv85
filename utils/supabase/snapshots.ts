import { supabase } from './client';
import { normalizeBrand } from './helpers';
import type { InventoryItem } from '../../types/inventory';

export interface SnapshotMetadataRow {
  id: string;
  filename: string;
  dealer_filename: string | null;
  bo_filename: string | null;
  storage_path: string;
  upload_date: string;
  row_count: number;
  file_size_bytes: number | null;
  raw_size_bytes: number | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  notes: string | null;
  brand: string | null;
  content_hash: string | null;
}

import InventoryWorker from '../inventoryWorker?worker';

// Singleton worker for utility functions off-main-thread
let sharedWorker: Worker | null = null;
let compressionCallbacks = new Map<string, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

function getSharedWorker() {
  if (!sharedWorker) {
    try {
      sharedWorker = new InventoryWorker();
      sharedWorker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'COMPRESS_RESULT' || type === 'COMPRESS_ERROR') {
          const cb = compressionCallbacks.get(payload.id);
          if (cb) {
            if (type === 'COMPRESS_RESULT') cb.resolve(payload.blob);
            else cb.reject(new Error(payload.error));
            compressionCallbacks.delete(payload.id);
          }
        }
      };
    } catch (err) {
      console.warn("Could not instantiate shared inventory worker:", err);
    }
  }
  return sharedWorker;
}

/** Export for use in UI layer to allow pre-compression with progress tracking */
export async function compressData(data: any): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const worker = getSharedWorker();
      if (!worker) throw new Error("Worker not available");

      const id = Math.random().toString(36).substring(2, 15);
      compressionCallbacks.set(id, { resolve, reject });
      worker.postMessage({ type: 'COMPRESS_DATA', payload: { data, id } });
    } catch (fallbackErr) {
      // Fallback to synchronous if Web Workers are not supported
      console.warn('Web Worker failed, falling back to sync compression', fallbackErr);
      try {
        const json = JSON.stringify(data);
        const blob = new Blob([new TextEncoder().encode(json)]);
        const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'));
        new Response(compressed).blob().then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    }
  });
}

async function decompressData(blob: Blob): Promise<any> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/**
 * Light cleanup before storage — keep all user-uploaded data intact
 * (DealerBreakdown, BackorderBreakdown are preserved for full restore).
 */
function pruneForStorage(items: InventoryItem[]): any[] {
  return items;
}

/**
 * Lightweight fingerprint from row count + first/last item key fields.
 */
function computeSnapshotHash(data: InventoryItem[]): string {
  const first = data[0];
  const last = data[data.length - 1];
  const raw = `${data.length}|${first?.ItemCode}|${first?.TotalInventory ?? 0}|${last?.ItemCode}|${last?.TotalInventory ?? 0}`;
  // Simple string hash (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash) + raw.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

/**
 * Auto-delete oldest snapshots when exceeding limit.
 */
async function enforceRetentionLimit(maxSnapshots = 30): Promise<void> {
  try {
    const { data, error: fetchErr } = await supabase
      .from('snapshot_metadata')
      .select('id, storage_path')
      .order('upload_date', { ascending: true });

    if (fetchErr) {
      console.error('[Supabase] Retention limit fetch error:', fetchErr);
      return;
    }

    if (!data || data.length <= maxSnapshots) return;

    const toDelete = data.slice(0, data.length - maxSnapshots);
    console.log(`[Supabase] Retention: deleting ${toDelete.length} old snapshots.`);

    // Batch storage removal (Storage SDK accepts an array) and DB delete (single .in() query),
    // replacing the per-row round-trip loop.
    const paths = toDelete.map((s) => s.storage_path).filter(Boolean);
    const ids = toDelete.map((s) => s.id);

    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from('inventory_snapshots')
        .remove(paths);
      if (storageErr) console.warn('[Supabase] Retention storage remove warning:', storageErr);
    }

    if (ids.length > 0) {
      const { error: dbErr } = await supabase
        .from('snapshot_metadata')
        .delete()
        .in('id', ids);
      if (dbErr) console.error('[Supabase] Retention DB delete error:', dbErr);
    }
  } catch (err) {
    console.error('[Supabase] Unexpected error in enforceRetentionLimit:', err);
  }
}

/**
 * Upload inventory snapshot: prune → compress → dedup check → upload → save metadata → enforce retention.
 */
export async function uploadSnapshot(
  data: InventoryItem[],
  filename: string,
  opts?: { dealerFilename?: string; boFilename?: string }
): Promise<{ success: boolean; error?: string; deduplicated?: boolean }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Get user's department for security segregation if data doesn't provide brand
    let userDepartmentBrand: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('department')
        .eq('id', user.id)
        .single();
      if (profile) {
        userDepartmentBrand = normalizeBrand(profile.department);
      }
    }

    const rawBrand = data[0]?.BrandName || (data[0] as any)?.ThuongHieu || null;
    const dataBrand = normalizeBrand(rawBrand);

    // Final brand is either from the data itself or the user's current department/brand
    const brand = dataBrand || userDepartmentBrand;
    const contentHash = computeSnapshotHash(data);

    // Dedup: skip if same hash exists within 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('snapshot_metadata')
      .select('id')
      .eq('content_hash', contentHash)
      .gte('upload_date', since)
      .limit(1);
    if (existing && existing.length > 0) {
      return { success: true, deduplicated: true };
    }

    // Prune large arrays + compress
    const pruned = pruneForStorage(data);
    const rawSize = new Blob([JSON.stringify(pruned)]).size;
    const compressed = await compressData(pruned);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePath = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // Structure path by brand to support RLS and organization
    const brandPrefix = brand ? `${brand.toLowerCase()}/` : 'unbranded/';
    const path = `${brandPrefix}${datePath}/snapshot_${ts}.json.gz`;

    const { error: uploadErr } = await supabase.storage
      .from('inventory_snapshots')
      .upload(path, compressed, {
        contentType: 'application/gzip',
        upsert: false,
      });
    if (uploadErr) return { success: false, error: uploadErr.message };

    const { error: metaErr } = await supabase.from('snapshot_metadata').insert({
      filename,
      dealer_filename: opts?.dealerFilename || null,
      bo_filename: opts?.boFilename || null,
      storage_path: path,
      row_count: data.length,
      file_size_bytes: compressed.size,
      raw_size_bytes: rawSize,
      // Identity restriction: Set uploaded_by as null to maintain anonymity as requested
      uploaded_by: null,
      brand,
      content_hash: contentHash,
    });
    if (metaErr) {
      // Metadata insert failed → snapshot becomes orphaned (file in Storage but
      // not listable via listSnapshots). Clean up the orphan and surface the error.
      // Pre-2026-05-09 silent fallback masked an RLS bug for non-admin uploaders;
      // see migration 016.
      await supabase.storage.from('inventory_snapshots').remove([path]).catch(() => {});
      return { success: false, error: `Metadata insert failed: ${metaErr.message}` };
    }

    // Auto-cleanup oldest snapshots (fire-and-forget)
    enforceRetentionLimit(30);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * List saved snapshots, newest first. Optional brand filter for non-admin users.
 * brandFilter=null → show all (admin), brandFilter='Kia' → only Kia snapshots + untagged.
 */
export async function listSnapshots(limit = 50, brandFilter?: string | null): Promise<SnapshotMetadataRow[]> {
  try {
    let query = supabase
      .from('snapshot_metadata')
      .select('*, profiles:uploaded_by(full_name)');

    if (brandFilter) {
      const normalized = normalizeBrand(brandFilter);
      if (normalized) {
        // Use OR to include the exact normalized brand and also nulls (global defaults)
        query = query.or(`brand.eq.${normalized},brand.is.null`);
      }
    }

    query = query.order('upload_date', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) { console.error('listSnapshots:', error); return []; }
    return (data || []).map((row: any) => ({
      ...row,
      uploader_name: row.profiles?.full_name || null,
      profiles: undefined,
    })) as SnapshotMetadataRow[];
  } catch {
    return [];
  }
}

/**
 * Get total storage usage from snapshot metadata.
 */
export async function getStorageUsage(): Promise<{ usedBytes: number; count: number }> {
  try {
    const { data } = await supabase
      .from('snapshot_metadata')
      .select('file_size_bytes');
    const usedBytes = (data || []).reduce((sum: number, r: any) => sum + (r.file_size_bytes || 0), 0);
    return { usedBytes, count: (data || []).length };
  } catch {
    return { usedBytes: 0, count: 0 };
  }
}

/**
 * Download & decompress a snapshot from Storage, returning InventoryItem[].
 */
export async function loadSnapshot(storagePath: string): Promise<InventoryItem[] | null> {
  try {
    const { data, error } = await supabase.storage
      .from('inventory_snapshots')
      .download(storagePath);
    if (error || !data) { console.error('loadSnapshot download:', error); return null; }
    const parsed = await decompressData(data);
    return Array.isArray(parsed) ? parsed as InventoryItem[] : null;
  } catch (err) {
    console.error('loadSnapshot:', err);
    return null;
  }
}

/**
 * Delete a snapshot (storage file + metadata row).
 */
export async function deleteSnapshot(id: string, storagePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Supabase] Attempting to delete snapshot: ${id} at ${storagePath}`);

    // 1. Remove file from storage
    const { error: storageErr } = await supabase.storage
      .from('inventory_snapshots')
      .remove([storagePath]);

    if (storageErr) {
      console.warn('[Supabase] Storage removal warning (might already be deleted):', storageErr);
      // We continue even if storage removal fails
    }

    // 2. Delete metadata row
    const { error: dbErr } = await supabase
      .from('snapshot_metadata')
      .delete()
      .eq('id', id);

    if (dbErr) {
      console.error('[Supabase] Error deleting snapshot metadata:', dbErr);
      return { success: false, error: dbErr.message };
    }

    console.log(`[Supabase] Successfully deleted snapshot: ${id}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Supabase] Unexpected error in deleteSnapshot:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}
