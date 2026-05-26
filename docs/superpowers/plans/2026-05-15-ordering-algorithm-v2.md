# Dual-Mode Ordering Algorithm — Implementation Plan (V2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách biệt rõ ràng hai thuật toán đề xuất đặt hàng — **Khẩn (Air)** dùng `available - bo` baseline, **Dự trữ (Sea)** dùng `NetDemand + urgentQty` baseline — giải quyết câu hỏi "NetDemand hay stock bình thường?" với cơ sở toán học rõ ràng.

**Architecture:**
- **Khẩn (Air)** trả lời câu hỏi: "Hết tiền hết hàng RIGHT NOW thì cần đặt nhanh bao nhiêu?" → dùng `available` (kệ thật) trừ `bo` (nợ thật), KHÔNG tính `onOrder` (PO 2-3 tháng nữa mới về, không cứu được khẩn).
- **Dự trữ (Sea)** trả lời: "Sau khi PO về và Air về, còn cần đặt thêm bao nhiêu để duy trì buffer?" → dùng `NetDemand = reserve - bo` (future state) + `urgentQty` (sẽ về).
- **Anti-double-count** chặt: `reserveBaseline = NetDemand + urgentQty`, không tính lại phần `bo` đã trả hoặc phần `urgent` đã đặt.

**Tech Stack:** TypeScript, `utils/inventoryEngine.ts`, `pages/Ordering.tsx`, `types/inventory.ts`

---

## Phân tích nền tảng — Tại sao baseline khác nhau

### 1. NetDemand thực chất là gì?

Trong `utils/csvParser.ts:588`:
```
NetDemand = (invNB + invBB + dcNB + dcBB + totalPO) - backorderTotal
          = (available + onOrder) - bo
          = reserve - bo
```

**Tên gọi misleading**: NetDemand thực ra là **Tồn ròng tương lai** (Net Future Supply) sau khi PO về và BO trả hết. Không phải "demand" — đây là **supply state**.

### 2. Bảng quyết định baseline

| Use case | Câu hỏi | Baseline đúng | Tại sao KHÔNG dùng baseline khác |
|----------|---------|---------------|-----------------------------------|
| **Khẩn (Air)** | Cần đặt nhanh bao nhiêu để không bị hụt? | `available - bo` (kệ hiện tại trừ nợ) | KHÔNG dùng `NetDemand` vì nó cộng PO chưa về (2-3 tháng) → false sense of safety |
| **Dự trữ (Sea)** | Sau khi PO+Air về, còn thiếu bao nhiêu để đạt buffer? | `NetDemand + urgentQty` (future state) | KHÔNG dùng `available` vì nó bỏ qua PO sắp về → over-order |

### 3. Tại sao current code có vấn đề

`inventoryEngine.ts:729-742` hiện tại:
```typescript
const target = Math.max(stockMax, bo);
gapOrExcess = ceil((target - reserve) / snp) × snp;  // reserve = available + onOrder
suggestedBO = ceil((bo - reserve - min(gapOrExcess, bo-reserve)) / snp) × snp;
```

**Lỗi 1**: `target = max(stockMax, bo)` — nếu `bo > stockMax`, target sẽ chỉ là `bo`, bỏ qua nhu cầu buffer cho demand sắp tới.

**Lỗi 2**: `gapOrExcess` dùng `reserve` (đã cộng `onOrder`) → ít fire khi có nhiều PO, dù `available` thực tế đã hết.

**Lỗi 3**: `suggestedBO` (Air) hầu như không bao giờ fire vì `gapOrExcess` đã cover BO trước. User báo "không thấy gợi ý Air" là đúng.

---

## File Structure

| File | Action | Trách nhiệm |
|------|--------|-------------|
| `utils/inventoryEngine.ts` | Modify (lines 729-742) | Thay 2 dòng `gapOrExcess`/`suggestedBO` bằng 2 hàm riêng `computeUrgentQty` + `computeReserveQty` |
| `types/inventory.ts` | Modify (`ComputedFields`) | Thêm `urgentQty`, `reserveQty`, `urgentTrigger`, `reserveTrigger`, `orderPriority` |
| `pages/Ordering.tsx` | Modify (lines 1091-1109) | Đổi `suggestedBO`→`urgentQty`, `gapOrExcess`→`reserveQty`, thêm trigger badge |

---

## Task 1: Mở rộng ComputedFields type

**Files:**
- Modify: `types/inventory.ts`

- [ ] **Step 1: Tìm interface ComputedFields**

```bash
grep -n "interface ComputedFields\|type ComputedFields\|gapOrExcess\|suggestedBO" types/inventory.ts
```

Expected: tìm thấy `ComputedFields` interface chứa `gapOrExcess` và `suggestedBO`.

- [ ] **Step 2: Thêm fields mới (giữ field cũ cho backward-compat)**

Trong `types/inventory.ts`, tìm `ComputedFields` interface, thêm vào cuối:

```typescript
// === Dual-mode ordering algorithm ===
urgentQty?: number;          // Khẩn (Air) — cover BO + imminent stockout
reserveQty?: number;         // Dự trữ (Sea) — fill to StockMax (after urgent)
urgentTrigger?: 'backorder' | 'stockout' | 'none';
reserveTrigger?: 'below_stockmax' | 'none';
orderPriority?: 'urgent_only' | 'reserve_only' | 'both' | 'none';
urgentReason?: string;       // human-readable lý do (badge tooltip)
reserveReason?: string;
```

- [ ] **Step 3: Build check**

```bash
cd D:\App\V16
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution.*accent\|InventoryDistribution.*warn\|npm notice" | tail -5
```

Expected: chỉ thấy 2 lỗi cũ của `InventoryDistribution.tsx`.

- [ ] **Step 4: Commit**

```bash
git add types/inventory.ts
git commit -m "feat(types): add urgent/reserve computed fields to ComputedFields"
```

---

## Task 2: Implement computeUrgentQty

**Files:**
- Modify: `utils/inventoryEngine.ts` (thêm function trước `computeInventory`)

- [ ] **Step 1: Thêm hàm `computeUrgentQty`**

Trong `utils/inventoryEngine.ts`, ngay trước `export function computeInventory(`, thêm:

```typescript
/**
 * Khẩn (Air) — đặt nhanh để cover deficit RIGHT NOW.
 * Baseline: `available - bo` (kệ thật trừ nợ thật).
 * KHÔNG tính `onOrder` vì PO 2-3 tháng nữa mới về, không cứu được khẩn.
 *
 * Triggers:
 *   1. backorder: bo > available  → khách hàng đang chờ
 *   2. stockout : (available - bo) < rop → sắp hết trong LT, cần đặt khẩn
 *   3. none     : tồn đủ để cover BO + ROP buffer
 */
function computeUrgentQty(params: {
    available: number;
    bo: number;
    rop: number;
    snp: number;
    demandMonthly: number;
    maxOrderMonths?: number;
}): { qty: number; trigger: 'backorder' | 'stockout' | 'none'; reason: string } {
    const { available, bo, rop, snp, demandMonthly, maxOrderMonths = 4 } = params;
    const realStock = available - bo;  // kệ thật sau khi trả BO
    const cap = demandMonthly * maxOrderMonths;
    const roundUp = (x: number) => snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x);

    // Trigger 1: BO > available → có khách đang chờ
    if (bo > 0 && bo > available) {
        const deficit = bo - available;        // số bị nợ chưa có hàng
        const buffer = Math.max(0, rop);       // cần thêm buffer đến ROP cho demand mới
        const need = deficit + buffer;
        const qty = roundUp(Math.min(need, cap));
        return {
            qty,
            trigger: 'backorder',
            reason: `BO ${bo} > tồn ${available}, thiếu ${deficit} + buffer ROP ${Math.round(buffer)}`,
        };
    }

    // Trigger 2: realStock < ROP → sắp hết trong lead time
    if (realStock < rop) {
        const need = rop - realStock;
        const qty = roundUp(Math.min(need, cap));
        return {
            qty,
            trigger: 'stockout',
            reason: `Tồn ròng ${realStock} < ROP ${Math.round(rop)}, hụt ${Math.round(need)}`,
        };
    }

    return { qty: 0, trigger: 'none', reason: 'Tồn đủ cover BO + ROP buffer' };
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

Expected: chỉ lỗi cũ.

- [ ] **Step 3: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): add computeUrgentQty with BO + stockout triggers"
```

---

## Task 3: Implement computeReserveQty

**Files:**
- Modify: `utils/inventoryEngine.ts`

- [ ] **Step 1: Thêm hàm `computeReserveQty` ngay sau `computeUrgentQty`**

```typescript
/**
 * Dự trữ (Sea) — đặt từ từ để duy trì buffer.
 * Baseline: NetDemand + urgentQty = future state sau khi PO + Air về.
 * Anti-double-count: KHÔNG cộng lại bo (đã trừ trong NetDemand) và KHÔNG re-tính phần urgent đã đặt.
 *
 * Trigger:
 *   - below_stockmax: futureStock < stockMax → cần buffer thêm
 *   - none          : đã có đủ buffer
 */
function computeReserveQty(params: {
    netDemand: number;       // = reserve - bo = available + onOrder - bo
    urgentQty: number;       // sẽ về thêm từ Air order
    stockMax: number;
    snp: number;
    demandMonthly: number;
    maxOrderMonths?: number;
}): { qty: number; trigger: 'below_stockmax' | 'none'; reason: string } {
    const { netDemand, urgentQty, stockMax, snp, demandMonthly, maxOrderMonths = 4 } = params;
    const futureStock = netDemand + urgentQty;
    const cap = demandMonthly * maxOrderMonths;
    const roundUp = (x: number) => snp > 0 ? Math.ceil(x / snp) * snp : Math.ceil(x);

    if (futureStock >= stockMax) {
        return {
            qty: 0,
            trigger: 'none',
            reason: `Future stock ${Math.round(futureStock)} >= MAX ${Math.round(stockMax)}, không cần dự trữ`,
        };
    }

    const need = stockMax - futureStock;
    const qty = roundUp(Math.min(need, cap));
    return {
        qty,
        trigger: 'below_stockmax',
        reason: `Future stock ${Math.round(futureStock)} < MAX ${Math.round(stockMax)}, cần thêm ${Math.round(need)}`,
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
git commit -m "feat(engine): add computeReserveQty with future-state baseline"
```

---

## Task 4: Wire 2 hàm mới vào computed output

**Files:**
- Modify: `utils/inventoryEngine.ts` (lines 729-742)

- [ ] **Step 1: Đọc đoạn cũ để biết context**

Đoạn current (lines 729-742):
```typescript
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

- [ ] **Step 2: Thay bằng dual-mode logic**

```typescript
// === Dual-mode ordering: Khẩn (Air) + Dự trữ (Sea) ===
let urgentQty = 0, reserveQty = 0;
let urgentTrigger: 'backorder' | 'stockout' | 'none' = 'none';
let reserveTrigger: 'below_stockmax' | 'none' = 'none';
let urgentReason = '', reserveReason = '';

if (!isStop && !isZeroDemand) {
    const urgent = computeUrgentQty({
        available, bo, rop, snp, demandMonthly,
    });
    urgentQty = urgent.qty;
    urgentTrigger = urgent.trigger;
    urgentReason = urgent.reason;

    const netDemandValue = available + onOrder - bo;  // recompute to be safe
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

// Order priority classification
let orderPriority: 'urgent_only' | 'reserve_only' | 'both' | 'none' = 'none';
if (urgentQty > 0 && reserveQty > 0) orderPriority = 'both';
else if (urgentQty > 0) orderPriority = 'urgent_only';
else if (reserveQty > 0) orderPriority = 'reserve_only';

// Backward-compat: giữ suggestedBO/gapOrExcess để code cũ chưa migrate vẫn chạy
const suggestedBO = urgentQty;
const gapOrExcess = reserveQty;
```

- [ ] **Step 3: Tìm chỗ build `ComputedFields` return object**

```bash
grep -n "return {" utils/inventoryEngine.ts | head -5
grep -n "gapOrExcess:\|suggestedBO:" utils/inventoryEngine.ts
```

- [ ] **Step 4: Thêm fields mới vào return object**

Trong return object của `computeInventory`, ngay sau `gapOrExcess,` và `suggestedBO,` thêm:

```typescript
        gapOrExcess,
        suggestedBO,
        // === Dual-mode fields ===
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
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 6: Smoke test trong dev**

```bash
npm run dev
```

Mở browser → trang Ordering → kiểm tra console không có error → kiểm tra bảng vẫn render qty gợi ý (vì backward-compat suggestedBO/gapOrExcess vẫn cấp giá trị).

- [ ] **Step 7: Commit**

```bash
git add utils/inventoryEngine.ts
git commit -m "feat(engine): wire dual-mode urgent/reserve into computed fields with backward-compat"
```

---

## Task 5: Migrate Ordering.tsx UI để dùng fields mới

**Files:**
- Modify: `pages/Ordering.tsx` (lines 1091-1109)

- [ ] **Step 1: Update Air button — dùng urgentQty + trigger badge**

Tìm đoạn (line ~1091):

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
        className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full border border-rose-200 mt-0.5"
    >
        {item.computed?.urgentTrigger === 'backorder' ? 'BO' : 'ROP'}: {item.computed!.urgentQty}
    </button>
)}
```

- [ ] **Step 2: Update Sea button — dùng reserveQty**

Tìm (line ~1108):

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

- [ ] **Step 3: Tìm các chỗ khác dùng suggestedBO/gapOrExcess trong Ordering.tsx**

```bash
grep -n "suggestedBO\|gapOrExcess" pages/Ordering.tsx
```

Với mỗi chỗ tìm thấy, áp dụng tương tự: `suggestedBO`→`urgentQty`, `gapOrExcess`→`reserveQty`.

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add pages/Ordering.tsx
git commit -m "feat(ui): Ordering page uses dual-mode urgent/reserve with trigger badges"
```

---

## Task 6: Row priority indicator + filter

**Files:**
- Modify: `pages/Ordering.tsx`

- [ ] **Step 1: Thêm border màu trái row theo priority**

Tìm `<tr key={item.ItemCode}` (line ~1165):

```tsx
<tr key={item.ItemCode} className={`hover:bg-slate-50 transition-colors group ${draftQtyTotal > 0 ? 'bg-blue-50/20' : ''}`}>
```

Thay bằng:

```tsx
{(() => {
    const pri = item.computed?.orderPriority;
    const priClass =
        pri === 'urgent_only' ? 'border-l-4 border-rose-500' :
        pri === 'both'        ? 'border-l-4 border-amber-500' :
        pri === 'reserve_only'? 'border-l-4 border-blue-400' :
        'border-l-4 border-transparent';
    return (
        <tr key={item.ItemCode} className={`hover:bg-slate-50 transition-colors group ${draftQtyTotal > 0 ? 'bg-blue-50/20' : ''} ${priClass}`}>
        {/* ... existing tr children ... */}
    );
})()}
```

**LƯU Ý**: vì pattern IIFE-trong-map có thể gây nhiễu cấu trúc, đơn giản hơn dùng inline ternary trên className gốc. Cụ thể:

```tsx
const pri = item.computed?.orderPriority;
const priClass =
    pri === 'urgent_only' ? 'border-l-4 border-rose-500' :
    pri === 'both'        ? 'border-l-4 border-amber-500' :
    pri === 'reserve_only'? 'border-l-4 border-blue-400' :
    'border-l-4 border-transparent';
```

(Đặt biến này trên dòng `const demandMonthly = ...` đã có) rồi append `${priClass}` vào className của `<tr>`.

- [ ] **Step 2: Thêm filter chip "Chỉ Khẩn / Chỉ Dự trữ / Cả hai"**

Tìm filter chip area (search "filterPills" hoặc "Coverage"):

```bash
grep -n "Coverage\|filterPills\|chip" pages/Ordering.tsx | head -10
```

Thêm 3 chip mới:

```tsx
{(['urgent_only', 'reserve_only', 'both'] as const).map(pri => (
    <button
        key={pri}
        onClick={() => setPriorityFilter(p => p === pri ? null : pri)}
        className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition-all ${
            priorityFilter === pri
                ? pri === 'urgent_only' ? 'bg-rose-100 text-rose-700 border-rose-300' :
                  pri === 'both'        ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                          'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
        }`}
    >
        {pri === 'urgent_only' ? 'Chỉ Khẩn' : pri === 'both' ? 'Cả hai' : 'Chỉ Dự trữ'}
    </button>
))}
```

Khai báo state ở đầu component:

```typescript
const [priorityFilter, setPriorityFilter] = useState<'urgent_only' | 'reserve_only' | 'both' | null>(null);
```

Và áp filter vào `paginatedData` source:

```typescript
const priorityFiltered = priorityFilter
    ? enrichedList.filter(it => it.computed?.orderPriority === priorityFilter)
    : enrichedList;
```

(replace `enrichedList` downstream bằng `priorityFiltered`)

- [ ] **Step 3: Build + deploy**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npx vercel --prod --yes 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add pages/Ordering.tsx
git commit -m "feat(ui): row priority border + filter chips for urgent/reserve/both"
```

---

## Task 7: Update OrderReviewModal + ExecutiveDashboard nếu cần

**Files:**
- Modify (nếu cần): `components/OrderReviewModal.tsx`, `components/ExecutiveDashboard.tsx`

- [ ] **Step 1: Tìm các chỗ khác dùng suggestedBO/gapOrExcess**

```bash
grep -rn "suggestedBO\|gapOrExcess" components/ pages/ utils/ | grep -v "inventoryEngine.ts\|Ordering.tsx" | head -20
```

- [ ] **Step 2: Với mỗi file tìm thấy, kiểm tra nếu nó render gợi ý qty**

Nếu có, áp dụng cùng pattern: `suggestedBO`→`urgentQty || suggestedBO` (fallback chain), `gapOrExcess`→`reserveQty || gapOrExcess`.

- [ ] **Step 3: Build + deploy**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npx vercel --prod --yes 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: migrate remaining components to dual-mode order suggestions"
```

---

## Tóm tắt quyết định thiết kế

### Bảng tra cứu nhanh: scenario → action

| `available` | `bo` | `onOrder` | `rop` | `stockMax` | → urgentQty | → reserveQty | Lý do |
|-------------|------|-----------|-------|------------|-------------|---------------|-------|
| 100 | 0 | 0 | 50 | 200 | 0 | 100 | Tồn đủ ROP, đặt dự trữ tới MAX |
| 50 | 30 | 0 | 50 | 200 | 50 | 130 | BO < tồn nhưng tồn ròng (20) < ROP → urgent fill ROP, reserve fill MAX |
| 20 | 50 | 0 | 50 | 200 | 80 | 150 | BO > tồn → urgent = (50-20) deficit + 50 buffer, reserve fill phần còn lại |
| 100 | 0 | 100 | 50 | 200 | 0 | 0 | Tồn + PO = 200 = MAX, không đặt thêm |
| 30 | 50 | 100 | 50 | 200 | 70 | 50 | BO > tồn → urgent. PO 100 sẽ về sau, reserve = MAX 200 - (NetDemand 80 + urgent 70) = 50 |

### Tại sao dual-mode > single target?

**Single target (current)**: `target = max(stockMax, bo)` chỉ ra một số duy nhất, mix khẩn và dự trữ. User không biết tại sao gợi ý số đó, không biết có nên đặt Air hay Sea.

**Dual-mode**: 
- Mỗi qty có **trigger** rõ ràng (BO / stockout / below_stockmax)
- Mỗi qty có **reason** human-readable (badge tooltip)
- Anti-double-count: reserve baseline đã trừ urgent → không over-order
- UI có thể filter "chỉ khẩn" để buyer xử lý nhanh

---

## Self-Review Checklist

- [x] Spec coverage: cả 3 yêu cầu (Khẩn, Dự trữ, NetDemand vs stock baseline) đều có task
- [x] Không placeholder: mỗi step có code thực, command thực, expected output
- [x] Type consistency: `urgentQty` xuất hiện ở Task 1 (type), Task 2 (function), Task 4 (wire), Task 5 (UI) đều đúng tên
- [x] Backward-compat: giữ `suggestedBO`/`gapOrExcess` để code cũ không vỡ
- [x] Test path: smoke test ở Task 4, deploy ở Task 6 và 7
