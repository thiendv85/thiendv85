# Plan: Gộp Demand AI vào Dashboard làm sub-tab

## Mục tiêu
- Gộp trang **Demand Intelligence** thành tab con trong **Dashboard**
- Giảm menu chính từ 7 → 6 mục
- Dashboard sẽ có 3 tabs: **Tổng quan | Demand AI | Lead Time**

## Thay đổi

### 1. `App.tsx`
- Xóa menu item `demand-intel` khỏi nav array
- Xóa view type `'demand-intel'` khỏi useState
- Xóa render block `{view === 'demand-intel' && <DemandIntelligence .../>}`
- Truyền thêm props cho Dashboard: `draftData`, `onUpdateDraft` (cần cho DemandIntelligence)

### 2. `pages/Dashboard.tsx`
- Import `DemandIntelligence` component
- Thêm state `activeTab: 'overview' | 'demand-ai' | 'lead-time'`
- Thêm tab bar ngay dưới page header (trước KPI grid)
- Tab `overview` = nội dung Dashboard hiện tại
- Tab `demand-ai` = render `<DemandIntelligence>` với viewMode='ANALYTICS'
- Tab `lead-time` = render `<DemandIntelligence>` với viewMode='LEAD_TIME'
- Cập nhật props interface thêm `draftData`, `onUpdateDraft`
- Lưu `activeTab` vào `onSaveState` để giữ trạng thái khi chuyển trang

### 3. `pages/DemandIntelligence.tsx`
- Export thêm viewMode prop (optional) để Dashboard có thể force viewMode
- Hoặc: Không cần sửa nếu Dashboard chỉ wrap lại component nguyên bản

### 4. `utils/i18n.tsx`
- Xóa key `nav_demand` (không cần nữa vì đã gộp)
- Thêm keys cho tab labels nếu cần

## Approach
- **Cách đơn giản nhất**: Dashboard render `<DemandIntelligence>` nguyên component trong tab demand-ai
- DemandIntelligence đã có toggle ANALYTICS/LEAD_TIME bên trong → có thể giữ 2 tabs (Tổng quan | Demand AI) thay vì 3
- → **Chọn 2 tabs: Tổng quan | Demand AI** (gọn hơn, DemandIntelligence tự quản lý view mode bên trong)

## Files affected
- `App.tsx`
- `pages/Dashboard.tsx`
- `utils/i18n.tsx`
