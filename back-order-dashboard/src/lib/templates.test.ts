import { describe, it, expect } from 'vitest';
import { renderTemplate, suggestTemplateLevel } from './templates';
import type { Annotation, TemplateLevel } from './types';

const baseCtx = {
  doc_no: 'PO-2026-0123',
  item_code: 'A6A-001',
  item_name: 'HỘP SỐ TỰ ĐỘNG',
  supplier: 'Van Kim Automative Co',
  doc_date: '01/04/2026',
  aging_days: 40,
  estimated_date1: '29/06/2026',
  days_overdue: 5,
  reminder_count: 0,
};

describe('templates.renderTemplate', () => {
  it('first-nudge email contains key fields', () => {
    const out = renderTemplate('first-nudge', 'email', baseCtx);
    expect(out.subject).toMatch(/Nhắc nhở/i);
    expect(out.body).toContain('PO-2026-0123');
    expect(out.body).toContain('HỘP SỐ TỰ ĐỘNG');
    expect(out.body).toContain('40 ngày');
  });

  it('overdue subject mentions quá hạn', () => {
    const out = renderTemplate('overdue', 'email', { ...baseCtx, reminder_count: 1 });
    expect(out.subject).toMatch(/quá hạn/i);
  });

  it('escalation subject includes lần thứ N+1', () => {
    const out = renderTemplate('escalation', 'email', { ...baseCtx, reminder_count: 3 });
    expect(out.subject).toMatch(/Lần thứ 4/);
  });

  it('Zalo body shorter than email', () => {
    const e = renderTemplate('first-nudge', 'email', baseCtx);
    const z = renderTemplate('first-nudge', 'zalo', baseCtx);
    expect(z.body.length).toBeLessThan(e.body.length);
  });

  it('replaces missing ETA with "(chưa có)"', () => {
    const out = renderTemplate('first-nudge', 'email', { ...baseCtx, estimated_date1: undefined });
    // first-nudge doesn't include ETA — overdue does
    const ov = renderTemplate('overdue', 'email', { ...baseCtx, estimated_date1: undefined, reminder_count: 1 });
    expect(ov.body).toContain('(chưa có)');
    expect(out.subject).toBeTruthy();
  });

  it('Zalo overdue includes ETA + days', () => {
    const z = renderTemplate('overdue', 'zalo', { ...baseCtx, reminder_count: 1 });
    expect(z.body).toContain('29/06/2026');
    expect(z.body).toContain('5');
  });

  it('Zalo escalation mentions reminder count', () => {
    const z = renderTemplate('escalation', 'zalo', { ...baseCtx, reminder_count: 3 });
    expect(z.body).toContain('3');
  });
});

describe('templates.suggestTemplateLevel', () => {
  it('returns first-nudge when reminder_count === 0', () => {
    expect(suggestTemplateLevel({ reminder_count: 0, ncc_response_status: 'pending' } as Annotation, false)).toBe<TemplateLevel>('first-nudge');
  });

  it('returns first-nudge when no annotation', () => {
    expect(suggestTemplateLevel(undefined, false)).toBe<TemplateLevel>('first-nudge');
  });

  it('returns overdue when reminded ≥ 1 and overdue', () => {
    expect(suggestTemplateLevel({ reminder_count: 1, ncc_response_status: 'pending' } as Annotation, true)).toBe<TemplateLevel>('overdue');
  });

  it('returns escalation when reminder_count ≥ 3', () => {
    expect(suggestTemplateLevel({ reminder_count: 3, ncc_response_status: 'pending' } as Annotation, false)).toBe<TemplateLevel>('escalation');
  });

  it('returns escalation when status silent', () => {
    expect(suggestTemplateLevel({ reminder_count: 1, ncc_response_status: 'silent' } as Annotation, false)).toBe<TemplateLevel>('escalation');
  });
});
