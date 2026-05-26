import type * as React from 'react';
import { useEffect, useState } from 'react';
import type { MonthlyData, KittingDefinition } from '../types/inventory';
import type { SupersessionMapping } from '../utils/supersessionGraph';
import type { AppSettings } from '../utils/appSettings';
import {
    loadFromCloudStorage,
    loadLatestMonthlyData,
    loadAllSupersessionMappings,
    dbMappingsToApp,
} from '../utils/supabase';
import { cacheMonthlyData, getCachedMonthlyData } from '../utils/db';

type Setters = {
    setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    setSupersessionMappings: React.Dispatch<React.SetStateAction<SupersessionMapping[]>>;
    setKittingDefs: React.Dispatch<React.SetStateAction<KittingDefinition[]>>;
    setMonthlyData: React.Dispatch<React.SetStateAction<Record<string, MonthlyData> | null>>;
    setMonthlyDataDate: React.Dispatch<React.SetStateAction<string | null>>;
};

/**
 * Bootstrap on app mount: pull cloud defaults (settings/supersession/kitting) and the latest
 * monthly coefficient snapshot. Uses IndexedDB cache as fast first paint, then revalidates.
 */
export function useAppBootstrap(setters: Setters) {
    const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const [configData, ssDbRows, kittingData] = await Promise.all([
                    loadFromCloudStorage('global_config'),
                    loadAllSupersessionMappings(),
                    loadFromCloudStorage('kitting_draft'),
                ]);
                if (cancelled) return;

                if (configData) setters.setAppSettings(prev => ({ ...prev, ...configData }));

                if (ssDbRows.length > 0) {
                    setters.setSupersessionMappings(dbMappingsToApp(ssDbRows));
                } else {
                    const ssLegacy = await loadFromCloudStorage('supersession_draft');
                    if (Array.isArray(ssLegacy)) setters.setSupersessionMappings(ssLegacy);
                }

                if (Array.isArray(kittingData)) setters.setKittingDefs(kittingData);

                setIsMonthlyLoading(true);

                const cachedMonthly = await getCachedMonthlyData();
                let lastTimestamp: string | undefined = undefined;
                if (cachedMonthly && !cancelled) {
                    setters.setMonthlyData(cachedMonthly.data);
                    setters.setMonthlyDataDate(cachedMonthly.date);
                    lastTimestamp = cachedMonthly.updatedAt;
                    setIsMonthlyLoading(false);
                }

                const monthly = await loadLatestMonthlyData(lastTimestamp);
                if (cancelled) return;

                if (monthly && !monthly.isUpToDate && monthly.data) {
                    const updatedAtDate = monthly.updatedAt.slice(0, 10);
                    setters.setMonthlyData(monthly.data);
                    setters.setMonthlyDataDate(updatedAtDate);
                    await cacheMonthlyData(monthly.data, updatedAtDate, monthly.updatedAt);
                }
                setIsMonthlyLoading(false);
            } catch (err) {
                setIsMonthlyLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
        // Run once on mount only — bootstrap is a one-shot operation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { isMonthlyLoading };
}
