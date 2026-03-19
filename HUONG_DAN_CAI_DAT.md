# 🚀 Hướng Dẫn Cài Đặt & Chạy ATP v12

> **Kết quả:** Truy cập app tại `http://localhost:3000/`

---

## BƯỚC 1 — Cài Node.js (Chỉ làm 1 lần)

1. Vào **https://nodejs.org** → tải bản **LTS** (ví dụ: 20.x.x)
2. Chạy file `.msi` → nhấn **Next** liên tục → **Install** → **Finish**
3. Mở **Command Prompt** (cmd.exe) → kiểm tra:
   ```cmd
   node --version
   ```
   → Thấy `v20.x.x` là OK ✅

---

## BƯỚC 2 — Copy Thư Mục App

Copy toàn bộ thư mục `v12` vào máy, ví dụ: `C:\ATP\v12\`

> ⚠️ Không đặt trong thư mục có **dấu cách** hoặc ký tự đặc biệt  
> ✅ Tốt: `C:\ATP\v12`  
> ❌ Tránh: `C:\My Documents\ATP v12`

---

## BƯỚC 3 — Cài Dependencies (Chỉ làm 1 lần)

Mở **Command Prompt** (cmd.exe):

```cmd
cd C:\ATP\v12
node -e "require('child_process').execSync('npm install', {stdio:'inherit'})"
```

⏳ Chờ ~1-2 phút → thấy `added xxx packages` là xong ✅

---

## BƯỚC 4 — Chạy App (Mỗi Lần Dùng)

```cmd
cd C:\ATP\v12
node node_modules/vite/bin/vite.js --port 3000
```

Kết quả thành công:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

---

## BƯỚC 5 — Mở App

Mở trình duyệt **(Chrome hoặc Edge)** và truy cập:

```
http://localhost:3000/
```

🎉 **Xong! App đã chạy.**

---

## 🌐 Cho Người Khác Xem Trong Cùng Mạng WiFi

Dùng địa chỉ **Network** hiển thị ở Bước 4, ví dụ:
```
http://192.168.1.10:3000/
```

---

## ❓ Lỗi Thường Gặp

| Lỗi | Cách xử lý |
|-----|-----------|
| `node` không nhận diện | Chưa cài Node.js → Quay lại Bước 1 |
| `Cannot find module 'vite'` | Chưa chạy npm install → Quay lại Bước 3 |
| `Port 3000 already in use` | Đổi port: thêm `--port 3001` vào lệnh Bước 4 |

---

## 🔄 Tắt App

Nhấn `Ctrl + C` trong cửa sổ Command Prompt.
