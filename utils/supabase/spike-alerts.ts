import { supabase } from './client';
import type { SpikeAlert, SpikeAlertNote } from '../spikeAlerts';

const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

/** Page through a query; unlike helpers.selectAllPaginated, a failed page is reported, not dropped. */
async function selectAll<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error?: string }> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await build(from, from + PAGE_SIZE - 1);
        if (error) return { data: all, error: error.message };
        all.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) return { data: all };
    }
}

/**
 * Save one week of spike alerts (from usp_WeeklySpikeAlert CSV). Re-uploading the same week replaces its
 * alerts; notes live in spike_alert_notes and are kept. Requires role admin/planner (RLS).
 * Safe on failure: rows are upserted first and rows of the week from earlier uploads are deleted only after
 * every batch succeeded, so a broken upload never leaves the week empty.
 */
export async function saveSpikeAlerts(
    rows: SpikeAlert[],
): Promise<{ success: boolean; inserted?: number; error?: string }> {
    if (rows.length === 0) return { success: false, error: 'Không có dòng cảnh báo nào.' };
    const weekEnd = rows[0].week_end;
    const uploadBatch = crypto.randomUUID();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const stamped = rows.map(r => ({ ...r, upload_batch: uploadBatch, uploaded_by: user?.id ?? null }));
    for (let i = 0; i < stamped.length; i += BATCH_SIZE) {
        const { error } = await supabase
            .from('spike_alerts')
            .upsert(stamped.slice(i, i + BATCH_SIZE), { onConflict: 'week_end,item_code' });
        if (error) return { success: false, inserted: i, error: error.message };
    }

    // Items of this week that are not in the new file still carry an earlier upload_batch.
    const { error: delErr } = await supabase
        .from('spike_alerts')
        .delete()
        .eq('week_end', weekEnd)
        .neq('upload_batch', uploadBatch);
    if (delErr) return { success: false, inserted: stamped.length, error: delErr.message };
    return { success: true, inserted: stamped.length };
}

/** Latest uploaded week: its alerts and the notes recorded for it. On any error, no alerts are returned. */
export async function loadLatestSpikeAlerts(): Promise<{
    weekEnd: string | null;
    alerts: SpikeAlert[];
    notes: SpikeAlertNote[];
    error?: string;
}> {
    const empty = { weekEnd: null, alerts: [], notes: [] };
    const { data: latest, error } = await supabase
        .from('spike_alerts')
        .select('week_end')
        .order('week_end', { ascending: false })
        .limit(1);
    // Table not created yet (migration 020 pending) = simply no alerts; the app keeps working.
    if (error && (error.code === 'PGRST205' || error.code === '42P01')) return empty;
    if (error) return { ...empty, error: error.message };
    const weekEnd: string | null = latest?.[0]?.week_end ?? null;
    if (!weekEnd) return empty;

    const [alerts, notes] = await Promise.all([
        selectAll<SpikeAlert>((from, to) =>
            supabase.from('spike_alerts').select('*').eq('week_end', weekEnd).order('item_code').range(from, to),
        ),
        selectAll<SpikeAlertNote>((from, to) =>
            supabase.from('spike_alert_notes').select('*').eq('week_end', weekEnd).order('item_code').range(from, to),
        ),
    ]);
    // Showing alerts without their notes would let a user overwrite a colleague's conclusion with a blank form.
    const loadError = alerts.error || notes.error;
    if (loadError) return { ...empty, error: loadError };
    return { weekEnd, alerts: alerts.data, notes: notes.data };
}

/** Record the ordering team's conclusion for one alert (any active user). Author and time are set server-side. */
export async function saveSpikeNote(
    note: Pick<SpikeAlertNote, 'week_end' | 'item_code' | 'conclusion' | 'dealer_code' | 'action' | 'note'>,
): Promise<{ success: boolean; saved?: SpikeAlertNote; error?: string }> {
    const { data, error } = await supabase
        .from('spike_alert_notes')
        .upsert(note, { onConflict: 'week_end,item_code' })
        .select()
        .single();
    return error ? { success: false, error: error.message } : { success: true, saved: data as SpikeAlertNote };
}
