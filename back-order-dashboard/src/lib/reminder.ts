import { ulid } from 'ulid';
import type { ReminderEntry, Annotation } from './types';

type NewReminderInput = Omit<ReminderEntry, 'uuid' | 'created_at'>;

export function createReminder(input: NewReminderInput): ReminderEntry {
  return {
    ...input,
    uuid: ulid(),
    created_at: new Date().toISOString(),
  };
}

export function supersedeReminder(
  original: ReminderEntry,
  patch: Partial<Omit<ReminderEntry, 'uuid' | 'created_at' | 'supersedes'>>
): ReminderEntry {
  return {
    ...original,
    ...patch,
    uuid: ulid(),
    created_at: new Date().toISOString(),
    supersedes: original.uuid,
  };
}

export function applyToAnnotation(existing: Annotation | undefined, r: ReminderEntry): Annotation {
  const base: Annotation = existing ?? { reminder_count: 0, ncc_response_status: 'pending' };
  return {
    last_reminded_at: r.created_at,
    reminder_count: base.reminder_count + 1,
    ncc_response_status: r.ncc_response_status,
    eta_promised_new: r.eta_promised_new ?? base.eta_promised_new,
    updated_by: r.reminder_by,
    reminder_uuid_last: r.uuid,
  };
}
