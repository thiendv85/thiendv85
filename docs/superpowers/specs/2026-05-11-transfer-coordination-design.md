# Transfer Coordination Rebuild — Design Spec

**Date:** 2026-05-11
**Status:** Approved

## Goal

Rebuild `InventoryDistribution.tsx` into a professional transfer coordination page. Optimize working capital by rebalancing NB↔BB warehouse stock based on demand, backorders, and cost-benefit analysis.

## Architecture

### Keep
- `utils/transferEngine.ts` — mature cost-aware engine, no changes to core logic

### Rebuild
- `pages/InventoryDistribution.tsx` — full rebuild

### New Files
- `hooks/useTransferPlan.ts` — compute, save/load cloud, export state management
- `utils/transferExport.ts` — CSV generation
- `utils/transferSmartFilter.ts` — anti-clutter logic

## Smart Transfer Logic (Anti-Clutter)

All filtering applied BEFORE display. Users see only actionable transfers.

| Rule | Threshold | Purpose |
|------|-----------|---------|
| Min value per SKU | qty × unitCost ≥ 500,000đ | Skip low-value noise |
| Min qty per SKU | existing engine minTransferQty: 5 | No trivial quantities |
| SNP rounding | Round to nearest SNP (Standard Pack) | ERP needs full packs |
| Net benefit positive | netBenefit > 0 (already in engine) | Cost-justified only |
| Donor MOS floor | Donor keeps ≥ 1.5 MOS after transfer | Protect donor stock |
| Batch consolidation | Group all NB→BB into one shipment, BB→NB into one | Max 2 transfer orders |

## Page Layout

```
HEADER — Title + [Save Cloud] [Load Plan] [Export CSV]
KPI DASHBOARD — bento grid
  Row 1: [Total SKU] [Total Qty] [Total Value VNĐ] [Net Benefit]
  Row 2: [NB→BB / BB→NB split] [MOS Δ avg] [BO Cover %] [Top 5 SKU]
FILTER BAR — liquid glass
  [Rebalance | Allocation tabs] [Priority] [Sort] [Search]
DATA TABLE
  ☐ | SKU | Name | NB(stock/MOS/PO) | BB(stock/MOS/PO) | Dir | Qty | Value | Net | Reason
PAGINATION
```

## KPI Dashboard

| Card | Source |
|------|--------|
| Total SKU | count(items with transfer > 0) |
| Total Qty | sum(transferQty) |
| Total Value | sum(qty × unitCost) |
| Net Benefit | sum(netBenefit) from engine |
| Direction Split | count + qty per direction |
| MOS Improvement | avg(receiverMOSAfter - receiverMOSBefore) |
| BO Coverage | % of SKU with BO where transfer covers shortage |
| Top 5 | sorted by transfer value desc, take 5 |

## Cloud Save

- Table: `cloud_storage` (existing)
- Key: `transfer_plan_{brand}_{YYYY-MM-DD}`
- Payload: `{ items: TransferPlanItem[], metadata, savedAt }`
- Auto-load today's plan on page mount
- Manual save/load buttons

## CSV Export

```
STT,MaHang,TenHang,KhoGui,KhoNhan,SoLuong,DonGia,GiaTri,MOSGui_Truoc,MOSGui_Sau,MOSNhan_Truoc,MOSNhan_Sau,LoiIch,LyDo
```

- BOM UTF-8 for Excel compatibility
- Filename: `dieu_phoi_tonkho_{YYYY-MM-DD}.csv`
- Summary rows at top: direction totals
- Only exports selected items (or all if none selected)

## Filter Bar

- `lg-segmented` for tabs + priority
- `lg-select` for sort
- Standard search input

## Not In Scope

- Approval workflow
- Multi-warehouse beyond NB/BB
- Real-time sync
- Transfer engine algorithm changes (only threshold tuning)
