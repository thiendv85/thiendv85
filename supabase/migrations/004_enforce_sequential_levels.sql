-- Phase 4: Enforce sequential approval level progression
CREATE OR REPLACE FUNCTION enforce_sequential_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_level > OLD.current_level + 1 THEN
    RAISE EXCEPTION 'Cannot skip approval levels: % → %', OLD.current_level, NEW.current_level;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sequential_level ON approval_requests;
CREATE TRIGGER trg_sequential_level
BEFORE UPDATE ON approval_requests
FOR EACH ROW
WHEN (OLD.current_level IS DISTINCT FROM NEW.current_level)
EXECUTE FUNCTION enforce_sequential_level();
