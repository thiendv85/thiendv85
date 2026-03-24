-- Phase 5: Optimistic Locking via version column
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 NOT NULL;
