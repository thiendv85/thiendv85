-- ============================================================================
-- 011 — Fix owner-based writes on cloud_storage + approval flow writes
--
-- Context:
-- 009 + 010 locked cloud_storage to admin-only INSERT/UPDATE/DELETE. But the
-- app stores TWO categories of records in this table:
--   1. Global config (id like 'global_config', 'supersession_draft', 'kitting_draft',
--      'monthly_index_*'): owner_id IS NULL — admin-only is correct.
--   2. User-owned order drafts (id like 'order_draft_*'): owner_id = auth.uid()
--      — any authenticated user must be able to save their own draft.
--
-- This migration adds owner-based PERMISSIVE policies that allow non-admin users
-- to insert/update/delete rows where owner_id = auth.uid(), while admin policies
-- from 009 still cover global rows.
--
-- It also adds explicit role-based policies for the approval flow so that
-- planner/approver/admin can each perform their respective writes.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─── 1. cloud_storage owner-based access ───────────────────────────────────

DROP POLICY IF EXISTS "cloud_storage_insert_owner" ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_update_owner" ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_delete_owner" ON public.cloud_storage;

-- Users can insert rows they own (owner_id MUST equal their auth.uid()).
-- Combined with the admin policy from 009, this means:
--   - Admin can write any row (with or without owner_id)
--   - Non-admin can only write rows where owner_id = auth.uid()
--   - Non-admin CANNOT write global rows (owner_id IS NULL)
CREATE POLICY "cloud_storage_insert_owner" ON public.cloud_storage
  FOR INSERT TO authenticated
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

CREATE POLICY "cloud_storage_update_owner" ON public.cloud_storage
  FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

CREATE POLICY "cloud_storage_delete_owner" ON public.cloud_storage
  FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());

-- ─── 2. approval_requests — explicit role-based writes ─────────────────────

DROP POLICY IF EXISTS "approval_requests_insert_planner_or_admin" ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_update_owner_approver_admin" ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_select_all_authenticated" ON public.approval_requests;

-- Anyone authenticated can read requests (internal app, no row-level confidentiality).
CREATE POLICY "approval_requests_select_all_authenticated" ON public.approval_requests
  FOR SELECT TO authenticated USING (true);

-- Planner/approver/admin can submit a request as themselves.
-- (User cannot submit as someone else — submitted_by must be their own uid.)
CREATE POLICY "approval_requests_insert_planner_or_admin" ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.current_user_role() IN ('planner', 'approver', 'admin', 'super_admin')
  );

-- Update: owner can edit their own (e.g. resubmit), approver/admin can advance status.
CREATE POLICY "approval_requests_update_owner_approver_admin" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.current_user_role() IN ('approver', 'admin', 'super_admin')
  )
  WITH CHECK (
    submitted_by = auth.uid()
    OR public.current_user_role() IN ('approver', 'admin', 'super_admin')
  );

-- ─── 3. approval_actions — approver/admin can record actions ───────────────

DROP POLICY IF EXISTS "approval_actions_select_all_authenticated" ON public.approval_actions;
DROP POLICY IF EXISTS "approval_actions_insert_approver_admin" ON public.approval_actions;

CREATE POLICY "approval_actions_select_all_authenticated" ON public.approval_actions
  FOR SELECT TO authenticated USING (true);

-- Approver/admin can insert action records, but only as themselves (actor_id = uid).
CREATE POLICY "approval_actions_insert_approver_admin" ON public.approval_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.current_user_role() IN ('approver', 'admin', 'super_admin')
  );

-- ============================================================================
-- Verification:
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public'
--    AND tablename IN ('cloud_storage', 'approval_requests', 'approval_actions')
--    ORDER BY tablename, policyname;
-- ============================================================================
