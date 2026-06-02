-- Seed DEV cho phân hệ "Hàng về" — chạy SAU migration 020 + 021.
-- Mục đích: có dữ liệu thật để verify UI (real path) mà KHÔNG cần import 187k.
-- Idempotent (ON CONFLICT DO NOTHING). KHÔNG chạy trên production.
-- Dùng: psql "$DATABASE_URL" -f supabase/seed/execution_seed.sql  (hoặc Supabase SQL editor)

-- 1) Master map mã PT → NCC
INSERT INTO part_supplier_map (part_code, supplier) VALUES
  ('Z1140306256K', 'Mobis Korea'),
  ('Z414282N010',  'Mobis Korea'),
  ('Z96621R0000',  'Mobis Korea'),
  ('ABC123',       'Mobis India'),
  ('DEF456',       'Mobis India'),
  ('DENSO0001',    'Denso')
ON CONFLICT (part_code) DO NOTHING;

-- 2) Đơn NCC (id cố định để FK + re-run idempotent)
INSERT INTO supplier_orders
  (id, source, po_region_no, po_date, region, order_type, ship_method, supplier, external_order_ref, ordered_at, supplier_confirmed_at, stage) VALUES
  ('11111111-1111-1111-1111-111111110001','imported','EPCBB23010501','2026-05-02','Miền Bắc','KHAN','AIR','Mobis Korea','A26VBW3AAE','2026-05-03','2026-05-04','S8_RECEIVED'),
  ('11111111-1111-1111-1111-111111110002','imported','VORBB23020110','2026-05-10','Miền Bắc','DU_TRU','SEA','Mobis Korea','A26VBW9KZ1','2026-05-11','2026-05-12','S6_ETA'),
  ('11111111-1111-1111-1111-111111110005','imported','VORBB23040301','2026-04-20','Miền Bắc','DU_TRU','SEA','Mobis Korea','A26VBW7QX2','2026-04-21','2026-04-22','S7_CUSTOMS')
ON CONFLICT (source, po_region_no, supplier) DO NOTHING;

-- 3) Dòng PT
INSERT INTO order_lines
  (id, supplier_order_id, part_code_old, part_code, name_vi, name_en, unit, car_model, group_name, qty_ordered, unit_price) VALUES
  ('22222222-2222-2222-2222-222222220001','11111111-1111-1111-1111-111111110001','_','Z1140306256K','BU LÔNG','BOLT','CÁI','RIO 2012','MÁY GẦM ĐIỆN',15,0.05),
  ('22222222-2222-2222-2222-222222220002','11111111-1111-1111-1111-111111110001',NULL,'Z414282N010','ĐỆM CHỮ O','O-RING','CÁI','MQ4','MÁY GẦM ĐIỆN',7,0.44),
  ('22222222-2222-2222-2222-222222220003','11111111-1111-1111-1111-111111110002',NULL,'Z96621R0000','CÒI ĐIỆN','HORN','CÁI','CARNIVAL','ĐỒNG SƠN',4,11.88),
  ('22222222-2222-2222-2222-222222220005','11111111-1111-1111-1111-111111110005',NULL,'Z1140306256K','BU LÔNG','BOLT','CÁI','RIO','MÁY GẦM ĐIỆN',200,0.05)
ON CONFLICT (supplier_order_id, part_code) DO NOTHING;

-- 4) Lô về (so-1 đủ; so-2 chưa về; so-5 giao thiếu → còn nợ + trễ)
INSERT INTO receipt_lots
  (id, order_line_id, invoice_no, invoice_date, etd_pol, eta_pod, port, expected_wh_date, actual_wh_date, warehouse, qty_received) VALUES
  ('33333333-3333-3333-3333-333333330001','22222222-2222-2222-2222-222222220001','F3A00719','2026-05-08','2026-05-09','2026-05-12','HẢI PHÒNG','2026-05-15','2026-05-15','Kho Đài Tư',15),
  ('33333333-3333-3333-3333-333333330002','22222222-2222-2222-2222-222222220002','F3A00719','2026-05-08','2026-05-09','2026-05-12','HẢI PHÒNG','2026-05-15','2026-05-15','Kho Đài Tư',7),
  ('33333333-3333-3333-3333-333333330003','22222222-2222-2222-2222-222222220003','F3B01200','2026-05-18','2026-05-20','2026-05-28','VICT HCM','2026-06-02',NULL,'Kho Sóng Thần',0),
  ('33333333-3333-3333-3333-333333330005','22222222-2222-2222-2222-222222220005','A-INV-501','2026-04-25','2026-04-27','2026-05-06','CÁT LÁI HCM','2026-05-10','2026-05-10','Kho Sóng Thần',120),
  ('33333333-3333-3333-3333-333333330006','22222222-2222-2222-2222-222222220005','A-INV-540','2026-05-12','2026-05-14','2026-05-22','CÁT LÁI HCM','2026-05-26',NULL,'Kho Sóng Thần',0)
ON CONFLICT (order_line_id, invoice_no) DO NOTHING;
