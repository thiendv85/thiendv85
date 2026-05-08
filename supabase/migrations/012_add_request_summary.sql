-- 012: Tổng quan đơn hàng dạng JSONB để hiển thị KPI ở list view
--   skuCount   : số SKU thực sự đặt (qty > 0)
--   totalQty   : tổng số lượng hàng hóa (Air + Sea)
--   totalValue : giá trị đơn hàng (VND, dựa trên unitCost của snapshot)
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Index nhẹ để truy vấn theo brand + status + summary nhanh hơn nếu cần dashboard
CREATE INDEX IF NOT EXISTS idx_approval_requests_summary_skucount
  ON approval_requests USING btree ((summary->>'skuCount'));
