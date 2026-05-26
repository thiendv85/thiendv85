-- Part Affinity Pairs — gợi ý mã liên quan khi đặt hàng (2026-05-26)
-- Pairs đối xứng, lưu canonical (part_a < part_b) để tránh dup ngược chiều.

CREATE TABLE IF NOT EXISTS part_affinity_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_a TEXT NOT NULL,
    part_b TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mandatory', 'recommended')),
    score INT DEFAULT 50 CHECK (score >= 0 AND score <= 100),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    UNIQUE (part_a, part_b),
    CONSTRAINT canonical_order CHECK (part_a < part_b)
);

CREATE INDEX IF NOT EXISTS idx_affinity_a ON part_affinity_pairs(part_a);
CREATE INDEX IF NOT EXISTS idx_affinity_b ON part_affinity_pairs(part_b);

ALTER TABLE part_affinity_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affinity_read ON part_affinity_pairs;
CREATE POLICY affinity_read ON part_affinity_pairs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS affinity_write ON part_affinity_pairs;
CREATE POLICY affinity_write ON part_affinity_pairs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')));

COMMENT ON TABLE part_affinity_pairs IS 'Quan hệ gợi ý A↔B khi đặt hàng. Đối xứng, canonical part_a<part_b';
COMMENT ON COLUMN part_affinity_pairs.type IS 'mandatory=bắt buộc, recommended=khuyến nghị';
COMMENT ON COLUMN part_affinity_pairs.score IS '0-100, chỉ dùng cho type=recommended sort';
