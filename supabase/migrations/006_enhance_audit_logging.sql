-- Phase 6: Enhanced Audit Logging with metadata
ALTER TABLE approval_actions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN approval_actions.metadata IS 'Audit metadata: old_status, new_status, old_level, new_level, changed_fields, version_before/after, reason';
