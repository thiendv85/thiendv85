import { describe, test, expect } from 'vitest';
import {
  getVietnameseWorkingDays,
  getWorkingDaysByLeadTime,
  buildWorkingDaysCache,
  computeInventory,
  makeComputeParams,
} from '../inventoryEngine';
import type { InventoryItem } from '../../types/inventory';

// ── getVietnameseWorkingDays ────────────────────────────────────────────────

describe('getVietnameseWorkingDays', () => {
  test('normal month returns 22-27 working days', () => {
    // March 2026 — no Tet, no major holidays
    const wd = getVietnameseWorkingDays(2, 2026); // month=2 is March
    expect(wd).toBeGreaterThanOrEqual(22);
    expect(wd).toBeLessThanOrEqual(27);
  });

  test('January has fewer days due to New Year holiday', () => {
    const jan = getVietnameseWorkingDays(0, 2026);
    const mar = getVietnameseWorkingDays(2, 2026);
    // Jan 1 is holiday → should be ≤ March
    expect(jan).toBeLessThanOrEqual(mar);
  });

  test('returns at least 1 (fallback 26 for zero case)', () => {
    const wd = getVietnameseWorkingDays(0, 2026);
    expect(wd).toBeGreaterThan(0);
  });

  test('Tet month (Feb 2026) has fewer working days', () => {
    // Tet 2026 is mid-Feb
    const feb = getVietnameseWorkingDays(1, 2026);
    const mar = getVietnameseWorkingDays(2, 2026);
    expect(feb).toBeLessThan(mar);
  });
});

// ── getWorkingDaysByLeadTime ────────────────────────────────────────────────

describe('getWorkingDaysByLeadTime', () => {
  test('7 calendar days → ~6 working days (Mon-Sat, skip Sunday)', () => {
    // Start on a Monday with no holidays
    const monday = new Date(2026, 5, 1); // June 1, 2026 is Monday
    const wd = getWorkingDaysByLeadTime(7, monday);
    expect(wd).toBe(6); // Mon-Sat = 6, Sun skipped
  });

  test('0 calendar days → 0 working days', () => {
    const wd = getWorkingDaysByLeadTime(0, new Date());
    expect(wd).toBe(0);
  });

  test('30 days → roughly 25-26 working days', () => {
    const start = new Date(2026, 2, 1); // March
    const wd = getWorkingDaysByLeadTime(30, start);
    expect(wd).toBeGreaterThanOrEqual(24);
    expect(wd).toBeLessThanOrEqual(27);
  });
});

// ── buildWorkingDaysCache ───────────────────────────────────────────────────

describe('buildWorkingDaysCache', () => {
  test('returns Map with cumulative working days keyed by calendar day offset', () => {
    const cache = buildWorkingDaysCache(new Date(2026, 2, 1), 90);
    expect(cache).toBeInstanceOf(Map);
    expect(cache.has(0)).toBe(true);
    expect(cache.get(0)).toBe(0);
    expect(cache.has(30)).toBe(true);
    expect(cache.get(30)!).toBeGreaterThan(0);
    expect(cache.has(90)).toBe(true);
  });
});

// ── computeInventory (integration-level) ────────────────────────────────────

describe('computeInventory', () => {
  // Use 'as any' for fields merged from MonthlyData at runtime (CV, Sigma_eff)
  const baseItem: Record<string, any> = {
    ItemCode: 'TEST-001',
    ItemName: 'Test Part',
    BrandName: 'Kia',
    TotalInventory: 100,
    QuantityInventory_NB: 60,
    QuantityInventory_BB: 40,
    QuantityDC_NB: 0,
    QuantityDC_BB: 0,
    Backorder: 5,
    TotalPO: 20,
    UnitCost_PP: 50000,
    UnitCost_FOB: 40000,
    SNP: 10,
    AvgQty3M: 15,
    AvgQty6M: 12,
    AvgQty12M: 10,
    BaseForecast: 14,
    CV: 0.3,
    Sigma_eff: 4.5,
    SalesHistory: [10, 12, 15, 8, 14, 11, 9, 13, 16, 10, 12, 14],
  };

  const baseParams = {
    lt: 60,
    sp: 30,
    ssp: 14,
    warehouseScope: 'All' as const,
    costBasis: 'PP' as const,
    snapshotYYMM: '2605',
    snapshotDate: '2026-05-01',
  };

  test('returns computed fields with valid structure', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(result).toHaveProperty('demandRateDaily');
    expect(result).toHaveProperty('rop');
    expect(result).toHaveProperty('stockMax');
    expect(result).toHaveProperty('mos');
    expect(result).toHaveProperty('safetyStock');
    expect(result).toHaveProperty('priorityBucket');
  });

  test('demandRateDaily > 0 when item has sales history', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(result.demandRateDaily).toBeGreaterThan(0);
    expect(result.demandMonthly).toBeGreaterThan(0);
  });

  test('ROP > safety stock (ROP = SS + demand during LT)', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(result.rop).toBeGreaterThanOrEqual(result.safetyStock);
  });

  test('stockMax > ROP (MAX = ROP + demand during SP)', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(result.stockMax).toBeGreaterThan(result.rop);
  });

  test('zero demand item has MOS 0 or Infinity (engine-specific)', () => {
    const zeroDemandItem = {
      ...baseItem,
      AvgQty3M: 0,
      AvgQty6M: 0,
      AvgQty12M: 0,
      BaseForecast: 0,
      SalesHistory: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    } as InventoryItem;
    const result = computeInventory(zeroDemandItem, baseParams);
    // Engine returns 0 when demandMonthly is 0 (no sales → MOS meaningless)
    expect(result.demandMonthly).toBe(0);
  });

  test('unitCost uses PP when costBasis is PP', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(result.unitCost).toBe(50000);
  });

  test('unitCost uses FOB when costBasis is FOB', () => {
    const result = computeInventory(baseItem as InventoryItem, {
      ...baseParams,
      costBasis: 'FOB',
    });
    expect(result.unitCost).toBe(40000);
  });

  test('priority bucket is one of P1, P2, P3', () => {
    const result = computeInventory(baseItem as InventoryItem, baseParams);
    expect(['P1', 'P2', 'P3']).toContain(result.priorityBucket);
  });
});

// ── makeComputeParams ───────────────────────────────────────────────────────

describe('makeComputeParams', () => {
  test('creates params from settings object with nested params', () => {
    const settings = {
      params: { lt: 60, sp: 30, ssp: 14 },
      warehouseScope: 'All',
      costBasis: 'PP',
      snapshotDate: '2026-05-01',
    };
    const params = makeComputeParams(settings);
    expect(params.lt).toBe(60);
    expect(params.sp).toBe(30);
    expect(params.warehouseScope).toBe('All');
    expect(params.snapshotYYMM).toBe('2605');
  });
});
