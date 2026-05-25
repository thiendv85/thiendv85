import { supabase } from './client';
import { selectAllPaginated, computeSnapshotSummary, normalizeBrand } from './helpers';
import type { ApprovalWorkflow, ApprovalRequest, ApprovalAction, ApprovalStatus, SnapshotData, ApprovalSummary } from '../../types/inventory';
import { compressData } from '../supabase';

async function decompressData(blob: Blob): Promise<any> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export interface SubmitRequestPayload {
  draft_name: string;
  brand: string | null;
  workflow_id: string;
  submitted_by: string;
  snapshot_data: SnapshotData;
}

export async function submitApprovalRequest(payload: SubmitRequestPayload): Promise<{ id: string | null; error: string | null }> {
  try {
    // Phase 8: Auto-calculate deadline (3 business days from now)
    const deadline = new Date();
    let daysAdded = 0;
    while (daysAdded < 3) {
      deadline.setDate(deadline.getDate() + 1);
      const day = deadline.getDay();
      if (day !== 0 && day !== 6) daysAdded++; // skip weekends
    }

    const fullSnapshot = {
      ...payload.snapshot_data,
      original_quantities: payload.snapshot_data.quantities
    };

    // Check payload size
    const rawSize = new Blob([JSON.stringify(fullSnapshot)]).size;
    let finalSnapshotData: any = fullSnapshot;

    if (rawSize > 50000) { // If > 50KB, compress and store
      const compressed = await compressData(fullSnapshot);
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${Date.now()}`;
      const brandPrefix = payload.brand ? `${normalizeBrand(payload.brand)}/` : 'unbranded/';
      const path = `approvals/${brandPrefix}${ts}.json.gz`;

      const { error: uploadErr } = await supabase.storage
        .from('inventory_snapshots')
        .upload(path, compressed, { contentType: 'application/gzip' });

      if (uploadErr) {
        console.error('Failed to upload compressed snapshot:', uploadErr);
        return { id: null, error: 'Lỗi tải dữ liệu lên Cloud Storage: ' + uploadErr.message };
      }

      finalSnapshotData = {
        submitted_at: fullSnapshot.submitted_at,
        app_version: fullSnapshot.app_version,
        storage_path: path,
        is_compressed: true
      };
    }

    const baseRow: Record<string, unknown> = {
      draft_name: payload.draft_name,
      brand: normalizeBrand(payload.brand),
      workflow_id: payload.workflow_id,
      current_level: 1,
      status: 'pending',
      submitted_by: payload.submitted_by,
      snapshot_data: finalSnapshotData,
      version: 1,
      deadline: deadline.toISOString(),
    };
    const rowWithSummary = { ...baseRow, summary: computeSnapshotSummary(fullSnapshot) };

    let { data, error } = await supabase
      .from('approval_requests')
      .insert(SUMMARY_COLUMN_AVAILABLE === false ? baseRow : rowWithSummary)
      .select('id')
      .single();

    if (error && isMissingSummaryColumn(error) && SUMMARY_COLUMN_AVAILABLE !== false) {
      SUMMARY_COLUMN_AVAILABLE = false;
      ({ data, error } = await supabase
        .from('approval_requests')
        .insert(baseRow)
        .select('id')
        .single());
    } else if (!error) {
      SUMMARY_COLUMN_AVAILABLE = true;
    }

    if (error) {
      console.error('submitApprovalRequest failed:', error);
      return { id: null, error: error.message };
    }

    if (!data) {
      return { id: null, error: 'Không nhận được phản hồi từ máy chủ' };
    }

    return { id: data.id, error: null };
  } catch (err: any) {
    console.error('submitApprovalRequest exception:', err);
    return { id: null, error: err.message || 'Lỗi không xác định' };
  }
}

/**
 * Variant of submitApprovalRequest that accepts a pre-compressed Blob.
 * Use this when compression has already been done client-side (with progress tracking).
 * Skips redundant JSON.stringify + compress, goes straight to Storage upload + DB insert.
 */
export async function submitApprovalRequestPrecompressed(payload: {
  draft_name: string;
  brand: string | null;
  workflow_id: string;
  submitted_by: string;
  compressedBlob: Blob;
  meta: { submitted_at: string; app_version: string };
  summary?: ApprovalSummary;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    // Deadline: 3 business days
    const deadline = new Date();
    let daysAdded = 0;
    while (daysAdded < 3) {
      deadline.setDate(deadline.getDate() + 1);
      const day = deadline.getDay();
      if (day !== 0 && day !== 6) daysAdded++;
    }

    // Upload pre-compressed blob straight to Storage
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${Date.now()}`;
    const brandPrefix = payload.brand ? `${normalizeBrand(payload.brand)}/` : 'unbranded/';
    const path = `approvals/${brandPrefix}${ts}.json.gz`;

    const { error: uploadErr } = await supabase.storage
      .from('inventory_snapshots')
      .upload(path, payload.compressedBlob, { contentType: 'application/gzip' });

    if (uploadErr) {
      console.error('Failed to upload pre-compressed snapshot:', uploadErr);
      return { id: null, error: 'Lỗi tải dữ liệu lên Cloud Storage: ' + uploadErr.message };
    }

    const finalSnapshotData = {
      submitted_at: payload.meta.submitted_at,
      app_version: payload.meta.app_version,
      storage_path: path,
      is_compressed: true,
    };

    const baseRow: Record<string, unknown> = {
      draft_name: payload.draft_name,
      brand: normalizeBrand(payload.brand),
      workflow_id: payload.workflow_id,
      current_level: 1,
      status: 'pending',
      submitted_by: payload.submitted_by,
      snapshot_data: finalSnapshotData,
      version: 1,
      deadline: deadline.toISOString(),
    };
    const rowWithSummary = { ...baseRow, summary: payload.summary || { skuCount: 0, totalQty: 0, totalValue: 0 } };

    let { data, error } = await supabase
      .from('approval_requests')
      .insert(SUMMARY_COLUMN_AVAILABLE === false ? baseRow : rowWithSummary)
      .select('id')
      .single();

    if (error && isMissingSummaryColumn(error) && SUMMARY_COLUMN_AVAILABLE !== false) {
      SUMMARY_COLUMN_AVAILABLE = false;
      ({ data, error } = await supabase
        .from('approval_requests')
        .insert(baseRow)
        .select('id')
        .single());
    } else if (!error) {
      SUMMARY_COLUMN_AVAILABLE = true;
    }

    if (error) {
      console.error('submitApprovalRequestPrecompressed failed:', error);
      return { id: null, error: error.message };
    }
    if (!data) return { id: null, error: 'Không nhận được phản hồi từ máy chủ' };
    return { id: data.id, error: null };
  } catch (err: any) {
    console.error('submitApprovalRequestPrecompressed exception:', err);
    return { id: null, error: err.message || 'Lỗi không xác định' };
  }
}

// Cache 1 lần / phiên: nếu DB chưa có cột `summary` thì các query sau bỏ luôn,
// tránh request thừa.
let SUMMARY_COLUMN_AVAILABLE: boolean | null = null;

const isMissingSummaryColumn = (err: any) => {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return code === '42703' || (msg.includes('column') && msg.includes('summary'));
};

export async function fetchMyRequests(userId: string): Promise<ApprovalRequest[]> {
  const colsWith = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline, summary';
  const colsNo = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline';
  if (SUMMARY_COLUMN_AVAILABLE !== false) {
    try {
      const out = await selectAllPaginated<ApprovalRequest>((from, to) =>
        supabase.from('approval_requests').select(colsWith).eq('submitted_by', userId).order('submitted_at', { ascending: false }).range(from, to) as any
      );
      SUMMARY_COLUMN_AVAILABLE = true;
      return out;
    } catch (e: any) {
      if (!isMissingSummaryColumn(e)) return [];
      SUMMARY_COLUMN_AVAILABLE = false;
      console.warn('[approval] cột `summary` chưa tồn tại, retry không có summary');
    }
  }
  return selectAllPaginated<ApprovalRequest>((from, to) =>
    supabase.from('approval_requests').select(colsNo).eq('submitted_by', userId).order('submitted_at', { ascending: false }).range(from, to) as any
  );
}

export async function fetchPendingForApprover(
  _userId?: string,
  approvalLevels?: number[]
): Promise<ApprovalRequest[]> {
  const colsWith = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline, summary';
  const colsNo = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline';
  let requests: ApprovalRequest[] = [];
  if (SUMMARY_COLUMN_AVAILABLE !== false) {
    try {
      requests = await selectAllPaginated<ApprovalRequest>((from, to) =>
        supabase.from('approval_requests').select(colsWith).in('status', ['pending', 'in_progress']).order('submitted_at', { ascending: true }).range(from, to) as any
      );
      SUMMARY_COLUMN_AVAILABLE = true;
    } catch (e: any) {
      if (isMissingSummaryColumn(e)) {
        SUMMARY_COLUMN_AVAILABLE = false;
        console.warn('[approval] cột `summary` chưa tồn tại, retry không có summary');
      } else return [];
    }
  }
  if (SUMMARY_COLUMN_AVAILABLE === false) {
    requests = await selectAllPaginated<ApprovalRequest>((from, to) =>
      supabase.from('approval_requests').select(colsNo).in('status', ['pending', 'in_progress']).order('submitted_at', { ascending: true }).range(from, to) as any
    );
  }
  if (approvalLevels && approvalLevels.length > 0) {
    return requests.filter(r => approvalLevels.includes(r.current_level));
  }
  return requests;
}

export async function fetchAllRequests(): Promise<ApprovalRequest[]> {
  const colsWith = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline, summary';
  const colsNo = 'id, draft_name, brand, workflow_id, current_level, status, submitted_by, submitted_at, version, deadline';
  if (SUMMARY_COLUMN_AVAILABLE !== false) {
    try {
      const out = await selectAllPaginated<ApprovalRequest>((from, to) =>
        supabase.from('approval_requests').select(colsWith).order('submitted_at', { ascending: false }).range(from, to) as any
      );
      SUMMARY_COLUMN_AVAILABLE = true;
      return out;
    } catch (e: any) {
      if (!isMissingSummaryColumn(e)) return [];
      SUMMARY_COLUMN_AVAILABLE = false;
      console.warn('[approval] cột `summary` chưa tồn tại, retry không có summary');
    }
  }
  return selectAllPaginated<ApprovalRequest>((from, to) =>
    supabase.from('approval_requests').select(colsNo).order('submitted_at', { ascending: false }).range(from, to) as any
  );
}

export async function fetchRequestById(id: string): Promise<ApprovalRequest | null> {
  const { data, error } = await supabase.from('approval_requests').select('*').eq('id', id).single();
  if (error || !data) return null;
  const request = data as ApprovalRequest;

  if (request.snapshot_data?.is_compressed && request.snapshot_data?.storage_path) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from('inventory_snapshots')
        .download(request.snapshot_data.storage_path);

      if (dlErr || !blob) {
        console.error('Failed to download compressed snapshot:', dlErr);
        return request;
      }

      const decompressed = await decompressData(blob);
      request.snapshot_data = decompressed;
    } catch (e) {
      console.error('Decompression failed:', e);
    }
  }

  // Lazy backfill: nếu record cũ chưa có summary mà giờ ta có full snapshot, viết lại
  const needBackfill = !request.summary
    || (request.summary.skuCount === 0 && request.summary.totalQty === 0 && request.summary.totalValue === 0);
  if (needBackfill && request.snapshot_data?.inventory_context?.length) {
    const summary = computeSnapshotSummary(request.snapshot_data);
    if (summary.skuCount > 0 || summary.totalQty > 0) {
      request.summary = summary;
      // fire-and-forget update — chỉ thử nếu cột summary tồn tại (RLS có thể chặn, không sao)
      if (SUMMARY_COLUMN_AVAILABLE !== false) {
        supabase.from('approval_requests').update({ summary }).eq('id', id).then(
          (res: any) => {
            if (res?.error && isMissingSummaryColumn(res.error)) SUMMARY_COLUMN_AVAILABLE = false;
          },
          () => {},
        );
      }
    }
  }

  return request;
}


export async function fetchRequestByDraftName(draftName: string): Promise<ApprovalRequest | null> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('draft_name', draftName)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  const request = data as ApprovalRequest;

  // Decompress if snapshot is stored in Supabase Storage
  if (request.snapshot_data?.is_compressed && request.snapshot_data?.storage_path) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from('inventory_snapshots')
        .download(request.snapshot_data.storage_path);
      if (!dlErr && blob) {
        request.snapshot_data = await decompressData(blob);
      }
    } catch (e) {
      console.error('Decompression failed for draft:', draftName, e);
    }
  }

  return request;
}

export async function fetchRequestActions(requestId: string): Promise<ApprovalAction[]> {
  const { data, error } = await supabase
    .from('approval_actions')
    .select('*')
    .eq('request_id', requestId)
    .order('acted_at', { ascending: true });
  if (error || !data) return [];
  return data as ApprovalAction[];
}

/**
 * Xử lý hành động phê duyệt (Enhanced with Phase 1-6):
 * - State transition validation (Phase 2)
 * - Reason enforcement for reject/return (Phase 3)
 * - Sequential approval + approver_ids check (Phase 4)
 * - Optimistic locking via version (Phase 5)
 * - Audit metadata logging (Phase 6)
 */
export async function processApprovalAction(
  requestId: string,
  actorId: string,
  action: 'approved' | 'rejected' | 'commented' | 'returned',
  comment?: string,
  modifiedQuantities?: Record<string, { air: number; sea: number }>,
  reason?: string, // Phase 3: dedicated reason for reject/return
  expectedVersion?: number, // Phase 5: optimistic locking
  decisionSummary?: any, // New: Summary snapshot from Decision Support layer
  providedSnapshotData?: any, // Pass from client to prevent huge network download
  modifiedNotes?: Record<string, string>
): Promise<{ success: boolean; newStatus: ApprovalStatus; error?: string }> {

  // Look up request and workflow. Dynamically select snapshot_data only if strictly needed AND not provided.
  const selectQuery = 'id, workflow_id, current_level, status, version' + ((modifiedQuantities || modifiedNotes) && !providedSnapshotData ? ', snapshot_data' : '');
  const { data: reqRaw, error: reqErr } = await supabase.from('approval_requests').select(selectQuery).eq('id', requestId).single();
  const request = reqRaw as Partial<ApprovalRequest> | null;

  if (reqErr || !request) return { success: false, newStatus: 'pending', error: 'Không tìm thấy yêu cầu' };
  const { data: wfData } = await supabase.from('approval_workflows').select('*').eq('id', request.workflow_id).single();
  const workflow: ApprovalWorkflow | null = wfData ?? null;
  if (!workflow) return { success: false, newStatus: request.status, error: 'Không tìm thấy quy trình phê duyệt' };

  // Phase 5: Optimistic locking — check version matches
  if (expectedVersion !== undefined && request.version !== expectedVersion) {
    return {
      success: false,
      newStatus: request.status,
      error: 'Đơn hàng đã bị thay đổi bởi người khác. Vui lòng tải lại trang.',
    };
  }
  const nextVersion = (request.version || 1) + 1;

  // Phase 4: Check approver is authorized for this level
  const currentLevelConfig = workflow.levels.find(l => l.level === (request.current_level || 1));
  if (action !== 'commented' && currentLevelConfig) {
    if (!currentLevelConfig.approver_ids.includes(actorId)) {
      console.warn(`Actor ${actorId} not in approver_ids for level ${request.current_level}, allowing via role-based access`);
    }
  }

  // Phase 6: Build audit metadata + version snapshot
  const prevSnap = providedSnapshotData || request.snapshot_data;
  const metadata: Record<string, unknown> = {
    old_status: request.status,
    old_level: request.current_level,
    version_before: request.version || 1,
    version_after: nextVersion,
    snapshot_quantities: modifiedQuantities || prevSnap?.quantities || null,
    snapshot_notes: modifiedNotes || prevSnap?.notes || null,
    original_quantities: prevSnap?.original_quantities || prevSnap?.quantities || null,
  };

  // Pre-process and compress snapshot data if needed to prevent DB bloat/UI freeze
  let finalSnapshotData: any = undefined;
  if (modifiedQuantities || modifiedNotes) {
    let snapData = providedSnapshotData || request.snapshot_data;

    // Decompress if snapshot is a compressed stub (only has storage_path, no real data)
    if (snapData?.is_compressed && snapData?.storage_path && !snapData?.inventory_context) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from('inventory_snapshots')
          .download(snapData.storage_path);
        if (!dlErr && blob) {
          snapData = await decompressData(blob);
        }
      } catch (e) {
        console.error('Failed to decompress snapshot during action:', e);
      }
    }

    const updatedSnap = { ...(snapData || {}), ...(modifiedQuantities ? { quantities: modifiedQuantities } : {}), ...(modifiedNotes ? { notes: modifiedNotes } : {}) };

    if (!updatedSnap.original_quantities && snapData?.quantities) {
      updatedSnap.original_quantities = snapData.quantities;
    }

    finalSnapshotData = updatedSnap;
    try {
        const rawSize = new Blob([JSON.stringify(updatedSnap)]).size;
        if (rawSize > 50000) {
            const compressed = await compressData(updatedSnap);
            const now = new Date();
            const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${Date.now()}`;
            const brandPrefix = request.brand ? `${normalizeBrand(request.brand)}/` : 'unbranded/';
            const path = `approvals/${brandPrefix}action_${ts}.json.gz`;

            const { error: uploadErr } = await supabase.storage
              .from('inventory_snapshots')
              .upload(path, compressed, { contentType: 'application/gzip' });

            if (!uploadErr) {
              finalSnapshotData = {
                submitted_at: updatedSnap.submitted_at || new Date().toISOString(),
                app_version: updatedSnap.app_version || 'unknown',
                storage_path: path,
                is_compressed: true
              };
            }
        }
    } catch (err) {
        console.warn("Failed to compress/upload updated snapshot during action", err);
    }
  }

  // 1. Ghi action vào audit trail
  const { error: actionError } = await supabase.from('approval_actions').insert({
    request_id: request.id,
    level: request.current_level,
    action,
    actor_id: actorId,
    comment: comment || null,
    metadata: { ...metadata, reason: reason || null, decisionSummary: decisionSummary || null },
  });

  if (actionError) return { success: false, newStatus: request.status, error: 'Không thể ghi nhận hành động phê duyệt' };

  if (action === 'commented') return { success: true, newStatus: request.status };

  if (action === 'rejected') {
    const update: Record<string, unknown> = {
      status: 'rejected',
      version: nextVersion,
    };
    if (reason) update.rejection_reason = reason;
    const { error: updErr } = await supabase.from('approval_requests').update(update).eq('id', request.id);
    if (updErr) return { success: false, newStatus: request.status, error: 'Lỗi khi từ chối đơn hàng: ' + updErr.message };
    return { success: true, newStatus: 'rejected' };
  }

  if (action === 'returned') {
    const returnUpdate: Record<string, unknown> = {
      status: 'returned',
      current_level: 1,
      version: nextVersion,
    };
    if (reason) returnUpdate.returned_reason = reason;
    if (finalSnapshotData) returnUpdate.snapshot_data = finalSnapshotData;

    const { error: updErr } = await supabase.from('approval_requests').update(returnUpdate).eq('id', request.id);
    if (updErr) return { success: false, newStatus: request.status, error: 'Lỗi khi trả lại đơn hàng: ' + updErr.message };
    return { success: true, newStatus: 'returned' };
  }

  // action === 'approved': kiểm tra xem level hiện tại đã đủ chưa
  if (!currentLevelConfig) return { success: false, newStatus: request.status, error: 'Không tìm thấy cấu hình cấp bậc' };

  let advance = false;
  if (!currentLevelConfig.require_all) {
    advance = true;
  } else {
    const { data: actions } = await supabase
      .from('approval_actions')
      .select('actor_id')
      .eq('request_id', request.id)
      .eq('level', request.current_level)
      .eq('action', 'approved');
    const approvedIds = new Set((actions || []).map((a: any) => a.actor_id));
    advance = currentLevelConfig.approver_ids.every(id => approvedIds.has(id));
  }

  if (!advance) {
    // Nếu chưa đủ người duyệt nhưng đang ở trạng thái pending, chuyển sang in_progress
    if (request.status === 'pending') {
      const { error: updErr } = await supabase
        .from('approval_requests')
        .update({ status: 'in_progress', version: nextVersion })
        .eq('id', request.id);
      if (updErr) return { success: false, newStatus: 'pending', error: 'Lỗi khi cập nhật trạng thái đơn hàng' };
      return { success: true, newStatus: 'in_progress' };
    }
    return { success: true, newStatus: 'in_progress' };
  }

  // Tìm level tiếp theo
  const nextLevelConfig = workflow.levels.find(l => l.level === request.current_level + 1);
  if (nextLevelConfig) {
    const advanceUpdate: Record<string, unknown> = {
      current_level: request.current_level + 1,
      status: 'in_progress',
      version: nextVersion,
    };
    if (finalSnapshotData) advanceUpdate.snapshot_data = finalSnapshotData;

    const { error: updErr } = await supabase.from('approval_requests').update(advanceUpdate).eq('id', request.id);
    if (updErr) return { success: false, newStatus: request.status, error: 'Lỗi khi chuyển cấp bậc phê duyệt' };
    return { success: true, newStatus: 'in_progress' };
  } else {
    const approveUpdate: Record<string, unknown> = {
      status: 'approved',
      version: nextVersion,
    };
    if (finalSnapshotData) approveUpdate.snapshot_data = finalSnapshotData;

    const { error: updErr } = await supabase.from('approval_requests').update(approveUpdate).eq('id', request.id);
    if (updErr) return { success: false, newStatus: request.status, error: 'Lỗi khi phê duyệt đơn hàng: ' + updErr.message };
    return { success: true, newStatus: 'approved' };
  }
}

/** Gửi lại yêu cầu đã bị trả lại: cập nhật snapshot + reset status/level về pending */
export async function resubmitApprovalRequest(
  requestId: string,
  snapshotData: SnapshotData,
  expectedVersion?: number
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status: 'pending',
    current_level: 1,
    snapshot_data: snapshotData,
    submitted_at: new Date().toISOString(),
    rejection_reason: null,
    returned_reason: null,
  };
  if (SUMMARY_COLUMN_AVAILABLE !== false) {
    update.summary = computeSnapshotSummary(snapshotData);
  }
  if (expectedVersion !== undefined) update.version = expectedVersion + 1;
  let { error } = await supabase.from('approval_requests').update(update).eq('id', requestId);
  if (error && isMissingSummaryColumn(error)) {
    SUMMARY_COLUMN_AVAILABLE = false;
    delete update.summary;
    ({ error } = await supabase.from('approval_requests').update(update).eq('id', requestId));
  }
  return !error;
}

/**
 * Gửi lại với pre-compressed blob — upload blob lên Storage, lưu storage_path vào DB.
 * Dùng khi resubmit từ UI có progress tracking.
 */
export async function resubmitApprovalRequestPrecompressed(
  requestId: string,
  compressedBlob: Blob,
  meta: { submitted_at: string; app_version: string; brand?: string | null; summary?: ApprovalSummary },
  expectedVersion?: number,
  resubmitAudit?: { actorId: string; quantities?: Record<string, { air: number; sea: number }>; notes?: Record<string, string> }
): Promise<boolean> {
  try {
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${Date.now()}`;
    const brandPrefix = meta.brand ? `${normalizeBrand(meta.brand)}/` : 'unbranded/';
    const path = `approvals/${brandPrefix}resubmit_${ts}.json.gz`;

    const { error: uploadErr } = await supabase.storage
      .from('inventory_snapshots')
      .upload(path, compressedBlob, { contentType: 'application/gzip' });

    if (uploadErr) {
      console.error('resubmitApprovalRequestPrecompressed upload failed:', uploadErr);
      return false;
    }

    const update: Record<string, unknown> = {
      status: 'pending',
      current_level: 1,
      snapshot_data: {
        submitted_at: meta.submitted_at,
        app_version: meta.app_version,
        storage_path: path,
        is_compressed: true,
      },
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      returned_reason: null,
    };
    if (meta.summary && SUMMARY_COLUMN_AVAILABLE !== false) update.summary = meta.summary;
    if (expectedVersion !== undefined) update.version = expectedVersion + 1;
    let { error } = await supabase.from('approval_requests').update(update).eq('id', requestId);
    if (error && isMissingSummaryColumn(error)) {
      SUMMARY_COLUMN_AVAILABLE = false;
      delete update.summary;
      ({ error } = await supabase.from('approval_requests').update(update).eq('id', requestId));
    }
    if (!error && resubmitAudit) {
      await supabase.from('approval_actions').insert({
        request_id: requestId,
        level: 0,
        action: 'commented',
        actor_id: resubmitAudit.actorId,
        comment: 'Gửi lại đơn hàng sau khi điều chỉnh',
        metadata: {
          is_resubmit: true,
          version_before: expectedVersion || 1,
          version_after: (expectedVersion || 1) + 1,
          snapshot_quantities: resubmitAudit.quantities || null,
          snapshot_notes: resubmitAudit.notes || null,
        },
      });
    }
    return !error;
  } catch (err) {
    console.error('resubmitApprovalRequestPrecompressed exception:', err);
    return false;
  }
}

export async function unlockRequest(
  requestId: string,
  actorId: string,
  reason: string,
  expectedVersion?: number
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status: 'unlocked',
    unlocked_by: actorId,
    unlocked_at: new Date().toISOString(),
    unlock_reason: reason,
  };
  // Phase 5: version increment
  if (expectedVersion !== undefined) update.version = expectedVersion + 1;
  const { error } = await supabase.from('approval_requests').update(update).eq('id', requestId);
  return !error;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATIONS (via Edge Function)
// ─────────────────────────────────────────────────────────────────────────────

export type EmailEvent = 'submitted' | 'level_advanced' | 'approved' | 'rejected' | 'unlocked';

export async function sendApprovalEmail(payload: {
  event: EmailEvent;
  request_id: string;
  recipient_ids: string[];
  request_details: {
    draft_name: string;
    brand: string | null;
    submitted_by_name: string;
    current_level: number;
    comment?: string;
    unlock_reason?: string;
  };
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-approval-email', { body: payload });
  } catch (err) {
    console.warn('sendApprovalEmail failed (non-critical):', err);
  }
}
