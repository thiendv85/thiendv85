import { useMemo } from 'react';

export interface RowExplanation {
  action: 'keep' | 'reduce' | 'increase' | 'exclude';
  reason: string;
  detail: string;
}

export const useRowExplanation = (
  ctx: any,
  originalQty: { air: number; sea: number },
  currentQty: { air: number; sea: number },
  isSelected: boolean
): RowExplanation => {
  return useMemo(() => {
    if (!isSelected) {
      return {
        action: 'exclude',
        reason: 'Item excluded',
        detail: 'Dealer and pipeline stock are sufficient short-term.'
      };
    }

    const deltaAir = currentQty.air - originalQty.air;
    const deltaSea = currentQty.sea - originalQty.sea;

    if (deltaSea < 0 || deltaAir < 0) {
      return {
        action: 'reduce',
        reason: 'Qty reduced',
        detail: 'Projected stock after this order already covers safe range.'
      };
    }

    if (deltaSea > 0 || deltaAir > 0) {
      return {
        action: 'increase',
        reason: 'Qty increased',
        detail: 'Increased quantity to address imminent stockout risk.'
      };
    }

    if (ctx.backorder > 0 && ctx.priorityBucket === 'P1') {
        return {
            action: 'keep',
            reason: 'Air kept',
            detail: 'Backorder present and critical priority requires fast coverage.'
        };
    }

    return {
      action: 'keep',
      reason: 'Draft maintained',
      detail: 'Original proposal matches replenishment target.'
    };
  }, [ctx, originalQty, currentQty, isSelected]);
};
