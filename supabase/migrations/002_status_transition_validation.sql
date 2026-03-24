-- Phase 2: State Transition Validation (DB-level safety net)

CREATE OR REPLACE FUNCTION validate_status_transition(
  p_current_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN CASE p_current_status
    WHEN 'pending'     THEN p_new_status IN ('in_progress', 'rejected', 'returned', 'approved')
    WHEN 'in_progress' THEN p_new_status IN ('in_progress', 'approved', 'rejected', 'returned')
    WHEN 'approved'    THEN p_new_status IN ('unlocked')
    WHEN 'unlocked'    THEN p_new_status IN ('pending')
    WHEN 'returned'    THEN p_new_status IN ('pending')
    WHEN 'rejected'    THEN FALSE  -- terminal state
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add trigger to enforce valid transitions on approval_requests
CREATE OR REPLACE FUNCTION check_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT validate_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_status_transition ON approval_requests;
CREATE TRIGGER trg_check_status_transition
BEFORE UPDATE ON approval_requests
FOR EACH ROW EXECUTE FUNCTION check_status_transition();
