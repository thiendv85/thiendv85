import { useEffect, useMemo, useState, useCallback } from 'react';
import type { PartAffinityPair } from '../types/inventory';
import { fetchPartAffinityPairs } from '../utils/supabase';
import { buildAffinityIndex } from '../utils/partAffinity';

export function usePartAffinity() {
    const [pairs, setPairs] = useState<PartAffinityPair[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchPartAffinityPairs();
            setPairs(data);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const index = useMemo(() => buildAffinityIndex(pairs), [pairs]);

    return { pairs, index, isLoading, refresh: load };
}
