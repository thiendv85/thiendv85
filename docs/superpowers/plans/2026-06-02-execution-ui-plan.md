# Kế hoạch viết giao diện — Phân hệ "Hàng về" (Execution Tracking UI)

> Bổ trợ cho `2026-06-02-execution-tracking-phase1.md` (lõi + engine). Tài liệu này chia **giao diện** thành các giai đoạn, mỗi giai đoạn chạy & xem được nhờ **DỮ LIỆU GIẢ ĐỊNH** (không cần Supabase live / part_supplier_map / import).

## Dữ liệu giả định (đã có)

- `utils/execution/mockData.ts`: 6 đơn NCC phủ trạng thái S2/S4/S6/S7/S8/S9, đa lô (so-5 giao thiếu → còn nợ), `MOCK_PART_SUPPLIER_MAP` (3 NCC), `MOCK_APPROVAL_SNAPSHOT` (có mã mapped + 1 mã unmapped để demo Cổng G1).
- Bật bằng env Vite: thêm `VITE_EXECUTION_MOCK=1` vào `.env.local` → các hàm đọc trong `utils/supabase/execution.ts` trả mock, hàm ghi no-op. Tắt (bỏ env) → chạy Supabase thật. **Không ảnh hưởng production.**
- Verify mỗi giai đoạn: `VITE_EXECUTION_MOCK=1 npm run dev` → mở menu **"Hàng về"** → chụp màn hình.

> Lưu ý auth: app gate qua LoginScreen. Để xem nhanh chỉ UI, hoặc đăng nhập tài khoản dev, hoặc tạm thời render thẳng page (không commit) — không bypass auth trong code production.

---

## GĐ-UI-1 — Nền tảng & khung dữ liệu giả ✅ (đã làm trong phiên này)

- Mock fixture + cờ `EXECUTION_MOCK` + no-op ghi.
- Page `pages/ExecutionTracking.tsx` (bảng virtualize), `ExecutionSplitModal`, `ExecutionOrderDetail`, nav "Hàng về".
- **Done check:** `tsc` 0 lỗi, `npm run build` ✓.
- **Còn lại của GĐ này:** verify render bằng dev server + screenshot (mock).

## GĐ-UI-2 — Bảng pipeline hoàn chỉnh

**File:** `pages/ExecutionTracking.tsx`, `components/execution/StageBadge.tsx` (mới), `components/execution/ExecutionToolbar.tsx` (mới).

- Cột: PO miền · NCC · khoá NCC · **badge trạng thái có màu** (S2..S9) · phương thức (AIR/SEA chip) · ETA · **tồn nợ** · **tuổi nợ** · cảnh báo trễ (icon đỏ khi quá dự kiến).
- Bộ lọc: trạng thái (đang có), **NCC**, **phương thức**, **miền**, ô search (PO/khoá/mã). Đếm theo nhóm.
- Sort theo cột; header dính; giữ virtualize 187k.
- **Dữ liệu giả:** 6 đơn đủ trạng thái → thấy badge, nợ (so-5), trễ (so-2 ETA quá hạn so dự kiến).
- **Verify:** lọc "Đang chạy" ẩn S9; badge đúng màu; so-5 hiện tồn nợ; cuộn mượt.

## GĐ-UI-3 — Chi tiết đơn (drawer) + nhập tay

**File:** `components/ExecutionOrderDetail.tsx` (nâng cấp), `components/execution/LotTimeline.tsx` (mới).

- Bảng dòng PT: mã, tên, SL đặt, Σ nhận, **tồn nợ**, tuổi nợ.
- **Timeline lô** mỗi dòng: stepper S2→S4→S5→S6→S7→S8 theo mốc đã điền; nhiều lô xếp dọc.
- Form nhập tay: **S2** (khoá NCC + ngày đặt), **S7** (mốc thông quan), **S8** (ghi lô: invoice/ETA/ngày về/SL nhận/kho) → `recomputeOrderStage`.
- **Đối chiếu 3 chiều (G4):** cờ đỏ khi `Σ nhận > SL đặt` hoặc lệch invoice; chặn "đóng đơn" khi còn nợ.
- **Dữ liệu giả:** so-1 (đủ), so-5 (1 lô về + 1 lô đang chờ → nợ), so-3 (có invoice, chưa về).
- **Verify:** mở từng đơn, timeline đúng mốc; nhập 1 lô (mock no-op nhưng UI cập nhật optimistic/hiện thông báo).

## GĐ-UI-4 — Cổng G1: Tách & gán NCC

**File:** `components/ExecutionSplitModal.tsx` (nâng cấp).

- Xem trước nhóm theo NCC + tổng SL; vùng **unmapped** nổi bật.
- **Gán NCC tay cho mã unmapped** ngay trong modal (dropdown NCC) → cập nhật nhóm, nút xác nhận mở khi hết unmapped.
- Xác nhận → `persistSplit` (mock: báo số đơn/dòng).
- **Dữ liệu giả:** `MOCK_APPROVAL_SNAPSHOT` có `UNMAPPED99` → demo chặn + gán tay.
- **Verify:** mở modal (nút "Tách & gán NCC", nhập id bất kỳ khi mock) → thấy 2 NCC + 1 unmapped → gán → xác nhận.

## GĐ-UI-5 — Wizard import từ app NCC (khung UI, logic GĐ3)

**File:** `pages/execution/ImportWizard.tsx` (mới), `components/execution/ReconcileDiff.tsx` (mới).

- 4 bước: Tải file → chọn **NCC (template)** → **xem trước & soát** (dòng không khớp/giá trị bất thường) → **đối chiếu diff** (matched/cập nhật mốc/lô mới/không khớp) → ghi nhận (có nhật ký, undo).
- GĐ này chỉ dựng **khung UI + diff giả**; nối parser/template thật ở GĐ3 phần mềm.
- **Dữ liệu giả:** một diff mẫu (3 matched, 1 lô mới, 2 unmatched).
- **Verify:** đi hết 4 bước với dữ liệu giả.

## GĐ-UI-6 — Dashboard & KPI (GĐ2 phần mềm)

**File:** `pages/execution/ExecutionDashboard.tsx` (mới), tái dùng chart sẵn có (BackorderAnalytics/SalesHistoryChart patterns).

- **KPI cards:** đúng hẹn %, lead-time trung vị (AIR/SEA), fill-rate, tỉ lệ đơn nợ, tuổi nợ TB, giá trị đang về, khớp-import %.
- **Charts:** lead-time theo 6 chặng (bottleneck), aging buckets, giá trị treo theo trạng thái, **NCC scorecard**.
- Tính từ mock (sau là dữ liệu lịch sử đã import).
- **Verify:** số khớp công thức §9 spec trên tập mock; chart render.

---

## Thứ tự đề xuất & ước lượng

| GĐ | Nội dung | Trạng thái |
|---|---|---|
| UI-1 | Nền tảng + mock | ✅ xong |
| UI-2 | Bảng pipeline (lọc/sort/badge/summary) | ✅ xong |
| UI-3 | Chi tiết + LotTimeline + nhập tay + G4 | ✅ xong |
| UI-4 | Cổng G1 (gán NCC tay) | ✅ xong |
| UI-5 | Import wizard (khung) | ✅ xong |
| UI-6 | Dashboard & KPI | ✅ xong |

**Tất cả 6 GĐ UI đã hoàn thành** (tsc 0 · build ✓ · 52 test · lint 0). Còn verify browser (auth) + dữ liệu thật.

UI-2/3/4 độc lập → chia team chạy song song (mỗi GĐ file riêng, tránh đụng `App.tsx`/page gốc; tích hợp tuần tự). UI-5/6 sau.

## Nguyên tắc (karpathy)
- Mỗi component 1 trách nhiệm, file gọn; tái dùng `STAGE_LABEL`, engine `outstanding/forecast/stateMachine`, chart pattern sẵn có.
- Không thêm tính năng ngoài; không nuốt lỗi (mọi form ghi có try/catch + báo).
- Verify từng GĐ bằng mock + screenshot trước khi sang GĐ sau.

## Khi có dữ liệu thật
Tắt `VITE_EXECUTION_MOCK`, áp migration 020, nạp `part_supplier_map` + import 187k → cùng UI chạy dữ liệu thật, không sửa component.
