-- Admin PIN verification via server-side RPC
-- PIN is stored hashed in profiles.admin_pin_hash (bcrypt)
-- Callers send plaintext PIN; comparison happens server-side only.

-- Step 1: Add admin_pin_hash column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_pin_hash text;

-- Step 2: Enable pgcrypto for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 3: Create RPC to verify PIN
CREATE OR REPLACE FUNCTION verify_admin_pin(pin_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_active boolean;
  v_pin_hash text;
BEGIN
  SELECT role, is_active, admin_pin_hash
    INTO v_role, v_is_active, v_pin_hash
    FROM profiles
   WHERE id = auth.uid();

  -- Must be active admin/super_admin
  IF v_role IS NULL OR NOT v_is_active OR v_role NOT IN ('admin', 'super_admin') THEN
    RETURN false;
  END IF;

  -- If no PIN set, role check alone is sufficient (backward compat)
  IF v_pin_hash IS NULL OR v_pin_hash = '' THEN
    RETURN true;
  END IF;

  -- Verify PIN against stored bcrypt hash
  RETURN v_pin_hash = crypt(pin_input, v_pin_hash);
END;
$$;

-- Step 4: Create RPC to set/update admin PIN
CREATE OR REPLACE FUNCTION set_admin_pin(new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET admin_pin_hash = crypt(new_pin, gen_salt('bf'))
   WHERE id = auth.uid()
     AND role IN ('admin', 'super_admin')
     AND is_active = true;

  RETURN FOUND;
END;
$$;

-- Step 5: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION verify_admin_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_admin_pin(text) TO authenticated;
