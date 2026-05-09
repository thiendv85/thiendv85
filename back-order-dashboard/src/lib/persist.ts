import Papa from 'papaparse';
import type { RawBOData } from './transform';
import { ARCHIVE_VERSION, type Annotation, type ArchiveFile, type CompositeKey, type ReminderEntry, type ReminderStatus } from './types';
import { compositeKey } from './types';

export const ANNOTATION_COLUMNS = [
  'last_reminded_at',
  'reminder_count',
  'ncc_response_status',
  'eta_promised_new',
  'updated_by',
  'reminder_uuid_last',
] as const;

type AnnotationCol = typeof ANNOTATION_COLUMNS[number];

function annToRecord(a: Annotation | undefined): Record<AnnotationCol, string> {
  return {
    last_reminded_at: a?.last_reminded_at ?? '',
    reminder_count: a ? String(a.reminder_count) : '',
    ncc_response_status: a?.ncc_response_status ?? '',
    eta_promised_new: a?.eta_promised_new ?? '',
    updated_by: a?.updated_by ?? '',
    reminder_uuid_last: a?.reminder_uuid_last ?? '',
  };
}

export function serializeAnnotatedCsv(
  rows: RawBOData[],
  annotations: Map<CompositeKey, Annotation>
): string {
  const enriched = rows.map(r => {
    const key = compositeKey(r.DocNo, r.ItemCode, r.RowId);
    return { ...r, ...annToRecord(annotations.get(key)) };
  });
  return Papa.unparse(enriched, { header: true });
}

const VALID_STATUS = new Set<ReminderStatus>(['pending', 'acknowledged', 'committed', 'silent', 'closed']);

export interface ParseResult {
  rows: RawBOData[];
  annotations: Map<CompositeKey, Annotation>;
  warnings: string[];
}

export function parseAnnotatedCsv(csv: string): ParseResult {
  const stripped = csv.replace(/^﻿/, '');
  const result = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: true,
  });

  const warnings: string[] = [];
  const annotations = new Map<CompositeKey, Annotation>();
  const rows: RawBOData[] = [];

  for (const raw of result.data) {
    const cleaned: Record<string, string> = {};
    for (const k in raw) cleaned[k.replace(/^﻿/, '')] = raw[k];

    const status = cleaned.ncc_response_status as ReminderStatus | undefined;
    const count = cleaned.reminder_count ? Number(cleaned.reminder_count) : 0;
    if (cleaned.reminder_count && Number.isNaN(count)) {
      warnings.push(`Invalid reminder_count "${cleaned.reminder_count}" for ${cleaned.DocNo}`);
    }
    const hasAnnotation = ANNOTATION_COLUMNS.some(c => cleaned[c]);
    if (hasAnnotation) {
      annotations.set(compositeKey(cleaned.DocNo, cleaned.ItemCode, cleaned.RowId), {
        last_reminded_at: cleaned.last_reminded_at || undefined,
        reminder_count: Number.isFinite(count) ? count : 0,
        ncc_response_status: status && VALID_STATUS.has(status) ? status : 'pending',
        eta_promised_new: cleaned.eta_promised_new || undefined,
        updated_by: cleaned.updated_by || undefined,
        reminder_uuid_last: cleaned.reminder_uuid_last || undefined,
      });
    }

    const { last_reminded_at, reminder_count, ncc_response_status, eta_promised_new,
      updated_by, reminder_uuid_last, ...orig } = cleaned;
    rows.push(orig as unknown as RawBOData);
  }

  return { rows, annotations, warnings };
}

const REQUIRED_REMINDER_KEYS: (keyof ReminderEntry)[] = [
  'uuid', 'created_at', 'doc_no', 'item_code', 'item_name', 'supplier',
  'channel', 'reminder_by', 'template_used', 'ncc_response_status',
];

export function serializeArchive(reminders: ReminderEntry[]): string {
  const file: ArchiveFile = {
    version: ARCHIVE_VERSION,
    exported_at: new Date().toISOString(),
    reminders,
  };
  return JSON.stringify(file, null, 2);
}

export interface ParseArchiveResult {
  reminders: ReminderEntry[];
  warnings: string[];
}

export function parseArchive(json: string): ParseArchiveResult {
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch (e) {
    throw new Error(`Cannot parse archive JSON: ${(e as Error).message}`);
  }

  if (typeof file !== 'object' || file === null) {
    throw new Error('Archive root must be object');
  }
  const f = file as Record<string, unknown>;
  const version = f.version as number;
  if (version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version ${version} (expected ${ARCHIVE_VERSION})`);
  }
  if (!Array.isArray(f.reminders)) {
    throw new Error('Archive.reminders must be array');
  }

  const seen = new Set<string>();
  const warnings: string[] = [];
  const reminders: ReminderEntry[] = [];

  for (const [i, r] of (f.reminders as unknown[]).entries()) {
    if (typeof r !== 'object' || r === null) {
      warnings.push(`Reminder #${i} is not object — skipped`);
      continue;
    }
    const e = r as Record<string, unknown>;
    const missing = REQUIRED_REMINDER_KEYS.filter(k => !e[k]);
    if (missing.length > 0) {
      warnings.push(`Reminder #${i} missing fields: ${missing.join(', ')} — skipped`);
      continue;
    }
    const uuid = String(e.uuid);
    if (seen.has(uuid)) {
      warnings.push(`Reminder duplicate uuid ${uuid} — kept first`);
      continue;
    }
    seen.add(uuid);
    reminders.push(e as unknown as ReminderEntry);
  }

  return { reminders, warnings };
}

export interface MergeReport {
  added: number;
  overwritten: number;
  tieBroken: number;
  kept: number;
}

export function mergeArchives(
  local: ReminderEntry[],
  incoming: ReminderEntry[]
): { merged: ReminderEntry[]; report: MergeReport } {
  const byUuid = new Map<string, ReminderEntry>();
  for (const r of local) byUuid.set(r.uuid, r);

  const report: MergeReport = { added: 0, overwritten: 0, tieBroken: 0, kept: local.length };

  for (const r of incoming) {
    const existing = byUuid.get(r.uuid);
    if (!existing) {
      byUuid.set(r.uuid, r);
      report.added += 1;
      continue;
    }
    const ta = new Date(existing.created_at).getTime();
    const tb = new Date(r.created_at).getTime();
    if (tb > ta) {
      byUuid.set(r.uuid, r);
      report.overwritten += 1;
    } else if (tb < ta) {
      // keep existing
    } else {
      byUuid.delete(r.uuid);
      byUuid.set(`${r.uuid}-A`, { ...existing, uuid: `${r.uuid}-A` });
      byUuid.set(`${r.uuid}-B`, { ...r, uuid: `${r.uuid}-B` });
      report.tieBroken += 1;
    }
  }

  return { merged: Array.from(byUuid.values()), report };
}
