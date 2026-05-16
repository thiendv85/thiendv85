# Prompt template — Fix Print Page (V16)

> Reusable. Điền placeholder `[...]` rồi paste cho Claude.

---

Sửa trang in (print page) của **[TÊN TRANG/COMPONENT]** trong dự án V16:

## CONTEXT
- File: `pages/[X].tsx`, hàm `handlePrint()` build standalone HTML + `window.open` + print
- Print dùng `@page A4 landscape`, `table-layout: fixed`, CSS inline trong `<style>`
- 2 `div.page` (Hiện tại / Simulation), mỗi cái `page-break-after: always`

## YÊU CẦU

### 1. Header thiếu [THÔNG TIN] — thêm vào `.page-header`
- Auto-detect từ `data`: 1 giá trị → hiện tên đầy đủ; nhiều → `"Hỗn hợp · N"`
- Style: dòng nhỏ `6.5pt` dưới `.page-title`

### 2. Bảng tràn [N] trang — dồn xuống [M] trang
- Inline mọi sub-line `<br/><small>` → cùng dòng (giảm nửa chiều cao row)
- `small`: `display: block` → `inline`
- `tbody td` padding `2px` → `1px`, font `7.5pt` → `7pt`
- KPI card: value `11pt` → `9.5pt`, padding gọn
- `@page` margin `8mm` → `6mm`
- `.page-header` padding/margin giảm

## CONSTRAINT
- Surgical: chỉ sửa `handlePrint()` + CSS print, KHÔNG đụng UI screen
- Backward-compat: data binding giữ nguyên
- Build check: `npx tsc --noEmit` (bỏ qua lỗi cũ `InventoryDistribution`)
- Deploy: `npx vercel --prod --yes`

## VERIFY
Ctrl+P → mỗi tab = 1 trang vật lý, header có đủ thông tin

---

## Reference implementation (2026-05-16)
- Đã apply cho `pages/Dashboard.tsx` matrix print
- Brand label auto-detect: `data.map(i => i.BrandName/SourceId)` + `appSettings.sourceProfiles`
- Inline target: `${dMOS}M${tgtMOS ? ` <small>🎯${tgtMOS}M</small>` : ''}`
- Commit pattern: `feat(print): <change> + compress to N pages`
