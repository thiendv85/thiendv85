-- ============================================================================
-- RLS POLICIES CHO ATP SUPPLY CHAIN APP
-- Fix: dùng DO $$ block vì PostgreSQL không hỗ trợ CREATE POLICY IF NOT EXISTS
-- Chạy toàn bộ file này trên Supabase SQL Editor nếu bị lỗi RLS.
-- AN TOÀN để chạy lại nhiều lần (kiểm tra pg_policies trước khi tạo).
-- Last updated: 2026-04-15
-- ============================================================================

-- ─── 1. STORAGE: inventory_snapshots bucket ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated read storage'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated read storage"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (bucket_id = 'inventory_snapshots');
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated uploads'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated uploads"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'inventory_snapshots');
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated delete storage'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated delete storage"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (bucket_id = 'inventory_snapshots');
    $q$;
  END IF;
END $$;

-- ─── 2. TABLE: snapshot_metadata ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'snapshot_metadata'
      AND policyname = 'Allow authenticated read metadata'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated read metadata"
        ON snapshot_metadata
        FOR SELECT
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'snapshot_metadata'
      AND policyname = 'Allow authenticated insert metadata'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated insert metadata"
        ON snapshot_metadata
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'snapshot_metadata'
      AND policyname = 'Allow authenticated delete metadata'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated delete metadata"
        ON snapshot_metadata
        FOR DELETE
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

-- ─── 3. TABLE: cloud_storage ─────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cloud_storage'
      AND policyname = 'Allow authenticated read cloud_storage'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated read cloud_storage"
        ON cloud_storage
        FOR SELECT
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cloud_storage'
      AND policyname = 'Allow authenticated upsert cloud_storage'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated upsert cloud_storage"
        ON cloud_storage
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cloud_storage'
      AND policyname = 'Allow authenticated update cloud_storage'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated update cloud_storage"
        ON cloud_storage
        FOR UPDATE
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

-- ─── 4. TABLE: monthly_sku_data ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_sku_data'
      AND policyname = 'Allow authenticated read monthly_sku_data'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated read monthly_sku_data"
        ON monthly_sku_data
        FOR SELECT
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_sku_data'
      AND policyname = 'Allow authenticated upsert monthly_sku_data'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated upsert monthly_sku_data"
        ON monthly_sku_data
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_sku_data'
      AND policyname = 'Allow authenticated update monthly_sku_data'
  ) THEN
    EXECUTE $q$
      CREATE POLICY "Allow authenticated update monthly_sku_data"
        ON monthly_sku_data
        FOR UPDATE
        TO authenticated
        USING (true);
    $q$;
  END IF;
END $$;

-- ============================================================================
-- Done — Safe to re-run anytime.
-- ============================================================================
