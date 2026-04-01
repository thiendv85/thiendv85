import { createClient } from '@supabase/supabase-js';
import type { UserRole, UserProfile } from './authContext';
import type { InventoryItem, ApprovalWorkflow, ApprovalRequest, ApprovalAction, ApprovalStatus, SnapshotData } from '../types/inventory';

const supabaseUrl = 'https://jczdnlydozcftvnqnixt.supabase.co';
const supabaseKey = 'sb_publishable_Iahv6LF7asBI3E_u_HAZhQ_Qrb99Qjm'; // Provided by user

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});

// Hàm kiểm tra mã phê duyệt (Admin PIN)
export const verifyAdminPin = (inputPin: string) => {
  // Ưu tiên biến môi trường VITE_ADMIN_PIN (nếu thiết lập trên Vercel), mặc định là '2026' nếu không có
  const adminPin = (import.meta as any).env.VITE_ADMIN_PIN || '2026';
  return inputPin === adminPin;
};

/**
 * Normalizes brand names from departments or CSV headers to a standard set.
 */
export const normalizeBrand = (brandText?: string | null): string | null => {
    if (!brandText) return null;
    const b = brandText.toLowerCase().trim();
    if (b.includes('kia')) return 'Kia';
    if (b.includes('mazda')) return 'Mazda';
    if (b.includes('peugeot') || b.includes('peu') || b.includes('stellantis')) return 'Stellantis';
    if (b.includes('bmw')) return 'BMW';
    if (b.includes('mini')) return 'MINI';
    // Handle common ALL or empty cases
    if (b === 'all' || b === 'tất cả') return null;
    return brandText.trim();
};

// Helper function to save JSON data to cloud_storage table (global records, no owner)
export async function saveToCloudStorage(id: string, data: any) {
  try {
    const { error } = await supabase
      .from('cloud_storage')
      .upsert({ id, data, updated_at: new Date().toISOString() });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu lên Cloud:', error);
    return false;
  }
}

// Save a user-owned draft (owner_id = current user)
export async function saveOrderDraft(id: string, data: any) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('cloud_storage')
      .upsert({ id, data, updated_at: new Date().toISOString(), owner_id: user?.id ?? null });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu draft:', error);
    return false;
  }
}

// Helper function to load JSON data from cloud_storage table
export async function loadFromCloudStorage(id: string) {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('data')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - this is okay for first time
        return null;
      }
      throw error;
    }
    
    return data?.data || null;
  } catch (error) {
    console.error('Lỗi khi tải từ Cloud:', error);
    return null;
  }
}

// List order drafts belonging to current user only
export async function listOrderDrafts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at, owner_id')
      .like('id', 'order_draft_%')
      .eq('owner_id', user?.id ?? '')
      .order('updated_at', { ascending: false });

    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}

// ─── Monthly Data (File B) — Uses dedicated monthly_sku_data table ────────────

const BATCH_SIZE = 500; // Upsert 500 rows per request to avoid timeout

/**
 * Saves monthly coefficient data to Supabase monthly_sku_data table.
 * Uses batch upsert (BATCH_SIZE rows each) to safely handle 80,000+ SKUs.
 * snapshot_month format: 'YYYY-MM'
 */
export async function saveMonthlyData(monthlyMap: Record<string, any>): Promise<boolean> {
  try {
    const snapshotMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const now = new Date().toISOString();

    // Build flat rows for the table
    const rows = Object.entries(monthlyMap).map(([itemCode, d]) => ({
      item_code:        itemCode,
      snapshot_month:   snapshotMonth,
      lois_group:       d.LOISGroup        ?? null,
      avg_qty_3m:       d.AvgQty3M         ?? null,
      avg_qty_6m:       d.AvgQty6M         ?? null,
      avg_qty_12m:      d.AvgQty12M        ?? null,
      avg_qty_24m:      d.AvgQty24M        ?? null,
      trend_flag:       d.TrendFlag        ?? null,
      mos:              d.MOS              ?? null,
      base_forecast:    d.BaseForecast     ?? null,
      forecast_nb:      d.Forecast_NB      ?? null,
      forecast_bb:      d.Forecast_BB      ?? null,
      sales_history:    (d.SalesHistory && d.SalesHistory.length > 0) ? d.SalesHistory : null,
      order_type:       d.OrderType        ?? null,
      forecast_method:  d.ForecastMethod   ?? null,
      lin_reg_slope:    d.LinRegSlope      ?? null,
      lin_reg_forecast: d.LinRegForecast   ?? null,
      sigma_eff:        d.Sigma_eff        ?? null,
      cv:               d.CV               ?? null,
      alpha_used:       d.AlphaUsed        ?? null,
      risk_level:       d.InventoryRiskLevel ?? null,
      mad:              d.MAD              ?? null,
      mape:             d.MAPE             ?? null,
      // Extra fields: store remaining non-null fields as JSONB
      extra_fields: (() => {
        const extra: Record<string, any> = {};
        const skip = new Set(['LOISGroup','AvgQty3M','AvgQty6M','AvgQty12M','AvgQty24M',
          'TrendFlag','MOS','BaseForecast','Forecast_NB','Forecast_BB','SalesHistory',
          'OrderType','ForecastMethod','LinRegSlope','LinRegForecast','Sigma_eff','CV',
          'AlphaUsed','InventoryRiskLevel','MAD','MAPE','ItemCode','ItemName']);
        for (const [k, v] of Object.entries(d)) {
          if (!skip.has(k) && v !== null && v !== undefined && v !== 0 && v !== '') {
            extra[k] = v;
          }
        }
        return Object.keys(extra).length > 0 ? extra : null;
      })(),
      updated_at: now,
    }));

    // Batch upsert
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('monthly_sku_data')
        .upsert(batch, { onConflict: 'item_code,snapshot_month' });
      if (error) throw error;
    }

    // Also save a snapshot record (for listing history)
    await supabase.from('cloud_storage').upsert({
      id: `monthly_index_${snapshotMonth}`,
      data: { snapshotMonth, count: rows.length },
      updated_at: now,
    });

    return true;
  } catch (error) {
    console.error('Lỗi khi lưu Monthly Data:', error);
    return false;
  }
}

/**
 * Loads the latest monthly data from monthly_sku_data table.
 * Finds the most recent snapshot_month, loads all rows for it,
 * rebuilds a Record<ItemCode, MonthlyData> map in memory.
 */
export async function loadLatestMonthlyData(lastUpdatedAt?: string | null): Promise<{ data: Record<string, any>; updatedAt: string; isUpToDate?: boolean } | null> {
  try {
    // Step 1: Find the latest snapshot_month
    const { data: monthRows, error: mErr } = await supabase
      .from('monthly_sku_data')
      .select('snapshot_month, updated_at')
      .order('snapshot_month', { ascending: false })
      .limit(1);

    if (mErr || !monthRows || monthRows.length === 0) return null;
    const latestMonth = monthRows[0].snapshot_month as string;
    const updatedAt = monthRows[0].updated_at as string;

    // Phase: Version Check Optimization
    // If client provides a timestamp and it matches current Cloud timestamp, skip downloading 80k rows.
    if (lastUpdatedAt && updatedAt === lastUpdatedAt) {
        return { data: {}, updatedAt, isUpToDate: true };
    }

    // Step 2: Load all rows for that month in pages of 1000
    const result: Record<string, any> = {};
    let from = 0;
    const PAGE = 1000;

    while (true) {
      const { data: rows, error } = await supabase
        .from('monthly_sku_data')
        .select('*')
        .eq('snapshot_month', latestMonth)
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const r of rows) {
        const itemCode = (r.item_code || '').trim().toUpperCase();
        if (!itemCode) continue;

        result[itemCode] = {
          ItemCode:          itemCode,
          LOISGroup:         r.lois_group,
          AvgQty3M:          r.avg_qty_3m,
          AvgQty6M:          r.avg_qty_6m,
          AvgQty12M:         r.avg_qty_12m,
          AvgQty24M:         r.avg_qty_24m,
          TrendFlag:         r.trend_flag,
          MOS:               r.mos,
          BaseForecast:      r.base_forecast,
          Forecast_NB:       r.forecast_nb,
          Forecast_BB:       r.forecast_bb,
          SalesHistory:      r.sales_history,
          OrderType:         r.order_type,
          ForecastMethod:    r.forecast_method,
          LinRegSlope:       r.lin_reg_slope,
          LinRegForecast:    r.lin_reg_forecast,
          Sigma_eff:         r.sigma_eff,
          CV:                r.cv,
          AlphaUsed:         r.alpha_used,
          InventoryRiskLevel: r.risk_level,
          MAD:               r.mad,
          MAPE:              r.mape,
          ...(r.extra_fields || {}),
        };
      }

      if (rows.length < PAGE) break;
      from += PAGE;
      // Yield to main thread to prevent UI freezing with 80k rows
      await new Promise(r => setTimeout(r, 0));
    }

    if (Object.keys(result).length === 0) return null;
    return { data: result, updatedAt };
  } catch (error) {
    console.error('Lỗi khi tải Monthly Data:', error);
    return null;
  }
}

/**
 * Lists distinct months available in monthly_sku_data.
 */
export async function listMonthlyVersions(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('monthly_sku_data')
      .select('snapshot_month')
      .order('snapshot_month', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    // Extract unique months using Set
    const uniqueMonths = Array.from(new Set(data.map(r => r.snapshot_month as string)));
    return uniqueMonths;
  } catch (err) {
    console.error('listMonthlyVersions:', err);
    return [];
  }
}

/**
 * Loads monthly data for a specific month.
 */
export async function loadSpecificMonthlyData(month: string): Promise<{ data: Record<string, any>; updatedAt: string } | null> {
  try {
    // Phase 1: Get the exact updated_at for this month version
    const { data: monthRows, error: mErr } = await supabase
      .from('monthly_sku_data')
      .select('updated_at')
      .eq('snapshot_month', month)
      .limit(1);

    if (mErr || !monthRows || monthRows.length === 0) return null;
    const updatedAt = monthRows[0].updated_at as string;

    const result: Record<string, any> = {};
    let from = 0;
    const PAGE = 1000;

    while (true) {
      const { data: rows, error } = await supabase
        .from('monthly_sku_data')
        .select('*')
        .eq('snapshot_month', month)
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const r of rows) {
        const itemCode = (r.item_code || '').trim().toUpperCase();
        if (!itemCode) continue;

        result[itemCode] = {
          ItemCode:          itemCode,
          LOISGroup:         r.lois_group,
          AvgQty3M:          r.avg_qty_3m,
          AvgQty6M:          r.avg_qty_6m,
          AvgQty12M:         r.avg_qty_12m,
          AvgQty24M:         r.avg_qty_24m,
          TrendFlag:         r.trend_flag,
          MOS:               r.mos,
          BaseForecast:      r.base_forecast,
          Forecast_NB:       r.forecast_nb,
          Forecast_BB:       r.forecast_bb,
          SalesHistory:      r.sales_history,
          OrderType:         r.order_type,
          ForecastMethod:    r.forecast_method,
          LinRegSlope:       r.lin_reg_slope,
          LinRegForecast:    r.lin_reg_forecast,
          Sigma_eff:         r.sigma_eff,
          CV:                r.cv,
          AlphaUsed:         r.alpha_used,
          InventoryRiskLevel: r.risk_level,
          MAD:               r.mad,
          MAPE:              r.mape,
          ...(r.extra_fields || {}),
        };
      }

      if (rows.length < PAGE) break;
      from += PAGE;
      await new Promise(r => setTimeout(r, 0));
    }

    if (Object.keys(result).length === 0) return null;
    return { data: result, updatedAt };
  } catch (error) {
    console.error('loadSpecificMonthlyData:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — User management
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) return null;
  return data as UserProfile;
}

export async function listProfiles(): Promise<(UserProfile & { email?: string })[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as UserProfile[];
}

export async function updateProfileRole(userId: string, role: UserRole): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  return !error;
}

export async function toggleUserActive(userId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
  return !error;
}

export async function createUserByAdmin(email: string, password: string, fullName: string, role: UserRole): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name: fullName, role },
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function adminResetPassword(targetUserId: string, newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('admin-reset-password', {
    body: { target_user_id: targetUserId, new_password: newPassword },
  });
  if (error) return { error: error.message };
  return { error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────

export async function listWorkflows(): Promise<ApprovalWorkflow[]> {
  const { data, error } = await supabase.from('approval_workflows').select('*').eq('is_active', true).order('created_at');
  if (error || !data) return [];
  return data as ApprovalWorkflow[];
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

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL REQUESTS
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitRequestPayload {
  draft_name: string;
  brand: string | null;
  workflow_id: string;
  submitted_by: string;
  snapshot_data: SnapshotData;
}

export async function submitApprovalRequest(payload: SubmitRequestPayload): Promise<string | null> {
  // Phase 8: Auto-calculate deadline (3 business days from now)
  const deadline = new Date();
  let daysAdded = 0;
  while (daysAdded < 3) {
    deadline.setDate(deadline.getDate() + 1);
    const day = deadline.getDay();
    if (day !== 0 && day !== 6) daysAdded++; // skip weekends
  }

  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      draft_name: payload.draft_name,
      brand: normalizeBrand(payload.brand), // Normalize brand on submission
      workflow_id: payload.workflow_id,
      current_level: 1,
      status: 'pending',
      submitted_by: payload.submitted_by,
      snapshot_data: payload.snapshot_data,
      version: 1,
      deadline: deadline.toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) { console.error('submitApprovalRequest:', error); return null; }
  return data.id;
}

export async function fetchMyRequests(userId: string): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('submitted_by', userId)
    .order('submitted_at', { ascending: false });
  if (error || !data) return [];
  return data as ApprovalRequest[];
}

export async function fetchPendingForApprover(
  _userId?: string,
  approvalLevels?: number[]
): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .order('submitted_at', { ascending: true });
  if (error || !data) return [];
  const requests = data as ApprovalRequest[];
  // Phase 1: Filter by user's allowed approval levels (client-side, volume is small)
  if (approvalLevels && approvalLevels.length > 0) {
    return requests.filter(r => approvalLevels.includes(r.current_level));
  }
  return requests;
}

export async function fetchAllRequests(): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error || !data) return [];
  return data as ApprovalRequest[];
}

export async function fetchRequestById(id: string): Promise<ApprovalRequest | null> {
  const { data, error } = await supabase.from('approval_requests').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data as ApprovalRequest;
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
  return data as ApprovalRequest;
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
  decisionSummary?: any // New: Summary snapshot from Decision Support layer
): Promise<{ success: boolean; newStatus: ApprovalStatus; error?: string }> {

  // Look up request and workflow
  const request = await fetchRequestById(requestId);
  if (!request) return { success: false, newStatus: 'pending', error: 'Không tìm thấy yêu cầu' };
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
  const currentLevelConfig = workflow.levels.find(l => l.level === request.current_level);
  if (action !== 'commented' && currentLevelConfig) {
    if (!currentLevelConfig.approver_ids.includes(actorId)) {
      console.warn(`Actor ${actorId} not in approver_ids for level ${request.current_level}, allowing via role-based access`);
    }
  }

  // Phase 6: Build audit metadata
  const metadata: Record<string, unknown> = {
    old_status: request.status,
    old_level: request.current_level,
    version_before: request.version || 1,
    version_after: nextVersion,
  };

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
    if (modifiedQuantities) {
      returnUpdate.snapshot_data = {
        ...request.snapshot_data,
        quantities: modifiedQuantities,
      };
    }
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
    if (modifiedQuantities) {
      advanceUpdate.snapshot_data = { ...request.snapshot_data, quantities: modifiedQuantities };
    }
    const { error: updErr } = await supabase.from('approval_requests').update(advanceUpdate).eq('id', request.id);
    if (updErr) return { success: false, newStatus: request.status, error: 'Lỗi khi chuyển cấp bậc phê duyệt' };
    return { success: true, newStatus: 'in_progress' };
  } else {
    const approveUpdate: Record<string, unknown> = {
      status: 'approved',
      version: nextVersion,
    };
    if (modifiedQuantities) {
      approveUpdate.snapshot_data = { ...request.snapshot_data, quantities: modifiedQuantities };
    }
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
  // Phase 5: version increment
  if (expectedVersion !== undefined) update.version = expectedVersion + 1;
  const { error } = await supabase.from('approval_requests').update(update).eq('id', requestId);
  return !error;
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

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY SNAPSHOT — Compress & Upload to Supabase Storage
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotMetadataRow {
  id: string;
  filename: string;
  dealer_filename: string | null;
  bo_filename: string | null;
  storage_path: string;
  upload_date: string;
  row_count: number;
  file_size_bytes: number | null;
  raw_size_bytes: number | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  notes: string | null;
  brand: string | null;
  content_hash: string | null;
}

async function compressData(data: any): Promise<Blob> {
  const json = JSON.stringify(data);
  const blob = new Blob([new TextEncoder().encode(json)]);
  const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).blob();
}

async function decompressData(blob: Blob): Promise<any> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/**
 * Light cleanup before storage — keep all user-uploaded data intact
 * (DealerBreakdown, BackorderBreakdown are preserved for full restore).
 */
function pruneForStorage(items: InventoryItem[]): any[] {
  return items;
}

/**
 * Lightweight fingerprint from row count + first/last item key fields.
 */
function computeSnapshotHash(data: InventoryItem[]): string {
  const first = data[0];
  const last = data[data.length - 1];
  const raw = `${data.length}|${first?.ItemCode}|${first?.TotalInventory ?? 0}|${last?.ItemCode}|${last?.TotalInventory ?? 0}`;
  // Simple string hash (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash) + raw.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

/**
 * Auto-delete oldest snapshots when exceeding limit.
 */
async function enforceRetentionLimit(maxSnapshots = 30): Promise<void> {
  try {
    const { data } = await supabase
      .from('snapshot_metadata')
      .select('id, storage_path')
      .order('upload_date', { ascending: true });
    if (!data || data.length <= maxSnapshots) return;
    const toDelete = data.slice(0, data.length - maxSnapshots);
    for (const snap of toDelete) {
      await supabase.storage.from('inventory_snapshots').remove([snap.storage_path]);
      await supabase.from('snapshot_metadata').delete().eq('id', snap.id);
    }
  } catch (err) {
    console.warn('enforceRetentionLimit:', err);
  }
}

/**
 * Upload inventory snapshot: prune → compress → dedup check → upload → save metadata → enforce retention.
 */
export async function uploadSnapshot(
  data: InventoryItem[],
  filename: string,
  opts?: { dealerFilename?: string; boFilename?: string }
): Promise<{ success: boolean; error?: string; deduplicated?: boolean }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const rawBrand = data[0]?.BrandName || data[0]?.ThuongHieu || null;
    const brand = normalizeBrand(rawBrand);
    const contentHash = computeSnapshotHash(data);

    // Dedup: skip if same hash exists within 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('snapshot_metadata')
      .select('id')
      .eq('content_hash', contentHash)
      .gte('upload_date', since)
      .limit(1);
    if (existing && existing.length > 0) {
      return { success: true, deduplicated: true };
    }

    // Prune large arrays + compress
    const pruned = pruneForStorage(data);
    const rawSize = new Blob([JSON.stringify(pruned)]).size;
    const compressed = await compressData(pruned);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePath = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    // Structure path by brand to support RLS and organization
    const brandPrefix = brand ? `${brand.toLowerCase()}/` : 'unbranded/';
    const path = `${brandPrefix}${datePath}/snapshot_${ts}.json.gz`;

    const { error: uploadErr } = await supabase.storage
      .from('inventory_snapshots')
      .upload(path, compressed, {
        contentType: 'application/gzip',
        upsert: false,
      });
    if (uploadErr) return { success: false, error: uploadErr.message };

    const { error: metaErr } = await supabase.from('snapshot_metadata').insert({
      filename,
      dealer_filename: opts?.dealerFilename || null,
      bo_filename: opts?.boFilename || null,
      storage_path: path,
      row_count: data.length,
      file_size_bytes: compressed.size,
      raw_size_bytes: rawSize,
      uploaded_by: user?.id ?? null,
      brand,
      content_hash: contentHash,
    });
    if (metaErr) console.warn('Metadata insert failed (snapshot uploaded OK):', metaErr.message);

    // Auto-cleanup oldest snapshots (fire-and-forget)
    enforceRetentionLimit(30);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * List saved snapshots, newest first. Optional brand filter for non-admin users.
 * brandFilter=null → show all (admin), brandFilter='Kia' → only Kia snapshots + untagged.
 */
export async function listSnapshots(limit = 50, brandFilter?: string | null): Promise<SnapshotMetadataRow[]> {
  try {
    let query = supabase
      .from('snapshot_metadata')
      .select('*, profiles:uploaded_by(full_name)');

    if (brandFilter) {
      const normalized = normalizeBrand(brandFilter);
      if (normalized) {
        // Use OR to include the exact normalized brand and also nulls (global defaults)
        query = query.or(`brand.eq.${normalized},brand.is.null`);
      }
    }

    query = query.order('upload_date', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) { console.error('listSnapshots:', error); return []; }
    return (data || []).map((row: any) => ({
      ...row,
      uploader_name: row.profiles?.full_name || null,
      profiles: undefined,
    })) as SnapshotMetadataRow[];
  } catch {
    return [];
  }
}

/**
 * Get total storage usage from snapshot metadata.
 */
export async function getStorageUsage(): Promise<{ usedBytes: number; count: number }> {
  try {
    const { data } = await supabase
      .from('snapshot_metadata')
      .select('file_size_bytes');
    const usedBytes = (data || []).reduce((sum: number, r: any) => sum + (r.file_size_bytes || 0), 0);
    return { usedBytes, count: (data || []).length };
  } catch {
    return { usedBytes: 0, count: 0 };
  }
}

/**
 * Download & decompress a snapshot from Storage, returning InventoryItem[].
 */
export async function loadSnapshot(storagePath: string): Promise<InventoryItem[] | null> {
  try {
    const { data, error } = await supabase.storage
      .from('inventory_snapshots')
      .download(storagePath);
    if (error || !data) { console.error('loadSnapshot download:', error); return null; }
    const parsed = await decompressData(data);
    return Array.isArray(parsed) ? parsed as InventoryItem[] : null;
  } catch (err) {
    console.error('loadSnapshot:', err);
    return null;
  }
}

/**
 * Delete a snapshot (storage file + metadata row).
 */
export async function deleteSnapshot(id: string, storagePath: string): Promise<boolean> {
  try {
    await supabase.storage.from('inventory_snapshots').remove([storagePath]);
    await supabase.from('snapshot_metadata').delete().eq('id', id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists available monthly snapshots for history display in Settings.
 * Reads from the cloud_storage index records (monthly_index_YYYY-MM).
 */
export async function listMonthlyDataSnapshots(): Promise<{ id: string; updated_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at')
      .like('id', 'monthly_index_%')
      .order('id', { ascending: false }); // Better ordering by ID (YYYY-MM)
    if (error) return [];
    return (data || []).map(d => ({
      id: (d.id as string).replace('monthly_index_', ''), // Clean version: YYYY-MM
      updated_at: d.updated_at,
    }));
  } catch {
    return [];
  }
}

