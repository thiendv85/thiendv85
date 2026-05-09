export const ARCHIVE_VERSION = 1 as const;

export type ReminderStatus = 'pending' | 'acknowledged' | 'committed' | 'silent' | 'closed';
export type ReminderChannel = 'email' | 'zalo' | 'phone';
export type TemplateLevel = 'first-nudge' | 'overdue' | 'escalation';
export type OrderCategory = 'Khẩn VOR' | 'Bảo hành' | 'Khẩn' | 'Dự trữ' | 'Khác';

export interface ReminderEntry {
  uuid: string;
  created_at: string;
  doc_no: string;
  item_code: string;
  row_id?: string;
  item_name: string;
  supplier: string;
  channel: ReminderChannel;
  reminder_by: string;
  template_used: TemplateLevel;
  ncc_response?: string;
  eta_promised_new?: string;
  ncc_response_status: ReminderStatus;
  supersedes?: string;
}

export interface Annotation {
  last_reminded_at?: string;
  reminder_count: number;
  ncc_response_status: ReminderStatus;
  eta_promised_new?: string;
  updated_by?: string;
  reminder_uuid_last?: string;
}

export interface ArchiveFile {
  version: typeof ARCHIVE_VERSION;
  exported_at: string;
  reminders: ReminderEntry[];
}

export type CompositeKey = string;

export function compositeKey(docNo: string, itemCode: string, rowId?: string): CompositeKey {
  return `${docNo}|${itemCode}|${rowId ?? ''}`;
}
