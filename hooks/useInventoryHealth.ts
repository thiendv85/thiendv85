import { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';

/**
 * Custom hook for reusable inventory health and risk logic.
 * Hook tùy chỉnh cho các logic sức khỏe tồn kho và quản lý rủi ro.
 */
export function useInventoryHealth(item?: InventoryItem) {
    return useMemo(() => {
        if (!item || !item.computed) {
            return {
                mos: 0,
                isOOS: false,
                isRisk: false,
                gapQty: 0,
                gapValue: 0,
                healthColor: 'text-slate-400',
                healthLabel: 'N/A',
            };
        }

        const { mos, available, netAvailable, demandMonthly, stockoutGapQty, stockoutGapValue } = item.computed;
        
        const isOOS = available <= 0;
        const isRisk = item.computed.stockoutRiskFlag || netAvailable < (demandMonthly * 0.5);
        const gapQty = stockoutGapQty || 0;
        const gapValue = stockoutGapValue || 0;

        let healthColor = 'text-emerald-500';
        let healthLabel = 'Khỏe mạnh (Healthy)';

        if (isOOS) {
            healthColor = 'text-rose-600';
            healthLabel = 'Hết hàng (Stockout)';
        } else if (isRisk) {
            healthColor = 'text-amber-500';
            healthLabel = 'Rủi ro (Risk)';
        } else if (mos > 6) {
            healthColor = 'text-blue-500';
            healthLabel = 'Tồn cao (Overstock)';
        }

        return {
            mos,
            isOOS,
            isRisk,
            gapQty,
            gapValue,
            healthColor,
            healthLabel,
        };
    }, [item]);
}

/**
 * Helper to calculate aggregate health for a set of items.
 * Hàm bổ trợ tính toán sức khỏe tổng hợp cho một tập hợp mã hàng.
 */
export function useInventoryHealthBulk(items: InventoryItem[]) {
    return useMemo(() => {
        const totals = {
            oos: 0,
            risk: 0,
            overstock: 0,
            healthy: 0,
            totalGapValue: 0,
            totalExcessValue: 0,
            avgMos: 0,
        };

        if (!items.length) return totals;

        let mosSum = 0;
        items.forEach(item => {
            const comp = item.computed;
            if (!comp) return;

            if (comp.available <= 0) totals.oos++;
            else if (comp.stockoutRiskFlag) totals.risk++;
            else if (comp.mos > 6) totals.overstock++;
            else totals.healthy++;

            totals.totalGapValue += comp.stockoutGapValue || 0;
            totals.totalExcessValue += comp.excessValue || 0;
            mosSum += comp.mos || 0;
        });

        totals.avgMos = mosSum / items.length;
        return totals;
    }, [items]);
}
