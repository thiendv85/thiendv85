-- Dedicated supersession tables: per-file uploads + row-level mappings
-- Replaces the cloud_storage JSON blob approach

-- Track each uploaded file
CREATE TABLE IF NOT EXISTS supersession_uploads (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    filename    text NOT NULL,
    brand       text,                -- e.g. 'Kia', 'Mazda', 'Stellantis', NULL = all
    row_count   integer NOT NULL DEFAULT 0,
    uploaded_by uuid REFERENCES auth.users(id),
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    notes       text
);

-- Individual mappings with source file reference
CREATE TABLE IF NOT EXISTS supersession_mappings (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    old_part        text NOT NULL,
    new_part        text NOT NULL,
    interchangeable boolean NOT NULL DEFAULT false,
    upload_id       uuid REFERENCES supersession_uploads(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (old_part, new_part)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_supersession_mappings_old ON supersession_mappings(old_part);
CREATE INDEX IF NOT EXISTS idx_supersession_mappings_new ON supersession_mappings(new_part);
CREATE INDEX IF NOT EXISTS idx_supersession_mappings_upload ON supersession_mappings(upload_id);
CREATE INDEX IF NOT EXISTS idx_supersession_uploads_brand ON supersession_uploads(brand);

-- RLS: all authenticated can read, only admins can write
ALTER TABLE supersession_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE supersession_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supersession_uploads_select" ON supersession_uploads
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "supersession_uploads_insert" ON supersession_uploads
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "supersession_uploads_delete" ON supersession_uploads
    FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "supersession_mappings_select" ON supersession_mappings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "supersession_mappings_insert" ON supersession_mappings
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "supersession_mappings_update" ON supersession_mappings
    FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "supersession_mappings_delete" ON supersession_mappings
    FOR DELETE TO authenticated USING (public.is_admin());
