import { describe, test, expect } from 'vitest';
import {
  deriveDefaultCostProfiles,
  buildProjection,
  computeCostAwareTransfer,
  DEFAULT_TRANSFER_POLICY,
} from '../transferEngine';
import type { WarehouseState, TwoWarehouseState } from '../transferEngine';

// ── deriveDefaultCostProfiles ───────────────────────────────────────────────

describe('deriveDefaultCostProfiles', () => {
  test('derives cost proportional to unit cost', () => {
    const profiles = deriveDefaultCostProfiles(100000);
    expect(profiles.NB.holdingCostPerUnitPerDay).toBeCloseTo(70, 0); // 0.07%
    expect(profiles.NB.shortageCostPerUnit).toBe(30000); // 30%
    expect(profiles.NB.transferCostPerUnit).toBe(5000); // 5%
  });

  test('NB and BB profiles are independent objects', () => {
    const profiles = deriveDefaultCostProfiles(100000);
    profiles.NB.holdingCostPerUnitPerDay = 999;
    expect(profiles.BB.holdingCostPerUnitPerDay).not.toBe(999);
  });

  test('zero unit cost → zero costs', () => {
    const profiles = deriveDefaultCostProfiles(0);
    expect(profiles.NB.holdingCostPerUnitPerDay).toBe(0);
    expect(profiles.NB.shortageCostPerUnit).toBe(0);
  });
});

// ── buildProjection ─────────────────────────────────────────────────────────

describe('buildProjection', () => {
  const state: WarehouseState = {
    physicalStock: 100,
    incomingPO: 20,
    demandPerDay: 2,
    backorder: 0,
  };

  test('projects stock correctly at arrival', () => {
    const proj = buildProjection(state, DEFAULT_TRANSFER_POLICY);
    // demand during transit = 2 * 3 = 6
    // inbound during transit = 20 * 0.25 = 5
    // projected = max(0, 100 - 6 + 5) = 99
    expect(proj.projectedAvailableAtArrival).toBe(99);
  });

  test('surplusToGive = projected - protection', () => {
    const proj = buildProjection(state, DEFAULT_TRANSFER_POLICY);
    const protStock = 2 * DEFAULT_TRANSFER_POLICY.donorMinCoverDays; // 2*18=36
    expect(proj.protectionStock).toBe(protStock);
    expect(proj.surplusToGive).toBe(proj.projectedAvailableAtArrival - protStock);
  });

  test('zero demand → MOS = 99', () => {
    const zeroDemand: WarehouseState = { ...state, demandPerDay: 0 };
    const proj = buildProjection(zeroDemand, DEFAULT_TRANSFER_POLICY);
    expect(proj.mosAtArrival).toBe(99);
  });

  test('low stock → shortage > 0', () => {
    const lowStock: WarehouseState = { ...state, physicalStock: 5 };
    const proj = buildProjection(lowStock, DEFAULT_TRANSFER_POLICY);
    expect(proj.shortageToTarget).toBeGreaterThan(0);
  });
});

// ── computeCostAwareTransfer ────────────────────────────────────────────────

describe('computeCostAwareTransfer', () => {
  test('imbalanced warehouses → transfer from surplus to shortage', () => {
    const input: TwoWarehouseState = {
      NB: { physicalStock: 200, incomingPO: 0, demandPerDay: 2, backorder: 0 },
      BB: { physicalStock: 5, incomingPO: 0, demandPerDay: 2, backorder: 0 },
      unitCost: 100000,
      snp: 1,
    };
    const profiles = deriveDefaultCostProfiles(100000);
    const result = computeCostAwareTransfer(input, profiles);
    expect(result.bestDirection).toBe('NB_TO_BB');
    expect(result.transferQty).toBeGreaterThan(0);
    expect(result.transferNBtoBB).toBeGreaterThan(0);
    expect(result.transferBBtoNB).toBe(0);
  });

  test('balanced warehouses → no transfer', () => {
    const input: TwoWarehouseState = {
      NB: { physicalStock: 100, incomingPO: 0, demandPerDay: 2, backorder: 0 },
      BB: { physicalStock: 100, incomingPO: 0, demandPerDay: 2, backorder: 0 },
      unitCost: 100000,
      snp: 1,
    };
    const profiles = deriveDefaultCostProfiles(100000);
    const result = computeCostAwareTransfer(input, profiles);
    expect(result.bestDirection).toBe('NONE');
    expect(result.transferQty).toBe(0);
  });

  test('both warehouses critically low → no transfer (system MOS < 0.5)', () => {
    const input: TwoWarehouseState = {
      NB: { physicalStock: 2, incomingPO: 0, demandPerDay: 5, backorder: 0 },
      BB: { physicalStock: 1, incomingPO: 0, demandPerDay: 5, backorder: 0 },
      unitCost: 100000,
      snp: 1,
    };
    const profiles = deriveDefaultCostProfiles(100000);
    const result = computeCostAwareTransfer(input, profiles);
    // System MOS = 3/(10*30) < 0.5 → should skip transfer
    expect(result.transferQty).toBe(0);
  });

  test('result has valid structure', () => {
    const input: TwoWarehouseState = {
      NB: { physicalStock: 200, incomingPO: 10, demandPerDay: 3, backorder: 0 },
      BB: { physicalStock: 10, incomingPO: 0, demandPerDay: 3, backorder: 5 },
      unitCost: 50000,
      snp: 5,
    };
    const profiles = deriveDefaultCostProfiles(50000);
    const result = computeCostAwareTransfer(input, profiles);
    expect(result).toHaveProperty('bestDirection');
    expect(result).toHaveProperty('transferQty');
    expect(result).toHaveProperty('reasonCodes');
    expect(result).toHaveProperty('reasonText');
    expect(result).toHaveProperty('evaluations');
    expect(Array.isArray(result.reasonCodes)).toBe(true);
  });
});
