import { describe, it, expect } from 'vitest';
import {
  serializeAnnotatedCsv, parseAnnotatedCsv, ANNOTATION_COLUMNS,
  serializeArchive, parseArchive, mergeArchives,
} from './persist';
import { ARCHIVE_VERSION, compositeKey, type Annotation, type CompositeKey, type ReminderEntry } from './types';

function makeRow(over: Record<string, string> = {}) {
  return {
    DocDate: '12/04/2024', DocNo: 'FPNVC-2404-020', OPropertyName: 'Bảo hành',
    BranchCode: '', BranchName: '', BranchCodeReceipt: 'YL003877ZD',
    ItemCode: 'A1', ItemName: 'DA ĐỆM GHẾ TRƯỚC TRÁI', TypeCar: '',
    QuantityRemainClose: '1', EstimatedDescription: 'NCC chưa có',
    EstimatedDate1: '', RowId: '', RowId_S2: '', KhoNo: 'Kho MB', 'SR-ĐL2': 'PEU HN',
    ...over,
  };
}

function makeReminder(over: Partial<ReminderEntry> = {}): ReminderEntry {
  return {
    uuid: '01H8000000000000000000000A',
    created_at: '2026-05-10T08:00:00.000Z',
    doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
    channel: 'email', reminder_by: 'NV A', template_used: 'first-nudge',
    ncc_response_status: 'pending',
    ...over,
  };
}

describe('persist.serializeAnnotatedCsv', () => {
  it('appends 6 annotation columns to header', () => {
    const csv = serializeAnnotatedCsv([makeRow()], new Map());
    const headerLine = csv.split('\n')[0];
    for (const col of ANNOTATION_COLUMNS) expect(headerLine).toContain(col);
  });

  it('writes annotation values for known rows', () => {
    const ann: Annotation = {
      last_reminded_at: '2026-05-10T08:00:00Z', reminder_count: 2,
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
      updated_by: 'NV A', reminder_uuid_last: '01H8',
    };
    const map = new Map<CompositeKey, Annotation>([
      [compositeKey('FPNVC-2404-020', 'A1', ''), ann],
    ]);
    const csv = serializeAnnotatedCsv([makeRow()], map);
    expect(csv).toContain('committed');
    expect(csv).toContain('15/05/2026');
    expect(csv).toContain('NV A');
  });

  it('leaves annotation columns empty for unknown rows', () => {
    const csv = serializeAnnotatedCsv([makeRow()], new Map());
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('persist.parseAnnotatedCsv', () => {
  it('round-trips annotations correctly', () => {
    const ann: Annotation = {
      last_reminded_at: '2026-05-10T08:00:00.000Z', reminder_count: 2,
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
      updated_by: 'NV A', reminder_uuid_last: '01H8',
    };
    const map = new Map<CompositeKey, Annotation>([
      [compositeKey('FPNVC-2404-020', 'A1', ''), ann],
    ]);
    const csv = serializeAnnotatedCsv([makeRow()], map);

    const { rows, annotations } = parseAnnotatedCsv(csv);
    expect(rows).toHaveLength(1);
    const back = annotations.get(compositeKey('FPNVC-2404-020', 'A1', ''));
    expect(back?.reminder_count).toBe(2);
    expect(back?.ncc_response_status).toBe('committed');
  });

  it('treats CSV without annotation cols as empty annotations (backward-compat)', () => {
    const header = 'DocDate,DocNo,OPropertyName,BranchCode,BranchName,BranchCodeReceipt,ItemCode,ItemName,TypeCar,QuantityRemainClose,EstimatedDescription,EstimatedDate1,RowId,RowId_S2,KhoNo,SR-ĐL2';
    const dataLine = '12/04/2024,FPNVC-2404-020,Bảo hành,,,YL003877ZD,A1,DA ĐỆM,,1,NCC chưa,,,,Kho MB,PEU HN';
    const csv = header + '\n' + dataLine;
    const { rows, annotations } = parseAnnotatedCsv(csv);
    expect(rows).toHaveLength(1);
    expect(annotations.size).toBe(0);
  });

  it('strips UTF-8 BOM', () => {
    const csv = '﻿DocDate,DocNo,OPropertyName,ItemCode,ItemName,QuantityRemainClose,KhoNo,SR-ĐL2\n12/04/2024,X,Khẩn,A1,n,1,K,S';
    const { rows } = parseAnnotatedCsv(csv);
    expect(rows[0].DocDate).toBe('12/04/2024');
  });
});

describe('persist.serializeArchive', () => {
  it('produces valid JSON with version + reminders', () => {
    const json = serializeArchive([makeReminder()]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(ARCHIVE_VERSION);
    expect(parsed.reminders).toHaveLength(1);
    expect(typeof parsed.exported_at).toBe('string');
  });
});

describe('persist.parseArchive', () => {
  it('round-trips a single reminder', () => {
    const json = serializeArchive([makeReminder()]);
    const { reminders, warnings } = parseArchive(json);
    expect(reminders).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseArchive('{not json')).toThrow(/parse/i);
  });

  it('rejects unknown future version', () => {
    expect(() => parseArchive(JSON.stringify({ version: 999, exported_at: '', reminders: [] })))
      .toThrow(/version/i);
  });

  it('skips entries missing required fields, returns warnings', () => {
    const bad = {
      version: ARCHIVE_VERSION, exported_at: 'x', reminders: [
        makeReminder(),
        { uuid: 'incomplete' },
      ]
    };
    const { reminders, warnings } = parseArchive(JSON.stringify(bad));
    expect(reminders).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('drops duplicate UUID, keeps first', () => {
    const dup = makeReminder({ uuid: 'SAMEUUID', ncc_response: 'first' });
    const dup2 = makeReminder({ uuid: 'SAMEUUID', ncc_response: 'second' });
    const file = { version: ARCHIVE_VERSION, exported_at: 'x', reminders: [dup, dup2] };
    const { reminders, warnings } = parseArchive(JSON.stringify(file));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].ncc_response).toBe('first');
    expect(warnings.some(w => w.includes('duplicate'))).toBe(true);
  });
});

describe('persist.mergeArchives', () => {
  it('union of disjoint sets', () => {
    const a = [makeReminder({ uuid: 'A1' })];
    const b = [makeReminder({ uuid: 'B1' })];
    const { merged, report } = mergeArchives(a, b);
    expect(merged).toHaveLength(2);
    expect(report.added).toBe(1);
    expect(report.overwritten).toBe(0);
  });

  it('newer created_at wins on UUID conflict', () => {
    const old = makeReminder({ uuid: 'X', created_at: '2026-05-01T00:00:00.000Z', ncc_response: 'old' });
    const fresh = makeReminder({ uuid: 'X', created_at: '2026-05-10T00:00:00.000Z', ncc_response: 'fresh' });
    const { merged } = mergeArchives([old], [fresh]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ncc_response).toBe('fresh');
  });

  it('older incoming does not overwrite local', () => {
    const fresh = makeReminder({ uuid: 'X', created_at: '2026-05-10T00:00:00.000Z', ncc_response: 'fresh' });
    const old = makeReminder({ uuid: 'X', created_at: '2026-05-01T00:00:00.000Z', ncc_response: 'old' });
    const { merged } = mergeArchives([fresh], [old]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ncc_response).toBe('fresh');
  });

  it('keeps both with suffix when timestamps tie', () => {
    const sameMs = '2026-05-10T00:00:00.000Z';
    const a = makeReminder({ uuid: 'X', created_at: sameMs, ncc_response: 'a' });
    const b = makeReminder({ uuid: 'X', created_at: sameMs, ncc_response: 'b' });
    const { merged, report } = mergeArchives([a], [b]);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.ncc_response === 'a')?.uuid).toBe('X-A');
    expect(merged.find(r => r.ncc_response === 'b')?.uuid).toBe('X-B');
    expect(report.tieBroken).toBe(1);
  });
});
