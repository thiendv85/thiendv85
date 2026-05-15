# Dual-Mode Ordering Algorithm — Implementation Plan (FINAL)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách biệt rõ ràng hai thuật toán đề xuất đặt hàng — **Khẩn (Air)** dùng `available - bo` baseline + check `poIn30d`, **Dự trữ (Sea)** dùng `NetDemand + urgentQty` baseline — với UI badge trigger và tooltip lý do.

**Architecture:**
- **Khẩn (Air)** trả lời: "Hết tiền hết hàng RIGHT NOW thì cần đặt nhanh bao nhiêu?" — baseline `available - bo`, KHÔNG tính `onOrder` (PO 2-3 tháng nữa). Có check `poIn30d` (PO về trong 30 ngày) để skip Air nếu đủ kịp cứu BO.
- **Dự trữ (Sea)** trả lời: "Sau khi PO + Air về, còn cần đặt thêm bao nhiêu để duy trì buffer?" — baseline `NetDemand + urgentQty` (future state), fill tới `stockMax`.
- **Anti-double-count**: `reserveBaseline = NetDemand + urgentQty`, không tính lại phần `bo` (đã trừ trong NetDemand) hay phần `urgent` đã đặt.
- **Cap Air tiết kiệm**: `urgentQty = BO_deficit + 1 tháng demand` (KHÔNG fill tới 4 tháng như cũ).

**Tech Stack:** TypeScript, `utils/inventoryEngine.ts`, `pages/Ordering.tsx`, `types/inventory.ts`

---

## Quyết định thiết kế đã chốt qua brainstorming

| Quyết định | Giá trị | Lý do |
|------------|---------|-------|
| Khi nào fire Air | `BO > 0` HOẶC sắp stockout | Air đắt, chỉ dùng khi cần thật |
| Air có check PO sắp về không | Có — `poIn30d` (PO về trong 30 ngày) | Tránh đặt Air thừa khi Sea sắp về |
| Cap PO sắp về | 30 ngày | User chốt: "PO về trong 30 ngày là kịp" |
| Cap số lượng Air | `BO_deficit + 1 tháng demand` | Air đắt — chỉ đủ cover ngắn hạn, phần dài hạn để Sea |
| Sea fire khi nào | `futureStock < stockMax` | Luôn fill tới MAX sau khi tính BO + PO |
| Baseline Sea | `NetDemand + urgentQty` | Future state, chống double-count |

---

## File Structure

| File | Action | Trách nhiệm |
|------|--------|-------------|
| `types/inventory.ts` | Modify | Thêm 8 fields vào `ComputedFields` |
| `utils/inventoryEngine.ts` | Modify (lines ~525-742) | Thêm 4 helper functions, thay đoạn `gapOrExcess`/`suggestedBO` |
| `pages/Ordering.tsx` | Modify (lines ~1091-1109, ~1165) | Đổi suggested fields, thêm trigger badge, row priority border |
| `components/OrderReviewModal.tsx`, `ExecutiveDashboard.tsx` | Audit + migrate nếu render gợi ý qty | Backward-compat đảm bảo không vỡ |

---

## Task 1: Mở rộng ComputedFields type

**Files:**
- Modify: `types/inventory.ts`

- [ ] **Step 1: Tìm interface ComputedFields**

```bash
grep -n "interface ComputedFields\|gapOrExcess\b\|suggestedBO\b" D:/App/V16/types/inventory.ts
```

Expected: tìm thấy `ComputedFields` interface chứa `gapOrExcess` và `suggestedBO`.

- [ ] **Step 2: Thêm 8 fields mới (giữ field cũ cho backward-compat)**

Trong `types/inventory.ts`, tìm `ComputedFields` interface, thêm vào cuối (trước dấu `}` của interface):

```typescript
    // === Dual-mode ordering algorithm (added 2026-05-15) ===
    poIn30d?: number;                // PO arriving within 30 days
    urgentQty?: number;              // Khẩn (Air) — cover BO + 1m buffer
    reserveQty?: number;             // Dự trữ (Sea) — fill to StockMax
    urgentTrigger?: 'backorder_uncovered' | 'stockout_imminent' | 'none';
    reserveTrigger?: 'below_stockmax' | 'none';
    urgentReason?: string;           // Human-readable lý do (badge tooltip)
    reserveReason?: string;
    orderPriority?: 'urgent_only' | 'reserve_only' | 'both' | 'none';
```

- [ ] **Step 3: Build check**

```bash
cd D:/App/V16
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

Expected: chỉ thấy 2 lỗi cũ của `InventoryDistribution.tsx` (`accent`, `warn`).

- [ ] **Step 4: Commit**

```bash
git add types/inventory.ts
git commit -m "feat(types): add dual-mode ordering fields to ComputedFields"
```

---

## Task 2: Helper computePoArrivingWithinDays

**Files:**
- Modify: `utils/inventoryEngine.ts` (thêm function gần `parsePipelineDate`)

- [ ] **Step 1: Tìm vị trí parsePipelineDate**

```bash
grep -n "parsePipelineDate\|incomingCurrentMonth\|incomingNextMonth" D:/App/V16/utils/inventoryEngine.ts | head -10
```

- [ ] **Step 2: Thêm helper ngay sau định nghĩa `parsePipelineDate`**

```typescript
/**
 * Tổng qty của các Pipeline entries có arrival date trong vòng `days` ngày tới.
 * Dùng để check "PO sắp về kịp cứu BO không?" — user chốt 30 ngày là kịp.
 */
function computePoArrivingWithinDays(
    pipeline: Record<string, number> | undefined,
    days: number,
    now: Date,
    snapshotYYMM?: string,
): number {
    if (!pipeline) return 0;
    const cutoff = now.getTime() + days * MS_PER_DAY;
    let total = 0;
    for (const [k, v] of Object.entries(pipeline)) {
        const ts = parsePipelineDate(k, snapshotYYMM);
        if (!ts) continue;
        if (ts <= cutoff && ts >= now.getTime()) total += v;
    }
    return total;
}
```

(Nếu `MS_PER_DAY` chưa có, dùng `86_400_000`.)

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): add computePoArrivingWithinDays helper for 30-day window"
```

---

## Task 3: computeUrgentQty

**Files:**
- Modify: `utils/inventoryEngine.ts` (thêm function trước `computeInventory`)

- [ ] **Step 1: Thêm hàm `computeUrgentQty`**

Trong `utils/inventoryEngine.ts`, ngay trước `export function computeInventory(`, thêm:

```typescript
/**
 * Khẩn (Air) — đặt nhanh để cover deficit RIGHT NOW.
 *
 * Baseline: `available - bo` (kệ thật trừ nợ thật).
 * KHÔNG dùng NetDemand vì nó cộng PO 2-3 tháng nữa mới về → false safety.
 *
 * Có check poIn30d: nếu PO sắp về trong 30 ngày đủ cover BO → KHÔNG fire Air.
 *
 * Cap qty: BO_deficit + 1 tháng demand (Air đắt, không fill tới 4 tháng).
 *
 * Triggers:
 *   1. backorder_uncovered: bo > available + poIn30d → có khách chờ + PO không kịp
 *   2. stockout_imminent  : (available - bo) < rop AND poIn30d == 0 → sắp hết, không có PO cứu
 *   3. none               : tồn đủ hoặc PO về kịp
 */
function computeUrgentQty(params: {
    available: number;
    bo: number;
    poIn30d: number;
    rop: number;
    snp: number;
    demandMonthly: number;
}): { qty: number; trigger: 'backorder_uncovered' | 'stockout_imminent' | 'none'; reason: string } {
    const { available, bo, poIn30d, rop, snp, demandMonthly } = params;
    const roundUp = (x: number) => snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x);
    const realStock = available - bo;
    const effectiveStock30d = available + poIn30d - bo;

    // Trigger 1: BO không cover nổi sau khi PO 30d về
    if (bo > 0 && effectiveStock30d < 0) {
        const deficit = -effectiveStock30d;
        const buffer = demandMonthly * 1; // 1 tháng cover khi chờ Sea
        const qty = roundUp(deficit + buffer);
        return {
            qty,
            trigger: 'backorder_uncovered',
            reason: `BO ${bo} > tồn ${available} + PO 30d ${Math.round(poIn30d)}, thiếu ${Math.round(deficit)} + buffer 1m ${Math.round(buffer)}`,
        };
    }

    // Trigger 2: sắp stockout, không có PO cứu
    if (realStock < rop && poIn30d <= 0) {
        const need = rop - realStock;
        const qty = roundUp(need);
        return {
            qty,
            trigger: 'stockout_imminent',
            reason: `Tồn ròng ${Math.round(realStock)} < ROP ${Math.round(rop)}, không có PO 30d cứu`,
        };
    }

    return {
        qty: 0,
        trigger: 'none',
        reason: bo > 0
            ? `BO ${bo} sẽ được cover bởi tồn ${available} + PO 30d ${Math.round(poIn30d)}`
            : `Tồn ròng ${Math.round(realStock)} >= ROP ${Math.round(rop)}, không khẩn`,
    };
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): add computeUrgentQty with 30d-window trigger logic"
```

---

## Task 4: computeReserveQty

**Files:**
- Modify: `utils/inventoryEngine.ts`

- [ ] **Step 1: Thêm `computeReserveQty` ngay sau `computeUrgentQty`**

```typescript
/**
 * Dự trữ (Sea) — đặt từ từ để duy trì buffer.
 *
 * Baseline: NetDemand + urgentQty = future state sau khi PO + Air về.
 * Anti-double-count: KHÔNG cộng lại bo (đã trừ trong NetDemand) và KHÔNG re-tính phần urgent.
 *
 * Cap: 4 tháng demand (chính sách công ty hiện tại — MaxMonthsCap).
 */
function computeReserveQty(params: {
    netDemand: number;       // = available + onOrder - bo
    urgentQty: number;       // sẽ về thêm từ Air order
    stockMax: number;
    snp: number;
    demandMonthly: number;
    maxOrderMonths?: number;
}): { qty: number; trigger: 'below_stockmax' | 'none'; reason: string } {
    const { netDemand, urgentQty, stockMax, snp, demandMonthly, maxOrderMonths = 4 } = params;
    const roundUp = (x: number) => snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x);
    const futureStock = netDemand + urgentQty;
    const cap = demandMonthly * maxOrderMonths;

    if (futureStock >= stockMax) {
        return {
            qty: 0,
            trigger: 'none',
            reason: `Future stock ${Math.round(futureStock)} >= MAX ${Math.round(stockMax)}, không cần dự trữ`,
        };
    }

    const need = stockMax - futureStock;
    const capped = Math.min(need, cap);
    const qty = roundUp(capped);
    return {
        qty,
        trigger: 'below_stockmax',
        reason: `Future stock ${Math.round(futureStock)} < MAX ${Math.round(stockMax)}, cần thêm ${Math.round(need)}`,
    };
}
```

- [ ] **Step 2: Thêm `classifyOrderPriority` helper**

```typescript
function classifyOrderPriority(
    urgentQty: number,
    reserveQty: number,
): 'urgent_only' | 'reserve_only' | 'both' | 'none' {
    if (urgentQty > 0 && reserveQty > 0) return 'both';
    if (urgentQty > 0) return 'urgent_only';
    if (reserveQty > 0) return 'reserve_only';
    return 'none';
}
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): add computeReserveQty + classifyOrderPriority helpers"
```

---

## Task 5: Wire 4 helpers vào computed output

**Files:**
- Modify: `utils/inventoryEngine.ts` (lines ~725-742)

- [ ] **Step 1: Đọc đoạn cũ**

Đoạn current (lines 725-742):

```typescript
const incomingCurrentMonth = item.Pipeline ? Object.entries(item.Pipeline).reduce(...);
const incomingNextMonth = item.Pipeline ? Object.entries(item.Pipeline).reduce(...);
const priorityBucket = resolvePriority(available, onOrder, bo, rop, demandMonthly, isStop);

let gapOrExcess = 0;
let suggestedBO = 0;
if (!isStop && !isZeroDemand) {
    const target = Math.max(stockMax, bo);
    if (reserve < target) gapOrExcess = Math.ceil((target - reserve) / snp) * snp;
    const MAX_ORDER_MONTHS = 4;
    const maxOrderCap = demandMonthly * MAX_ORDER_MONTHS;
    if (gapOrExcess > maxOrderCap && maxOrderCap > 0) {
        gapOrExcess = Math.ceil(maxOrderCap / snp) * snp;
    }
    const boGap = bo - reserve;
    if (boGap > 0) suggestedBO = Math.ceil((boGap - (gapOrExcess > 0 ? Math.min(gapOrExcess, boGap) : 0)) / snp) * snp;
}
```

- [ ] **Step 2: Thêm tính `poIn30d` ngay sau `incomingNextMonth`**

```typescript
const incomingNextMonth = item.Pipeline ? Object.entries(item.Pipeline).reduce((sum, [k, v]) => isMatchNext(k) ? sum + v : sum, 0) : 0;
const poIn30d = computePoArrivingWithinDays(item.Pipeline, 30, now, params.snapshotYYMM);
```

- [ ] **Step 3: Thay block `gapOrExcess`/`suggestedBO` bằng dual-mode**

```typescript
// === Dual-mode ordering: Khẩn (Air) + Dự trữ (Sea) ===
let urgentQty = 0, reserveQty = 0;
let urgentTrigger: 'backorder_uncovered' | 'stockout_imminent' | 'none' = 'none';
let reserveTrigger: 'below_stockmax' | 'none' = 'none';
let urgentReason = '', reserveReason = '';

if (!isStop && !isZeroDemand) {
    const urgent = computeUrgentQty({
        available,
        bo,
        poIn30d,
        rop,
        snp,
        demandMonthly,
    });
    urgentQty = urgent.qty;
    urgentTrigger = urgent.trigger;
    urgentReason = urgent.reason;

    const netDemandValue = available + onOrder - bo;
    const reserveResult = computeReserveQty({
        netDemand: netDemandValue,
        urgentQty,
        stockMax,
        snp,
        demandMonthly,
    });
    reserveQty = reserveResult.qty;
    reserveTrigger = reserveResult.trigger;
    reserveReason = reserveResult.reason;
}

const orderPriority = classifyOrderPriority(urgentQty, reserveQty);

// Backward-compat: giữ suggestedBO/gapOrExcess cho code cũ chưa migrate
const suggestedBO = urgentQty;
const gapOrExcess = reserveQty;
```

- [ ] **Step 4: Tìm return object và thêm fields mới**

```bash
grep -n "return {" D:/App/V16/utils/inventoryEngine.ts | head -5
```

Trong return object của `computeInventory`, sau `gapOrExcess,` và `suggestedBO,` thêm:

```typescript
        gapOrExcess,
        suggestedBO,
        // === Dual-mode fields ===
        poIn30d,
        urgentQty,
        reserveQty,
        urgentTrigger,
        reserveTrigger,
        urgentReason,
        reserveReason,
        orderPriority,
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -10
```

- [ ] **Step 6: Smoke test trong dev**

```bash
npm run dev
```

Mở browser → trang Ordering → kiểm tra:
- Console không có error
- Bảng vẫn render qty gợi ý (backward-compat suggestedBO/gapOrExcess vẫn cấp giá trị)
- Một SKU có BO > 0 → kiểm tra `item.computed.urgentQty` và `urgentReason` qua React DevTools

- [ ] **Step 7: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): wire dual-mode urgent/reserve into computeInventory"
```

---

## Task 6: Update Ordering.tsx — Air/Sea button + tooltip

**Files:**
- Modify: `pages/Ordering.tsx` (lines ~1091, ~1108)

- [ ] **Step 1: Update Air button (line ~1091)**

Tìm:

```tsx
{((item.computed?.suggestedBO || 0) > 0) && d.air === 0 && (
    <button onClick={() => handleQtyChange(item.ItemCode, 'air', item.computed!.suggestedBO!)} className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full border border-rose-200 mt-0.5">BO: {item.computed!.suggestedBO}</button>
)}
```

Thay bằng:

```tsx
{((item.computed?.urgentQty || 0) > 0) && d.air === 0 && (
    <button
        onClick={() => handleQtyChange(item.ItemCode, 'air', item.computed!.urgentQty!)}
        title={item.computed?.urgentReason}
        className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border mt-0.5 ${
            item.computed?.urgentTrigger === 'backorder_uncovered'
                ? 'text-rose-600 bg-rose-100 border-rose-200'
                : 'text-orange-600 bg-orange-100 border-orange-200'
        }`}
    >
        {item.computed?.urgentTrigger === 'backorder_uncovered' ? 'BO+30' : 'ROP'}: {item.computed!.urgentQty}
    </button>
)}
```

- [ ] **Step 2: Update Sea button (line ~1108)**

Tìm:

```tsx
{((item.computed?.gapOrExcess || 0) > 0) && d.sea === 0 && (
    <button onClick={() => handleQtyChange(item.ItemCode, 'sea', Math.ceil((item.computed!.gapOrExcess! || 1) / (item.SNP || 1)) * (item.SNP || 1))} className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200 mt-0.5">Gợi ý: {item.computed!.gapOrExcess}</button>
)}
```

Thay bằng:

```tsx
{((item.computed?.reserveQty || 0) > 0) && d.sea === 0 && (
    <button
        onClick={() => handleQtyChange(item.ItemCode, 'sea', item.computed!.reserveQty!)}
        title={item.computed?.reserveReason}
        className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200 mt-0.5"
    >
        MAX: {item.computed!.reserveQty}
    </button>
)}
```

- [ ] **Step 3: Tìm các chỗ khác trong Ordering.tsx dùng suggestedBO/gapOrExcess**

```bash
grep -n "suggestedBO\|gapOrExcess" D:/App/V16/pages/Ordering.tsx
```

Với mỗi chỗ tìm thấy, áp dụng fallback chain: `urgentQty ?? suggestedBO`, `reserveQty ?? gapOrExcess`.

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add pages/Ordering.tsx
git commit -m "feat(ui): Ordering page uses dual-mode urgent/reserve with trigger badge + tooltip"
```

---

## Task 7: Row priority indicator

**Files:**
- Modify: `pages/Ordering.tsx` (line ~1165)

- [ ] **Step 1: Tìm dòng `<tr key={item.ItemCode}`**

```bash
grep -n "<tr key={item.ItemCode}" D:/App/V16/pages/Ordering.tsx
```

- [ ] **Step 2: Thêm priority class trước `<tr>`**

Trong block `paginatedData.map((item, idx) => {`, sau `const incomingThisMonth = ...`:

```typescript
const priorityBorderClass =
    item.computed?.orderPriority === 'urgent_only' ? 'border-l-4 border-rose-500' :
    item.computed?.orderPriority === 'both'        ? 'border-l-4 border-amber-500' :
    item.computed?.orderPriority === 'reserve_only'? 'border-l-4 border-blue-400' :
    'border-l-4 border-transparent';
```

Trong className của `<tr>`, append `${priorityBorderClass}`:

```tsx
<tr key={item.ItemCode} className={`hover:bg-slate-50 transition-colors group ${draftQtyTotal > 0 ? 'bg-blue-50/20' : ''} ${priorityBorderClass}`}>
```

- [ ] **Step 3: Build check + smoke test**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npm run dev
```

Mở Ordering page → kiểm tra hàng có BO có border đỏ trái, hàng chỉ cần dự trữ có border xanh trái.

- [ ] **Step 4: Commit**

```bash
git add pages/Ordering.tsx
git commit -m "feat(ui): row priority border indicator (red/amber/blue/none)"
```

---

## Task 8: Filter chips (Khẩn / Cả hai / Dự trữ)

**Files:**
- Modify: `pages/Ordering.tsx`

- [ ] **Step 1: Khai báo state ở đầu component**

Tìm các `useState` declarations đầu component, thêm:

```typescript
const [priorityFilter, setPriorityFilter] = useState<'urgent_only' | 'reserve_only' | 'both' | null>(null);
```

- [ ] **Step 2: Áp filter vào source data**

Tìm chỗ filter/sort dữ liệu (search "filteredItems" hoặc "sortedItems"). Thêm step lọc theo priority:

```typescript
const priorityFiltered = priorityFilter
    ? someBaseList.filter(it => it.computed?.orderPriority === priorityFilter)
    : someBaseList;
```

(Replace `someBaseList` downstream bằng `priorityFiltered`.)

- [ ] **Step 3: Render 3 chip mới**

Tìm filter chip area (search "Coverage" hoặc "filterPills" hoặc "BÌNH THƯỜNG"). Thêm cạnh đó:

```tsx
<div className="flex items-center gap-1.5 ml-3">
    <span className="text-[10px] font-black text-slate-400 uppercase">Ưu tiên:</span>
    {([
        { key: 'urgent_only',  label: 'Chỉ Khẩn', cls: 'rose'  },
        { key: 'both',         label: 'Cả hai',    cls: 'amber' },
        { key: 'reserve_only', label: 'Chỉ Dự trữ', cls: 'blue' },
    ] as const).map(opt => (
        <button
            key={opt.key}
            onClick={() => setPriorityFilter(p => p === opt.key ? null : opt.key)}
            className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition-all ${
                priorityFilter === opt.key
                    ? `bg-${opt.cls}-100 text-${opt.cls}-700 border-${opt.cls}-300`
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
        >
            {opt.label}
        </button>
    ))}
</div>
```

**LƯU Ý**: Tailwind dynamic class names (`bg-${opt.cls}-100`) chỉ work khi safelist hoặc khi class string được purge biết trước. Nếu Tailwind không pickup, hardcode 3 chip riêng:

```tsx
<button onClick={() => setPriorityFilter(p => p === 'urgent_only' ? null : 'urgent_only')} className={`... ${priorityFilter === 'urgent_only' ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-white text-slate-500 border-slate-200'}`}>Chỉ Khẩn</button>
<button onClick={() => setPriorityFilter(p => p === 'both' ? null : 'both')} className={`... ${priorityFilter === 'both' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-500 border-slate-200'}`}>Cả hai</button>
<button onClick={() => setPriorityFilter(p => p === 'reserve_only' ? null : 'reserve_only')} className={`... ${priorityFilter === 'reserve_only' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-500 border-slate-200'}`}>Chỉ Dự trữ</button>
```

- [ ] **Step 4: Build + smoke test**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npm run dev
```

Mở Ordering → click "Chỉ Khẩn" → kiểm tra chỉ hiện rows có border đỏ.

- [ ] **Step 5: Commit**

```bash
git add pages/Ordering.tsx
git commit -m "feat(ui): priority filter chips (urgent/both/reserve)"
```

---

## Task 9: Audit + migrate components khác

**Files:**
- Modify (nếu cần): `components/OrderReviewModal.tsx`, `components/ExecutiveDashboard.tsx`, `components/DecisionSupport/OrderItemRow.tsx`

- [ ] **Step 1: Tìm tất cả chỗ dùng suggestedBO/gapOrExcess**

```bash
grep -rn "suggestedBO\|gapOrExcess" D:/App/V16/components/ D:/App/V16/pages/ D:/App/V16/utils/ 2>&1 | grep -v "node_modules\|inventoryEngine.ts\|Ordering.tsx\|backup"
```

- [ ] **Step 2: Với mỗi chỗ tìm thấy**

Nếu render gợi ý qty cho user → migrate sang dual-mode:
```typescript
// CŨ:
const suggested = item.computed?.suggestedBO ?? 0;

// MỚI (fallback chain):
const urgent = item.computed?.urgentQty ?? item.computed?.suggestedBO ?? 0;
const reserve = item.computed?.reserveQty ?? item.computed?.gapOrExcess ?? 0;
```

Nếu chỉ là tính toán nội bộ → giữ nguyên (backward-compat đã handle).

- [ ] **Step 3: Build + deploy staging**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npx vercel --yes 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: migrate remaining components to dual-mode order suggestions"
```

---

## Task 10: Testing + deploy production

- [ ] **Step 1: Manual test cases (dùng React DevTools để check `item.computed`)**

Tìm 5 SKU đại diện trong production data:

| Test Case | Tìm SKU có | Expected |
|-----------|-----------|----------|
| 1 | `Backorder > 0`, không có PO sắp về | `urgentTrigger = backorder_uncovered`, `urgentQty > 0` |
| 2 | `Backorder > 0`, `poIn30d >= bo` | `urgentTrigger = none` (PO cứu được) |
| 3 | `available < ROP`, `Backorder = 0`, `poIn30d = 0` | `urgentTrigger = stockout_imminent` |
| 4 | Tồn rất nhiều, `available > stockMax` | `urgentQty = 0`, `reserveQty = 0` |
| 5 | `available + onOrder < stockMax`, `Backorder = 0` | `reserveTrigger = below_stockmax`, `reserveQty > 0` |

- [ ] **Step 2: Verify `urgentReason`/`reserveReason` tooltips**

Hover từng badge → xem tooltip có đúng số liệu không.

- [ ] **Step 3: Verify row priority colors**

- Hàng có BO → border đỏ
- Hàng có cả BO + cần dự trữ → border vàng cam
- Hàng chỉ cần dự trữ → border xanh

- [ ] **Step 4: Verify filter chips**

Click từng chip → kiểm tra rows lọc đúng.

- [ ] **Step 5: Performance check**

`computePoArrivingWithinDays` chạy mỗi item — kiểm tra render time không tăng > 200ms cho 1000+ rows.

```javascript
// Trong browser console:
console.time('render');
// scroll table
console.timeEnd('render');
```

- [ ] **Step 6: Deploy production**

```bash
npx vercel --prod --yes 2>&1 | tail -5
```

- [ ] **Step 7: Monitor 24h**

- Check console errors trong production
- Hỏi 1-2 buyer xem badge mới có hiểu không
- Track metric: % SKU có Air gợi ý / total SKU (kỳ vọng giảm so với current vì check poIn30d)

- [ ] **Step 8: Final commit + tag**

```bash
git tag -a v2.2.0-dual-ordering -m "Dual-mode ordering algorithm rollout"
git push origin v2.2.0-dual-ordering
```

---

## Bảng tra cứu nhanh: scenario → action

| `available` | `bo` | `onOrder` | `poIn30d` | `rop` | `stockMax` | demand/m | → urgent | → reserve | trigger |
|-------------|------|-----------|-----------|-------|------------|----------|----------|-----------|---------|
| 50 | 0 | 0 | 0 | 100 | 300 | 100 | 50 | 200 | stockout_imminent + below_stockmax |
| 50 | 80 | 100 | 100 | 100 | 300 | 100 | 0 | 230 | none + below_stockmax (PO 30d cứu BO) |
| 50 | 80 | 100 | 0 | 100 | 300 | 100 | 130 | 100 | backorder_uncovered (BO 30 deficit + 100 buffer) |
| 50 | 80 | 0 | 0 | 100 | 300 | 100 | 130 | 200 | backorder_uncovered + below_stockmax |
| 200 | 0 | 100 | 100 | 100 | 300 | 100 | 0 | 0 | none (đã đủ MAX) |

---

## Rollback Plan

Nếu sau deploy có vấn đề:

1. Backward-compat `suggestedBO = urgentQty`, `gapOrExcess = reserveQty` → code cũ vẫn chạy
2. Revert UI chỉ cần checkout file `pages/Ordering.tsx`:
   ```bash
   git checkout HEAD~3 -- pages/Ordering.tsx
   npx vercel --prod --yes
   ```
3. Revert engine: checkout `utils/inventoryEngine.ts` về commit trước task 5

---

## Self-Review Checklist

- [x] Spec coverage: 6 quyết định brainstorming đều có task tương ứng
- [x] No placeholder: mỗi step có code thực, command thực, expected output
- [x] Type consistency: `urgentQty` xuất hiện ở Task 1 (type), Task 3 (function), Task 5 (wire), Task 6 (UI) đều cùng tên
- [x] Backward-compat: giữ `suggestedBO`/`gapOrExcess`
- [x] Test cases cụ thể: Task 10 có 5 scenarios với expected output
- [x] Rollback plan: documented
- [x] File paths: tất cả absolute hoặc relative từ project root
