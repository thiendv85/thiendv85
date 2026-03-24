-- Phase 1: Authorization & RBAC
-- Add approval_levels and department to profiles table

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approval_levels INT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT DEFAULT NULL;

-- Index for faster approval level lookups
CREATE INDEX IF NOT EXISTS idx_profiles_approval_levels ON profiles USING GIN(approval_levels);

-- Comments for documentation
COMMENT ON COLUMN profiles.approval_levels IS 'Array of approval levels user can approve [1], [1,2], [1,2,3], etc.';
COMMENT ON COLUMN profiles.department IS 'User department: sales, procurement, etc.';

-- Seed: grant admin users all levels, approver users level 1
UPDATE profiles SET approval_levels = ARRAY[1,2,3] WHERE role = 'admin' AND approval_levels = '{}';
UPDATE profiles SET approval_levels = ARRAY[1] WHERE role = 'approver' AND approval_levels = '{}';
