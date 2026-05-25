import { supabase } from './client';
import { selectAllPaginated } from './helpers';
import type { ApprovalWorkflow, ApprovalAction, ApprovalStatus } from '../../types/inventory';

export async function listWorkflows(): Promise<ApprovalWorkflow[]> {
  const { data, error } = await supabase.from('approval_workflows').select('*').eq('is_active', true).order('created_at');
  if (error || !data) return [];
  return data as ApprovalWorkflow[];
}

export async function fetchWorkflowById(id: string): Promise<ApprovalWorkflow | null> {
  const { data, error } = await supabase.from('approval_workflows').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data as ApprovalWorkflow;
}

/**
 * Tìm tất cả level mà userId xuất hiện trong workflow.levels[].approver_ids.
 * Dùng để derive permission runtime — fix data drift giữa workflow vs profile.approval_levels.
 */
export async function fetchWorkflowMembership(userId: string): Promise<{ inAnyWorkflow: boolean; levels: number[] }> {
  if (!userId) return { inAnyWorkflow: false, levels: [] };
  const { data, error } = await supabase.from('approval_workflows').select('levels').eq('is_active', true);
  if (error || !data) return { inAnyWorkflow: false, levels: [] };
  const levelSet = new Set<number>();
  for (const wf of data as Array<{ levels: Array<{ level: number; approver_ids: string[] }> | null }>) {
    if (!Array.isArray(wf.levels)) continue;
    for (const lvl of wf.levels) {
      if (Array.isArray(lvl.approver_ids) && lvl.approver_ids.includes(userId)) {
        levelSet.add(lvl.level);
      }
    }
  }
  const levels = Array.from(levelSet).sort((a, b) => a - b);
  return { inAnyWorkflow: levels.length > 0, levels };
}

export async function fetchWorkflowsByIds(ids: string[]): Promise<ApprovalWorkflow[]> {
  if (!ids.length) return [];
  const uniq = Array.from(new Set(ids));
  const { data, error } = await supabase.from('approval_workflows').select('*').in('id', uniq);
  if (error || !data) return [];
  return data as ApprovalWorkflow[];
}

export async function fetchActionsByRequestIds(requestIds: string[]): Promise<ApprovalAction[]> {
  if (!requestIds.length) return [];
  const uniq = Array.from(new Set(requestIds));
  return selectAllPaginated<ApprovalAction>((from, to) =>
    supabase.from('approval_actions').select('*').in('request_id', uniq).order('acted_at', { ascending: true }).range(from, to)
  );
}

export async function updateRequestStatus(id: string, status: ApprovalStatus): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
  // Atomic optimistic lock: read current version, then update WHERE version matches.
  // Without the version predicate, two concurrent callers race and one silently wins;
  // the version column from migration 005 was being incremented but never used as a guard.
  const { data, error: fetchError } = await supabase
    .from('approval_requests')
    .select('version')
    .eq('id', id)
    .single();
  if (fetchError) return { success: false, error: fetchError.message };

  const currentVersion = (data as { version: number | null }).version ?? 0;
  const nextVersion = currentVersion + 1;

  const { count, error } = await supabase
    .from('approval_requests')
    .update({ status, version: nextVersion }, { count: 'exact' })
    .eq('id', id)
    .eq('version', currentVersion);

  if (error) return { success: false, error: error.message };
  if (!count) {
    return {
      success: false,
      conflict: true,
      error: 'Request was modified by another user. Reload and try again.',
    };
  }
  return { success: true };
}

export async function deleteApprovalRequests(ids: string[]): Promise<{ success: boolean; error?: string }> {
  // First delete actions due to foreign key constraints
  await supabase.from('approval_actions').delete().in('request_id', ids);
  const { error } = await supabase.from('approval_requests').delete().in('id', ids);
  return { success: !error, error: error?.message };
}

export async function createWorkflow(workflow: Omit<ApprovalWorkflow, 'id' | 'created_at'>): Promise<string | null> {
  const { data, error } = await supabase.from('approval_workflows').insert(workflow).select('id').single();
  if (error || !data) return null;
  return data.id;
}

export async function updateWorkflow(id: string, updates: Partial<ApprovalWorkflow>): Promise<boolean> {
  const { error } = await supabase.from('approval_workflows').update(updates).eq('id', id);
  return !error;
}
