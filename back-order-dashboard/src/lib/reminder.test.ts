import { describe, it, expect } from 'vitest';
import { createReminder, supersedeReminder, applyToAnnotation } from './reminder';
import type { Annotation } from './types';

describe('reminder.createReminder', () => {
  it('generates ULID uuid + ISO timestamp', () => {
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    expect(r.uuid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(r.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not mutate input', () => {
    const input = {
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email' as const, reminder_by: 'A', template_used: 'first-nudge' as const,
      ncc_response_status: 'pending' as const,
    };
    const snapshot = JSON.stringify(input);
    createReminder(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('reminder.supersedeReminder', () => {
  it('creates new entry with supersedes pointer', () => {
    const original = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const updated = supersedeReminder(original, { ncc_response: 'fixed', ncc_response_status: 'committed' });
    expect(updated.supersedes).toBe(original.uuid);
    expect(updated.uuid).not.toBe(original.uuid);
    expect(updated.ncc_response_status).toBe('committed');
    expect(updated.ncc_response).toBe('fixed');
  });

  it('original is not mutated', () => {
    const original = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const snapshot = JSON.stringify(original);
    supersedeReminder(original, { ncc_response_status: 'silent' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('reminder.applyToAnnotation', () => {
  it('initializes annotation when none exists', () => {
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const ann = applyToAnnotation(undefined, r);
    expect(ann.reminder_count).toBe(1);
    expect(ann.last_reminded_at).toBe(r.created_at);
    expect(ann.reminder_uuid_last).toBe(r.uuid);
    expect(ann.updated_by).toBe('A');
  });

  it('increments reminder_count when annotation exists', () => {
    const existing: Annotation = { reminder_count: 3, ncc_response_status: 'pending' };
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'zalo', reminder_by: 'B', template_used: 'overdue',
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
    });
    const ann = applyToAnnotation(existing, r);
    expect(ann.reminder_count).toBe(4);
    expect(ann.ncc_response_status).toBe('committed');
    expect(ann.eta_promised_new).toBe('15/05/2026');
  });

  it('preserves existing eta_promised_new when reminder has none', () => {
    const existing: Annotation = { reminder_count: 1, ncc_response_status: 'pending', eta_promised_new: '01/06/2026' };
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const ann = applyToAnnotation(existing, r);
    expect(ann.eta_promised_new).toBe('01/06/2026');
  });
});
