# Theo dõi thực thi đơn hàng & hàng về — Giai đoạn 1 (Lõi vận hành + nạp lịch sử) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa quy trình theo dõi thực thi đơn hàng/hàng về vào V16: tách đơn duyệt theo NCC, theo dõi vòng đời S0–S9 đến mức dòng + lô (giao nhiều đợt, tồn nợ), nhập/sửa tay + bảng theo dõi, và nạp 1 lần dữ liệu lịch sử Excel 187k dòng.

**Architecture:** Engine logic thuần trong `utils/execution/*` (TDD, không phụ thuộc React/Supabase) tái dùng `normalizePartCode`, `supersessionGraph`, `calendar`. Dữ liệu lưu Supabase (5 bảng mới) qua tầng `utils/supabase/execution.ts`. UI là một page V16 + hook + bảng virtualize. Nạp lịch sử bằng script Node dùng `exceljs` + hàm map thuần đã test.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres), Vitest, `@tanstack/react-virtual`, `exceljs`.

**Spec nguồn:** `docs/superpowers/specs/2026-06-02-ncc-order-execution-tracking-design.md`

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `types/execution.ts` | Kiểu canonical: `SupplierOrder`, `OrderLine`, `ReceiptLot`, `PartSupplierMap`, `ExecStage` enum |
| `utils/execution/normalize.ts` | Chuẩn hoá biến thể chữ: phương thức, loại đơn, cảng, phân nhóm |
| `utils/execution/split.ts` | Tách dòng đơn duyệt theo NCC (dùng supersession + normalizePartCode + map) |
| `utils/execution/outstanding.ts` | Tồn nợ + tuổi nợ theo dòng |
| `utils/execution/stateMachine.ts` | Bậc S0–S9, chuyển trạng thái lô, rollup trạng thái đơn |
| `utils/execution/forecast.ts` | Dự báo ngày về kho (ETA + đệm / trung vị lead-time) + `median` |
| `utils/execution/importMap.ts` | Map 1 dòng Excel lịch sử → canonical (thuần, test được) |
| `utils/supabase/execution.ts` | Data-access 5 bảng mới |
| `supabase/migrations/020_execution_tracking.sql` | Schema + RLS |
| `scripts/import-execution-history.mjs` | Nạp 1 lần Excel 187k → Supabase (glue, dùng `importMap`) |
| `hooks/useExecutionTracking.ts` | Tải/ghi dữ liệu cho UI |
| `pages/ExecutionTracking.tsx` | Bảng pipeline + review tách NCC (G1) + nhập/sửa tay |
| `utils/__tests__/execution.*.test.ts` | Test cho từng engine |

---

## Task 1: Kiểu canonical (`types/execution.ts`)

**Files:**
- Create: `types/execution.ts`

- [ ] **Step 1: Tạo file kiểu**

```typescript
// types/execution.ts
// Canonical entities cho phân hệ theo dõi thực thi đơn hàng & hàng về.

export type ExecStage =
  | 'S0_PENDING_SPLIT'
  | 'S1_SPLIT'
  | 'S2_ORDERED'
  | 'S3_SUPPLIER_CONFIRMED'
  | 'S4_INVOICED'
  | 'S5_ETD'
  | 'S6_ETA'
  | 'S7_CUSTOMS'
  | 'S8_RECEIVED'
  | 'S9_DONE';

export const STAGE_ORDER: ExecStage[] = [
  'S0_PENDING_SPLIT', 'S1_SPLIT', 'S2_ORDERED', 'S3_SUPPLIER_CONFIRMED',
  'S4_INVOICED', 'S5_ETD', 'S6_ETA', 'S7_CUSTOMS', 'S8_RECEIVED', 'S9_DONE',
];

export type ShipMethod = 'AIR' | 'SEA';
export type OrderType = 'DU_TRU' | 'KHAN';

export interface PartSupplierMap {
  part_code: string;   // mã PT mới, đã normalize
  supplier: string;    // tên NCC chuẩn
}

export interface SupplierOrder {
  id: string;
  source: 'v16' | 'imported' | 'manual';
  v16_approval_id: string | null;
  po_region_no: string | null;     // Số PO miền
  po_date: string | null;          // ISO
  region: string | null;           // Miền đặt hàng
  order_type: OrderType | null;
  ship_method: ShipMethod | null;
  supplier: string;                // NCC
  external_order_ref: string | null; // khoá đơn trên app NCC (bind ở S2)
  ordered_at: string | null;
  supplier_confirmed_at: string | null;
  stage: ExecStage;
}

export interface OrderLine {
  id: string;
  supplier_order_id: string;
  part_code_old: string | null;
  part_code: string;               // mã mới đã normalize
  name_vi: string | null;
  name_en: string | null;
  unit: string | null;
  car_model: string | null;
  group_name: string | null;       // phân nhóm chuẩn
  qty_ordered: number;
  unit_price: number | null;
}

export interface ReceiptLot {
  id: string;
  order_line_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  etd_pol: string | null;
  eta_pod: string | null;
  port: string | null;             // cảng đến chuẩn
  expected_wh_date: string | null; // dự kiến về kho
  actual_wh_date: string | null;   // thực tế về kho
  warehouse: string | null;
  qty_received: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add types/execution.ts
git commit -m "feat(execution): canonical types for order execution tracking"
```

---

## Task 2: Chuẩn hoá biến thể chữ (`utils/execution/normalize.ts`)

**Files:**
- Create: `utils/execution/normalize.ts`
- Test: `utils/__tests__/execution.normalize.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normShipMethod, normOrderType, normPort, normGroup } from '../execution/normalize';

describe('normShipMethod', () => {
  it('gộp mọi biến thể AIR/SEA', () => {
    expect(normShipMethod('AIR')).toBe('AIR');
    expect(normShipMethod('Air')).toBe('AIR');
    expect(normShipMethod('SEA')).toBe('SEA');
    expect(normShipMethod('sea')).toBe('SEA');
    expect(normShipMethod(' Sea ')).toBe('SEA');
  });
  it('null cho giá trị lạ', () => {
    expect(normShipMethod('')).toBeNull();
    expect(normShipMethod('xyz')).toBeNull();
  });
});

describe('normOrderType', () => {
  it('gộp Khẩn/KHẨN và Dự trữ', () => {
    expect(normOrderType('Khẩn')).toBe('KHAN');
    expect(normOrderType('KHẨN')).toBe('KHAN');
    expect(normOrderType('Dự trữ')).toBe('DU_TRU');
  });
});

describe('normPort', () => {
  it('gộp biến thể tên cảng theo hoa + bỏ dấu cách thừa', () => {
    expect(normPort('HẢI PHÒNG')).toBe('HẢI PHÒNG');
    expect(normPort('Cát Lái HCM')).toBe('CÁT LÁI HCM');
    expect(normPort('CÁT LÁI HCM')).toBe('CÁT LÁI HCM');
    expect(normPort('VICT hCM')).toBe('VICT HCM');
  });
});

describe('normGroup', () => {
  it('sửa typo ĐỐNG SƠN → ĐỒNG SƠN', () => {
    expect(normGroup('ĐỐNG SƠN')).toBe('ĐỒNG SƠN');
    expect(normGroup('ĐỒNG SƠN')).toBe('ĐỒNG SƠN');
    expect(normGroup('MÁY GẦM ĐIỆN')).toBe('MÁY GẦM ĐIỆN');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.normalize.test.ts`
Expected: FAIL ("Cannot find module '../execution/normalize'").

- [ ] **Step 3: Viết implementation tối thiểu**

```typescript
// utils/execution/normalize.ts
import type { ShipMethod, OrderType } from '../../types/execution';

const collapse = (s?: string | null) => (s || '').trim().replace(/\s+/g, ' ');

export function normShipMethod(s?: string | null): ShipMethod | null {
  const v = collapse(s).toUpperCase();
  if (v === 'AIR') return 'AIR';
  if (v === 'SEA') return 'SEA';
  return null;
}

export function normOrderType(s?: string | null): OrderType | null {
  const v = collapse(s).toUpperCase();
  if (v === 'KHẨN' || v === 'KHAN') return 'KHAN';
  if (v.startsWith('DỰ TRỮ') || v === 'DU TRU') return 'DU_TRU';
  return null;
}

export function normPort(s?: string | null): string | null {
  const v = collapse(s).toUpperCase().replace(/,/g, '');
  return v || null;
}

const GROUP_FIX: Record<string, string> = { 'ĐỐNG SƠN': 'ĐỒNG SƠN' };
export function normGroup(s?: string | null): string | null {
  const v = collapse(s).toUpperCase();
  return v ? (GROUP_FIX[v] || v) : null;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/normalize.ts utils/__tests__/execution.normalize.test.ts
git commit -m "feat(execution): value normalizers for ship method/order type/port/group"
```

---

## Task 3: Tách đơn theo NCC (`utils/execution/split.ts`)

**Files:**
- Create: `utils/execution/split.ts`
- Test: `utils/__tests__/execution.split.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.split.test.ts
import { describe, it, expect } from 'vitest';
import { splitBySupplier } from '../execution/split';

const map = new Map<string, string>([
  ['Z1140306256K', 'Mobis Korea'],
  ['Z414282N010', 'Mobis Korea'],
  ['ABC123', 'Mobis India'],
]);

describe('splitBySupplier', () => {
  it('gom dòng theo NCC từ master map (đã normalize mã)', () => {
    const lines = [
      { part_code: 'Z11 40306256K', qty_ordered: 15 }, // có dấu cách → normalize
      { part_code: 'Z414282N010', qty_ordered: 7 },
      { part_code: 'ABC123', qty_ordered: 2 },
    ];
    const { groups, unmapped } = splitBySupplier(lines, map);
    expect(unmapped).toHaveLength(0);
    expect(groups.get('Mobis Korea')).toHaveLength(2);
    expect(groups.get('Mobis India')).toHaveLength(1);
  });

  it('mã không có trong map → unmapped, không đoán', () => {
    const lines = [{ part_code: 'NOPE999', qty_ordered: 1 }];
    const { groups, unmapped } = splitBySupplier(lines, map);
    expect(groups.size).toBe(0);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].part_code).toBe('NOPE999');
  });

  it('dùng resolver đổi mã (supersession) trước khi tra map', () => {
    const resolve = (c: string) => (c === 'OLD1' ? 'ABC123' : c);
    const { groups } = splitBySupplier([{ part_code: 'OLD1', qty_ordered: 3 }], map, resolve);
    expect(groups.get('Mobis India')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.split.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Viết implementation tối thiểu**

```typescript
// utils/execution/split.ts
import { normalizePartCode } from '../partAffinity';

export interface SplittableLine { part_code: string; qty_ordered: number; [k: string]: unknown; }

/**
 * Gom dòng theo NCC dựa trên master map (mã PT đã normalize → NCC).
 * resolveSupersession (tuỳ chọn): đổi mã cũ → mã mới trước khi tra map.
 * Mã không tra được → trả về unmapped (KHÔNG tự đoán NCC).
 */
export function splitBySupplier<T extends SplittableLine>(
  lines: T[],
  partSupplierMap: Map<string, string>,
  resolveSupersession?: (code: string) => string,
): { groups: Map<string, T[]>; unmapped: T[] } {
  const groups = new Map<string, T[]>();
  const unmapped: T[] = [];
  for (const line of lines) {
    const resolved = resolveSupersession ? resolveSupersession(line.part_code) : line.part_code;
    const key = normalizePartCode(resolved);
    const supplier = partSupplierMap.get(key);
    if (!supplier) { unmapped.push(line); continue; }
    if (!groups.has(supplier)) groups.set(supplier, []);
    groups.get(supplier)!.push(line);
  }
  return { groups, unmapped };
}
```

> Lưu ý: `partSupplierMap` keys phải đã `normalizePartCode`. Test trên dùng key `'Z1140306256K'` (không dấu cách) — khớp sau normalize.

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.split.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/split.ts utils/__tests__/execution.split.test.ts
git commit -m "feat(execution): split approved order lines by supplier"
```

---

## Task 4: Tồn nợ & tuổi nợ (`utils/execution/outstanding.ts`)

**Files:**
- Create: `utils/execution/outstanding.ts`
- Test: `utils/__tests__/execution.outstanding.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.outstanding.test.ts
import { describe, it, expect } from 'vitest';
import { computeOutstanding, computeAgingDays } from '../execution/outstanding';

describe('computeOutstanding', () => {
  it('tồn nợ = đặt − tổng nhận các lô', () => {
    expect(computeOutstanding(15, [{ qty_received: 5 }, { qty_received: 7 }])).toBe(3);
  });
  it('không âm khi nhận dư', () => {
    expect(computeOutstanding(10, [{ qty_received: 12 }])).toBe(0);
  });
  it('chưa có lô → nợ toàn bộ', () => {
    expect(computeOutstanding(8, [])).toBe(8);
  });
});

describe('computeAgingDays', () => {
  it('số ngày từ ngày đặt đến mốc cho trước', () => {
    expect(computeAgingDays('2026-01-01', new Date('2026-01-11'))).toBe(10);
  });
  it('null ngày đặt → null', () => {
    expect(computeAgingDays(null, new Date('2026-01-11'))).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.outstanding.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```typescript
// utils/execution/outstanding.ts
const MS_PER_DAY = 86_400_000;

export function computeOutstanding(qtyOrdered: number, lots: { qty_received: number }[]): number {
  const received = lots.reduce((s, l) => s + (l.qty_received || 0), 0);
  return Math.max(0, qtyOrdered - received);
}

/** Số ngày dương lịch từ ngày đặt (ISO) đến asOf. null nếu thiếu ngày đặt. */
export function computeAgingDays(orderedAt: string | null, asOf: Date): number | null {
  if (!orderedAt) return null;
  const start = new Date(orderedAt).getTime();
  if (Number.isNaN(start)) return null;
  return Math.floor((asOf.getTime() - start) / MS_PER_DAY);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.outstanding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/outstanding.ts utils/__tests__/execution.outstanding.test.ts
git commit -m "feat(execution): outstanding qty + aging days"
```

---

## Task 5: State machine + rollup (`utils/execution/stateMachine.ts`)

**Files:**
- Create: `utils/execution/stateMachine.ts`
- Test: `utils/__tests__/execution.stateMachine.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.stateMachine.test.ts
import { describe, it, expect } from 'vitest';
import { stageFromLot, rollupOrderStage } from '../execution/stateMachine';

describe('stageFromLot', () => {
  it('suy bậc từ các mốc đã điền của lô', () => {
    expect(stageFromLot({})).toBe('S2_ORDERED');
    expect(stageFromLot({ invoice_no: 'F1' })).toBe('S4_INVOICED');
    expect(stageFromLot({ invoice_no: 'F1', etd_pol: '2026-01-14' })).toBe('S5_ETD');
    expect(stageFromLot({ invoice_no: 'F1', eta_pod: '2026-01-15' })).toBe('S6_ETA');
    expect(stageFromLot({ actual_wh_date: '2026-01-18' })).toBe('S8_RECEIVED');
  });
});

describe('rollupOrderStage', () => {
  it('đơn = bậc THẤP NHẤT của các dòng chưa hoàn tất', () => {
    expect(rollupOrderStage(['S6_ETA', 'S4_INVOICED', 'S8_RECEIVED'])).toBe('S4_INVOICED');
  });
  it('mọi dòng done → S9_DONE', () => {
    expect(rollupOrderStage(['S9_DONE', 'S9_DONE'])).toBe('S9_DONE');
  });
  it('rỗng → S1_SPLIT', () => {
    expect(rollupOrderStage([])).toBe('S1_SPLIT');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.stateMachine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```typescript
// utils/execution/stateMachine.ts
import { type ExecStage, STAGE_ORDER } from '../../types/execution';
import type { ReceiptLot } from '../../types/execution';

type LotMarks = Partial<Pick<ReceiptLot, 'invoice_no' | 'etd_pol' | 'eta_pod' | 'actual_wh_date'>> & {
  customs?: boolean;
};

/** Bậc của một lô dựa trên mốc đã điền (mốc muộn nhất thắng). */
export function stageFromLot(lot: LotMarks): ExecStage {
  if (lot.actual_wh_date) return 'S8_RECEIVED';
  if (lot.customs) return 'S7_CUSTOMS';
  if (lot.eta_pod) return 'S6_ETA';
  if (lot.etd_pol) return 'S5_ETD';
  if (lot.invoice_no) return 'S4_INVOICED';
  return 'S2_ORDERED';
}

const rank = (s: ExecStage) => STAGE_ORDER.indexOf(s);

/** Trạng thái đơn = bậc thấp nhất trong các dòng. Mọi dòng S9 → S9. Rỗng → S1. */
export function rollupOrderStage(lineStages: ExecStage[]): ExecStage {
  if (lineStages.length === 0) return 'S1_SPLIT';
  if (lineStages.every((s) => s === 'S9_DONE')) return 'S9_DONE';
  return lineStages.reduce((min, s) => (rank(s) < rank(min) ? s : min), lineStages[0]);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.stateMachine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/stateMachine.ts utils/__tests__/execution.stateMachine.test.ts
git commit -m "feat(execution): lot stage detection + order stage rollup"
```

---

## Task 6: Dự báo ngày về kho + median (`utils/execution/forecast.ts`)

**Files:**
- Create: `utils/execution/forecast.ts`
- Test: `utils/__tests__/execution.forecast.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.forecast.test.ts
import { describe, it, expect } from 'vitest';
import { median, forecastWarehouseDate } from '../execution/forecast';

describe('median', () => {
  it('trung vị lẻ/chẵn', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('rỗng → null', () => {
    expect(median([])).toBeNull();
  });
});

describe('forecastWarehouseDate', () => {
  it('có ETA → ETA + đệm thông quan', () => {
    const r = forecastWarehouseDate({ etaPod: '2026-01-15', clearanceBufferDays: 3 });
    expect(r).toBe('2026-01-18');
  });
  it('chưa có ETA → ngày đặt + lead-time trung vị', () => {
    const r = forecastWarehouseDate({ orderedAt: '2026-01-01', medianLeadTimeDays: 17 });
    expect(r).toBe('2026-01-18');
  });
  it('thiếu dữ liệu → null', () => {
    expect(forecastWarehouseDate({})).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.forecast.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```typescript
// utils/execution/forecast.ts
const MS_PER_DAY = 86_400_000;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  return new Date(d.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Dự báo ngày về kho:
 *  - có ETA: ETA + đệm thông quan theo cảng
 *  - chưa có ETA: ngày đặt + lead-time trung vị (NCC × phương thức × loại đơn)
 */
export function forecastWarehouseDate(opts: {
  etaPod?: string | null;
  clearanceBufferDays?: number;
  orderedAt?: string | null;
  medianLeadTimeDays?: number | null;
}): string | null {
  if (opts.etaPod) return addDaysISO(opts.etaPod, opts.clearanceBufferDays ?? 0);
  if (opts.orderedAt && opts.medianLeadTimeDays != null) {
    return addDaysISO(opts.orderedAt, opts.medianLeadTimeDays);
  }
  return null;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.forecast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/forecast.ts utils/__tests__/execution.forecast.test.ts
git commit -m "feat(execution): warehouse-date forecast + median helper"
```

---

## Task 7: Migration schema (`supabase/migrations/020_execution_tracking.sql`)

**Files:**
- Create: `supabase/migrations/020_execution_tracking.sql`

- [ ] **Step 1: Viết migration**

```sql
-- Theo dõi thực thi đơn hàng & hàng về (2026-06-02)
-- 4 tầng: supplier_orders → order_lines → receipt_lots; part_supplier_map cho tách NCC.

CREATE TABLE IF NOT EXISTS part_supplier_map (
    part_code TEXT PRIMARY KEY,      -- mã PT mới đã normalize
    supplier  TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('v16','imported','manual')),
    v16_approval_id UUID REFERENCES approval_requests(id),
    po_region_no TEXT,
    po_date DATE,
    region TEXT,
    order_type TEXT CHECK (order_type IN ('DU_TRU','KHAN')),
    ship_method TEXT CHECK (ship_method IN ('AIR','SEA')),
    supplier TEXT NOT NULL,
    external_order_ref TEXT,
    ordered_at DATE,
    supplier_confirmed_at DATE,
    stage TEXT NOT NULL DEFAULT 'S1_SPLIT',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_so_supplier ON supplier_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_so_stage ON supplier_orders(stage);
CREATE INDEX IF NOT EXISTS idx_so_extref ON supplier_orders(external_order_ref);
CREATE INDEX IF NOT EXISTS idx_so_po ON supplier_orders(po_region_no);

CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_order_id UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
    part_code_old TEXT,
    part_code TEXT NOT NULL,
    name_vi TEXT, name_en TEXT, unit TEXT, car_model TEXT, group_name TEXT,
    qty_ordered NUMERIC NOT NULL DEFAULT 0,
    unit_price NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_ol_order ON order_lines(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_ol_part ON order_lines(part_code);

CREATE TABLE IF NOT EXISTS receipt_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_line_id UUID NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
    invoice_no TEXT, invoice_date DATE, etd_pol DATE, eta_pod DATE,
    port TEXT, expected_wh_date DATE, actual_wh_date DATE, warehouse TEXT,
    qty_received NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rl_line ON receipt_lots(order_line_id);
CREATE INDEX IF NOT EXISTS idx_rl_invoice ON receipt_lots(invoice_no);

CREATE TABLE IF NOT EXISTS import_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier TEXT,
    filename TEXT,
    rows_total INT, rows_matched INT, rows_new INT, rows_unmatched INT,
    imported_by UUID REFERENCES profiles(id),
    imported_at TIMESTAMPTZ DEFAULT now(),
    note TEXT
);

-- RLS: đọc cho mọi user đã đăng nhập; ghi cho admin/planner (như các bảng khác).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['part_supplier_map','supplier_orders','order_lines','receipt_lots','import_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT TO authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON %I;', t, t);
    EXECUTE format($f$CREATE POLICY %I_write ON %I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','planner')))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','planner')));$f$, t, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Áp migration (môi trường dev/branch)**

Run (qua Supabase MCP `apply_migration`, name `020_execution_tracking`), hoặc Supabase CLI:
`supabase db push`
Expected: 5 bảng tạo thành công, không lỗi.

- [ ] **Step 3: Sinh lại types DB (tuỳ chọn) & commit**

```bash
git add supabase/migrations/020_execution_tracking.sql
git commit -m "feat(execution): migration 020 — execution tracking tables + RLS"
```

---

## Task 8: Tầng data-access (`utils/supabase/execution.ts`)

**Files:**
- Create: `utils/supabase/execution.ts`
- Test: `utils/__tests__/execution.dataaccess.test.ts` (smoke — mock supabase)

- [ ] **Step 1: Viết test smoke (mock client)**

```typescript
// utils/__tests__/execution.dataaccess.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ data: [{ id: 'x' }], error: null }) }),
    }),
  },
}));

import { buildSupplierOrderRows } from '../../utils/supabase/execution';

describe('buildSupplierOrderRows', () => {
  it('map nhóm NCC → bản ghi supplier_orders', () => {
    const rows = buildSupplierOrderRows('appr-1', new Map([['Mobis Korea', [{ part_code: 'A', qty_ordered: 2 }]]]), {
      po_region_no: 'PO1', region: 'Miền Bắc', order_type: 'KHAN', ship_method: 'AIR',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier).toBe('Mobis Korea');
    expect(rows[0].source).toBe('v16');
    expect(rows[0].stage).toBe('S1_SPLIT');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.dataaccess.test.ts`
Expected: FAIL (no `buildSupplierOrderRows`).

- [ ] **Step 3: Viết implementation**

```typescript
// utils/supabase/execution.ts
import { supabase } from './client';
import { selectAllPaginated } from './helpers';
import type { SupplierOrder, OrderLine, ReceiptLot, OrderType, ShipMethod } from '../../types/execution';
import type { SplittableLine } from '../execution/split';

interface OrderMeta {
  po_region_no: string | null; region: string | null;
  order_type: OrderType | null; ship_method: ShipMethod | null;
}

/** Tạo bản ghi supplier_orders (chưa id) từ kết quả tách NCC. Thuần — test được. */
export function buildSupplierOrderRows(
  approvalId: string | null,
  groups: Map<string, SplittableLine[]>,
  meta: OrderMeta,
): Omit<SupplierOrder, 'id'>[] {
  return [...groups.keys()].map((supplier) => ({
    source: approvalId ? 'v16' : 'manual',
    v16_approval_id: approvalId,
    po_region_no: meta.po_region_no,
    po_date: null,
    region: meta.region,
    order_type: meta.order_type,
    ship_method: meta.ship_method,
    supplier,
    external_order_ref: null,
    ordered_at: null,
    supplier_confirmed_at: null,
    stage: 'S1_SPLIT',
  }));
}

export async function listSupplierOrders(): Promise<SupplierOrder[]> {
  return selectAllPaginated<SupplierOrder>('supplier_orders', '*');
}

export async function listOrderLines(orderId: string): Promise<OrderLine[]> {
  const { data, error } = await supabase.from('order_lines').select('*').eq('supplier_order_id', orderId);
  if (error) throw error;
  return (data ?? []) as OrderLine[];
}

export async function listReceiptLots(lineId: string): Promise<ReceiptLot[]> {
  const { data, error } = await supabase.from('receipt_lots').select('*').eq('order_line_id', lineId);
  if (error) throw error;
  return (data ?? []) as ReceiptLot[];
}

export async function updateSupplierOrder(id: string, patch: Partial<SupplierOrder>): Promise<void> {
  const { error } = await supabase.from('supplier_orders').update(patch).eq('id', id);
  if (error) throw error;
}

export async function upsertReceiptLot(lot: Partial<ReceiptLot>): Promise<void> {
  const { error } = await supabase.from('receipt_lots').upsert(lot);
  if (error) throw error;
}
```

> Kiểm tra chữ ký `selectAllPaginated` trong `utils/supabase/helpers.ts:` và chỉnh tham số cho khớp nếu cần.

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.dataaccess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/supabase/execution.ts utils/__tests__/execution.dataaccess.test.ts
git commit -m "feat(execution): supabase data-access for execution tracking"
```

---

## Task 9: Map dòng Excel lịch sử → canonical (`utils/execution/importMap.ts`)

**Files:**
- Create: `utils/execution/importMap.ts`
- Test: `utils/__tests__/execution.importMap.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.importMap.test.ts
import { describe, it, expect } from 'vitest';
import { mapExcelRowToCanonical, excelStatusToStage } from '../execution/importMap';

const headerIndex = {
  po_no: 1, po_date: 2, region: 3, order_type: 4, ship_method: 5,
  part_old: 6, part_new: 7, name_vi: 8, name_en: 9, unit: 10, qty: 11,
  unit_price: 12, car: 14, supplier: 15, ordered_at: 16, ext_ref: 17,
  confirmed_at: 18, invoice_no: 19, invoice_date: 20, etd: 21, eta: 22,
  port: 23, expected_wh: 24, actual_wh: 25, warehouse: 26, status: 27, group: 29,
};

describe('excelStatusToStage', () => {
  it('ánh xạ 4 trạng thái Excel', () => {
    expect(excelStatusToStage('Đã nhập kho')).toBe('S8_RECEIVED');
    expect(excelStatusToStage('Chưa invoice')).toBe('S2_ORDERED');
    expect(excelStatusToStage('Đang thông quan')).toBe('S7_CUSTOMS');
    expect(excelStatusToStage('Đã có invoice, có lịch về')).toBe('S4_INVOICED');
  });
});

describe('mapExcelRowToCanonical', () => {
  it('tách 1 dòng thành order/line/lot đã chuẩn hoá', () => {
    const row = [];
    row[1] = 'EPCBB23010501'; row[2] = new Date('2023-01-06'); row[3] = 'Miền Bắc';
    row[4] = 'Khẩn'; row[5] = 'Air'; row[6] = '_'; row[7] = 'Z1140306256K';
    row[8] = 'BU LÔNG'; row[9] = 'BOLT'; row[10] = 'CÁI'; row[11] = 15; row[12] = 0.05;
    row[14] = 'RIO 2012'; row[15] = 'Mobis Korea'; row[16] = new Date('2023-01-07');
    row[17] = 'A26VBW3AAE'; row[19] = 'F3A00719'; row[22] = new Date('2023-01-15');
    row[23] = 'HẢI PHÒNG'; row[25] = new Date('2023-01-18'); row[26] = 'Kho Đài Tư';
    row[27] = 'Đã nhập kho'; row[29] = 'MÁY GẦM ĐIỆN';

    const c = mapExcelRowToCanonical(row, headerIndex);
    expect(c.order.supplier).toBe('Mobis Korea');
    expect(c.order.ship_method).toBe('AIR');
    expect(c.order.order_type).toBe('KHAN');
    expect(c.order.external_order_ref).toBe('A26VBW3AAE');
    expect(c.order.stage).toBe('S8_RECEIVED');
    expect(c.line.part_code).toBe('Z1140306256K');
    expect(c.line.qty_ordered).toBe(15);
    expect(c.lot.qty_received).toBe(15);          // đã nhập kho → nhận đủ
    expect(c.lot.actual_wh_date).toBe('2023-01-18');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.importMap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```typescript
// utils/execution/importMap.ts
import { normalizePartCode } from '../partAffinity';
import { normShipMethod, normOrderType, normPort, normGroup } from './normalize';
import type { ExecStage } from '../../types/execution';

export type HeaderIndex = Record<string, number>;

export function excelStatusToStage(status: string | null): ExecStage {
  const s = (status || '').trim();
  if (s === 'Đã nhập kho') return 'S8_RECEIVED';
  if (s === 'Đang thông quan') return 'S7_CUSTOMS';
  if (s === 'Đã có invoice, có lịch về') return 'S4_INVOICED';
  return 'S2_ORDERED'; // "Chưa invoice" + mặc định
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown): string | null => { const s = (v == null ? '' : String(v)).trim(); return s && s !== '_' ? s : null; };

/** Map 1 dòng Excel (mảng theo cột) → {order, line, lot} canonical, đã chuẩn hoá. */
export function mapExcelRowToCanonical(row: unknown[], h: HeaderIndex) {
  const stage = excelStatusToStage(str(row[h.status]));
  const qty = num(row[h.qty]);
  const order = {
    source: 'imported' as const,
    v16_approval_id: null,
    po_region_no: str(row[h.po_no]),
    po_date: iso(row[h.po_date]),
    region: str(row[h.region]),
    order_type: normOrderType(str(row[h.order_type])),
    ship_method: normShipMethod(str(row[h.ship_method])),
    supplier: str(row[h.supplier]) || 'KHÔNG RÕ',
    external_order_ref: str(row[h.ext_ref]),
    ordered_at: iso(row[h.ordered_at]),
    supplier_confirmed_at: iso(row[h.confirmed_at]),
    stage,
  };
  const line = {
    part_code_old: str(row[h.part_old]),
    part_code: normalizePartCode(String(row[h.part_new] ?? '')),
    name_vi: str(row[h.name_vi]),
    name_en: str(row[h.name_en]),
    unit: str(row[h.unit]),
    car_model: str(row[h.car]),
    group_name: normGroup(str(row[h.group])),
    qty_ordered: qty,
    unit_price: row[h.unit_price] == null ? null : num(row[h.unit_price]),
  };
  const received = stage === 'S8_RECEIVED' || stage === 'S9_DONE' ? qty : 0;
  const lot = {
    invoice_no: str(row[h.invoice_no]),
    invoice_date: iso(row[h.invoice_date]),
    etd_pol: iso(row[h.etd]),
    eta_pod: iso(row[h.eta]),
    port: normPort(str(row[h.port])),
    expected_wh_date: iso(row[h.expected_wh]),
    actual_wh_date: iso(row[h.actual_wh]),
    warehouse: str(row[h.warehouse]),
    qty_received: received,
  };
  return { order, line, lot };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.importMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/execution/importMap.ts utils/__tests__/execution.importMap.test.ts
git commit -m "feat(execution): map historical Excel rows to canonical entities"
```

---

## Task 10: Script nạp lịch sử 187k (`scripts/import-execution-history.mjs`)

**Files:**
- Create: `scripts/import-execution-history.mjs`

> Dùng `exceljs` (đã có trong deps) đọc theo luồng (streaming) để chịu được 187k dòng; gom theo (po_region_no + supplier) thành supplier_orders, theo part_code thành order_lines, mỗi dòng Excel thành 1 receipt_lot. Ghi qua Supabase service key (chạy 1 lần, ngoài app).

- [ ] **Step 1: Viết script**

```javascript
// scripts/import-execution-history.mjs
// Chạy 1 lần: node scripts/import-execution-history.mjs "<đường dẫn .xlsx>"
// Cần env: SUPABASE_URL, SUPABASE_SERVICE_KEY
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { mapExcelRowToCanonical } from '../utils/execution/importMap.ts';

const FILE = process.argv[2];
const HEADER_INDEX = {
  po_no: 1, po_date: 2, region: 3, order_type: 4, ship_method: 5, part_old: 6, part_new: 7,
  name_vi: 8, name_en: 9, unit: 10, qty: 11, unit_price: 12, car: 14, supplier: 15,
  ordered_at: 16, ext_ref: 17, confirmed_at: 18, invoice_no: 19, invoice_date: 20,
  etd: 21, eta: 22, port: 23, expected_wh: 24, actual_wh: 25, warehouse: 26, status: 27, group: 29,
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const orderKey = (o) => `${o.po_region_no || ''}|${o.supplier}`;
const orders = new Map();   // key → {order, lines: Map(part→{line, lots:[]})}

const wb = new ExcelJS.stream.xlsx.WorkbookReader(FILE, {});
let rowNum = 0;
for await (const worksheet of wb) {
  for await (const row of worksheet) {
    rowNum++;
    if (rowNum === 1) continue; // header
    const values = row.values; // exceljs: index 1-based; values[0] undefined
    const arr = []; for (let i = 0; i < values.length; i++) arr[i] = values[i];
    if (!arr[HEADER_INDEX.po_no]) continue;
    const c = mapExcelRowToCanonical(arr, HEADER_INDEX);
    const k = orderKey(c.order);
    if (!orders.has(k)) orders.set(k, { order: c.order, lines: new Map() });
    const bucket = orders.get(k);
    if (!bucket.lines.has(c.line.part_code)) bucket.lines.set(c.line.part_code, { line: c.line, lots: [] });
    bucket.lines.get(c.line.part_code).lots.push(c.lot);
  }
}
console.log(`Đọc ${rowNum - 1} dòng → ${orders.size} đơn NCC`);

// Ghi theo lô: orders → lines → lots
let nOrders = 0, nLines = 0, nLots = 0;
for (const { order, lines } of orders.values()) {
  const { data: so, error: e1 } = await supabase.from('supplier_orders').insert(order).select('id').single();
  if (e1) { console.error('order err', e1.message); continue; }
  nOrders++;
  for (const { line, lots } of lines.values()) {
    const { data: ol, error: e2 } = await supabase.from('order_lines')
      .insert({ ...line, supplier_order_id: so.id }).select('id').single();
    if (e2) { console.error('line err', e2.message); continue; }
    nLines++;
    const lotRows = lots.map((l) => ({ ...l, order_line_id: ol.id }));
    const { error: e3 } = await supabase.from('receipt_lots').insert(lotRows);
    if (e3) console.error('lot err', e3.message); else nLots += lotRows.length;
  }
}
await supabase.from('import_log').insert({
  supplier: 'HISTORICAL', filename: FILE, rows_total: rowNum - 1,
  rows_matched: 0, rows_new: nLines, rows_unmatched: 0, note: 'one-time historical load',
});
console.log(`Đã ghi: ${nOrders} đơn, ${nLines} dòng, ${nLots} lô`);
```

- [ ] **Step 2: Chạy thử trên tập nhỏ (sanity)**

Tạo bản copy 200 dòng đầu của file Excel (thủ công hoặc bằng script tách), đặt biến môi trường, chạy:
`SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/import-execution-history.mjs "test_200.xlsx"`
Expected: log "Đọc 199 dòng → N đơn NCC" và "Đã ghi…" không lỗi; kiểm tra bảng `supplier_orders`/`order_lines`/`receipt_lots` có dữ liệu.

> Lưu ý: import `.ts` trong `.mjs` cần chạy qua `tsx` (đã có trong deps): `npx tsx scripts/import-execution-history.mjs ...`. Nếu vẫn lỗi import, đổi `importMap.ts` → biên dịch hoặc dùng `npx tsx`.

- [ ] **Step 3: Chạy đầy đủ 187k (sau khi sanity OK)**

`npx tsx scripts/import-execution-history.mjs "C:\\Users\\Administrator\\Desktop\\260529_CTy PP Đặt Hàng - Hàng Về Phụ Tùng KIA.xlsx"`
Expected: ~3.077 đơn, ~? dòng, ~187k lô (theo Phụ lục A của spec).

- [ ] **Step 4: Commit**

```bash
git add scripts/import-execution-history.mjs
git commit -m "feat(execution): one-time historical Excel import script"
```

---

## Task 11: Hook + Page UI (`hooks/useExecutionTracking.ts`, `pages/ExecutionTracking.tsx`)

**Files:**
- Create: `hooks/useExecutionTracking.ts`
- Create: `pages/ExecutionTracking.tsx`
- Modify: `App.tsx` (thêm route/menu tới page mới — theo cách các page khác được đăng ký)

- [ ] **Step 1: Viết hook tải dữ liệu**

```typescript
// hooks/useExecutionTracking.ts
import { useCallback, useEffect, useState } from 'react';
import { listSupplierOrders, updateSupplierOrder } from '../utils/supabase/execution';
import type { SupplierOrder } from '../types/execution';

export function useExecutionTracking() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOrders(await listSupplierOrders()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const saveStage = useCallback(async (id: string, patch: Partial<SupplierOrder>) => {
    await updateSupplierOrder(id, patch);
    await reload();
  }, [reload]);

  return { orders, loading, error, reload, saveStage };
}
```

- [ ] **Step 2: Viết page với bảng virtualize + lọc theo trạng thái**

```tsx
// pages/ExecutionTracking.tsx
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useExecutionTracking } from '../hooks/useExecutionTracking';
import { STAGE_ORDER, type ExecStage } from '../types/execution';

const STAGE_LABEL: Record<ExecStage, string> = {
  S0_PENDING_SPLIT: 'Chờ tách', S1_SPLIT: 'Đã tách', S2_ORDERED: 'Đã đặt NCC',
  S3_SUPPLIER_CONFIRMED: 'NCC xác nhận', S4_INVOICED: 'Có invoice', S5_ETD: 'Đã ETD',
  S6_ETA: 'Đến VN (ETA)', S7_CUSTOMS: 'Thông quan', S8_RECEIVED: 'Về kho', S9_DONE: 'Hoàn tất',
};

export default function ExecutionTracking() {
  const { orders, loading, error } = useExecutionTracking();
  const [stageFilter, setStageFilter] = useState<ExecStage | 'OPEN' | 'ALL'>('OPEN');
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    if (stageFilter === 'ALL') return orders;
    if (stageFilter === 'OPEN') return orders.filter((o) => o.stage !== 'S9_DONE');
    return orders.filter((o) => o.stage === stageFilter);
  }, [orders, stageFilter]);

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 40, overscan: 12 });

  if (loading) return <div className="p-6">Đang tải…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Theo dõi thực thi đơn hàng & hàng về</h1>
      <div className="mb-3 flex gap-2 text-sm">
        <button onClick={() => setStageFilter('OPEN')} className="px-2 py-1 border rounded">Đang chạy</button>
        <button onClick={() => setStageFilter('ALL')} className="px-2 py-1 border rounded">Tất cả</button>
        {STAGE_ORDER.map((s) => (
          <button key={s} onClick={() => setStageFilter(s)} className="px-2 py-1 border rounded">{STAGE_LABEL[s]}</button>
        ))}
      </div>
      <div ref={parentRef} className="h-[70vh] overflow-auto border rounded">
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const o = rows[vi.index];
            return (
              <div key={o.id} style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                   className="flex gap-3 px-3 py-2 border-b text-sm">
                <span className="w-40 truncate">{o.po_region_no}</span>
                <span className="w-40 truncate">{o.supplier}</span>
                <span className="w-44 truncate">{o.external_order_ref ?? '—'}</span>
                <span className="w-32">{STAGE_LABEL[o.stage]}</span>
                <span className="w-20">{o.ship_method ?? ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{rows.length} đơn NCC</p>
    </div>
  );
}
```

- [ ] **Step 3: Đăng ký page vào điều hướng**

Mở `App.tsx`, tìm nơi các page được render theo state điều hướng (xem cách `pages/Settings.tsx`, `pages/Ordering.tsx` được mount), thêm một mục menu "Theo dõi thực thi" và nhánh render `<ExecutionTracking />` theo đúng pattern hiện có. (Không thay đổi cơ chế điều hướng, chỉ thêm 1 mục.)

- [ ] **Step 4: Chạy app, kiểm bằng preview**

Run: `npm run dev`, mở page, xác nhận bảng render, lọc "Đang chạy" ẩn đơn S9, cuộn mượt với dữ liệu lịch sử đã nạp.

- [ ] **Step 5: Commit**

```bash
git add hooks/useExecutionTracking.ts pages/ExecutionTracking.tsx App.tsx
git commit -m "feat(execution): tracking page with virtualized pipeline table + stage filter"
```

---

## Task 12: Tách NCC từ đơn duyệt + review G1 (ghép luồng)

**Files:**
- Create: `utils/execution/fromApproval.ts`
- Test: `utils/__tests__/execution.fromApproval.test.ts`

- [ ] **Step 1: Viết test thất bại**

```typescript
// utils/__tests__/execution.fromApproval.test.ts
import { describe, it, expect } from 'vitest';
import { expandApprovalToLines } from '../execution/fromApproval';

describe('expandApprovalToLines', () => {
  it('bung snapshot_data.quantities thành dòng (air & sea tách dòng)', () => {
    const snapshot = { quantities: { 'A1': { air: 5, sea: 0 }, 'B2': { air: 0, sea: 3 } } };
    const lines = expandApprovalToLines(snapshot as any);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ part_code: 'A1', qty_ordered: 5, ship_method: 'AIR' }),
        expect.objectContaining({ part_code: 'B2', qty_ordered: 3, ship_method: 'SEA' }),
      ]),
    );
    expect(lines).toHaveLength(2); // bỏ qty 0
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run utils/__tests__/execution.fromApproval.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```typescript
// utils/execution/fromApproval.ts
import type { SnapshotData } from '../../types/inventory';
import type { ShipMethod } from '../../types/execution';

export interface ExpandedLine { part_code: string; qty_ordered: number; ship_method: ShipMethod; }

/** Bung snapshot_data.quantities {itemCode:{air,sea}} → các dòng (bỏ số lượng 0). */
export function expandApprovalToLines(snapshot: SnapshotData): ExpandedLine[] {
  const out: ExpandedLine[] = [];
  const q = snapshot.quantities ?? {};
  for (const [code, v] of Object.entries(q)) {
    if (v.air > 0) out.push({ part_code: code, qty_ordered: v.air, ship_method: 'AIR' });
    if (v.sea > 0) out.push({ part_code: code, qty_ordered: v.sea, ship_method: 'SEA' });
  }
  return out;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run utils/__tests__/execution.fromApproval.test.ts`
Expected: PASS.

- [ ] **Step 5: Chạy toàn bộ test bộ execution + commit**

Run: `npx vitest run utils/__tests__/execution.*.test.ts`
Expected: tất cả PASS.

```bash
git add utils/execution/fromApproval.ts utils/__tests__/execution.fromApproval.test.ts
git commit -m "feat(execution): expand approved snapshot into order lines (air/sea)"
```

> UI cho review tách NCC (G1) và bind khoá ngoài (S2): nối `expandApprovalToLines` → `splitBySupplier` → `buildSupplierOrderRows` trong một modal "Tách & gán NCC" trên page Task 11; hiển thị nhóm theo NCC + danh sách `unmapped` để gán tay; nút xác nhận ghi `supplier_orders`/`order_lines`. (Triển khai trong cùng pattern modal của V16, ví dụ `components/OrderReviewModal.tsx`.)

---

## Self-Review

**Spec coverage:**
- Mô hình 4 tầng → Task 1 (types) + Task 7 (schema). ✔
- Tách theo NCC (mã→NCC cố định, supersession) → Task 3 + Task 12. ✔
- Tồn nợ + giao nhiều đợt → Task 4 + receipt_lots (Task 7). ✔
- State machine S0–S9 + rollup → Task 5. ✔
- Dự báo về kho/lead-time → Task 6. ✔
- Chuẩn hoá dữ liệu → Task 2 + dùng trong Task 9. ✔
- Nạp lịch sử 187k → Task 9 (map) + Task 10 (script). ✔
- Nhập/sửa tay + bảng theo dõi → Task 11. ✔
- Cổng G1 (review tách) + bind S2 → Task 12 (logic) + ghi chú UI. ✔
- *Ngoài phạm vi GĐ1 (sang plan sau):* khung import đa-NCC tự động (G3), dashboard & KPI (GĐ2), cổng G2/G4/G6 đầy đủ, cảnh báo tự động.

**Placeholder scan:** Không có TODO/“xử lý lỗi phù hợp”. Bước UI Task 11 Step 3 / Task 12 ghi chú mô tả việc nối theo pattern hiện có — cần đọc `App.tsx`/`OrderReviewModal.tsx` lúc thực thi (không phải placeholder code).

**Type consistency:** `ExecStage`, `STAGE_ORDER`, `SupplierOrder`, `OrderLine`, `ReceiptLot`, `SplittableLine`, `mapExcelRowToCanonical`, `buildSupplierOrderRows`, `expandApprovalToLines` dùng nhất quán giữa các task. `normShipMethod/normOrderType/normPort/normGroup` khớp Task 2 ↔ Task 9.

**Đầu vào còn thiếu (chặn một phần GĐ1):** master `part_supplier_map` — nếu chưa có, Task 3/12 vẫn chạy nhưng mọi mã rơi vào `unmapped`; cần Ban cung cấp bảng ánh xạ để tách tự động (xem §13 spec).
