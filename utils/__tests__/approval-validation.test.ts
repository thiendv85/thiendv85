import { describe, test, expect } from 'vitest';
import {
  validateStateTransition,
  getAllowedNextStates,
  getAvailableActions,
  validateReason,
} from '../approval-validation';

// ── validateStateTransition ─────────────────────────────────────────────────

describe('validateStateTransition', () => {
  test('pending → in_progress is valid', () => {
    const result = validateStateTransition('pending', 'in_progress');
    expect(result.valid).toBe(true);
  });

  test('pending → approved is invalid (must go through in_progress)', () => {
    const result = validateStateTransition('pending', 'approved');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('in_progress → approved is valid', () => {
    const result = validateStateTransition('in_progress', 'approved');
    expect(result.valid).toBe(true);
  });

  test('approved → unlocked within 24h is valid', () => {
    const recentApproval = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const result = validateStateTransition('approved', 'unlocked', {
      approvedAt: recentApproval,
    });
    expect(result.valid).toBe(true);
  });

  test('approved → unlocked after 24h is invalid', () => {
    const oldApproval = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    const result = validateStateTransition('approved', 'unlocked', {
      approvedAt: oldApproval,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('24');
  });

  test('in_progress → approved requires correct level', () => {
    const result = validateStateTransition('in_progress', 'approved', {
      userRole: 'approver',
      approvalLevels: [1],
      requestLevel: 2,
    });
    expect(result.valid).toBe(false);
  });

  test('admin can approve any level', () => {
    const result = validateStateTransition('in_progress', 'approved', {
      userRole: 'admin',
      approvalLevels: [1],
      requestLevel: 99,
    });
    expect(result.valid).toBe(true);
  });
});

// ── getAllowedNextStates ─────────────────────────────────────────────────────

describe('getAllowedNextStates', () => {
  test('pending has transitions', () => {
    const states = getAllowedNextStates('pending');
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('in_progress');
  });

  test('unknown status returns empty', () => {
    const states = getAllowedNextStates('nonexistent' as any);
    expect(states).toEqual([]);
  });
});

// ── getAvailableActions ─────────────────────────────────────────────────────

describe('getAvailableActions', () => {
  test('viewer gets no actions', () => {
    const actions = getAvailableActions('pending', 'viewer', [], 1);
    expect(actions).toEqual([]);
  });

  test('approver with matching level can approve', () => {
    const actions = getAvailableActions('pending', 'approver', [1], 1);
    expect(actions).toContain('approved');
    expect(actions).toContain('returned');
    expect(actions).toContain('rejected');
  });

  test('approver without matching level cannot approve but can reject', () => {
    const actions = getAvailableActions('pending', 'approver', [2], 1);
    expect(actions).not.toContain('approved');
    expect(actions).toContain('rejected');
  });

  test('admin can always approve', () => {
    const actions = getAvailableActions('in_progress', 'admin', [], 5);
    expect(actions).toContain('approved');
  });
});

// ── validateReason ──────────────────────────────────────────────────────────

describe('validateReason', () => {
  test('approved action does not require reason', () => {
    const result = validateReason('approved', '');
    expect(result.valid).toBe(true);
  });

  test('rejected action requires reason with min length', () => {
    const result = validateReason('rejected', 'short');
    expect(result.valid).toBe(false);
  });

  test('rejected action with valid reason passes', () => {
    const result = validateReason('rejected', 'Vượt quá ngân sách tháng này rồi');
    expect(result.valid).toBe(true);
  });

  test('reason exceeding max length fails', () => {
    const longReason = 'x'.repeat(501);
    const result = validateReason('rejected', longReason);
    expect(result.valid).toBe(false);
  });
});
