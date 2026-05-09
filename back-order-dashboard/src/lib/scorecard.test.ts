import { describe, it, expect } from 'vitest';
import { computeScorecard, reliabilityScore } from './scorecard';
import type { ReminderEntry } from './types';

function r(over: Partial<ReminderEntry>): ReminderEntry {
  return {
    uuid: Math.random().toString(36),
    created_at: '2026-05-10T08:00:00.000Z',
    doc_no: 'PO-1', item_code: 'A', item_name: 'X',
    supplier: 'Van Kim', channel: 'email', reminder_by: 'NV A',
    template_used: 'first-nudge', ncc_response_status: 'pending',
    ...over,
  };
}

describe('reliabilityScore', () => {
  it('returns 0 when no reminders', () => {
    expect(reliabilityScore({
      supplier: 'X', totalOrders: 0, totalReminders: 0,
      committedCount: 0, silentCount: 0, avgEtaSlipDays: 0, avgResponseTimeHours: 0,
      pctCommitted: 0, pctSilent: 0,
    })).toBe(0);
  });

  it('high score for high commit + low slip + low silent', () => {
    const s = reliabilityScore({
      supplier: 'X', totalOrders: 10, totalReminders: 10,
      committedCount: 9, silentCount: 0, avgEtaSlipDays: 1, avgResponseTimeHours: 2,
      pctCommitted: 0.9, pctSilent: 0,
    });
    expect(s).toBeGreaterThan(7);
  });

  it('low score for high silent + high slip', () => {
    const s = reliabilityScore({
      supplier: 'X', totalOrders: 10, totalReminders: 10,
      committedCount: 0, silentCount: 10, avgEtaSlipDays: 30, avgResponseTimeHours: 0,
      pctCommitted: 0, pctSilent: 1,
    });
    expect(s).toBeLessThan(3);
  });
});

describe('computeScorecard', () => {
  it('groups by supplier', () => {
    const archive = [
      r({ supplier: 'A', ncc_response_status: 'committed' }),
      r({ supplier: 'A', ncc_response_status: 'silent' }),
      r({ supplier: 'B', ncc_response_status: 'committed' }),
    ];
    const stats = computeScorecard(archive);
    expect(stats.find(s => s.supplier === 'A')?.totalReminders).toBe(2);
    expect(stats.find(s => s.supplier === 'B')?.totalReminders).toBe(1);
  });

  it('filters by time window', () => {
    const archive = [
      r({ supplier: 'A', created_at: '2026-04-01T00:00:00Z' }),
      r({ supplier: 'A', created_at: '2026-05-09T00:00:00Z' }),
    ];
    const today = new Date('2026-05-10');
    const stats7d = computeScorecard(archive, { now: today, windowDays: 7 });
    expect(stats7d.find(s => s.supplier === 'A')?.totalReminders).toBe(1);
  });

  it('counts committed and silent percentages', () => {
    const archive = [
      r({ supplier: 'X', ncc_response_status: 'committed' }),
      r({ supplier: 'X', ncc_response_status: 'committed' }),
      r({ supplier: 'X', ncc_response_status: 'silent' }),
      r({ supplier: 'X', ncc_response_status: 'pending' }),
    ];
    const stats = computeScorecard(archive);
    const s = stats.find(s => s.supplier === 'X')!;
    expect(s.pctCommitted).toBe(0.5);
    expect(s.pctSilent).toBe(0.25);
  });

  it('counts distinct orders within supplier', () => {
    const archive = [
      r({ supplier: 'X', doc_no: 'PO-1', item_code: 'A' }),
      r({ supplier: 'X', doc_no: 'PO-1', item_code: 'A' }),
      r({ supplier: 'X', doc_no: 'PO-2', item_code: 'B' }),
    ];
    const stats = computeScorecard(archive);
    expect(stats.find(s => s.supplier === 'X')?.totalOrders).toBe(2);
    expect(stats.find(s => s.supplier === 'X')?.totalReminders).toBe(3);
  });

  it('sorts by totalReminders desc', () => {
    const archive = [
      r({ supplier: 'A' }),
      r({ supplier: 'B' }),
      r({ supplier: 'B' }),
      r({ supplier: 'B' }),
      r({ supplier: 'C' }),
      r({ supplier: 'C' }),
    ];
    const stats = computeScorecard(archive);
    expect(stats.map(s => s.supplier)).toEqual(['B', 'C', 'A']);
  });
});
