-- Phase 3: Rejection Reason & Feedback
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS returned_reason TEXT DEFAULT NULL;
