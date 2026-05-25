import { supabase } from './client';
import { selectAllPaginated } from './helpers';

const BATCH_SIZE = 500; // Upsert 500 rows per request to avoid timeout

/**
 * Saves monthly coefficient data to Supabase monthly_sku_data table.
 * Uses batch upsert (BATCH_SIZE rows each) to safely handle 80,000+ SKUs.
 * snapshot_month format: 'YYYY-MM'
 */
export async function saveMonthlyData(monthlyMap: Record<string, any>, options?: { clearFirst?: boolean }): Promise<boolean> {
  try {
    const snapshotMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const now = new Date().toISOString();

    // Phase: Clear existing data for this month if requested
    if (options?.clearFirst) {
      await deleteMonthlyData(snapshotMonth);
    }

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
    await supabase.from('monthly_snapshots').upsert(
      {
        snapshot_month: snapshotMonth,
        row_count: rows.length,
        metadata: { snapshotMonth, count: rows.length },
        updated_at: now,
      },
      { onConflict: 'snapshot_month' },
    );

    return true;
  } catch (error) {
    console.error('Lỗi khi lưu Monthly Data:', error);
    return false;
  }
}

/**
 * Loads the latest monthly data from monthly_sku_data table.
 * Uses monthly_snapshots index to find the latest version first.
 */
export async function loadLatestMonthlyData(lastUpdatedAt?: string | null): Promise<{ data: Record<string, any>; updatedAt: string; isUpToDate?: boolean } | null> {
  try {
    // Step 1: Find the latest snapshot from monthly_snapshots
    const { data: indexRows, error: idxErr } = await supabase
      .from('monthly_snapshots')
      .select('snapshot_month, updated_at')
      .order('snapshot_month', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);

    if (idxErr || !indexRows || indexRows.length === 0) return null;

    const latestIndex = indexRows[0];
    const latestMonth = latestIndex.snapshot_month as string;
    const updatedAt = latestIndex.updated_at as string;

    // Phase: Version Check Optimization
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

/**
 * Deletes all records for a specific snapshot_month.
 * Also removes the index record from monthly_snapshots.
 */
export async function deleteMonthlyData(snapshotMonth: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Supabase] Deleting monthly data for: ${snapshotMonth}`);

    // 1. Delete rows from monthly_sku_data
    const { error: dErr } = await supabase
      .from('monthly_sku_data')
      .delete()
      .eq('snapshot_month', snapshotMonth);

    if (dErr) {
      console.error('[Supabase] Error deleting from monthly_sku_data:', dErr);
      return { success: false, error: dErr.message };
    }

    // 2. Delete index record from monthly_snapshots
    const { error: cErr } = await supabase
      .from('monthly_snapshots')
      .delete()
      .eq('snapshot_month', snapshotMonth);

    if (cErr) {
      console.error('[Supabase] Error deleting from monthly_snapshots:', cErr);
      return { success: false, error: cErr.message };
    }

    console.log(`[Supabase] Successfully deleted monthly data for: ${snapshotMonth}`);
    return { success: true };
  } catch (error: any) {
    console.error('Lỗi khi xóa Monthly Data:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Lists available monthly snapshots for history display in Settings.
 * Reads from the monthly_snapshots table.
 */
export async function listMonthlyDataSnapshots(): Promise<{ id: string; updated_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from('monthly_snapshots')
      .select('snapshot_month, updated_at')
      .order('snapshot_month', { ascending: false });
    if (error) return [];
    return (data || []).map(d => ({
      id: d.snapshot_month as string,
      updated_at: d.updated_at as string,
    }));
  } catch {
    return [];
  }
}
