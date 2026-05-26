# Ordering Algorithm — Dual-Mode Recommendation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách biệt rõ ràng hai thuật toán đề xuất đặt hàng — Khẩn (Air, dùng NetDemand baseline) và Dự trữ (Sea, dùng StockMax baseline) — và loại bỏ double-count giữa hai loại.

**Architecture:**
- Urgent order (Khẩn/Air): baseline = `NetDemand` = thiếu hụt NGAY BÂY (Backorder + projected stockout trong LT). Câu hỏi: "Cần mua ngay bao nhiêu để không bị hụt?"
- Reserve order (Dự trữ/Sea): baseline = `StockMax` target sau khi đã tính urgent. Câu hỏi: "Cần mua thêm bao nhiêu để đạt mức tồn kho lành mạnh?"
- Anti-double-count: reserve tính `available + TotalPO + urgentQty` làm nền, không tính lại phần urgent đã cover.

**Tech Stack:** TypeScript, `utils/inventoryEngine.ts`, `pages/Ordering.tsx`

---

## Phân tích baseline: NetDemand vs Stock bình thường

### Khi nào dùng NetDemand?
- Đơn **Khẩn (Air)**: phải cover ngay những gì đang thiếu:
  - `Backorder > 0` → khách hàng đang chờ
  - `MOS < 1.0` → hết hàng trong vòng 1 tháng
  - Công thức: `urgentQty = ceil(max(Backorder, ROP - available) / SNP) × SNP`

### Khi nào dùng Stock bình thường?
- Đơn **Dự trữ (Sea)**: đưa stock về mức target (StockMax):
  - Baseline = `available + TotalPO + urgentQty` (đã tính urgent vào)
  - `reserveQty = ceil(max(0, stockMax - baseline) / SNP) × SNP`
  - Không fire nếu `available + TotalPO >= stockMax` (đã đủ tồn)

### Tại sao không dùng NetDemand cho dự trữ?
- NetDemand chỉ phản ánh deficit hiện tại, không tính buffer/safety stock
- Dùng NetDemand cho dự trữ → thiếu SS → stockout lại khi demand spike

---

## File Structure

| File | Action | Mục đích |
|------|--------|----------|
| `utils/inventoryEngine.ts` | Modify | Tách `computeUrgentQty` và `computeReserveQty`, xóa `suggestedBO`/`gapOrExcess` cũ |
| `pages/Ordering.tsx` | Modify | Dùng `urgentQty` cho Air, `reserveQty` cho Sea; badge riêng cho mỗi loại |

---

## Task 1: Định nghĩa hai hàm tính toán trong inventoryEngine

**Files:**
- Modify: `utils/inventoryEngine.ts` (quanh line 729–742)

- [ ] **Step 1: Đọc code cũ để hiểu context**

```bash
# Xem đoạn tính suggestedBO và gapOrExcess hiện tại
grep -n "suggestedBO\|gapOrExcess\|suggestedOrder" utils/inventoryEngine.ts | head -30
```

- [ ] **Step 2: Thêm interface `OrderSuggestion` vào types**

Trong `types/inventory.ts`, tìm `ComputedMetrics` interface, thêm:

```typescript
// Thêm vào ComputedMetrics hoặc computed field
urgentQty: number;      // Air — cover Backorder + imminent stockout
reserveQty: number;     // Sea — fill to StockMax (after urgent)
urgentTrigger: 'backorder' | 'stockout' | 'none';
reserveTrigger: 'below_stockmax' | 'none';
```

- [ ] **Step 3: Implement `computeUrgentQty`**

Trong `utils/inventoryEngine.ts`, thêm hàm sau block safetyStock/ROP hiện tại:

```typescript
function computeUrgentQty(params: {
  available: number;
  backorder: number;
  rop: number;
  snp: number;
  maxOrderMonths?: number;
  demandMonthly: number;
}): { qty: number; trigger: 'backorder' | 'stockout' | 'none' } {
  const { available, backorder, rop, snp, maxOrderMonths = 4, demandMonthly } = params;

  // Trigger 1: có Backorder
  if (backorder > 0) {
    const deficit = Math.max(backorder, rop - available);
    const raw = Math.max(0, deficit);
    const capped = Math.min(raw, demandMonthly * maxOrderMonths);
    return {
      qty: snp > 0 ? Math.ceil(capped / snp) * snp : Math.ceil(capped),
      trigger: 'backorder',
    };
  }

  // Trigger 2: sắp hết hàng (available < ROP và không có PO cover)
  if (available < rop) {
    const deficit = rop - available;
    const capped = Math.min(deficit, demandMonthly * maxOrderMonths);
    return {
      qty: snp > 0 ? Math.ceil(capped / snp) * snp : Math.ceil(capped),
      trigger: 'stockout',
    };
  }

  return { qty: 0, trigger: 'none' };
}
```

- [ ] **Step 4: Implement `computeReserveQty`**

Ngay sau `computeUrgentQty`:

```typescript
function computeReserveQty(params: {
  available: number;
  totalPO: number;
  urgentQty: number;
  stockMax: number;
  snp: number;
  maxOrderMonths?: number;
  demandMonthly: number;
}): { qty: number; trigger: 'below_stockmax' | 'none' } {
  const { available, totalPO, urgentQty, stockMax, snp, maxOrderMonths = 4, demandMonthly } = params;

  // Baseline = gì chúng ta sẽ có sau khi urgent order về
  const effectiveStock = available + totalPO + urgentQty;

  if (effectiveStock >= stockMax) {
    return { qty: 0, trigger: 'none' };
  }

  const deficit = stockMax - effectiveStock;
  const capped = Math.min(deficit, demandMonthly * maxOrderMonths);
  return {
    qty: snp > 0 ? Math.ceil(capped / snp) * snp : Math.ceil(capped),
    trigger: 'below_stockmax',
  };
}
```

- [ ] **Step 5: Wire vào computed output**

Tìm chỗ inventoryEngine build `computed` object (quanh line 729), thêm:

```typescript
const urgentResult = computeUrgentQty({
  available: computed.available,
  backorder: item.Backorder || 0,
  rop: computed.rop,
  snp: params.snp ?? 1,
  demandMonthly: computed.demandRateDaily * 30,
});

const reserveResult = computeReserveQty({
  available: computed.available,
  totalPO: item.TotalPO || 0,
  urgentQty: urgentResult.qty,
  stockMax: computed.stockMax,
  snp: params.snp ?? 1,
  demandMonthly: computed.demandRateDaily * 30,
});

computed.urgentQty = urgentResult.qty;
computed.reserveQty = reserveResult.qty;
computed.urgentTrigger = urgentResult.trigger;
computed.reserveTrigger = reserveResult.trigger;

// Giữ backward-compat cho code cũ đang dùng suggestedBO/gapOrExcess
computed.suggestedBO = urgentResult.qty;
computed.gapOrExcess = reserveResult.qty;
```

- [ ] **Step 6: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v InventoryDistribution | tail -10
```

Expected: chỉ còn lỗi cũ của InventoryDistribution.

- [ ] **Step 7: Commit**

```bash
git add utils/inventoryEngine.ts types/inventory.ts
git commit -m "feat: split urgent/reserve order algorithms with clear baselines"
```

---

## Task 2: Cập nhật Ordering.tsx — hiển thị badge trigger

**Files:**
- Modify: `pages/Ordering.tsx` (quanh line 1092–1325)

- [ ] **Step 1: Tìm chỗ render Air/Sea qty suggestion**

```bash
grep -n "suggestedBO\|gapOrExcess\|air\|sea\|Air\|Sea" pages/Ordering.tsx | head -30
```

- [ ] **Step 2: Thay suggestedBO → urgentQty, gapOrExcess → reserveQty**

Tìm pattern `item.computed?.suggestedBO` và `item.computed?.gapOrExcess`:

```typescript
// CŨ:
const airSuggest = item.computed?.suggestedBO ?? 0;
const seaSuggest = item.computed?.gapOrExcess ?? 0;

// MỚI:
const airSuggest = item.computed?.urgentQty ?? item.computed?.suggestedBO ?? 0;
const seaSuggest = item.computed?.reserveQty ?? item.computed?.gapOrExcess ?? 0;
```

- [ ] **Step 3: Thêm trigger badge cạnh số gợi ý**

Cạnh chỗ hiển thị Air qty:

```tsx
{airSuggest > 0 && (
  <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">
    {item.computed?.urgentTrigger === 'backorder' ? 'BO' : 'ROP'}
  </span>
)}
```

Cạnh chỗ hiển thị Sea qty:

```tsx
{seaSuggest > 0 && (
  <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">MAX</span>
)}
```

- [ ] **Step 4: Build + deploy**

```bash
npx tsc --noEmit 2>&1 | grep -v InventoryDistribution | tail -5
npx vercel --prod --yes
```

---

## Task 3: Logic ưu tiên — khi nào fire Khẩn vs Dự trữ

**Files:**
- Modify: `utils/inventoryEngine.ts`
- Modify: `pages/Ordering.tsx`

- [ ] **Step 1: Định nghĩa priority rules**

Trong inventoryEngine, thêm helper:

```typescript
function classifyOrderPriority(params: {
  urgentQty: number;
  reserveQty: number;
  backorder: number;
  mos: number;
}): 'urgent_only' | 'reserve_only' | 'both' | 'none' {
  const { urgentQty, reserveQty, backorder, mos } = params;
  const hasUrgent = urgentQty > 0;
  const hasReserve = reserveQty > 0;

  if (!hasUrgent && !hasReserve) return 'none';
  if (hasUrgent && hasReserve) return 'both';
  if (hasUrgent) return 'urgent_only';
  return 'reserve_only';
}
```

- [ ] **Step 2: Wire priority vào computed**

```typescript
computed.orderPriority = classifyOrderPriority({
  urgentQty: urgentResult.qty,
  reserveQty: reserveResult.qty,
  backorder: item.Backorder || 0,
  mos: computed.mos ?? 99,
});
```

- [ ] **Step 3: Trong Ordering.tsx — highlight row theo priority**

Tìm `<tr>` của mỗi item, thêm conditional border:

```tsx
const priority = item.computed?.orderPriority;
const rowHighlight =
  priority === 'urgent_only' ? 'border-l-2 border-red-400' :
  priority === 'both'        ? 'border-l-2 border-amber-400' :
  priority === 'reserve_only'? 'border-l-2 border-blue-300' :
  '';
```

- [ ] **Step 4: Commit**

```bash
git add utils/inventoryEngine.ts pages/Ordering.tsx
git commit -m "feat: classify order priority (urgent/reserve/both) with visual indicators"
```

---

## Tóm tắt quyết định thiết kế

| Scenario | Baseline | Order type | Lý do |
|----------|----------|------------|-------|
| `Backorder > 0` | NetDemand (BO gap) | Khẩn (Air) | Phải trả nợ ngay |
| `MOS < 1, Backorder = 0` | ROP - available | Khẩn (Air) | Sắp hết trong LT |
| `available + PO < StockMax` | StockMax - (available+PO+urgent) | Dự trữ (Sea) | Buffer đến mức an toàn |
| `available + PO >= StockMax` | — | Không đặt | Tồn đủ |

**Không dùng NetDemand cho Dự trữ** vì NetDemand không tính safety stock → thiếu buffer.

**Không double-count**: reserve baseline = `available + TotalPO + urgentQty` (đã bao gồm phần urgent sẽ về).
