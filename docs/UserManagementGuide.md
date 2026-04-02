# 📘 Hướng dẫn sử dụng: Quản lý Người dùng (User Management)

> [!NOTE]
> Tính năng này dành riêng cho quản trị viên (Admin) để quản lý quyền truy cập của đội ngũ vào hệ thống ATP Supply Chain.

## 1. Giới thiệu tổng quan
Module Quản lý Người dùng cho phép Admin tạo mới tài khoản và giám sát danh sách người dùng đang hoạt động. Điểm nổi bật là khả năng đồng bộ hóa trực tiếp với hệ thống xác thực Supabase, đảm bảo dữ liệu email luôn chính xác.

## 2. Giải thích giao diện & Chỉ số
| Thành phần | Ý nghĩa | Lưu ý |
| --- | --- | --- |
| **Họ & Tên** | Tên hiển thị của người dùng trong hệ thống. | Hiển thị trong các lịch sử phê duyệt. |
| **Email** | Địa chỉ email đăng nhập của người dùng. | **[MỚI]** Tự động đồng bộ từ Authenticator. |
| **Trạng thái** | Tình trạng hoạt động của tài khoản. | Active (Đang hoạt động) hoặc Inactive. |
| **Vai trò (Role)** | Phân quyền (Admin, Planner, Viewer). | Quyết định các tính năng người dùng được dùng. |

## 3. Quy trình thao tác chuẩn (SOP)
1. **Truy cập**: Vào mục **Cài đặt (Settings)** -> chọn Tab **Quản lý người dùng**.
2. **Thêm người dùng mới**:
   - Nhấn nút **Thêm người dùng**.
   - Nhập đầy đủ Họ tên, Email và chọn Vai trò.
   - Hệ thống sẽ tự động tạo profile và gửi thông tin xác thực qua email.
3. **Kiểm tra danh sách**: Danh sách người dùng sẽ hiển thị đầy đủ thông tin Email giúp Admin dễ dàng nhận diện và hỗ trợ khi có sự cố đăng nhập.

## 4. Phân tích chuyên sâu (Insights)
Hệ thống sử dụng cơ chế **Edge Functions** (`admin-create-user`) để đảm bảo rằng khi một tài khoản được tạo ở tầng bảo mật (Auth), thông tin email sẽ ngay lập tức được ghi nhận vào bảng hồ sơ (Profiles). Điều này giúp loại bỏ tình trạng dữ liệu "N/A" thường gặp ở các phiên bản trước.

## 5. Mẹo & Câu hỏi thường gặp
- 💡 **Mẹo**: Nếu email hiển thị "N/A", hãy yêu cầu Admin chạy script đồng bộ hóa SQL để cập nhật các user cũ.
- ❓ **FAQ**: "Tôi có thể đổi email cho người dùng không?" -> Hiện tại email được quản lý bởi Supabase Auth, Admin nên tạo user mới nếu cần thay đổi địa chỉ email chính thức.

---
*Tài liệu được cập nhật tự động bởi App Guide Expert v1.0.*
