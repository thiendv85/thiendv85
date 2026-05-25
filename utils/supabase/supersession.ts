import { supabase } from './client';
import { selectAllPaginated } from './helpers';
import type { PartAffinityPair } from '../../types/inventory';
import type { SupersessionMapping } from '../supersessionGraph';

// ─── Supersession — Dedicated tables for per-file upload + row-level mappings ──

export interface SupersessionUpload {
  id: string;
  filename: string;
  brand: string | null;
  row_count: number;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
}

export async function listSupersessionUploads(): Promise<SupersessionUpload[]> {
  const { data, error } = await supabase
    .from('supersession_uploads')
    .select('*')
    .order('uploaded_at', { ascending: false });
  if (error) { console.error('listSupersessionUploads:', error); return []; }
  return data || [];
}

export async function uploadSupersessionFile(
  filename: string,
  rows: { old_part: string; new_part: string; interchangeable: boolean }[],
  notes?: string
): Promise<{ success: boolean; uploadId?: string; inserted?: number; previousCount?: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Snapshot model: delete ALL old data, replace with new
    const { count: previousCount } = await supabase
      .from('supersession_mappings')
      .select('id', { count: 'exact', head: true });

    // Delete all old uploads (CASCADE removes mappings)
    await supabase.from('supersession_uploads').delete().gte('created_at', '1970-01-01');

    // Create new snapshot upload
    const { data: upload, error: uploadErr } = await supabase
      .from('supersession_uploads')
      .insert({
        filename,
        brand: null,
        row_count: rows.length,
        uploaded_by: user?.id ?? null,
        notes: notes || null,
      })
      .select('id')
      .single();

    if (uploadErr || !upload) throw uploadErr || new Error('No upload ID returned');

    // Insert all mappings — DEDUPE theo (old_part, new_part) để tránh
    // Postgres "ON CONFLICT DO UPDATE command cannot affect row a second time".
    // Nếu CSV có cặp trùng (sau trim/case-normalize), giữ bản cuối, interchangeable OR-merge.
    const dedupMap = new Map<string, { old_part: string; new_part: string; interchangeable: boolean; upload_id: string }>();
    for (const r of rows) {
      const oldP = r.old_part.trim();
      const newP = r.new_part.trim();
      if (!oldP || !newP) continue;
      const key = `${oldP.toUpperCase()}|${newP.toUpperCase()}`;
      const prev = dedupMap.get(key);
      dedupMap.set(key, {
        old_part: oldP,
        new_part: newP,
        interchangeable: (prev?.interchangeable || r.interchangeable),
        upload_id: upload.id,
      });
    }
    const mappingRows = Array.from(dedupMap.values());

    let inserted = 0;
    const BATCH = 500;
    for (let i = 0; i < mappingRows.length; i += BATCH) {
      const batch = mappingRows.slice(i, i + BATCH);
      const { error: batchErr, count } = await supabase
        .from('supersession_mappings')
        .upsert(batch, { onConflict: 'old_part,new_part', ignoreDuplicates: false, count: 'exact' });
      if (batchErr) throw batchErr;
      inserted += count || batch.length;
    }

    await supabase
      .from('supersession_uploads')
      .update({ row_count: inserted })
      .eq('id', upload.id);

    return { success: true, uploadId: upload.id, inserted, previousCount: previousCount || 0 };
  } catch (err: any) {
    console.error('uploadSupersessionFile:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteSupersessionUpload(uploadId: string): Promise<boolean> {
  const { error } = await supabase
    .from('supersession_uploads')
    .delete()
    .eq('id', uploadId);
  if (error) { console.error('deleteSupersessionUpload:', error); return false; }
  return true;
}

export async function migrateLocalMappingsToDB(
  mappings: { oldPart: string; newPart: string; interchangeable: boolean }[]
): Promise<{ success: boolean; inserted: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: upload, error: uploadErr } = await supabase
      .from('supersession_uploads')
      .insert({
        filename: `legacy_migration_${new Date().toISOString().slice(0, 10)}`,
        brand: null,
        row_count: mappings.length,
        uploaded_by: user?.id ?? null,
        notes: 'Migration từ dữ liệu local/cloud_storage cũ',
      })
      .select('id')
      .single();

    if (uploadErr || !upload) throw uploadErr || new Error('No upload ID');

    // Dedupe (old_part, new_part) tránh ON CONFLICT lỗi 1 batch
    const dedupMap = new Map<string, { old_part: string; new_part: string; interchangeable: boolean; upload_id: string }>();
    for (const m of mappings) {
      const oldP = m.oldPart.trim();
      const newP = m.newPart.trim();
      if (!oldP || !newP) continue;
      const key = `${oldP.toUpperCase()}|${newP.toUpperCase()}`;
      const prev = dedupMap.get(key);
      dedupMap.set(key, {
        old_part: oldP,
        new_part: newP,
        interchangeable: (prev?.interchangeable || m.interchangeable),
        upload_id: upload.id,
      });
    }
    const rows = Array.from(dedupMap.values());

    let inserted = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error: batchErr, count } = await supabase
        .from('supersession_mappings')
        .upsert(batch, { onConflict: 'old_part,new_part', ignoreDuplicates: true, count: 'exact' });
      if (batchErr) throw batchErr;
      inserted += count || batch.length;
    }

    await supabase.from('supersession_uploads').update({ row_count: inserted }).eq('id', upload.id);
    return { success: true, inserted };
  } catch (err: any) {
    console.error('migrateLocalMappingsToDB:', err);
    return { success: false, inserted: 0, error: err?.message || String(err) };
  }
}

export async function loadAllSupersessionMappings(): Promise<{ old_part: string; new_part: string; interchangeable: boolean }[]> {
  return selectAllPaginated<{ old_part: string; new_part: string; interchangeable: boolean }>(
    (from, to) => supabase.from('supersession_mappings').select('old_part, new_part, interchangeable').range(from, to)
  );
}

export function dbMappingsToApp(rows: { old_part: string; new_part: string; interchangeable: boolean }[]): SupersessionMapping[] {
  return rows.map(r => ({
    oldPart: r.old_part,
    newPart: r.new_part,
    interchangeable: r.interchangeable,
  }));
}

// ─── Part Affinity Pairs (2026-05-26) ─────────────────────────────────────────

export async function fetchPartAffinityPairs(): Promise<PartAffinityPair[]> {
  const rows = await selectAllPaginated<any>((from, to) =>
    supabase.from('part_affinity_pairs').select('*').order('created_at', { ascending: false }).range(from, to)
  );
  return rows.map(r => ({
    id: r.id,
    partA: r.part_a,
    partB: r.part_b,
    type: r.type,
    score: r.score,
    note: r.note || undefined,
    createdAt: r.created_at,
    createdBy: r.created_by || undefined,
  }));
}

export async function upsertPartAffinityPair(
  pair: Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { canonicalSort } = await import('../partAffinity');
    const [A, B] = canonicalSort(pair.partA, pair.partB);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('part_affinity_pairs').upsert({
      part_a: A,
      part_b: B,
      type: pair.type,
      score: pair.score,
      note: pair.note || null,
      updated_at: new Date().toISOString(),
      created_by: user?.id ?? null,
    }, { onConflict: 'part_a,part_b' });
    return { success: !error, error: error?.message };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function bulkUpsertPartAffinity(
  pairs: Array<Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>>
): Promise<{ inserted: number; skipped: number; error?: string }> {
  const { canonicalSort } = await import('../partAffinity');
  const dedup = new Map<string, any>();
  let skipped = 0;
  for (const p of pairs) {
    try {
      const [A, B] = canonicalSort(p.partA, p.partB);
      const key = `${A}|${B}`;
      dedup.set(key, {
        part_a: A,
        part_b: B,
        type: p.type,
        score: p.score,
        note: p.note || null,
        updated_at: new Date().toISOString(),
      });
    } catch {
      skipped++;
    }
  }
  const rows = Array.from(dedup.values());
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from('part_affinity_pairs')
      .upsert(batch, { onConflict: 'part_a,part_b', count: 'exact' });
    if (error) return { inserted, skipped, error: error.message };
    inserted += count || batch.length;
  }
  return { inserted, skipped };
}

export async function deletePartAffinityPair(id: string): Promise<boolean> {
  const { error } = await supabase.from('part_affinity_pairs').delete().eq('id', id);
  if (error) console.error('deletePartAffinityPair:', error);
  return !error;
}
