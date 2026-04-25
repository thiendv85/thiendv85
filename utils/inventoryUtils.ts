import { InventoryItem, SourceProfile, MonthlyData } from '../types/inventory';

/**
 * resolveItemProfile — Determines the correct lead time and safety stock profile for an item.
 * Extracted from inventoryEngine.ts to minimize entry bundle size.
 */
export function resolveItemProfile(item: InventoryItem, sourceProfiles?: SourceProfile[]): { profile?: SourceProfile; isFallback?: boolean; fallbackReason?: string } {
    if (!sourceProfiles || sourceProfiles.length === 0) return {};
    const sId = (item.SourceId || '').toLowerCase();
    const brand = (item.BrandName || '').toLowerCase();

    // 1. Precise Match (ID + Brand)
    const exact = sourceProfiles.find(p => p.id.toLowerCase() === sId && p.brand.toLowerCase() === brand);
    if (exact) return { profile: exact };

    // 2. Brand-Specific Fallback: Use Max Lead Time of the same brand
    const sameBrandProfiles = sourceProfiles.filter(p => p.brand.toLowerCase() === brand);
    if (sameBrandProfiles.length > 0) {
        const brandFallback = sameBrandProfiles.reduce((max, p) => (p.lt > max.lt ? p : max), sameBrandProfiles[0]);
        return { profile: brandFallback, isFallback: true, fallbackReason: `Dùng LT cao nhất của ${item.BrandName || 'thương hiệu'}` };
    }

    // 3. Absolute Fallback: Default to General profile (GEN) or first profile
    const generalProfile = sourceProfiles.find(p => p.id.toUpperCase() === 'GEN') || sourceProfiles[0];
    return { profile: generalProfile, isFallback: true, fallbackReason: brand ? `Không tìm thấy profile cho ${brand}` : 'Dùng profile chung' };
}

/**
 * mergeMonthlyIntoItems — Re-applies File B (monthly coefficients) to an existing list of InventoryItems.
 * Extracted from csvParser.ts to minimize entry bundle size.
 */
export const mergeMonthlyIntoItems = (items: InventoryItem[], monthlyData: Record<string, MonthlyData>): InventoryItem[] => {
    return items.map(item => {
        const monthly = monthlyData[item.ItemCode];
        const cleanNote = (item.Note || '').replace(' [⚠ Chưa có dữ liệu tháng]', '').trim();

        if (!monthly) {
            return { ...item, Note: (cleanNote + ' [⚠ Chưa có dữ liệu tháng]').trim() };
        }

        const rawTrend = (monthly.TrendFlag || item.TrendFlag || 'Stable').toUpperCase();
        let trendFlag = 'Stable';
        if (rawTrend.includes('UP') || rawTrend.includes('TANG')) trendFlag = 'Up';
        else if (rawTrend.includes('DOWN') || rawTrend.includes('GIAM')) trendFlag = 'Down';
        else if (rawTrend.includes('DINH') || rawTrend.includes('STABLE')) trendFlag = 'Stable';

        return {
            ...item,
            LOISGroup: item.LOISGroup ? item.LOISGroup : (monthly.LOISGroup || ''),
            TrendFlag: trendFlag,
            AvgQty3M:  monthly.AvgQty3M  ?? item.AvgQty3M,
            AvgQty6M:  monthly.AvgQty6M  ?? item.AvgQty6M,
            AvgQty12M: monthly.AvgQty12M ?? item.AvgQty12M,
            AvgQty24M: monthly.AvgQty24M ?? item.AvgQty24M,
            BaseForecast: monthly.BaseForecast ?? item.BaseForecast,
            Forecast_NB: monthly.Forecast_NB ?? item.Forecast_NB,
            Forecast_BB: monthly.Forecast_BB ?? item.Forecast_BB,
            SalesHistory: (monthly.SalesHistory && monthly.SalesHistory.length > 0) ? monthly.SalesHistory : item.SalesHistory,
            Note: cleanNote
        };
    });
};
