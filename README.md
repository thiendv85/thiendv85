# Auto Parts Governance

Hệ thống quản lý chuỗi cung ứng phụ tùng ô tô cao cấp — phân tích tồn kho, tối ưu đặt hàng, quy trình phê duyệt đa cấp.

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Auth, Database, Storage, Edge Functions)
- **Deploy:** Vercel

## Tính năng chính

### 1. Phân tích tồn kho (Inventory Analytics)
- Upload file CSV tồn kho hàng ngày (hỗ trợ drag & drop)
- Tự động tính toán: MOS, ROP, Stock Max, Safety Stock, CST
- Phân nhóm LOIS (L/O/I/S) theo velocity
- Dashboard với biểu đồ phân bổ tồn kho, trend, risk matrix

### 2. Cloud Snapshot
- Upload snapshot lên Supabase Storage (gzip compressed)
- **Tối ưu storage:** Column pruning (~30-40% savings), content hash dedup, auto-retention (max 30 snapshots)
- **Phân quyền brand:** Planner chỉ thấy snapshot của brand mình (Kia/Mazda/Stellantis/BMW)
- Admin quản lý toàn bộ snapshots trong Settings với storage usage indicator

### 3. Đặt hàng & Phê duyệt (Ordering & Approval)
- Tạo đơn đặt hàng AIR/SEA với gợi ý số lượng từ AI
- Quy trình phê duyệt đa cấp (1-3 levels)
- Workflow theo thương hiệu (brand-specific)
- Optimistic locking chống conflict
- Audit trail đầy đủ

### 4. Dữ liệu tháng (Monthly Data)
- Upload file dữ liệu tháng (~80k SKU) lên Cloud
- Tự động merge với snapshot hàng ngày
- Version check tránh download lại data chưa thay đổi

### 5. Quản lý người dùng
- 4 roles: Admin, Planner, Approver, Viewer
- Phân quyền brand/phòng ban
- Quản lý approval workflows

## Cài đặt & Chạy

```bash
# Install dependencies
npm install

# Chạy dev server
npm run dev

# Build production
npm run build
```

## Cấu hình

Tạo file `.env.local` với:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Cấu trúc dự án

```
├── components/          # React components (modals, guards, UI)
├── pages/               # Main pages (FileUpload, Settings, Dashboard, etc.)
├── types/               # TypeScript type definitions
├── utils/               # Supabase client, CSV parser, i18n, auth context
├── supabase/migrations/ # SQL migrations (7 phases)
└── public/              # Static assets
```

## Supabase Tables

| Table | Mô tả |
|-------|--------|
| `profiles` | User profiles (role, department/brand, approval_levels) |
| `snapshot_metadata` | Metadata cho inventory snapshots trên Storage |
| `approval_requests` | Đơn đặt hàng chờ phê duyệt |
| `approval_workflows` | Cấu hình quy trình phê duyệt |
| `approval_actions` | Audit trail các hành động phê duyệt |
| `monthly_sku_data` | Dữ liệu tháng (80k+ rows) |
| `cloud_storage` | Generic JSON store (config, drafts) |
