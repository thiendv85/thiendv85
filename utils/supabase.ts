import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jczdnlydozcftvnqnixt.supabase.co';
const supabaseKey = 'sb_publishable_Iahv6LF7asBI3E_u_HAZhQ_Qrb99Qjm'; // Provided by user

export const supabase = createClient(supabaseUrl, supabaseKey);

// Hàm kiểm tra mã phê duyệt (Admin PIN)
export const verifyAdminPin = (inputPin: string) => {
  // Ưu tiên biến môi trường VITE_ADMIN_PIN (nếu thiết lập trên Vercel), mặc định là '2026' nếu không có
  const adminPin = (import.meta as any).env.VITE_ADMIN_PIN || '2026';
  return inputPin === adminPin;
};

// Helper function to save JSON data to cloud_storage table
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

// Function to get list of order drafts (metadata only)
export async function listOrderDrafts() {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at')
      .like('id', 'order_draft_%')
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
export async function loadLatestMonthlyData(): Promise<{ data: Record<string, any>; updatedAt: string } | null> {
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
 * Lists available monthly snapshots for history display in Settings.
 * Reads from the cloud_storage index records (monthly_index_YYYY-MM).
 */
export async function listMonthlyDataSnapshots(): Promise<{ id: string; updated_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at')
      .like('id', 'monthly_index_%')
      .order('updated_at', { ascending: false });
    if (error) return [];
    return (data || []).map(d => ({
      id: (d.id as string).replace('monthly_index_', 'monthly_data_'),
      updated_at: d.updated_at,
    }));
  } catch {
    return [];
  }
}

