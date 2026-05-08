import type * as React from 'react';
import { useEffect, useRef } from 'react';
import type { InventoryItem } from '../types/inventory';
import { type AppSettings, saveAppSettings } from '../utils/appSettings';

/**
 * One-shot schema repair: ensures every source profile has a `brand` field, and that
 * `OEM` / `CXD` profiles exist for the dominant brand. Runs at most once per app load
 * (guarded by a ref) regardless of how many times settings changes.
 *
 * Why this is a hook: the original effect lived inline in App.tsx and re-triggered on
 * every appSettings change, doing O(n²) work via .some/.sort/.filter. Extracting
 * isolates it and makes the once-only invariant explicit.
 */
export function useSettingsRepair(
  appSettings: AppSettings,
  data: InventoryItem[],
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>
) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;

    let needsRepair = false;
    for (const p of appSettings.sourceProfiles) {
      if (!p.brand) {
        needsRepair = true;
        break;
      }
    }
    if (!needsRepair) {
      ranRef.current = true;
      return;
    }

    const brandCounts = new Map<string, number>();
    for (const item of data) {
      if (!item.BrandName) continue;
      brandCounts.set(item.BrandName, (brandCounts.get(item.BrandName) ?? 0) + 1);
    }
    let dominantBrand: string = 'Kia';
    let maxCount = 0;
    for (const [brand, count] of brandCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantBrand = brand;
      }
    }

    const updatedProfiles = appSettings.sourceProfiles.map((p) => ({
      ...p,
      brand: p.brand || (p.id === 'BMWASIA' ? 'BMW' : (dominantBrand as any)),
    }));

    const hasOEMForBrand = updatedProfiles.some((p) => p.id === 'OEM' && p.brand === dominantBrand);
    const hasCXDForBrand = updatedProfiles.some((p) => p.id === 'CXD' && p.brand === dominantBrand);

    if (!hasOEMForBrand) {
      updatedProfiles.push({
        id: 'OEM',
        brand: dominantBrand as any,
        name: 'OEM chưa xác định',
        lt: 90,
        sp: 30,
        ssp: 15,
      });
    }
    if (!hasCXDForBrand) {
      updatedProfiles.push({
        id: 'CXD',
        brand: dominantBrand as any,
        name: 'Chưa xác định',
        lt: 90,
        sp: 30,
        ssp: 15,
      });
    }

    const repaired: AppSettings = { ...appSettings, sourceProfiles: updatedProfiles };
    ranRef.current = true;
    setAppSettings(repaired);
    saveAppSettings(repaired);
  }, [appSettings, data, setAppSettings]);
}
