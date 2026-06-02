# Thiết kế: Theo dõi thực thi đơn hàng & hàng về (NCC Order Execution Tracking)

- **Ngày:** 2026-06-02
- **Trạng thái:** Đã chốt thiết kế, chờ lập plan triển khai
- **Phạm vi:** Module mới trong app V16 (atp-v16), nối tiếp luồng Ordering/Approval sẵn có

---

## 1. Bối cảnh & vấn đề

Sau khi một **draft order được duyệt** trên V16, có một **bộ phận thực thi (đội mua)** làm việc **riêng biệt** để mua hàng về. Hiện họ theo dõi bằng một file Excel (`Kế hoạch chi tiết`, ~187.170 dòng, 30 cột, dữ liệu PO từ 2023-01 đến 2026-12). File này gộp 2 phía:

- **Phía đặt hàng (cột 1–16):** Số PO miền, ngày PO, miền, loại đơn (Dự trữ/Khẩn), phương thức (AIR/SEA), mã PT cũ/mới, tên VI/EN, ĐVT, số lượng, đơn giá NCC, thành tiền, loại xe, nhà cung cấp.
- **Phía thực thi (cột 17–30):** ngày đặt NCC, số đơn NCC, NCC xác nhận, số/ngày invoice, ETD POL, ETA POD, cảng đến, dự kiến về kho, ngày về kho thực tế, kho, trạng thái, thời gian NCC nợ, phân nhóm.

**Vấn đề:**
- Quy trình thực thi có **nhiều công đoạn chờ xác nhận** (bất đồng bộ): đặt → NCC xác nhận → invoice → giao → đến VN → thông quan → về kho.
- Một đơn duyệt có thể chứa **nhiều NCC** → phải **tách theo NCC**, mỗi NCC đội mua theo dõi **riêng**.
- NCC **có app riêng** (≈10 NCC, mỗi NCC một biểu mẫu export khác nhau). Đội mua đặt hàng trên app NCC rồi **load/export dữ liệu từ app NCC để import vào V16** cập nhật tiến độ.
- Một đơn NCC thường **về nhiều đợt** (giao thiếu, phần còn lại "NCC nợ" về sau).

**Mục tiêu:** Xây **module trong V16** thay thế file Excel, nối liền với Ordering/Approval, theo dõi vòng đời thực thi đến mức lô giao, và dùng dữ liệu lịch sử làm nền phân tích.

### Quyết định đã chốt (brainstorming)
| # | Quyết định |
|---|-----------|
| Hình thái | Module **trong V16** (không phải tool rời) |
| Nhập liệu | **Kết hợp**: import từ export app NCC (chính) + nhập/sửa tay (phụ) |
| Phạm vi v1 | **Cả hai**: bảng vận hành + dashboard phân tích → chia nhiều giai đoạn |
| Liên kết | **Lai**: tự sinh từ draft V16 đã duyệt khi có + cho import/nhập tay đơn ngoài + toàn bộ 187k lịch sử |
| Gán NCC | **Mã PT có NCC cố định** (master mapping) → tách tự động |
| Giao nhiều đợt | **Có** — theo dõi đến mức dòng + lô, có SL nhận từng đợt và tồn nợ |
| Khoá khớp import | Khai báo **theo từng NCC** (cung cấp sau) → core phải NCC-agnostic |

---

## 2. Phát hiện từ dữ liệu thật (187.170 dòng)

- **Trạng thái** (4): Đã nhập kho 179.349 (96%) · Chưa invoice 4.012 · Đang thông quan 1.922 · Đã có invoice, có lịch về 1.887. → ~96% là lịch sử; phần "sống" cần theo dõi ≈ 7.800 dòng.
- **Đơn NCC** (Số đơn hàng đặt NCC): 3.077 distinct; **1.661 (54%) có >1 invoice**, 1.642 có >1 ETA → giao nhiều đợt là bình thường.
- **PO miền → đơn NCC**: 2.816 PO; **267 (~10%) tách thành >1 NCC** (tối đa 6/PO). (KIA hầu hết Mobis nên phần lớn 1 NCC, nhưng model phải đỡ nhiều NCC cho brand khác.)
- **Loại đơn**: Dự trữ 165k · Khẩn ~22k.
- **NCC** (trong file KIA): Mobis Korea 186.970 · Mobis India 200.
- **Cột "NCC nợ"** chỉ điền 2% (4.012) — trùng nhóm "Chưa invoice" → field aging dành cho phần chưa giao/nợ.
- **Mã PT cũ** chỉ điền 49% → đổi mã (supersession) phổ biến.
- **Lỗi chất lượng dữ liệu cần chuẩn hoá khi import:** AIR/Air, SEA/Sea/sea; Khẩn/KHẨN; tên cảng nhiều biến thể (HẢI PHÒNG, VICT HCM, Cát Lái HCM…); phân nhóm typo (ĐỒNG/ĐỐNG SƠN).

---

## 3. Mô hình dữ liệu (Hướng A — phân cấp 4 tầng)

```
Đơn duyệt V16 (ApprovalRequest đã duyệt / nguồn ngoài)
  └─ Đơn NCC (Supplier Sub-Order)        ← tách theo NCC; đơn vị công việc của đội mua
       └─ Dòng PT (Order Line)            ← 1 mã PT, SL đặt
            └─ Lô về (Receipt Lot)        ← từng đợt giao: invoice/ETD/ETA/về kho/SL nhận
```

Tồn nợ theo dòng = `SL đặt − Σ SL nhận các lô`. State machine ở tầng **Đơn NCC**; mốc invoice/ETD/ETA/về kho gắn ở tầng **Lô**.

**Lý do chọn A:** là cách duy nhất biểu diễn đúng đồng thời (a) tách theo NCC, (b) đội mua theo dõi riêng 1 đơn-NCC như 1 đơn vị, (c) giao nhiều đợt + nợ — mà không mất lịch sử lô. (Phương án B "sổ phẳng như Excel" và C "không có tầng Lô" đều làm mờ lịch sử nhiều invoice/ETA của 1.661 đơn.)

### Thực thể & trường (canonical schema)

**SupplierOrder (Đơn NCC)**
- id, nguồn (`v16_approval_id` nullable | `imported` | `manual`)
- số PO miền, ngày PO, miền, loại đơn (Dự trữ/Khẩn — chuẩn hoá), phương thức (AIR/SEA — chuẩn hoá)
- NCC, **khoá ngoài** (external_order_ref — mã đơn trên app NCC; bind ở S2)
- trạng thái (state machine §4), cờ ngoại lệ
- thời điểm các mốc cấp đơn (đặt NCC, NCC xác nhận)

**OrderLine (Dòng PT)**
- id, supplier_order_id
- mã PT cũ, mã PT mới, tên VI, tên EN, ĐVT, loại xe, phân nhóm (chuẩn hoá)
- SL đặt, đơn giá NCC, thành tiền
- (dẫn xuất) Σ SL nhận, tồn nợ, thời gian NCC nợ (aging)

**ReceiptLot (Lô về)**
- id, order_line_id (hoặc supplier_order_id + mã PT)
- số invoice, ngày invoice, ETD POL, ETA POD, cảng đến (chuẩn hoá), dự kiến về kho, ngày về kho thực tế, kho, **SL nhận lô này**

> Lưu ý nối V16: draft đã duyệt nằm trong `ApprovalRequest.snapshot_data` (`quantities: {itemCode → {air, sea}}` + `inventory_context`). Khi liên kết, bung snapshot theo từng mã PT × phương thức → nhóm theo NCC (master) → sinh SupplierOrder + OrderLine.

---

## 4. Quy trình & State machine (theo từng Đơn NCC)

⏳ = công đoạn **chờ xác nhận** (gate bất đồng bộ).

| # | Trạng thái | Dữ liệu ghi | Ai | Nguồn dữ liệu | Chờ |
|---|-----------|-------------|----|----|-----|
| S0 | Chờ tách | đơn V16 vừa duyệt | hệ thống | V16 | — |
| S1 | Đã tách & gán NCC | nhóm dòng theo NCC cố định → sinh Đơn NCC | hệ thống | master mã PT→NCC | — |
| S2 | Đã đặt NCC | ngày đặt, **khoá ngoài** (mã đơn app NCC) | đội mua | nhập tay (bind) | ⏳ NCC xác nhận |
| S3 | NCC đã xác nhận | ngày NCC nhận đơn | đội mua | import NCC | ⏳ invoice |
| S4 | Có invoice | số/ngày invoice | — | import NCC | ⏳ giao |
| S5 | Đã giao cảng đi (ETD) | ETD POL | — | import NCC | ⏳ vận chuyển |
| S6 | Đến VN (ETA) | ETA POD, cảng đến | — | import NCC | ⏳ thông quan |
| S7 | Đang thông quan | mốc hải quan | đội mua | import/nhập tay | ⏳ giải phóng |
| S8 | Về kho (theo lô) | dự kiến/thực tế về kho, kho, **SL nhận lô** | kho | nhập tay/kho xác nhận | — |
| S9 | Hoàn tất / Còn nợ | Σnhận<đặt → tồn nợ, mở lô kế; đủ → đóng | hệ thống | dẫn xuất | vòng lặp S4/S8 cho lô sau |

**Trạng thái Đơn NCC = tổng hợp** trạng thái các lô/dòng (vd: còn dòng chưa đủ → "Còn nợ"). Mỗi **Lô** có tiến trình con riêng: invoice → ETD → ETA → thông quan → về kho.

**Ngoại lệ song song:** NCC chưa xác nhận quá ngưỡng · trễ ETA/dự kiến về kho · lô thiếu (tồn nợ) · dòng import không khớp khoá · đổi mã cũ→mới (tái dùng supersession sẵn có) · hủy/đóng đơn nợ treo lâu.

**Ánh xạ 4 trạng thái Excel → state machine (để import 187k lịch sử):** Chưa invoice→S2/S3 · Đã có invoice, có lịch về→S4/S5 · Đang thông quan→S6/S7 · Đã nhập kho→S8/S9.

---

## 5. Khung import đa-NCC (cốt lõi — 10 NCC, 10 biểu mẫu)

Một **pipeline import chuẩn**; mỗi NCC chỉ khai một **template** (xây dần, không sửa core):

- **Column map:** cột file NCC → trường canonical (§3).
- **Key map:** khoá khớp của NCC đó (mã đơn NCC / invoice+mã PT / PO miền+mã PT…) — *khai sau theo từng NCC*.
- **Status map:** trạng thái chữ của NCC → state machine §4.
- **Value normalize:** ngày, ĐVT, AIR/SEA, loại đơn, tên cảng, phân nhóm.

**Luồng import:** Upload file NCC → chọn NCC (nạp template) → **staging** (xem trước, soát lỗi/không khớp) → **reconcile** (khớp khoá; phát hiện dòng mới / cập nhật mốc / lô mới) → **commit** (cập nhật + ghi `import_log`, hỗ trợ undo).

**Bắt tay (handshake) S2:** khi đội mua đặt trên app NCC, ghi **khoá ngoài** vào Đơn NCC trong V16. Các lần import sau khớp tự động theo khoá ngoài (+ mã PT). Adapter mỗi NCC khai khoá ngoài là trường nào.

**Fallback khớp:** Số PO miền + mã PT khi thiếu khoá ngoài.

---

## 6. Vai trò & bàn giao

| Vai | Việc | Mốc |
|----|------|-----|
| Người duyệt V16 | duyệt draft | S0 |
| Điều phối đội mua | nhận đơn duyệt, xác nhận tách NCC | S1 |
| Cán bộ mua (theo NCC) | đặt trên app NCC, ghi khoá ngoài, import định kỳ, xử lý dòng không khớp, ngoại lệ | S2–S7 |
| Kho | xác nhận nhập, SL thực nhận/lô | S8 |
| Hệ thống | tách auto, tính tồn nợ, cảnh báo trễ, tổng hợp trạng thái | S1, S9 |

---

## 7. Phân tích (dashboard, GĐ3)

Tái dùng BackorderAnalytics/Pipeline/StockoutForecastWithLeadTime sẵn có. Chỉ số: lead-time thực tế (đặt→về kho) theo NCC/loại đơn/AIR-SEA; tỉ lệ đúng hẹn (thực tế vs dự kiến/ETA); aging tồn nợ NCC; giá trị đang treo theo trạng thái; fill-rate theo lô.

---

## 8. Phân kỳ triển khai (đề xuất)

- **GĐ1 — Lõi vận hành:** mô hình 4 tầng + tách-NCC (master mapping) + state machine + nhập/sửa tay + bảng pipeline (lọc đơn chưa nhập kho). → thay Excel cho đơn mới.
- **GĐ2 — Import:** khung import + template NCC đầu (Mobis Korea/India) + import 187k lịch sử + chuẩn hoá dữ liệu.
- **GĐ3 — Phân tích:** dashboard lead-time/đúng hẹn/aging/nợ.
- **GĐ4 — Mở rộng:** template các NCC còn lại + cảnh báo/automation.

---

## 9. Phạm vi loại trừ (YAGNI)

- Không tích hợp API trực tiếp với app NCC (chỉ import file export) — trừ khi NCC có API ở giai đoạn sau.
- Không thay hệ thống đặt hàng của NCC; V16 chỉ là lớp theo dõi + phân tích.
- Không xử lý thanh toán/công nợ tài chính (ngoài aging "NCC nợ" thuần theo dõi giao hàng).
- `back-order-dashboard/` (Next.js) không thuộc phạm vi này.

---

## 10. Mở (cần cung cấp sau)

- Biểu mẫu export thực tế + khoá khớp của từng NCC (≈10) → để khai template.
- Master mapping **mã PT → NCC** (nguồn? đã có bảng chưa, hay phải xây?).
- Danh sách kho hợp lệ + chuẩn tên cảng/phân nhóm cho bảng chuẩn hoá.
- Cách cấp/định dạng "Số PO miền" hiện tại (V16 có sinh không, hay gán khi gửi miền?).
