-- View tổng hợp cấp đơn cho bảng pipeline "Hàng về" (2026-06-02)
-- Tránh N+1 trên ~3k đơn: 1 query thay vì load lines+lots từng đơn.
-- security_invoker=true → áp RLS của người gọi (PG15+), không bypass.

CREATE OR REPLACE VIEW supplier_order_summary
WITH (security_invoker = true) AS
WITH line_recv AS (
    SELECT ol.id AS line_id,
           ol.supplier_order_id,
           ol.qty_ordered,
           COALESCE(SUM(rl.qty_received), 0) AS received
    FROM order_lines ol
    LEFT JOIN receipt_lots rl ON rl.order_line_id = ol.id
    GROUP BY ol.id, ol.supplier_order_id, ol.qty_ordered
),
ord_out AS (
    -- tồn nợ = Σ theo dòng GREATEST(đặt − nhận, 0) (khớp computeOutstanding)
    SELECT supplier_order_id,
           SUM(GREATEST(qty_ordered - received, 0)) AS outstanding
    FROM line_recv
    GROUP BY supplier_order_id
),
open_lots AS (
    -- mốc sớm nhất của lô CHƯA về (actual_wh_date IS NULL)
    SELECT ol.supplier_order_id,
           MIN(rl.eta_pod) FILTER (WHERE rl.actual_wh_date IS NULL) AS eta,
           MIN(rl.expected_wh_date) FILTER (WHERE rl.actual_wh_date IS NULL) AS expected_wh
    FROM order_lines ol
    JOIN receipt_lots rl ON rl.order_line_id = ol.id
    GROUP BY ol.supplier_order_id
)
SELECT so.id                                   AS supplier_order_id,
       COALESCE(oo.outstanding, 0)             AS outstanding,
       opl.eta                                 AS eta,
       (CURRENT_DATE - so.ordered_at)          AS aging_days,
       (so.stage <> 'S9_DONE'
        AND opl.expected_wh IS NOT NULL
        AND opl.expected_wh < CURRENT_DATE)     AS is_late
FROM supplier_orders so
LEFT JOIN ord_out oo  ON oo.supplier_order_id = so.id
LEFT JOIN open_lots opl ON opl.supplier_order_id = so.id;
