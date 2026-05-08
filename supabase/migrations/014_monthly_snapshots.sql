-- ============================================================================
-- 014 — monthly_snapshots table
--
-- Purpose:
-- Replaces the cloud_storage `monthly_index_YYYY-MM` JSONB rows used as a
-- snapshot index. The previous design relied on `ILIKE 'monthly_index_%'`
-- which does a sequential scan and cannot use a B-tree index.
--
-- Strategy:
-- - Dedicated table with snapshot_month (TEXT, YYYY-MM) as a UNIQUE column.
-- - B-tree index on snapshot_month DESC for fast latest-snapshot lookup.
-- - RLS: authenticated read, admin/super_admin write (matches 009 pattern).
-- - Backfills from existing cloud_storage rows. Old rows are kept for one
--   release cycle so a rollback can read them; cleanup happens in 015.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.monthly_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month  TEXT        NOT NULL UNIQUE,
  row_count       INTEGER     NOT NULL DEFAULT 0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_month_desc
  ON public.monthly_snapshots (snapshot_month DESC);

COMMENT ON TABLE public.monthly_snapshots IS
  'Snapshot index for monthly_sku_data. Replaces cloud_storage monthly_index_* rows.';

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop policies for idempotent re-run
DROP POLICY IF EXISTS "monthly_snapshots_select"        ON public.monthly_snapshots;
DROP POLICY IF EXISTS "monthly_snapshots_insert_admin"  ON public.monthly_snapshots;
DROP POLICY IF EXISTS "monthly_snapshots_update_admin"  ON public.monthly_snapshots;
DROP POLICY IF EXISTS "monthly_snapshots_delete_admin"  ON public.monthly_snapshots;

CREATE POLICY "monthly_snapshots_select" ON public.monthly_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "monthly_snapshots_insert_admin" ON public.monthly_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "monthly_snapshots_update_admin" ON public.monthly_snapshots
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "monthly_snapshots_delete_admin" ON public.monthly_snapshots
  FOR DELETE TO authenticated USING (public.is_admin());

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monthly_snapshots_updated_at ON public.monthly_snapshots;
CREATE TRIGGER trg_monthly_snapshots_updated_at
  BEFORE UPDATE ON public.monthly_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Backfill from cloud_storage ────────────────────────────────────────────
INSERT INTO public.monthly_snapshots (snapshot_month, row_count, metadata, created_at, updated_at)
SELECT
  REPLACE(id, 'monthly_index_', '')                  AS snapshot_month,
  COALESCE((data->>'count')::INTEGER, 0)             AS row_count,
  data                                               AS metadata,
  COALESCE(updated_at, now())                        AS created_at,
  COALESCE(updated_at, now())                        AS updated_at
FROM public.cloud_storage
WHERE id LIKE 'monthly_index_%'
ON CONFLICT (snapshot_month) DO UPDATE
  SET row_count  = EXCLUDED.row_count,
      metadata   = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at;
