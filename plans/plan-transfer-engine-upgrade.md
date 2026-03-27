# Plan: Upgrade Transfer Engine — Cost-Aware Lateral Transshipment

## Scope
- Tạo file `utils/transferEngine.ts` với code từ spec (đã clean)
- Tích hợp vào pipeline qua adapter `attachBetterTransferDecisionBatch()`
- Default cost profiles tự tính từ `unitCost` (không cần user nhập)
- Hiển thị thêm explainability trong UI (reasonText, netBenefit, projected stock)

## Files
1. **`utils/transferEngine.ts`** — NEW: toàn bộ engine + adapter
2. **`pages/InventoryDistribution.tsx`** — Gọi adapter sau `computeInventoryBatch`, hiển thị thêm info
3. **`utils/inventoryEngine.ts`** — Không sửa (giữ logic cũ, adapter override transferNBtoBB/transferBBtoNB)

## Default Costs (tự tính từ unitCost)
- `shortageCostPerUnit = unitCost × 0.3` (30% giá trị)
- `transferCostTo = unitCost × 0.05` (5% giá trị)
- `holdingCostPerUnitPerDay = unitCost × 0.0007` (~25%/năm)
- `fixedTripCost = 300,000 VNĐ` (ước lượng)
