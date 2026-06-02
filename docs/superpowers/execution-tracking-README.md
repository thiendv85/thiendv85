# Phân hệ "Hàng về" — Theo dõi thực thi đơn hàng (Execution Tracking)

Theo dõi vòng đời mua hàng sau khi đơn V16 được duyệt: tách theo NCC → đặt trên app NCC → invoice → ETD → ETA → thông quan → về kho, đến mức **dòng PT** và **từng lô** (giao nhiều đợt + tồn nợ).

Spec: [specs/2026-06-02-ncc-order-execution-tracking-design.md](specs/2026-06-02-ncc-order-execution-tracking-design.md) ·
Plan lõi: [plans/2026-06-02-execution-tracking-phase1.md](plans/2026-06-02-execution-tracking-phase1.md) ·
Plan UI: [plans/2026-06-02-execution-ui-plan.md](plans/2026-06-02-execution-ui-plan.md)

## Kiến trúc

```
Đơn duyệt V16 (ApprovalRequest) ─ tách theo NCC ─▶ supplier_orders ─▶ order_lines ─▶ receipt_lots
                                  (part_supplier_map)                              (giao nhiều đợt)
```

| Lớp | File |
|---|---|
| Kiểu | `types/execution.ts` |
| Engine thuần (TDD) | `utils/execution/{normalize,split,outstanding,stateMachine,forecast,importMap,fromApproval,summary}.ts` |
| Data-access | `utils/supabase/execution.ts` |
| Schema | `supabase/migrations/020_execution_tracking.sql`, `021_execution_summary_view.sql` |
| Import lịch sử | `scripts/import-execution-history.mjs` |
| UI | `pages/ExecutionTracking.tsx` (tabs) · `components/ExecutionOrderDetail.tsx` · `components/ExecutionSplitModal.tsx` · `components/execution/*` |
| Dữ liệu giả | `utils/execution/mockData.ts` |

## Trạng thái (S0–S9)
Chờ tách → Đã tách → Đã đặt NCC → NCC xác nhận → Có invoice → ETD → ETA → Thông quan → Về kho → Hoàn tất.
Trạng thái đơn = bậc thấp nhất các dòng. Tồn nợ = Σ `GREATEST(đặt − nhận, 0)`.

## Cổng kiểm tra–phê duyệt
G1 duyệt tách NCC (chặn khi còn unmapped) · G4 đối chiếu 3 chiều (đặt/invoice/nhận) · "Đóng đơn" khoá khi còn nợ. (G2/G3/G6 ở giai đoạn import/automation.)

## Chạy

### Demo bằng dữ liệu giả (không cần DB)
```
# .env.local
VITE_EXECUTION_MOCK=1
```
`npm run dev` → menu **"Hàng về"**. Tabs: Pipeline · Dashboard & KPI · Nhập từ NCC. (Cần đăng nhập dev — app gate qua LoginScreen.)

### Dữ liệu thật
1. Áp migration: `020_execution_tracking.sql` rồi `021_execution_summary_view.sql` (Supabase — dev/branch trước).
2. Nạp nhanh để verify: `supabase/seed/execution_seed.sql` (vài đơn mẫu, idempotent).
   — hoặc nạp lịch sử đầy đủ: `npx tsx scripts/import-execution-history.mjs "<file.xlsx>"` (cần `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
3. Cung cấp `part_supplier_map` (mã PT → NCC) để tách tự động.
4. Bỏ `VITE_EXECUTION_MOCK` (hoặc =0).

## KPI (mục tiêu đề xuất — cần Ban duyệt)
Đúng hẹn ≥90% · fill-rate đợt đầu ≥85% · đơn còn nợ ≤10% · tuổi nợ TB ≤30 ngày · lead-time trung vị (AIR/SEA) · giá trị đang về.

## Tái dùng V16
supersession (đổi mã), `normalizePartCode`, `calendar` (ngày làm việc), `supplierAnomaly`, phê duyệt đa cấp + audit, `selectAllPaginated`, `@tanstack/react-virtual`.

## Còn lại (runtime / dữ liệu — ngoài code)
Áp 020/021 + seed/import lên Supabase live · `part_supplier_map` thật · verify browser (auth) · adapter import từng NCC (~10, GĐ sau) · push/PR branch `feat/execution-tracking-phase1`.

## Kiểm thử
`npx vitest run execution` (52 test engine) · `npx tsc --noEmit` (0) · `npm run build` (✓) · `npm run lint` (0 cho file phân hệ).
