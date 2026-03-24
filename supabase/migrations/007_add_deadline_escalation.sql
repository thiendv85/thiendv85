-- Phase 8: Escalation & Deadline Management
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS escalated_to TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_deadline ON approval_requests(deadline)
WHERE status IN ('pending', 'in_progress') AND deadline IS NOT NULL;

COMMENT ON COLUMN approval_requests.deadline IS 'Due date for approval (auto-set to 3 business days from submission)';
COMMENT ON COLUMN approval_requests.escalated_at IS 'When the request was escalated due to missed deadline';
COMMENT ON COLUMN approval_requests.escalated_to IS 'Who was escalated to (next-level approver IDs)';
