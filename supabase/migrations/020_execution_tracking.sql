-- Theo dõi thực thi đơn hàng & hàng về (2026-06-02)
-- 4 tầng: supplier_orders → order_lines → receipt_lots; part_supplier_map cho tách NCC.

CREATE TABLE IF NOT EXISTS part_supplier_map (
    part_code TEXT PRIMARY KEY,      -- mã PT mới đã normalize
    supplier  TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('v16','imported','manual')),
    v16_approval_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
    po_region_no TEXT,
    po_date DATE,
    region TEXT,
    order_type TEXT CHECK (order_type IN ('DU_TRU','KHAN')),
    ship_method TEXT CHECK (ship_method IN ('AIR','SEA')),
    supplier TEXT NOT NULL,
    external_order_ref TEXT,
    ordered_at DATE,
    supplier_confirmed_at DATE,
    stage TEXT NOT NULL DEFAULT 'S1_SPLIT' CHECK (stage IN (
        'S0_PENDING_SPLIT','S1_SPLIT','S2_ORDERED','S3_SUPPLIER_CONFIRMED','S4_INVOICED',
        'S5_ETD','S6_ETA','S7_CUSTOMS','S8_RECEIVED','S9_DONE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_so_supplier ON supplier_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_so_stage ON supplier_orders(stage);
CREATE INDEX IF NOT EXISTS idx_so_extref ON supplier_orders(external_order_ref);
CREATE INDEX IF NOT EXISTS idx_so_po ON supplier_orders(po_region_no);
CREATE INDEX IF NOT EXISTS idx_so_created_at ON supplier_orders(created_at, id); -- keyset/range pagination

CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_order_id UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
    part_code_old TEXT,
    part_code TEXT NOT NULL,
    name_vi TEXT, name_en TEXT, unit TEXT, car_model TEXT, group_name TEXT,
    qty_ordered INTEGER NOT NULL DEFAULT 0,   -- phụ tùng rời rạc
    unit_price NUMERIC(14,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ol_order ON order_lines(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_ol_part ON order_lines(part_code);

CREATE TABLE IF NOT EXISTS receipt_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_line_id UUID NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
    invoice_no TEXT, invoice_date DATE, etd_pol DATE, eta_pod DATE,
    port TEXT, expected_wh_date DATE, actual_wh_date DATE, warehouse TEXT,
    qty_received INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rl_line ON receipt_lots(order_line_id);
CREATE INDEX IF NOT EXISTS idx_rl_invoice ON receipt_lots(invoice_no);

-- Idempotency / natural keys (re-import & reconcile không nhân đôi):
CREATE UNIQUE INDEX IF NOT EXISTS uq_ol_order_part ON order_lines(supplier_order_id, part_code);
-- NULLS NOT DISTINCT (PG15+): lô không invoice cũng dedupe được; khớp onConflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rl_line_invoice ON receipt_lots(order_line_id, invoice_no) NULLS NOT DISTINCT;
-- Index TỔNG (không partial) để onConflict 'source,po_region_no,supplier' suy được (tránh 42P10).
CREATE UNIQUE INDEX IF NOT EXISTS uq_so_natural ON supplier_orders(source, po_region_no, supplier) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS import_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier TEXT,
    filename TEXT,
    rows_total INT, rows_matched INT, rows_new INT, rows_unmatched INT,
    imported_by UUID REFERENCES profiles(id),
    imported_at TIMESTAMPTZ DEFAULT now(),
    note TEXT
);

-- RLS: đọc cho mọi user đã đăng nhập; ghi cho admin/planner (như các bảng khác).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['part_supplier_map','supplier_orders','order_lines','receipt_lots','import_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT TO authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON %I;', t, t);
    -- (SELECT auth.uid()) → planner đánh giá 1 lần (initPlan), không lặp mỗi dòng.
    EXECUTE format($f$CREATE POLICY %I_write ON %I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin','planner')))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin','planner')));$f$, t, t);
  END LOOP;
END $$;
