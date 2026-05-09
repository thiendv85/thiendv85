-- Migration 016: Fix snapshot_metadata INSERT policy
--
-- BUG: Daily inventory snapshot upload silently failed for non-admin users
-- (planner/approver). Storage bucket accepted the .json.gz file (orphan), but
-- snapshot_metadata INSERT was blocked by `is_admin()` RLS policy. The client
-- code (utils/supabase.ts:uploadSnapshot) only console.warn'd the error and
-- returned success=true. Result: file in Storage but listSnapshots empty.
--
-- Evidence: 3 BMW snapshot files uploaded 2026-05-09 in Storage but
-- snapshot_metadata table latest row was 2026-05-08 (BMW department has
-- 1 approver + 2 planners, all non-admin).
--
-- FIX: Drop admin-only INSERT policy, replace with authenticated-only.
-- Storage bucket policies already restrict by brand path; metadata INSERT
-- carries no security risk beyond what Storage already enforces.
-- UPDATE/DELETE remain admin-only (planners can't delete each other's uploads).

BEGIN;

DROP POLICY IF EXISTS snapshot_metadata_insert_admin ON public.snapshot_metadata;

CREATE POLICY snapshot_metadata_insert_authenticated
  ON public.snapshot_metadata
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMIT;
