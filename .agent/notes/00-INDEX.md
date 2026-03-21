---
title: Mục lục Tài liệu & Kiến thức (Master Index)
date: 2026-03-21
category: indexing
tags: [index, summary, docs, overview]
---

# Danh sách các tài liệu (.md) quan trọng

Dưới đây là tổng hợp danh sách các file Markdown (Ghi chú, Kỹ năng, Lịch sử) đang có trong bộ nhớ của dự án. File này đóng vai trò như chiếc "bản đồ" để anh dễ dàng tra cứu và lưu trữ.

## 1. Kỹ năng Hệ thống AI (Skills)
*Nằm trong thư mục `.agent/skills/` hoặc thư mục cấu hình AI của anh. Các file này dạy cho AI cách làm việc tự động.*

- 📘 **[note-manager-pro](.agent/skills/note-manager-pro/SKILL.md)**
  - **Nội dung:** Hệ thống tự động phân loại, gắn thẻ (tags) và tra cứu lại các file `.md`. Giúp anh có một "Second Brain" lưu trữ siêu tốc.
  - **Cách dùng:** *"Lưu note..."* hoặc *"Tìm lại tài liệu..."*

- 📘 **[git-checkpoint-manager](.agent/skills/git-checkpoint-manager/SKILL.md)**
  - **Nội dung:** Hệ thống giúp backup dự án tự động lên GitHub và deploy Vercel, tự động ghi chú vào nhật ký để chống mất code dở dang.
  - **Cách dùng:** *"Backup git"* hoặc *"Xem git"*

*(Ngoài ra còn có các kỹ năng cốt lõi khác như `ui-ux-pro-max`, `atp-supply-chain`... để code chuẩn xác)*

---

## 2. Ghi chú Công việc & Quy chuẩn (Notes)
*Nằm trong thư mục `.agent/notes/` hoặc `docs/`. Nơi lưu trữ kiến thức dự án tái sử dụng.*

- 📝 **[Quy chuẩn màu sắc ATP Dashboard](.agent/notes/guidelines/atp-color-palette.md)**
  - **Đường dẫn:** `.agent/notes/guidelines/atp-color-palette.md`
  - **Nội dung:** Chứa danh sách các mã class Tailwind (`bg-atp-primary`, `bg-atp-action`, `bg-atp-success`...) dùng thống nhất cho dự án Supply Chain.
  - **Tags:** `[color, ui, dashboard, atp]`

*(Từ giờ anh chỉ cần bảo AI lưu quy trình mới, nó sẽ tự lấp đầy danh sách ở thư mục này)*

---

## 3. Dữ liệu Nhật ký & Quản lý (Logs)
*Nằm tại thư mục gốc dự án.*

- 🕰️ **[Nhật ký Sao lưu (Backup History)](../../../backup_history.md)**
  - **Đường dẫn:** `backup_history.md` (Thư mục gốc)
  - **Nội dung:** Một bảng log cực trực quan chứa tất cả những mốc push code lịch sử. (Bao gồm cả dòng log vừa được lưu chiều nay: *"Fix lỗi Gợi ý đặt hàng bị đè số, chỉnh formula cột RUNWAY và cập nhật nhãn Source ID cho Dashboard/Order"*).

---
> 💡 **Mẹo:** Từ màn hình này, anh có thể dùng `Ctrl + Click` vào đường dẫn để mở thẳng file ra xem nhé! Thay vì ghi nhớ thư mục lòng vòng, mình sẽ dùng cái "Mục lục" này để đi tới mọi nơi.
