# 📘 CẨM NANG VẬN HÀNH HỆ THỐNG ATP SUPPLY CHAIN (V14)

Chào mừng bạn đến với hệ thống Quản trị Tồn kho Phụ tùng ô tô Thông minh (Executive Intelligence). Tài liệu này sẽ hướng dẫn bạn cách vận hành hệ thống để tối ưu hóa dòng vốn và đảm bảo khả năng cung ứng.

---

## 📸 1. KHỞI ĐỘNG & ĐĂNG NHẬP

Hệ thống yêu cầu xác thực để bảo mật dữ liệu kinh doanh.

![Trang Đăng Nhập](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/login_page_1775101599365.png)

- **Tài khoản**: Email công ty đã được cấp quyền.
- **Mật khẩu**: Tối thiểu 6 ký tự.
- **Giao diện**: Sau khi đăng nhập thành công, bạn sẽ được đưa đến màn hình **Tổng quan**.

---

## 📊 2. QUY TRÌNH KIỂM TRA HÀNG HÓA HÀNG NGÀY (DAILY CHECK)

Đây là công việc quan trọng nhất mỗi buổi sáng để phát hiện sớm rủi ro đứt hàng.

### 2.1. Theo dõi các chỉ số KPI Sức khỏe Kho
Màn hình **Tổng quan** cung cấp 4 thẻ chỉ số chiến lược:

![KPI Dashboard](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_dashboard_full_1775101849425.png)

1.  **DOANH SỐ VỐN (COGS)**: Hiệu suất bán hàng lũy kế 12 tháng.
2.  **TỒN KHO HIỆN HỮU (OH)**: Giá trị hàng thực tế tại kho.
3.  **HÀNG ĐANG VỀ (PO)**: Giá trị hàng đã đặt nhưng chưa nhập kho.
4.  **GIÁ TRỊ DƯ THỪA (EXCESS)**: Hàng tồn vượt định mức cần giải phóng vốn.

### 2.2. Kiểm tra hàng ĐỨT TRỌNG ĐIỂM
Sử dụng thanh **SMART FILTERS** và nhấn vào **Stockout (Trọng điểm)**:

![Smart Filters](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_bo_radar_1775102283289.png)

- Hệ thống sẽ lọc ra các mã hàng thuộc nhóm **LOIS 1, 2, 3** (Hàng bán chạy) đang bị thiếu hụt.
- Nhấn **XEM NGAY** ở thanh cảnh báo đỏ để xử lý ngay danh sách này.

---

## 🏗️ 3. MA TRẬN CUNG ỨNG CHIẾN LƯỢC

Giúp bạn phân loại hàng hóa theo mức độ quan trọng và trạng thái tồn kho.

![Ma Trận Cung Ứng](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_strategic_matrix_1775101856783.png)

- **Hàng Regular (L1-L5)**: Luôn cần duy trì tồn kho ổn định.
- **Cột MOS (Month of Stock)**: Cho biết kho còn đủ dùng trong bao lâu. Nếu cột này có màu đỏ, bạn cần lên kế hoạch đặt hàng ngay.

---

## 📦 4. QUY TRÌNH LẬP KẾ HOẠCH ĐẶT HÀNG (ORDERING)

Truy cập tab **MUA HÀNG** để thực hiện lập kế hoạch.

### 4.1. Sử dụng Ordering Workbench
![Ordering Workbench](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_ordering_bench_1775101893839.png)

- **Stock Health**: Thanh tiến độ trực quan cho biết vị trí tồn kho hiện tại so với ROP (Điểm đặt hàng) và MAX (Tồn tối đa).
- **Debt Status**: Hiển thị trạng thái nợ đơn (Backorder) và khả năng bù đắp từ hàng đang về.

### 4.2. Mô phỏng & Chốt dự thảo
Bạn có thể nhập số lượng vào cột **AIR (Bù nợ)** hoặc **SEA (Regular)**:

![Mô phỏng Đặt hàng](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_simulation_lab_1775102093359.png)

- Hệ thống sẽ tự động tính toán **Thành tiền** và cập nhật **Tổng giá trị dự thảo** ở góc dưới.
- Sau khi hài lòng, nhấn **XUẤT DỰ THẢO** để lấy file gửi cho bộ phận thu mua.

---

## 🔬 5. PHÂN TÍCH CHI TIẾT SKU

Nhấn vào bất kỳ mã hàng (SKU) nào để xem dữ liệu chi tiết hơn.

![Chi Tiết SKU](file:///C:/Users/admin/.gemini/antigravity/brain/680484e9-98a2-43d1-9a84-d7da70ddd04d/manual_sku_detail_1775101921563.png)

- **Biểu đồ Cầu & Dự báo**: Sales lịch sử (xanh) và Dự án tương lai (cam).
- **Phân bổ Tồn kho**: Kiểm tra lượng hàng tại kho Miền Nam (NB) và Miền Bắc (BB). Nếu một kho thừa, một kho thiếu -> hãy dùng tính năng **Điều phối**.

---

## 💡 MẸO VẬN HÀNH HIỆU QUẢ
1. **Kiểm tra MOS hàng ngày**: Đừng để mã hàng nhóm L1 có MOS < 1 tháng.
2. **Ưu tiên AIR**: Chỉ dùng đặt Air cho hàng bù nợ (Backorder) để tiết kiệm chi phí vận chuyển.
3. **Giải phóng dử thừa**: Thường xuyên kiểm tra danh sách **Excess** để có phương án khuyến mãi hoặc luân chuyển hàng.

---
*Tài liệu được biên soạn bởi App Guide Expert v1.0 dành cho hệ thống ATP Supply Chain.*
