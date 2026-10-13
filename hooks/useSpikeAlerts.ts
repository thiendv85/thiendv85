import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadLatestSpikeAlerts } from '../utils/supabase';
import { buildSpikeAlertMap, type SpikeAlert, type SpikeAlertNote } from '../utils/spikeAlerts';

/** Latest week's spike alerts keyed by ItemCode (small: hundreds of rows), with the team's notes. */
export function useSpikeAlerts() {
    const [weekEnd, setWeekEnd] = useState<string | null>(null);
    const [alerts, setAlerts] = useState<SpikeAlert[]>([]);
    const [notes, setNotes] = useState<SpikeAlertNote[]>([]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await loadLatestSpikeAlerts();
        setWeekEnd(res.weekEnd);
        setAlerts(res.alerts);
        setNotes(res.notes);
        setError(res.error ?? null);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const map = useMemo(() => buildSpikeAlertMap(alerts, notes), [alerts, notes]);
    /** Stable across note saves — use for list filtering so saving a note does not re-filter 80k items. */
    const codes = useMemo(() => new Set(alerts.map(a => a.item_code)), [alerts]);

    /** Reflect a note saved by this user without refetching. */
    const applyNote = useCallback((note: SpikeAlertNote) => {
        setNotes(prev => [
            ...prev.filter(n => !(n.week_end === note.week_end && n.item_code === note.item_code)),
            note,
        ]);
    }, []);

    return { weekEnd, map, codes, error, refresh: load, applyNote };
}
