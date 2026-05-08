-- ============================================================================
-- 010 — Cleanup legacy RLS policies that defeat 009's admin-only restrictions
--
-- Context:
-- After running 009, the new admin-only INSERT/UPDATE/DELETE policies on
-- cloud_storage, snapshot_metadata, monthly_sku_data are present, but legacy
-- permissive policies (USING(true) granted to all authenticated users) are
-- ALSO present from older migrations. PostgreSQL OR's PERMISSIVE policies, so
-- the legacy permissive policy wins and 009's admin-only restriction is silently
-- defeated.
--
-- This migration drops the legacy policies, leaving only the new admin-restricted
-- ones. It also reverts 009's overly-permissive policies on approval_requests /
-- approval_actions because the existing role-based policies (`requests_insert_planner`,
-- `requests_select_approver_admin`, etc.) are stricter and correct.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─── cloud_storage: drop permissive ALL/INSERT/UPDATE legacy ────────────────
DROP POLICY IF EXISTS "cloud_storage_authenticated" ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_insert"        ON public.cloud_storage;
DROP POLICY IF EXISTS "cloud_storage_update"        ON public.cloud_storage;

-- ─── snapshot_metadata: drop permissive auth-can-everything legacy ──────────
DROP POLICY IF EXISTS "snapshot_delete_auth" ON public.snapshot_metadata;
DROP POLICY IF EXISTS "snapshot_insert_auth" ON public.snapshot_metadata;
DROP POLICY IF EXISTS "snapshot_read_all"    ON public.snapshot_metadata;

-- ─── approval_actions: revert 009 (legacy role-based policies are correct) ──
-- The legacy policies (`actions_insert_approver_admin`, `Admins can do everything`,
-- `actions_select_authenticated`) were already proper role-based RBAC. 009 added
-- duplicates that are no stricter. Drop 009's additions and the redundant SELECT.
DROP POLICY IF EXISTS "approval_actions_select"      ON public.approval_actions;
DROP POLICY IF EXISTS "approval_actions_insert_self" ON public.approval_actions;
DROP POLICY IF EXISTS "Allow authenticated select on actions" ON public.approval_actions;

-- ─── approval_requests: revert 009 (legacy role-based policies are correct) ─
-- Legacy: `requests_insert_planner` (only planners insert), `requests_select_approver_admin`,
-- `requests_select_own`, `requests_update_approver_admin`, `Admins can do everything`.
-- 009 added permissive variants (`approval_requests_select` USING true) that BROKE
-- those role checks. Drop the 009 additions; keep the legacy role-based ones.
DROP POLICY IF EXISTS "approval_requests_select"                   ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert_self"              ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_update_owner_or_approver" ON public.approval_requests;
DROP POLICY IF EXISTS "Allow authenticated select on requests"     ON public.approval_requests;

-- ─── profiles: drop legacy redundant policies (mine + role-escalation guard wins) ──
-- 009's policies cover everything safely:
--   profiles_select_self_or_admin = profiles_select_own + profiles_select_admin
--   profiles_update_self_safe blocks role/approval_levels/is_active escalation
--   profiles_update_admin lets admins manage roles
-- Keep `profiles_insert_trigger` (used by auth trigger on signup).
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;

-- ============================================================================
-- Verification — re-run after this migration. Should now show ~22 rows total:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname='public' ORDER BY tablename, policyname;
--
-- Expected per table:
--   approval_actions   : 3 (Admins-can-do-everything ALL, actions_insert_approver_admin INSERT, actions_select_authenticated SELECT)
--   approval_requests  : 5 (Admins-can-do-everything, requests_insert_planner, requests_select_approver_admin, requests_select_own, requests_update_approver_admin)
--   approval_workflows : 2 (workflows_all_admin, workflows_select_authenticated)
--   cloud_storage      : 4 (cloud_storage_select, _insert_admin, _update_admin, _delete_admin)
--   monthly_sku_data   : 4 (_select, _insert_admin, _update_admin, _delete_admin)
--   profiles           : 5 (profiles_select_self_or_admin, _update_self_safe, _update_admin, _insert_admin/trigger, _delete_admin)
--   snapshot_metadata  : 4 (_select, _insert_admin, _update_admin, _delete_admin)
-- ============================================================================
