-- ============================================================================
-- 009 — Proper RLS Policies (replaces USING(true) blanket access)
--
-- Context:
-- The original rls_policies.sql granted full access to every authenticated user
-- via USING (true) / WITH CHECK (true). This allowed any user to delete or
-- modify other users' draft orders, snapshots, and monthly pricing data.
--
-- Strategy:
-- - SELECT (read): authenticated users can read business data (internal app).
-- - INSERT/UPDATE/DELETE on business data: requires admin/super_admin role.
-- - profiles: self-read + admin-write; users CANNOT update their own role or
--   approval_levels; only admins can.
--
-- Idempotent — safe to re-run. Drops both old policy names (from rls_policies.sql)
-- AND new policy names so a partial previous run can be cleaned up.
-- ============================================================================

-- Helper function: current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_active, true) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('admin', 'super_admin')
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── 1. snapshot_metadata ───────────────────────────────────────────────────
ALTER TABLE public.snapshot_metadata ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies
DROP POLICY IF EXISTS "Allow authenticated read metadata"   ON public.snapshot_metadata;
DROP POLICY IF EXISTS "Allow authenticated insert metadata" ON public.snapshot_metadata;
DROP POLICY IF EXISTS "Allow authenticated delete metadata" ON public.snapshot_metadata;
-- Drop new policy names too (for idempotent re-run)
DROP POLICY IF EXISTS "snapshot_metadata_select"        ON public.snapshot_metadata;
DROP POLICY IF EXISTS "snapshot_metadata_insert_admin"  ON public.snapshot_metadata;
DROP POLICY IF EXISTS "snapshot_metadata_update_admin"  ON public.snapshot_metadata;
DROP POLICY IF EXISTS "snapshot_metadata_delete_admin"  ON public.snapshot_metadata;

CREATE POLICY "snapshot_metadata_select" ON public.snapshot_metadata
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "snapshot_metadata_insert_admin" ON public.snapshot_metadata
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "snapshot_metadata_update_admin" ON public.snapshot_metadata
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "snapshot_metadata_delete_admin" ON public.snapshot_metadata
  FOR DELETE TO authenticated USING (public.is_admin());

-- ─── 2. cloud_storage ───────────────────────────────────────────────────────
ALTER TABLE public.cloud_storage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read cloud_storage"   ON public.cloud_storage;
DROP POLICY IF EXISTS "Allow authenticated upsert cloud_storage" ON public.cloud_storage;
DROP POLICY IF EXISTS "Allow authenticated update cloud_storage" ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_select"        ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_insert_admin"  ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_update_admin"  ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_delete_admin"  ON public.cloud_storage;

CREATE POLICY "cloud_storage_select" ON public.cloud_storage
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cloud_storage_insert_admin" ON public.cloud_storage
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "cloud_storage_update_admin" ON public.cloud_storage
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "cloud_storage_delete_admin" ON public.cloud_storage
  FOR DELETE TO authenticated USING (public.is_admin());

-- ─── 3. monthly_sku_data ────────────────────────────────────────────────────
ALTER TABLE public.monthly_sku_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read monthly_sku_data"   ON public.monthly_sku_data;
DROP POLICY IF EXISTS "Allow authenticated upsert monthly_sku_data" ON public.monthly_sku_data;
DROP POLICY IF EXISTS "Allow authenticated update monthly_sku_data" ON public.monthly_sku_data;
DROP POLICY IF EXISTS "monthly_sku_data_select"        ON public.monthly_sku_data;
DROP POLICY IF EXISTS "monthly_sku_data_insert_admin"  ON public.monthly_sku_data;
DROP POLICY IF EXISTS "monthly_sku_data_update_admin"  ON public.monthly_sku_data;
DROP POLICY IF EXISTS "monthly_sku_data_delete_admin"  ON public.monthly_sku_data;

CREATE POLICY "monthly_sku_data_select" ON public.monthly_sku_data
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "monthly_sku_data_insert_admin" ON public.monthly_sku_data
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "monthly_sku_data_update_admin" ON public.monthly_sku_data
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "monthly_sku_data_delete_admin" ON public.monthly_sku_data
  FOR DELETE TO authenticated USING (public.is_admin());

-- ─── 4. profiles — self-read + admin-write; block self-role-escalation ─────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_safe"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"         ON public.profiles;

CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- Self update: only safe fields. Role / approval_levels / is_active protected.
CREATE POLICY "profiles_update_self_safe" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND approval_levels IS NOT DISTINCT FROM (SELECT approval_levels FROM public.profiles WHERE id = auth.uid())
    AND is_active IS NOT DISTINCT FROM (SELECT is_active FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin());

-- ─── 5. approval_requests ──────────────────────────────────────────────────
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_requests_select"                   ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert_self"              ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_update_owner_or_approver" ON public.approval_requests;

CREATE POLICY "approval_requests_select" ON public.approval_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_requests_insert_self" ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "approval_requests_update_owner_or_approver" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR public.is_admin())
  WITH CHECK (submitted_by = auth.uid() OR public.is_admin());

-- ─── 6. approval_actions ───────────────────────────────────────────────────
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_actions_select"      ON public.approval_actions;
DROP POLICY IF EXISTS "approval_actions_insert_self" ON public.approval_actions;

CREATE POLICY "approval_actions_select" ON public.approval_actions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_actions_insert_self" ON public.approval_actions
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ─── 7. Indexes recommended by audit ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_approval_requests_submitted_by
  ON public.approval_requests (submitted_by);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status_submitted_at
  ON public.approval_requests (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status_deadline_active
  ON public.approval_requests (status, deadline)
  WHERE escalated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_approval_actions_request_level_action
  ON public.approval_actions (request_id, level, action);

CREATE INDEX IF NOT EXISTS idx_approval_actions_request_acted_at
  ON public.approval_actions (request_id, acted_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshot_metadata_brand_upload_date
  ON public.snapshot_metadata (brand, upload_date DESC);

CREATE INDEX IF NOT EXISTS idx_snapshot_metadata_content_hash_upload_date
  ON public.snapshot_metadata (content_hash, upload_date DESC);

-- ============================================================================
-- Verification:
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
--   SELECT public.current_user_role();
--   SELECT public.is_admin();
-- ============================================================================
