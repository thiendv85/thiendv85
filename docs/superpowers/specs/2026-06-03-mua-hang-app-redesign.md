# Thiết kế lại: Tách "Mua hàng" thành app riêng (P2P chuẩn) — 2026-06-03

- **Trạng thái:** Spec định hướng, chờ duyệt (chưa code)
- **Lý do:** Bản hiện tại (module trong V16) bị đánh giá quá đơn giản. Đổi hướng: Mua hàng = **app riêng** cho **đội mua** (nhóm user riêng), nâng quy trình lên chuẩn procurement chuyên nghiệp (Coupa/Ariba/Precoro/Odoo).

## 1. Kiến trúc 2 app, chung dữ liệu

```
                 Supabase (1 project — chung DB, chung auth)
        ┌──────────────────────────┴──────────────────────────┐
   App "Kế hoạch Đặt Hàng" (V16 hiện tại)        App "Mua hàng" (MỚI, repo/deploy riêng)
   - planner: phân tích tồn kho, tạo+duyệt draft   - buyer/đội mua: thực thi P2P
        │  ghi: approved orders, part_supplier_map      │  đọc: approved orders + master
        └──────────────── chia sẻ dữ liệu ─────────────┘  ghi: PO/ASN/GRN/Invoice/Exception
```

- **App riêng hoàn toàn:** project + deploy riêng (như `back-order-dashboard`). Chung Supabase. Types/engine dùng chung qua **package shared** (`@atp/procurement-core`: `types/execution`, `utils/execution/*`) — publish nội bộ hoặc git submodule, tránh copy lệch.
- **Login auto theo role:** Supabase auth chung. `profile.role`/group → `planner` | `buyer` | cả hai. App Mua hàng chỉ cho `buyer`/admin; planner vào bị chặn. User có cả 2 quyền → nút "Chuyển sang Kế hoạch/Mua hàng" (link sang deploy kia, chung session Supabase).
- **Chia sẻ dữ liệu (chỉ qua Supabase, không gọi nhau trực tiếp):**
  - Mua hàng ĐỌC: `approval_requests` (đã duyệt), `part_supplier_map`, master mã PT.
  - Mua hàng GHI: bảng procurement riêng (mục §3).
  - V16 ĐỌC lại: trạng thái hàng về (qua view tổng hợp) để hiện ở dashboard kế hoạch.
  - Phân tách bằng **RLS theo role** + schema riêng (vd schema `procurement`).

## 2. Nâng quy trình lên chuẩn P2P (khắc phục "quá đơn giản")

Vòng đời đầy đủ (đội mua):
```
PO (từ đơn duyệt V16, tách theo NCC)
  -> NCC Acknowledge
    -> ASN (NCC báo lô gửi: container/ETD/ETA/packing)
      -> GRN + QC (nhận: SL nhận/từ chối, ảnh lỗi, short/excess, partial)
        -> Invoice
          -> 3-WAY MATCH (PO x GRN x Invoice, theo dòng, có tolerance)
            -> matched(auto) | Exception(routing+SLA)
              -> Duyệt invoice -> sẵn sàng thanh toán -> Đóng đơn
```

Bổ sung so với bản cũ:
| Mục | Mới |
|---|---|
| **ASN** | NCC báo lô gửi trước -> visibility chủ động (thực thể mới) |
| **GRN + QC** | Nhận có kiểm: SL nhận/từ chối, lý do, **ảnh lỗi**, short/excess, partial |
| **3-way match engine** | So PO/GRN/Invoice theo dòng + **tolerance** -> auto-approve low-risk / exception |
| **Exception module** | Phân loại (thiếu/dư/lệch giá/trễ/hư/đổi mã/thiếu ASN/customs-hold/không khớp), **owner + SLA/TAT**, trạng thái resolve, audit |
| **Supplier scorecard** | OTIF% · lead-time · tỉ lệ lỗi · TG xác nhận · fill-rate · aging nợ |
| **Invoice block / payment-ready** | Chặn thanh toán đến khi match xong; duyệt theo **ngưỡng giá trị** (tái dùng phê duyệt đa cấp V16) |
| **Status theo dòng** giàu | Acknowledged · In-transit · Customs-hold · Partially-received · Blocked · Short · Over · Closed |
| **Document-chain audit** | PO->ASN->GRN->Invoice->Match, immutable, 7-năm |
| **KPI mở rộng** | first-time match rate · OTIF · PO cycle time · exception rate theo nhóm · DPO |

## 3. Mô hình dữ liệu (procurement schema)

```
purchase_order (PO)        <- từ approved draft, tách theo NCC
  order_line               <- mã PT, SL đặt, giá, tolerance
    asn                    <- lô gửi NCC báo trước (carrier, container, ETD/ETA)
    grn                    <- phiếu nhận (qty_received, qty_rejected, qc_result, defect_photo, short/excess)
    invoice_line           <- dòng invoice (qty, price, tax)
    match_result           <- kết quả 3-way (status, variance_qty/price, tolerance_ok)
exception                  <- typed, owner, SLA, status, audit, link tới line/grn/invoice
supplier_scorecard (view)  <- OTIF/lead-time/defect/ack/fill/aging
audit_log                  <- chuỗi sự kiện bất biến
```
Tái dùng từ bản đã build: `supplier_orders`->`purchase_order`, `order_lines`, `receipt_lots`->tách `asn`+`grn`, `reconcile.ts`->nâng thành match engine có tolerance, `AlertsPanel`->exception module.

## 4. Tái dùng code đã có
- Engine thuần (normalize/split/outstanding/stateMachine/forecast/summary/reconcile/importAdapter) + bảng TanStack + components execution -> **chuyển thành lõi app Mua hàng** (đưa vào package shared + app shell mới).
- Migration 020/021 -> mở rộng thành procurement schema (thêm asn/grn/qc/invoice/match/exception/scorecard).

## 5. Phân kỳ
- **P0 — Tách app:** dựng project Mua hàng riêng + shared package + auth role-route + bê lõi execution-tracking sang. (App chạy = ngang bản hiện tại nhưng đứng riêng.)
- **P1 — ASN + GRN/QC:** 2 thực thể mới + UI nhận hàng có kiểm + ảnh lỗi + short/excess.
- **P2 — 3-way match + Exception:** match engine tolerance + exception workflow (owner/SLA/audit).
- **P3 — Supplier scorecard + KPI mở rộng + duyệt theo ngưỡng + document-chain.**

## 6. Mở (cần chốt khi build)
- Stack app Mua hàng: Vite+React (đồng bộ V16) hay Next (như back-order-dashboard)? -> đề xuất **Vite+React** để tái dùng trực tiếp.
- Cơ chế shared types: npm package nội bộ / git submodule / monorepo workspace.
- Domain/deploy: 2 Vercel project (vd `muahang.atp...` riêng).
- `part_supplier_map` + biểu mẫu export từng NCC (vẫn cần dữ liệu thật).
- Branch hiện tại `feat/execution-tracking-phase1`: giữ làm nền tái dùng (không bỏ).
