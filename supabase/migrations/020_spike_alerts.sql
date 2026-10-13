-- Cảnh báo đột biến hằng tuần (2026-10-12)
-- Nguồn: proc SQL usp_WeeklySpikeAlert (apg-data/deploy/weekly-spike-alert) → CSV → app nạp.
-- spike_alerts: số liệu từng tuần (planner/admin nạp, nạp lại cùng tuần thì thay thế).
-- spike_alert_notes: kết luận của bộ phận đặt hàng; bảng riêng để nạp lại CSV không xoá ghi chú.

CREATE TABLE IF NOT EXISTS spike_alerts (
    week_end DATE NOT NULL,
    item_code TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('ABOVE', 'NEW')),
    qty_28d NUMERIC NOT NULL,
    qty_7d NUMERIC NOT NULL,
    normal_28d NUMERIC NOT NULL,
    ratio NUMERIC,
    unit_cost NUMERIC,
    excess_value NUMERIC,
    brand_group TEXT,  -- nhóm hãng (OGroupName) bán nhiều nhất trong 28 ngày; tin Zalo chia theo cột này
    upload_batch UUID NOT NULL,  -- mã lần nạp: nạp lại tuần → xoá dòng không thuộc lần nạp mới (không dựa giờ máy client)
    uploaded_by UUID REFERENCES profiles(id),
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (week_end, item_code)
);

CREATE INDEX IF NOT EXISTS idx_spike_alerts_week ON spike_alerts(week_end DESC);

ALTER TABLE spike_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spike_alerts_read ON spike_alerts;
CREATE POLICY spike_alerts_read ON spike_alerts
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS spike_alerts_write ON spike_alerts;
CREATE POLICY spike_alerts_write ON spike_alerts
    FOR ALL TO authenticated
    USING ((SELECT public.current_user_role()) IN ('admin', 'super_admin', 'planner'))
    WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'super_admin', 'planner'));

CREATE TABLE IF NOT EXISTS spike_alert_notes (
    week_end DATE NOT NULL,
    item_code TEXT NOT NULL,
    conclusion TEXT CHECK (conclusion IN ('one_off', 'real_increase', 'project')),
    dealer_code TEXT CHECK (char_length(dealer_code) <= 50),
    action TEXT CHECK (action IN ('urgent_order', 'branch_transfer', 'none')),
    note TEXT CHECK (char_length(note) <= 1000),
    updated_by UUID REFERENCES profiles(id),
    -- Tên lưu kèm vì RLS profiles (009) chỉ cho đọc hồ sơ của chính mình → không embed được tên người khác.
    -- updated_by / updated_by_name / updated_at do trigger điền phía server, client không tự khai được.
    updated_by_name TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (week_end, item_code)
);

ALTER TABLE spike_alert_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.spike_note_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.week_end <> OLD.week_end OR NEW.item_code <> OLD.item_code) THEN
    RAISE EXCEPTION 'Không được đổi tuần / mã của ghi chú';
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := (SELECT full_name FROM profiles WHERE id = auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.spike_note_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_spike_note_stamp ON spike_alert_notes;
CREATE TRIGGER trg_spike_note_stamp BEFORE INSERT OR UPDATE ON spike_alert_notes
    FOR EACH ROW EXECUTE FUNCTION public.spike_note_stamp();

DROP POLICY IF EXISTS spike_notes_read ON spike_alert_notes;
CREATE POLICY spike_notes_read ON spike_alert_notes
    FOR SELECT TO authenticated USING (true);

-- Mọi người dùng đăng nhập (đặt hàng, sales) được ghi kết luận cho cảnh báo có thật; updated_by phải là chính mình.
-- Ai cũng sửa được ghi chú của nhau (cùng một nhóm làm việc); người sửa cuối được ghi lại.
DROP POLICY IF EXISTS spike_notes_insert ON spike_alert_notes;
CREATE POLICY spike_notes_insert ON spike_alert_notes
    FOR INSERT TO authenticated WITH CHECK (
        (SELECT public.current_user_role()) IS NOT NULL  -- tài khoản còn hoạt động
        AND EXISTS (SELECT 1 FROM spike_alerts a WHERE a.week_end = spike_alert_notes.week_end
                    AND a.item_code = spike_alert_notes.item_code)
    );

DROP POLICY IF EXISTS spike_notes_update ON spike_alert_notes;
CREATE POLICY spike_notes_update ON spike_alert_notes
    FOR UPDATE TO authenticated
    USING ((SELECT public.current_user_role()) IS NOT NULL)
    WITH CHECK ((SELECT public.current_user_role()) IS NOT NULL);

COMMENT ON TABLE spike_alerts IS 'Cảnh báo đột biến tuần: bán 28 ngày ≥ 1.5× mức thường (AvgQty12M) và vượt ≥ 20 đv; NEW = mã chưa có lịch sử 12 tháng';
COMMENT ON COLUMN spike_alerts.week_end IS 'Ngày cuối cửa sổ 28 ngày (ngày đơn cuối đã nạp)';
COMMENT ON TABLE spike_alert_notes IS 'Kết luận của bộ phận đặt hàng cho từng cảnh báo (loại đơn, mã đại lý, hành động)';
COMMENT ON COLUMN spike_alert_notes.conclusion IS 'one_off=đơn lớn một lần, real_increase=tăng thật, project=dự án/chiến dịch';
COMMENT ON COLUMN spike_alert_notes.action IS 'urgent_order=đặt khẩn, branch_transfer=điều chuyển chi nhánh, none=không làm gì';
