import { describe, it, expect } from 'vitest';
import {
  ReminderStatus,
  ReminderChannel,
  TemplateLevel,
  ARCHIVE_VERSION,
  compositeKey,
  type ReminderEntry,
  type Annotation,
  type ArchiveFile,
} from './types';

describe('types', () => {
  it('ReminderStatus enumerates 5 values', () => {
    const all: ReminderStatus[] = ['pending', 'acknowledged', 'committed', 'silent', 'closed'];
    expect(all).toHaveLength(5);
  });

  it('ReminderChannel enumerates 3 values', () => {
    const all: ReminderChannel[] = ['email', 'zalo', 'phone'];
    expect(all).toHaveLength(3);
  });

  it('TemplateLevel enumerates 3 values', () => {
    const all: TemplateLevel[] = ['first-nudge', 'overdue', 'escalation'];
    expect(all).toHaveLength(3);
  });

  it('ARCHIVE_VERSION = 1', () => {
    expect(ARCHIVE_VERSION).toBe(1);
  });

  it('ReminderEntry has required fields', () => {
    const r: ReminderEntry = {
      uuid: '01H8000000000000000000000A',
      created_at: '2026-05-10T08:00:00+07:00',
      doc_no: 'PO-001',
      item_code: 'A1',
      item_name: 'Test',
      supplier: 'X',
      channel: 'email',
      reminder_by: 'NV A',
      template_used: 'first-nudge',
      ncc_response_status: 'pending',
    };
    expect(r.uuid).toBeTruthy();
  });

  it('ArchiveFile shape', () => {
    const a: ArchiveFile = { version: 1, exported_at: new Date().toISOString(), reminders: [] };
    expect(a.version).toBe(1);
  });

  it('compositeKey joins doc_no, item_code, row_id', () => {
    expect(compositeKey('PO-1', 'A1', 'r1')).toBe('PO-1|A1|r1');
    expect(compositeKey('PO-1', 'A1')).toBe('PO-1|A1|');
    expect(compositeKey('PO-1', 'A1', '')).toBe('PO-1|A1|');
  });

  it('Annotation requires reminder_count', () => {
    const a: Annotation = { reminder_count: 0, ncc_response_status: 'pending' };
    expect(a.reminder_count).toBe(0);
  });
});
