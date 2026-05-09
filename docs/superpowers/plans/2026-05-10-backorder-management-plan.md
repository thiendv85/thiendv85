# Backorder Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp sub-app `D:\App\V16\back-order-dashboard\` để quản lý đơn nợ, bám tiến độ hàng về, và hỗ trợ NV mua hàng thúc giục NCC qua workflow log nhắc nhở + scorecard.

**Architecture:** Approach A "Annotated CSV + Archive JSON" — files-as-state, không backend. State trong React Context (mở rộng `DataProvider`); persistence = export/import 2 file user kiểm soát. Triển khai TDD strict, 4 phase độc lập (storage → reminder → scorecard → handoff).

**Tech Stack:** Next.js 14.2 (App Router), React 18, TypeScript strict, Tailwind, Papa Parse, Recharts (đã có); thêm: Vitest + @testing-library/react + jsdom (unit/component), Playwright (E2E + visual regression), `ulid` (UUID gen), `@axe-core/playwright` (a11y).

**Spec reference:** `D:\App\V16\docs\superpowers\specs\2026-05-10-backorder-management-design.md` (đọc trước khi bắt đầu).

**Working directory:** Tất cả lệnh chạy trong `D:\App\V16\back-order-dashboard\` trừ khi nói khác. Engineer dùng `cd D:/App/V16/back-order-dashboard` đầu session.

---

## Open Questions Resolution

Plan chốt 3 open question từ spec ngay tại đây:

### OQ1: Cột "supplier" trong CSV

**Vấn đề:** Spec giả định `SR-ĐL2`, nhưng kiểm tra CSV thực tế cho thấy `SR-ĐL2` chứa **tên đại lý người nhận** (PEU HN, Van Kim Automative Co, TH LAO CAI, Truong Hai Nghe An Co...) chứ **không phải nhà cung cấp**. CSV hiện tại **không có cột NCC riêng**.

**Quyết định plan:**
- Tạo helper `getSupplier(row): { name: string; isInferred: boolean }` trong `lib/supplier.ts` — wrap logic xác định NCC ở 1 chỗ.
- **Phase P1 + P2:** dùng `SR-ĐL2` tạm thời (gọi là "đối tác giao hàng" trong UI), `isInferred = false`.
- **Phase P3 (trước khi viết scorecard):** dừng lại, hỏi user xác nhận. 3 option: (a) giữ `SR-ĐL2`; (b) parse từ `EstimatedDescription` ("SEA NCC X"); (c) thêm cột mới vào CSV nguồn.
- Kiến trúc cho phép swap source mà không phải sửa downstream.

**Task P3.0** explicit để làm việc này — không skip.

### OQ2: Reliability score formula

**Quyết định plan:** Dùng heuristic từ spec, implement thuần hàm `reliabilityScore(stats)` để dễ tinh chỉnh:

```ts
function reliabilityScore(stats: SupplierStats): number {
  if (stats.totalReminders === 0) return 0;
  const pctCommitted = stats.committedCount / stats.totalReminders;
  const pctSilent = stats.silentCount / stats.totalReminders;
  const normSlip = Math.min(1, Math.max(0, stats.avgEtaSlipDays / 30));
  const raw = 0.4 * pctCommitted - 0.3 * normSlip - 0.3 * pctSilent;
  return Math.max(0, Math.min(10, (raw + 0.6) * 10));
}
```

Range raw: `[-0.6, 0.4]` → map sang `[0, 10]`. Test bằng fixture có data thật.

### OQ3: Templates tiếng Việt 3 mức

**Quyết định plan:** Plan ship sẵn nội dung 3 mức × 2 channel = 6 templates (Task P2.1). User review template trong UI; nếu cần đổi giọng văn thì sửa file `lib/templates.ts` 1 chỗ. Không block phase.

Nội dung cụ thể có trong Task P2.1 dưới đây.

---

## Pre-flight Checks (before starting)

Engineer phải xác nhận:
- Working dir là `D:\App\V16\back-order-dashboard`
- Node ≥ 18 đã cài (`node -v`)
- Branch git mới (`git checkout -b feature/backorder-management`)
- Đã đọc spec: `docs/superpowers/specs/2026-05-10-backorder-management-design.md`

---

# Phase 0: Test Infrastructure Setup

Mục tiêu: Có Vitest + Playwright chạy được trước khi viết tests cho code thật.

## Task 0.1: Cài đặt Vitest + Testing Library + jsdom

**Files:**
- Modify: `back-order-dashboard/package.json`
- Create: `back-order-dashboard/vitest.config.ts`
- Create: `back-order-dashboard/vitest.setup.ts`
- Create: `back-order-dashboard/tests/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Tạo `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('Vitest runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run smoke test (must fail — no Vitest yet)**

Run: `npm test`
Expected: FAIL — `npm ERR! Missing script: "test"` (hoặc tương tự).

- [ ] **Step 3: Cài deps + cấu hình Vitest**

Run:
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

Tạo `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      exclude: ['**/*.config.*', '**/node_modules/**', '**/.next/**', '**/tests/fixtures/**', '**/*.d.ts'],
    },
  },
});
```

Tạo `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Sửa `package.json` — thêm scripts trong `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 4: Run smoke test (must pass)**

Run: `npm test`
Expected: PASS — `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts tests/smoke.test.ts
git commit -m "chore(test): add Vitest + Testing Library + coverage gate (80%)"
```

---

## Task 0.2: Cài đặt Playwright + a11y

**Files:**
- Modify: `back-order-dashboard/package.json`
- Create: `back-order-dashboard/playwright.config.ts`
- Create: `back-order-dashboard/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the failing E2E smoke test**

Tạo `e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('homepage loads and redirects to /dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});
```

- [ ] **Step 2: Run E2E (must fail — no Playwright yet)**

Run: `npx playwright test`
Expected: FAIL — `command not found` hoặc `playwright is not installed`.

- [ ] **Step 3: Cài Playwright + cấu hình**

Run:
```bash
npm install -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

Tạo `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-tablet',  use: { ...devices['iPad Pro 11'] } },
    { name: 'chromium-mobile',  use: { ...devices['iPhone 13'] } },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Sửa `package.json` — thêm scripts:

```json
"test:e2e": "playwright test",
"test:e2e:update": "playwright test --update-snapshots"
```

- [ ] **Step 4: Run E2E smoke (must pass)**

Run: `npm run test:e2e -- --project=chromium-desktop smoke.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/smoke.spec.ts
git commit -m "chore(test): add Playwright + a11y for E2E + visual regression"
```

---

## Task 0.3: Thêm `ulid` cho UUID gen + lock TS strict

**Files:**
- Modify: `back-order-dashboard/package.json`

- [ ] **Step 1: Write the failing test for ulid import**

Tạo `tests/ulid-smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';

describe('ulid', () => {
  it('generates 26-char string sortable by time', () => {
    const a = ulid();
    expect(a).toHaveLength(26);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
```

- [ ] **Step 2: Run (must fail — package missing)**

Run: `npm test ulid-smoke`
Expected: FAIL — `Cannot find module 'ulid'`.

- [ ] **Step 3: Cài package**

Run: `npm install ulid`

- [ ] **Step 4: Run (must pass)**

Run: `npm test ulid-smoke`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/ulid-smoke.test.ts
git commit -m "chore: add ulid for sortable UUIDs"
```

---

# Phase 1: Storage & Data Model

Mục tiêu: Round-trip CSV + JSON hoạt động end-to-end, không phụ thuộc UI mới. Kết thúc P1 user vẫn dùng app như cũ nhưng underlying state đã hỗ trợ annotation + archive.

## Task 1.1: Schema types — `lib/types.ts`

**Files:**
- Create: `back-order-dashboard/src/lib/types.ts`
- Test: `back-order-dashboard/src/lib/types.test.ts`

- [ ] **Step 1: Write the failing test**

Tạo `src/lib/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ReminderStatus,
  ReminderChannel,
  TemplateLevel,
  ARCHIVE_VERSION,
  type ReminderEntry,
  type Annotation,
  type ArchiveFile,
} from './types';

describe('types', () => {
  it('ReminderStatus enumerates 5 values', () => {
    const all: ReminderStatus[] = ['pending', 'acknowledged', 'committed', 'silent', 'closed'];
    expect(all).toHaveLength(5);
  });

  it('ReminderChannel enumerates 3 values', () => {
    const all: ReminderChannel[] = ['email', 'zalo', 'phone'];
    expect(all).toHaveLength(3);
  });

  it('TemplateLevel enumerates 3 values', () => {
    const all: TemplateLevel[] = ['first-nudge', 'overdue', 'escalation'];
    expect(all).toHaveLength(3);
  });

  it('ARCHIVE_VERSION = 1', () => {
    expect(ARCHIVE_VERSION).toBe(1);
  });

  it('ReminderEntry has required fields', () => {
    const r: ReminderEntry = {
      uuid: '01H8000000000000000000000A',
      created_at: '2026-05-10T08:00:00+07:00',
      doc_no: 'PO-001',
      item_code: 'A1',
      item_name: 'Test',
      supplier: 'X',
      channel: 'email',
      reminder_by: 'NV A',
      template_used: 'first-nudge',
      ncc_response_status: 'pending',
    };
    expect(r.uuid).toBeTruthy();
  });

  it('ArchiveFile shape', () => {
    const a: ArchiveFile = { version: 1, exported_at: new Date().toISOString(), reminders: [] };
    expect(a.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test types.test`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Write minimal implementation**

Tạo `src/lib/types.ts`:

```ts
export const ARCHIVE_VERSION = 1 as const;

export type ReminderStatus = 'pending' | 'acknowledged' | 'committed' | 'silent' | 'closed';
export type ReminderChannel = 'email' | 'zalo' | 'phone';
export type TemplateLevel = 'first-nudge' | 'overdue' | 'escalation';
export type OrderCategory = 'Khẩn VOR' | 'Bảo hành' | 'Khẩn' | 'Dự trữ' | 'Khác';

export interface ReminderEntry {
  uuid: string;
  created_at: string; // ISO
  doc_no: string;
  item_code: string;
  row_id?: string;
  item_name: string;
  supplier: string;
  channel: ReminderChannel;
  reminder_by: string;
  template_used: TemplateLevel;
  ncc_response?: string;
  eta_promised_new?: string; // DD/MM/YYYY
  ncc_response_status: ReminderStatus;
  supersedes?: string;
}

export interface Annotation {
  last_reminded_at?: string; // ISO
  reminder_count: number;
  ncc_response_status: ReminderStatus;
  eta_promised_new?: string; // DD/MM/YYYY
  updated_by?: string;
  reminder_uuid_last?: string;
}

export interface ArchiveFile {
  version: typeof ARCHIVE_VERSION;
  exported_at: string;
  reminders: ReminderEntry[];
}

export type CompositeKey = string; // "DocNo|ItemCode|RowId"

export function compositeKey(docNo: string, itemCode: string, rowId?: string): CompositeKey {
  return `${docNo}|${itemCode}|${rowId ?? ''}`;
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test types.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/types.test.ts
git commit -m "feat(backorder): add core types — ReminderEntry, Annotation, ArchiveFile"
```

---

## Task 1.2: `lib/reminder.ts` — UUID gen, immutability, supersedes

**Files:**
- Create: `back-order-dashboard/src/lib/reminder.ts`
- Test: `back-order-dashboard/src/lib/reminder.test.ts`

- [ ] **Step 1: Write the failing test**

Tạo `src/lib/reminder.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createReminder, supersedeReminder, applyToAnnotation } from './reminder';
import type { ReminderEntry, Annotation } from './types';

describe('reminder.createReminder', () => {
  it('generates ULID uuid + ISO timestamp', () => {
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    expect(r.uuid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(r.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not mutate input', () => {
    const input = { doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email' as const, reminder_by: 'A', template_used: 'first-nudge' as const,
      ncc_response_status: 'pending' as const };
    const snapshot = JSON.stringify(input);
    createReminder(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('reminder.supersedeReminder', () => {
  it('creates new entry with supersedes pointer', () => {
    const original = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const updated = supersedeReminder(original, { ncc_response: 'fixed', ncc_response_status: 'committed' });
    expect(updated.supersedes).toBe(original.uuid);
    expect(updated.uuid).not.toBe(original.uuid);
    expect(updated.ncc_response_status).toBe('committed');
  });

  it('original is not mutated', () => {
    const original = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const snapshot = JSON.stringify(original);
    supersedeReminder(original, { ncc_response_status: 'silent' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('reminder.applyToAnnotation', () => {
  it('initializes annotation when none exists', () => {
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'email', reminder_by: 'A', template_used: 'first-nudge',
      ncc_response_status: 'pending',
    });
    const ann = applyToAnnotation(undefined, r);
    expect(ann.reminder_count).toBe(1);
    expect(ann.last_reminded_at).toBe(r.created_at);
    expect(ann.reminder_uuid_last).toBe(r.uuid);
    expect(ann.updated_by).toBe('A');
  });

  it('increments reminder_count when annotation exists', () => {
    const existing: Annotation = { reminder_count: 3, ncc_response_status: 'pending' };
    const r = createReminder({
      doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
      channel: 'zalo', reminder_by: 'B', template_used: 'overdue',
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
    });
    const ann = applyToAnnotation(existing, r);
    expect(ann.reminder_count).toBe(4);
    expect(ann.ncc_response_status).toBe('committed');
    expect(ann.eta_promised_new).toBe('15/05/2026');
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test reminder.test`
Expected: FAIL — `Cannot find module './reminder'`.

- [ ] **Step 3: Write implementation**

Tạo `src/lib/reminder.ts`:

```ts
import { ulid } from 'ulid';
import type { ReminderEntry, Annotation } from './types';

type NewReminderInput = Omit<ReminderEntry, 'uuid' | 'created_at'>;

export function createReminder(input: NewReminderInput): ReminderEntry {
  return {
    ...input,
    uuid: ulid(),
    created_at: new Date().toISOString(),
  };
}

export function supersedeReminder(
  original: ReminderEntry,
  patch: Partial<Omit<ReminderEntry, 'uuid' | 'created_at' | 'supersedes'>>
): ReminderEntry {
  return {
    ...original,
    ...patch,
    uuid: ulid(),
    created_at: new Date().toISOString(),
    supersedes: original.uuid,
  };
}

export function applyToAnnotation(existing: Annotation | undefined, r: ReminderEntry): Annotation {
  const base: Annotation = existing ?? { reminder_count: 0, ncc_response_status: 'pending' };
  return {
    last_reminded_at: r.created_at,
    reminder_count: base.reminder_count + 1,
    ncc_response_status: r.ncc_response_status,
    eta_promised_new: r.eta_promised_new ?? base.eta_promised_new,
    updated_by: r.reminder_by,
    reminder_uuid_last: r.uuid,
  };
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test reminder.test`
Expected: PASS — 5+ tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminder.ts src/lib/reminder.test.ts
git commit -m "feat(backorder): reminder lifecycle — create, supersede, apply to annotation"
```

---

## Task 1.3: `lib/priority.ts` — strict order + tie-break

**Files:**
- Create: `back-order-dashboard/src/lib/priority.ts`
- Test: `back-order-dashboard/src/lib/priority.test.ts`

- [ ] **Step 1: Write the failing test**

Tạo `src/lib/priority.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCategoryRank, comparePriority, sortByPriority } from './priority';
import type { TransformedBOData } from './transform';
import type { Annotation } from './types';

function row(over: Partial<TransformedBOData>): TransformedBOData {
  return {
    DocDate: '01/01/2026', DocNo: 'PO-A', OPropertyName: 'Khẩn',
    ItemCode: 'I1', ItemName: 'X', QuantityRemainClose: '1', Quantity: 1,
    KhoNo: 'Kho MB', 'SR-ĐL2': 'PEU HN',
    ParsedDocDate: new Date('2026-01-01'),
    AgingDays: 10, AgingBucket: '0–30 ngày',
    DaysUntilETA: null, ETAGroup: '', isUrgent: false, Region: '',
    ...over,
  } as TransformedBOData;
}

describe('priority.getCategoryRank', () => {
  it.each([
    ['Khẩn VOR', 1],
    ['Bảo hành', 2],
    ['Khẩn', 3],
    ['Dự trữ', 4],
    ['Chiến dịch', 5],
    ['', 5],
    ['totally unknown', 5],
  ])('rank("%s") === %i', (input, expected) => {
    expect(getCategoryRank(input)).toBe(expected);
  });
});

describe('priority.comparePriority', () => {
  it('Khẩn VOR aging 5d trumps Bảo hành aging 100d', () => {
    const vor  = row({ OPropertyName: 'Khẩn VOR', AgingDays: 5 });
    const wrnt = row({ OPropertyName: 'Bảo hành', AgingDays: 100 });
    expect(comparePriority(vor, wrnt)).toBeLessThan(0);
  });

  it('within same category: older aging wins', () => {
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 50 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 10 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it('within same category + aging: more overdue ETA wins', () => {
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 30, DaysUntilETA: -10 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 30, DaysUntilETA: -2 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it('within same category + aging + ETA: longer since last reminder wins', () => {
    const annA: Annotation = { reminder_count: 1, ncc_response_status: 'pending', last_reminded_at: '2026-04-01T00:00:00Z' };
    const annB: Annotation = { reminder_count: 1, ncc_response_status: 'pending', last_reminded_at: '2026-05-08T00:00:00Z' };
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 30 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 30 });
    const today = new Date('2026-05-10');
    expect(comparePriority(a, b, { annA, annB, today })).toBeLessThan(0);
  });
});

describe('priority.sortByPriority', () => {
  it('returns 5 categories in correct order', () => {
    const rows = [
      row({ DocNo: 'D5', OPropertyName: 'Chiến dịch' }),
      row({ DocNo: 'D2', OPropertyName: 'Bảo hành' }),
      row({ DocNo: 'D1', OPropertyName: 'Khẩn VOR' }),
      row({ DocNo: 'D4', OPropertyName: 'Dự trữ' }),
      row({ DocNo: 'D3', OPropertyName: 'Khẩn' }),
    ];
    const sorted = sortByPriority(rows);
    expect(sorted.map(r => r.DocNo)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test priority.test`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/lib/priority.ts`:

```ts
import type { TransformedBOData } from './transform';
import type { Annotation, CompositeKey } from './types';
import { compositeKey } from './types';

const CATEGORY_RANK: Readonly<Record<string, number>> = Object.freeze({
  'Khẩn VOR': 1,
  'Bảo hành': 2,
  'Khẩn': 3,
  'Dự trữ': 4,
});

export function getCategoryRank(opropertyName: string): number {
  return CATEGORY_RANK[opropertyName] ?? 5;
}

interface CompareCtx {
  annotations?: Map<CompositeKey, Annotation>;
  today?: Date;
  // shorthand for unit tests
  annA?: Annotation;
  annB?: Annotation;
}

function daysSince(iso: string | undefined, today: Date): number {
  if (!iso) return Infinity;
  const ms = today.getTime() - new Date(iso).getTime();
  return ms / 86_400_000;
}

export function comparePriority(
  a: TransformedBOData,
  b: TransformedBOData,
  ctx: CompareCtx = {}
): number {
  const ra = getCategoryRank(a.OPropertyName);
  const rb = getCategoryRank(b.OPropertyName);
  if (ra !== rb) return ra - rb;

  if (a.AgingDays !== b.AgingDays) return b.AgingDays - a.AgingDays;

  const oa = a.DaysUntilETA !== null && a.DaysUntilETA < 0 ? -a.DaysUntilETA : 0;
  const ob = b.DaysUntilETA !== null && b.DaysUntilETA < 0 ? -b.DaysUntilETA : 0;
  if (oa !== ob) return ob - oa;

  const today = ctx.today ?? new Date();
  const annA = ctx.annA ?? ctx.annotations?.get(compositeKey(a.DocNo, a.ItemCode, a.RowId));
  const annB = ctx.annB ?? ctx.annotations?.get(compositeKey(b.DocNo, b.ItemCode, b.RowId));
  const da = daysSince(annA?.last_reminded_at, today);
  const db = daysSince(annB?.last_reminded_at, today);
  return db - da;
}

export function sortByPriority(
  rows: TransformedBOData[],
  ctx: CompareCtx = {}
): TransformedBOData[] {
  return [...rows].sort((a, b) => comparePriority(a, b, ctx));
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test priority.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/priority.ts src/lib/priority.test.ts
git commit -m "feat(backorder): priority engine — strict order by category + tie-break"
```

---

## Task 1.4: `lib/persist.ts` — annotated CSV serialize + parse

**Files:**
- Create: `back-order-dashboard/src/lib/persist.ts`
- Test: `back-order-dashboard/src/lib/persist.test.ts`

- [ ] **Step 1: Write the failing test for CSV round-trip**

Tạo `src/lib/persist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeAnnotatedCsv, parseAnnotatedCsv, ANNOTATION_COLUMNS } from './persist';
import type { Annotation, CompositeKey } from './types';
import { compositeKey } from './types';

function makeRow(over: Record<string, string> = {}) {
  return {
    DocDate: '12/04/2024', DocNo: 'FPNVC-2404-020', OPropertyName: 'Bảo hành',
    BranchCode: '', BranchName: '', BranchCodeReceipt: 'YL003877ZD',
    ItemCode: 'A1', ItemName: 'DA ĐỆM GHẾ TRƯỚC TRÁI', TypeCar: '',
    QuantityRemainClose: '1', EstimatedDescription: 'NCC chưa có',
    EstimatedDate1: '', RowId: '', RowId_S2: '', KhoNo: 'Kho MB', 'SR-ĐL2': 'PEU HN',
    ...over,
  };
}

describe('persist.serializeAnnotatedCsv', () => {
  it('appends 6 annotation columns to header', () => {
    const csv = serializeAnnotatedCsv([makeRow()], new Map());
    const headerLine = csv.split('\n')[0];
    for (const col of ANNOTATION_COLUMNS) expect(headerLine).toContain(col);
  });

  it('writes annotation values for known rows', () => {
    const ann: Annotation = {
      last_reminded_at: '2026-05-10T08:00:00Z', reminder_count: 2,
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
      updated_by: 'NV A', reminder_uuid_last: '01H8...',
    };
    const map = new Map<CompositeKey, Annotation>([
      [compositeKey('FPNVC-2404-020', 'A1', ''), ann],
    ]);
    const csv = serializeAnnotatedCsv([makeRow()], map);
    expect(csv).toContain('committed');
    expect(csv).toContain('15/05/2026');
    expect(csv).toContain('NV A');
  });

  it('leaves annotation columns empty for unknown rows', () => {
    const csv = serializeAnnotatedCsv([makeRow()], new Map());
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    const cells = lines[1].split(',');
    // last 6 columns are annotations — should be empty
    expect(cells.slice(-6).every(c => c === '' || c === '0')).toBe(true);
  });
});

describe('persist.parseAnnotatedCsv', () => {
  it('round-trips annotations correctly', () => {
    const ann: Annotation = {
      last_reminded_at: '2026-05-10T08:00:00.000Z', reminder_count: 2,
      ncc_response_status: 'committed', eta_promised_new: '15/05/2026',
      updated_by: 'NV A', reminder_uuid_last: '01H8',
    };
    const map = new Map<CompositeKey, Annotation>([
      [compositeKey('FPNVC-2404-020', 'A1', ''), ann],
    ]);
    const csv = serializeAnnotatedCsv([makeRow()], map);

    const { rows, annotations } = parseAnnotatedCsv(csv);
    expect(rows).toHaveLength(1);
    const back = annotations.get(compositeKey('FPNVC-2404-020', 'A1', ''));
    expect(back?.reminder_count).toBe(2);
    expect(back?.ncc_response_status).toBe('committed');
  });

  it('treats CSV without annotation cols as empty annotations (backward-compat)', () => {
    // Use original CSV format (no annotation cols)
    const header = 'DocDate,DocNo,OPropertyName,BranchCode,BranchName,BranchCodeReceipt,ItemCode,ItemName,TypeCar,QuantityRemainClose,EstimatedDescription,EstimatedDate1,RowId,RowId_S2,KhoNo,SR-ĐL2';
    const dataLine = '12/04/2024,FPNVC-2404-020,Bảo hành,,,YL003877ZD,A1,DA ĐỆM,,1,NCC chưa,,,,Kho MB,PEU HN';
    const csv = header + '\n' + dataLine;
    const { rows, annotations } = parseAnnotatedCsv(csv);
    expect(rows).toHaveLength(1);
    expect(annotations.size).toBe(0);
  });

  it('strips UTF-8 BOM', () => {
    const csv = '﻿DocDate,DocNo,OPropertyName,ItemCode,ItemName,QuantityRemainClose,KhoNo,SR-ĐL2\n12/04/2024,X,Khẩn,A1,n,1,K,S';
    const { rows } = parseAnnotatedCsv(csv);
    expect(rows[0].DocDate).toBe('12/04/2024');
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test persist.test`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/lib/persist.ts`:

```ts
import Papa from 'papaparse';
import type { RawBOData } from './transform';
import type { Annotation, CompositeKey, ReminderStatus } from './types';
import { compositeKey } from './types';

export const ANNOTATION_COLUMNS = [
  'last_reminded_at',
  'reminder_count',
  'ncc_response_status',
  'eta_promised_new',
  'updated_by',
  'reminder_uuid_last',
] as const;

type AnnotationCol = typeof ANNOTATION_COLUMNS[number];

function annToRecord(a: Annotation | undefined): Record<AnnotationCol, string> {
  return {
    last_reminded_at: a?.last_reminded_at ?? '',
    reminder_count: a ? String(a.reminder_count) : '',
    ncc_response_status: a?.ncc_response_status ?? '',
    eta_promised_new: a?.eta_promised_new ?? '',
    updated_by: a?.updated_by ?? '',
    reminder_uuid_last: a?.reminder_uuid_last ?? '',
  };
}

export function serializeAnnotatedCsv(
  rows: RawBOData[],
  annotations: Map<CompositeKey, Annotation>
): string {
  const enriched = rows.map(r => {
    const key = compositeKey(r.DocNo, r.ItemCode, r.RowId);
    return { ...r, ...annToRecord(annotations.get(key)) };
  });
  return Papa.unparse(enriched, { header: true });
}

const VALID_STATUS = new Set<ReminderStatus>(['pending', 'acknowledged', 'committed', 'silent', 'closed']);

export interface ParseResult {
  rows: RawBOData[];
  annotations: Map<CompositeKey, Annotation>;
  warnings: string[];
}

export function parseAnnotatedCsv(csv: string): ParseResult {
  const stripped = csv.replace(/^﻿/, '');
  const result = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: true,
  });

  const warnings: string[] = [];
  const annotations = new Map<CompositeKey, Annotation>();
  const rows: RawBOData[] = [];

  for (const raw of result.data) {
    const cleaned: Record<string, string> = {};
    for (const k in raw) cleaned[k.replace(/^﻿/, '')] = raw[k];

    const status = cleaned.ncc_response_status as ReminderStatus | undefined;
    const count = cleaned.reminder_count ? Number(cleaned.reminder_count) : 0;
    if (cleaned.reminder_count && Number.isNaN(count)) {
      warnings.push(`Invalid reminder_count "${cleaned.reminder_count}" for ${cleaned.DocNo}`);
    }
    const hasAnnotation = ANNOTATION_COLUMNS.some(c => cleaned[c]);
    if (hasAnnotation) {
      annotations.set(compositeKey(cleaned.DocNo, cleaned.ItemCode, cleaned.RowId), {
        last_reminded_at: cleaned.last_reminded_at || undefined,
        reminder_count: Number.isFinite(count) ? count : 0,
        ncc_response_status: status && VALID_STATUS.has(status) ? status : 'pending',
        eta_promised_new: cleaned.eta_promised_new || undefined,
        updated_by: cleaned.updated_by || undefined,
        reminder_uuid_last: cleaned.reminder_uuid_last || undefined,
      });
    }

    const { last_reminded_at, reminder_count, ncc_response_status, eta_promised_new,
      updated_by, reminder_uuid_last, ...orig } = cleaned;
    rows.push(orig as unknown as RawBOData);
  }

  return { rows, annotations, warnings };
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test persist.test`
Expected: PASS — 5+ tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist.ts src/lib/persist.test.ts
git commit -m "feat(persist): annotated CSV serialize + parse with backward compat"
```

---

## Task 1.5: `lib/persist.ts` — archive JSON serialize + parse

**Files:**
- Modify: `back-order-dashboard/src/lib/persist.ts`
- Modify: `back-order-dashboard/src/lib/persist.test.ts`

- [ ] **Step 1: Write the failing test (append to persist.test.ts)**

Append vào `src/lib/persist.test.ts`:

```ts
import { serializeArchive, parseArchive } from './persist';
import { ARCHIVE_VERSION, type ReminderEntry } from './types';

function makeReminder(over: Partial<ReminderEntry> = {}): ReminderEntry {
  return {
    uuid: '01H8000000000000000000000A',
    created_at: '2026-05-10T08:00:00.000Z',
    doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
    channel: 'email', reminder_by: 'NV A', template_used: 'first-nudge',
    ncc_response_status: 'pending',
    ...over,
  };
}

describe('persist.serializeArchive', () => {
  it('produces valid JSON with version + reminders', () => {
    const json = serializeArchive([makeReminder()]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(ARCHIVE_VERSION);
    expect(parsed.reminders).toHaveLength(1);
    expect(typeof parsed.exported_at).toBe('string');
  });
});

describe('persist.parseArchive', () => {
  it('round-trips a single reminder', () => {
    const json = serializeArchive([makeReminder()]);
    const { reminders, warnings } = parseArchive(json);
    expect(reminders).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseArchive('{not json')).toThrow(/parse/i);
  });

  it('rejects unknown future version', () => {
    expect(() => parseArchive(JSON.stringify({ version: 999, exported_at: '', reminders: [] })))
      .toThrow(/version/i);
  });

  it('skips entries missing required fields, returns warnings', () => {
    const bad = { version: ARCHIVE_VERSION, exported_at: 'x', reminders: [
      makeReminder(),
      { uuid: 'incomplete' }, // missing nearly everything
    ] };
    const { reminders, warnings } = parseArchive(JSON.stringify(bad));
    expect(reminders).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('drops duplicate UUID, keeps first', () => {
    const dup = makeReminder({ uuid: 'SAMEUUID', ncc_response: 'first' });
    const dup2 = makeReminder({ uuid: 'SAMEUUID', ncc_response: 'second' });
    const file = { version: ARCHIVE_VERSION, exported_at: 'x', reminders: [dup, dup2] };
    const { reminders, warnings } = parseArchive(JSON.stringify(file));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].ncc_response).toBe('first');
    expect(warnings.some(w => w.includes('duplicate'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test persist.test`
Expected: FAIL — `serializeArchive is not a function`.

- [ ] **Step 3: Write implementation (append to persist.ts)**

Append vào `src/lib/persist.ts`:

```ts
import { ARCHIVE_VERSION, type ArchiveFile, type ReminderEntry, type ReminderStatus } from './types';

const REQUIRED_REMINDER_KEYS: (keyof ReminderEntry)[] = [
  'uuid', 'created_at', 'doc_no', 'item_code', 'item_name', 'supplier',
  'channel', 'reminder_by', 'template_used', 'ncc_response_status',
];

export function serializeArchive(reminders: ReminderEntry[]): string {
  const file: ArchiveFile = {
    version: ARCHIVE_VERSION,
    exported_at: new Date().toISOString(),
    reminders,
  };
  return JSON.stringify(file, null, 2);
}

export interface ParseArchiveResult {
  reminders: ReminderEntry[];
  warnings: string[];
}

export function parseArchive(json: string): ParseArchiveResult {
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch (e) {
    throw new Error(`Cannot parse archive JSON: ${(e as Error).message}`);
  }

  if (typeof file !== 'object' || file === null) {
    throw new Error('Archive root must be object');
  }
  const f = file as Record<string, unknown>;
  const version = f.version as number;
  if (version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version ${version} (expected ${ARCHIVE_VERSION})`);
  }
  if (!Array.isArray(f.reminders)) {
    throw new Error('Archive.reminders must be array');
  }

  const seen = new Set<string>();
  const warnings: string[] = [];
  const reminders: ReminderEntry[] = [];

  for (const [i, r] of (f.reminders as unknown[]).entries()) {
    if (typeof r !== 'object' || r === null) {
      warnings.push(`Reminder #${i} is not object — skipped`);
      continue;
    }
    const e = r as Record<string, unknown>;
    const missing = REQUIRED_REMINDER_KEYS.filter(k => !e[k]);
    if (missing.length > 0) {
      warnings.push(`Reminder #${i} missing fields: ${missing.join(', ')} — skipped`);
      continue;
    }
    const uuid = String(e.uuid);
    if (seen.has(uuid)) {
      warnings.push(`Reminder duplicate uuid ${uuid} — kept first`);
      continue;
    }
    seen.add(uuid);
    reminders.push(e as unknown as ReminderEntry);
  }

  return { reminders, warnings };
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test persist.test`
Expected: PASS — all archive tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist.ts src/lib/persist.test.ts
git commit -m "feat(persist): archive JSON serialize + parse with version + dedup"
```

---

## Task 1.6: `lib/persist.ts` — merge (handoff conflict resolution)

**Files:**
- Modify: `back-order-dashboard/src/lib/persist.ts`
- Modify: `back-order-dashboard/src/lib/persist.test.ts`

- [ ] **Step 1: Write failing test for merge**

Append vào `src/lib/persist.test.ts`:

```ts
import { mergeArchives, type MergeReport } from './persist';

describe('persist.mergeArchives', () => {
  it('union of disjoint sets', () => {
    const a = [makeReminder({ uuid: 'A1' })];
    const b = [makeReminder({ uuid: 'B1' })];
    const { merged, report } = mergeArchives(a, b);
    expect(merged).toHaveLength(2);
    expect(report.added).toBe(1);
    expect(report.overwritten).toBe(0);
  });

  it('newer created_at wins on UUID conflict', () => {
    const old = makeReminder({ uuid: 'X', created_at: '2026-05-01T00:00:00.000Z', ncc_response: 'old' });
    const fresh = makeReminder({ uuid: 'X', created_at: '2026-05-10T00:00:00.000Z', ncc_response: 'fresh' });
    const { merged } = mergeArchives([old], [fresh]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ncc_response).toBe('fresh');
  });

  it('keeps both with suffix when timestamps tie', () => {
    const sameMs = '2026-05-10T00:00:00.000Z';
    const a = makeReminder({ uuid: 'X', created_at: sameMs, ncc_response: 'a' });
    const b = makeReminder({ uuid: 'X', created_at: sameMs, ncc_response: 'b' });
    const { merged, report } = mergeArchives([a], [b]);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.ncc_response === 'a')?.uuid).toBe('X-A');
    expect(merged.find(r => r.ncc_response === 'b')?.uuid).toBe('X-B');
    expect(report.tieBroken).toBe(1);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test persist.test`
Expected: FAIL — `mergeArchives is not a function`.

- [ ] **Step 3: Write implementation**

Append vào `src/lib/persist.ts`:

```ts
export interface MergeReport {
  added: number;
  overwritten: number;
  tieBroken: number;
  kept: number;
}

export function mergeArchives(
  local: ReminderEntry[],
  incoming: ReminderEntry[]
): { merged: ReminderEntry[]; report: MergeReport } {
  const byUuid = new Map<string, ReminderEntry>();
  for (const r of local) byUuid.set(r.uuid, r);

  const report: MergeReport = { added: 0, overwritten: 0, tieBroken: 0, kept: local.length };

  for (const r of incoming) {
    const existing = byUuid.get(r.uuid);
    if (!existing) {
      byUuid.set(r.uuid, r);
      report.added += 1;
      continue;
    }
    const ta = new Date(existing.created_at).getTime();
    const tb = new Date(r.created_at).getTime();
    if (tb > ta) {
      byUuid.set(r.uuid, r);
      report.overwritten += 1;
    } else if (tb < ta) {
      // keep existing
    } else {
      // tie — keep both with suffix
      byUuid.delete(r.uuid);
      byUuid.set(`${r.uuid}-A`, { ...existing, uuid: `${r.uuid}-A` });
      byUuid.set(`${r.uuid}-B`, { ...r, uuid: `${r.uuid}-B` });
      report.tieBroken += 1;
    }
  }

  return { merged: Array.from(byUuid.values()), report };
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test persist.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist.ts src/lib/persist.test.ts
git commit -m "feat(persist): mergeArchives — UUID conflict resolution by created_at"
```

---

## Task 1.7: Mở rộng `DataProvider` — annotations, archive, currentUser, actions

**Files:**
- Modify: `back-order-dashboard/src/components/DataProvider.tsx`
- Test: `back-order-dashboard/src/components/DataProvider.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/DataProvider.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('DataProvider extended state', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('exposes annotations, archive, currentUser', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.annotations).toBeInstanceOf(Map);
    expect(Array.isArray(result.current.archive)).toBe(true);
    expect(typeof result.current.currentUser).toBe('string');
  });

  it('logReminder appends archive + updates annotation', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => {
      result.current.setCurrentUser('NV A');
      result.current.logReminder({
        doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
        channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending',
      });
    });
    expect(result.current.archive).toHaveLength(1);
    expect(result.current.archive[0].reminder_by).toBe('NV A');
    expect(result.current.annotations.size).toBe(1);
  });

  it('persists currentUser to localStorage', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => result.current.setCurrentUser('NV B'));
    expect(localStorage.getItem('backorder.currentUser')).toBe('NV B');
  });

  it('exportSnapshot returns csv + json blobs', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => result.current.setRows([
      { DocDate: '01/01/2026', DocNo: 'P', OPropertyName: 'Khẩn',
        ItemCode: 'I', ItemName: 'X', QuantityRemainClose: '1',
        KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
    ]));
    const out = result.current.exportSnapshot();
    expect(out.csv).toBeInstanceOf(Blob);
    expect(out.json).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test DataProvider`
Expected: FAIL — properties don't exist.

- [ ] **Step 3: Rewrite DataProvider**

Sửa `src/components/DataProvider.tsx` (REPLACE toàn file):

```tsx
'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { transformData, type RawBOData, type TransformedBOData } from '@/lib/transform';
import { compositeKey, type Annotation, type CompositeKey, type ReminderEntry, type ReminderChannel, type TemplateLevel, type ReminderStatus } from '@/lib/types';
import { createReminder, applyToAnnotation } from '@/lib/reminder';
import { serializeAnnotatedCsv, serializeArchive, mergeArchives, parseAnnotatedCsv, parseArchive, type MergeReport } from '@/lib/persist';

interface NewReminderInput {
  doc_no: string; item_code: string; row_id?: string;
  item_name: string; supplier: string;
  channel: ReminderChannel; template_used: TemplateLevel;
  ncc_response?: string; eta_promised_new?: string;
  ncc_response_status: ReminderStatus;
}

interface DataContextType {
  rows: RawBOData[];
  data: TransformedBOData[];
  annotations: Map<CompositeKey, Annotation>;
  archive: ReminderEntry[];
  currentUser: string;
  isLoading: boolean;
  lastUpdated: string | null;
  lastExportAt: string | null;

  setRows: (rows: RawBOData[]) => void;
  setIsLoading: (loading: boolean) => void;
  setLastUpdated: (date: string) => void;
  setCurrentUser: (name: string) => void;

  logReminder: (input: NewReminderInput) => ReminderEntry;
  exportSnapshot: () => { csv: Blob; json: Blob };
  importHandoff: (csv: string, json: string) => Promise<{ report: MergeReport; warnings: string[] }>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const LS_USER = 'backorder.currentUser';
const LS_LAST_EXPORT = 'backorder.lastExportAt';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<RawBOData[]>([]);
  const [annotations, setAnnotations] = useState<Map<CompositeKey, Annotation>>(new Map());
  const [archive, setArchive] = useState<ReminderEntry[]>([]);
  const [currentUserState, setCurrentUserState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUserState(localStorage.getItem(LS_USER) ?? '');
    setLastExportAt(localStorage.getItem(LS_LAST_EXPORT));
  }, []);

  const data = useMemo(() => transformData(rows), [rows]);

  const setCurrentUser = (name: string) => {
    setCurrentUserState(name);
    localStorage.setItem(LS_USER, name);
  };

  const logReminder = (input: NewReminderInput): ReminderEntry => {
    const r = createReminder({
      ...input,
      reminder_by: currentUserState || 'Unknown',
    });
    setArchive(prev => [...prev, r]);
    setAnnotations(prev => {
      const next = new Map(prev);
      const key = compositeKey(r.doc_no, r.item_code, r.row_id);
      next.set(key, applyToAnnotation(prev.get(key), r));
      return next;
    });
    return r;
  };

  const exportSnapshot = () => {
    const csvStr = serializeAnnotatedCsv(rows, annotations);
    const jsonStr = serializeArchive(archive);
    const now = new Date().toISOString();
    localStorage.setItem(LS_LAST_EXPORT, now);
    setLastExportAt(now);
    return {
      csv: new Blob([csvStr], { type: 'text/csv;charset=utf-8' }),
      json: new Blob([jsonStr], { type: 'application/json' }),
    };
  };

  const importHandoff = async (csvText: string, jsonText: string) => {
    const { rows: importedRows, annotations: importedAnn } = parseAnnotatedCsv(csvText);
    const { reminders: importedReminders, warnings: archiveWarn } = parseArchive(jsonText);
    const { merged, report } = mergeArchives(archive, importedReminders);

    setRows(importedRows);
    // merge annotations: imported overrides local for shared keys
    setAnnotations(prev => {
      const next = new Map(prev);
      importedAnn.forEach((v, k) => next.set(k, v));
      return next;
    });
    setArchive(merged);
    return { report, warnings: archiveWarn };
  };

  const value: DataContextType = {
    rows, data, annotations, archive, currentUser: currentUserState,
    isLoading, lastUpdated, lastExportAt,
    setRows, setIsLoading, setLastUpdated, setCurrentUser,
    logReminder, exportSnapshot, importHandoff,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
```

**Note:** `UploadButton.tsx` đã dùng `setData` cũ. Cần sửa nó dùng `setRows` và parse qua `parseAnnotatedCsv`. Làm trong Task 1.8.

- [ ] **Step 4: Run (must pass)**

Run: `npm test DataProvider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataProvider.tsx src/components/DataProvider.test.tsx
git commit -m "feat(provider): expand DataProvider — annotations, archive, currentUser, actions"
```

---

## Task 1.8: Sửa `UploadButton` để dùng `parseAnnotatedCsv`

**Files:**
- Modify: `back-order-dashboard/src/components/UploadButton.tsx`
- Test: `back-order-dashboard/src/components/UploadButton.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/UploadButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UploadButton from './UploadButton';
import { DataProvider } from './DataProvider';

describe('UploadButton', () => {
  it('renders button "Tải CSV"', () => {
    render(<DataProvider><UploadButton /></DataProvider>);
    expect(screen.getByRole('button', { name: /Tải CSV/i })).toBeInTheDocument();
  });

  it('parses uploaded annotated CSV via parseAnnotatedCsv', async () => {
    render(<DataProvider><UploadButton /></DataProvider>);
    const file = new File(
      ['DocDate,DocNo,OPropertyName,ItemCode,ItemName,QuantityRemainClose,KhoNo,SR-ĐL2,reminder_count\n01/01/2026,X,Khẩn,A1,n,1,K,S,3'],
      'test.csv',
      { type: 'text/csv' }
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    // Component should not throw; we don't assert state directly here (covered in DataProvider tests)
    expect(input.files?.[0]?.name).toBe('test.csv');
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test UploadButton`
Expected: FAIL.

- [ ] **Step 3: Rewrite UploadButton**

Sửa `src/components/UploadButton.tsx` (REPLACE):

```tsx
'use client';
import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { parseAnnotatedCsv } from '@/lib/persist';
import { useData } from './DataProvider';

export default function UploadButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setRows, setIsLoading, setLastUpdated } = useData();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const { rows, warnings } = parseAnnotatedCsv(text);
      setRows(rows);
      setLastUpdated(new Date().toLocaleString('vi-VN'));
      if (warnings.length > 0) {
        console.warn(`CSV warnings: ${warnings.length}`, warnings);
        alert(`File đã đọc xong nhưng có ${warnings.length} cảnh báo (xem console).`);
      }
    } catch (e) {
      console.error('CSV upload error', e);
      alert('Lỗi khi đọc file CSV. Vui lòng kiểm tra định dạng.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
      >
        <Upload size={14} />
        Tải CSV
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test UploadButton`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UploadButton.tsx src/components/UploadButton.test.tsx
git commit -m "refactor(upload): route CSV upload through parseAnnotatedCsv"
```

---

## Task 1.9: Integration test — round-trip end-to-end

**Files:**
- Create: `back-order-dashboard/tests/integration/round-trip.test.tsx`

- [ ] **Step 1: Write integration test**

Tạo `tests/integration/round-trip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DataProvider, useData } from '@/components/DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('integration: round-trip', () => {
  it('upload → log reminder → export → re-import → state equivalent', async () => {
    const { result } = renderHook(() => useData(), { wrapper });

    act(() => {
      result.current.setCurrentUser('NV A');
      result.current.setRows([
        { DocDate: '01/01/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn',
          ItemCode: 'A1', ItemName: 'X', QuantityRemainClose: '1',
          KhoNo: 'K', 'SR-ĐL2': 'NCC1' } as any,
      ]);
    });

    act(() => {
      result.current.logReminder({
        doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
        channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending',
      });
    });

    expect(result.current.archive).toHaveLength(1);

    const out = result.current.exportSnapshot();
    const csvText = await out.csv.text();
    const jsonText = await out.json.text();

    // simulate fresh session
    const session2 = renderHook(() => useData(), { wrapper });
    await act(async () => {
      await session2.result.current.importHandoff(csvText, jsonText);
    });

    expect(session2.result.current.archive).toHaveLength(1);
    expect(session2.result.current.archive[0].doc_no).toBe('PO-1');
    expect(session2.result.current.annotations.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run (must fail or pass — depends on prior tasks)**

Run: `npm test round-trip`
Expected: PASS (nếu các task trước đúng).

- [ ] **Step 3: Fix any gaps**

Nếu fail, đọc message → sửa `DataProvider` hoặc `persist.ts`. Phần này không có code mới — đảm bảo các module trước hoạt động đúng kết hợp.

- [ ] **Step 4: Re-run**

Run: `npm test round-trip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/round-trip.test.tsx
git commit -m "test(integration): round-trip CSV+JSON via DataProvider"
```

---

## Task 1.10: P1 acceptance — coverage gate

- [ ] **Step 1: Run full coverage**

Run: `npm run test:coverage`

- [ ] **Step 2: Inspect HTML report**

Mở `coverage/index.html`. Đảm bảo:
- `lib/reminder.ts`, `lib/priority.ts`, `lib/persist.ts`, `lib/types.ts`: ≥90%
- `components/DataProvider.tsx`: ≥80%

- [ ] **Step 3: Fix bất kỳ branch nào < threshold**

Thêm test cho branch còn thiếu cho tới khi tất cả ≥80%.

- [ ] **Step 4: Run lần cuối**

Run: `npm run test:coverage`
Expected: PASS, không có threshold violation.

- [ ] **Step 5: Tag P1 done**

```bash
git tag p1-storage-done
git commit --allow-empty -m "milestone(p1): storage layer complete, coverage ≥80%"
```

**P1 demo:** Chạy `npm run dev`, upload `data/sample.csv`, gọi DevTools → `useData().logReminder({...})` → `exportSnapshot()` xuống file. Chưa có UI mới, chỉ verify data layer hoạt động.

---

# Phase 2: Reminder Workflow

Mục tiêu: User log được reminder hoàn chỉnh end-to-end với UI.

## Task 2.1: `lib/templates.ts` — 6 templates tiếng Việt

**Files:**
- Create: `back-order-dashboard/src/lib/templates.ts`
- Test: `back-order-dashboard/src/lib/templates.test.ts`

- [ ] **Step 1: Write failing test**

Tạo `src/lib/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderTemplate, suggestTemplateLevel } from './templates';
import type { Annotation, TemplateLevel } from './types';

const baseCtx = {
  doc_no: 'PO-2026-0123',
  item_code: 'A6A-001',
  item_name: 'HỘP SỐ TỰ ĐỘNG',
  supplier: 'Van Kim Automative Co',
  doc_date: '01/04/2026',
  aging_days: 40,
  estimated_date1: '29/06/2026',
  days_overdue: 5,
  reminder_count: 0,
};

describe('templates.renderTemplate', () => {
  it('first-nudge email contains key fields', () => {
    const out = renderTemplate('first-nudge', 'email', baseCtx);
    expect(out.subject).toMatch(/Nhắc nhở/i);
    expect(out.body).toContain('PO-2026-0123');
    expect(out.body).toContain('HỘP SỐ TỰ ĐỘNG');
    expect(out.body).toContain('40 ngày');
  });

  it('overdue subject mentions quá hạn', () => {
    const out = renderTemplate('overdue', 'email', { ...baseCtx, reminder_count: 1 });
    expect(out.subject).toMatch(/quá hạn/i);
  });

  it('escalation subject includes lần thứ N+1', () => {
    const out = renderTemplate('escalation', 'email', { ...baseCtx, reminder_count: 3 });
    expect(out.subject).toMatch(/Lần thứ 4/);
  });

  it('Zalo body shorter than email', () => {
    const e = renderTemplate('first-nudge', 'email', baseCtx);
    const z = renderTemplate('first-nudge', 'zalo', baseCtx);
    expect(z.body.length).toBeLessThan(e.body.length);
  });

  it('replaces missing ETA with "(chưa có)"', () => {
    const out = renderTemplate('first-nudge', 'email', { ...baseCtx, estimated_date1: undefined });
    expect(out.body).toContain('(chưa có)');
  });
});

describe('templates.suggestTemplateLevel', () => {
  it('returns first-nudge when reminder_count === 0', () => {
    expect(suggestTemplateLevel({ reminder_count: 0, ncc_response_status: 'pending' } as Annotation, false)).toBe<TemplateLevel>('first-nudge');
  });

  it('returns overdue when reminded ≥ 1 and overdue', () => {
    expect(suggestTemplateLevel({ reminder_count: 1, ncc_response_status: 'pending' } as Annotation, true)).toBe<TemplateLevel>('overdue');
  });

  it('returns escalation when reminder_count ≥ 3', () => {
    expect(suggestTemplateLevel({ reminder_count: 3, ncc_response_status: 'pending' } as Annotation, false)).toBe<TemplateLevel>('escalation');
  });

  it('returns escalation when status silent', () => {
    expect(suggestTemplateLevel({ reminder_count: 1, ncc_response_status: 'silent' } as Annotation, false)).toBe<TemplateLevel>('escalation');
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test templates.test`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/lib/templates.ts`:

```ts
import type { Annotation, ReminderChannel, TemplateLevel } from './types';

export interface TemplateCtx {
  doc_no: string;
  item_code: string;
  item_name: string;
  supplier: string;
  doc_date: string;        // DD/MM/YYYY
  aging_days: number;
  estimated_date1?: string; // DD/MM/YYYY
  days_overdue?: number;
  reminder_count: number;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

const TODAY_DDMMYYYY = () => new Date().toLocaleDateString('vi-VN');

function fallback(v: string | number | undefined, alt = '(chưa có)'): string {
  if (v === undefined || v === null || v === '') return alt;
  return String(v);
}

export function renderTemplate(
  level: TemplateLevel,
  channel: ReminderChannel,
  c: TemplateCtx
): RenderedTemplate {
  const eta = fallback(c.estimated_date1);
  const today = TODAY_DDMMYYYY();
  const overdue = fallback(c.days_overdue, '0');

  if (channel === 'email') {
    if (level === 'first-nudge') {
      return {
        subject: `[Nhắc nhở] Đơn nợ ${c.doc_no} — ${c.item_name}`,
        body:
`Kính gửi quý đối tác ${c.supplier},

Công ty chúng tôi có đặt hàng phụ tùng ${c.item_name} (mã ${c.item_code}) thuộc đơn ${c.doc_no} ngày ${c.doc_date}, đến nay đã ${c.aging_days} ngày nhưng vẫn chưa nhận được hàng.

Quý đối tác vui lòng cho biết tiến độ giao hàng và ETA dự kiến trong thời gian sớm nhất.

Xin cảm ơn.`,
      };
    }
    if (level === 'overdue') {
      return {
        subject: `[Quá hạn ETA] Đơn nợ ${c.doc_no} — ${c.item_name}`,
        body:
`Kính gửi quý đối tác ${c.supplier},

Đơn ${c.doc_no} - ${c.item_name} (${c.item_code}) đã có ETA ${eta} nhưng đến nay ${today} vẫn chưa giao, trễ ${overdue} ngày.

Quý đối tác vui lòng xác nhận lịch giao mới và lý do chậm trễ.

Mong nhận hồi đáp sớm.`,
      };
    }
    // escalation
    return {
      subject: `[Khẩn cấp - Lần thứ ${c.reminder_count + 1}] Đơn nợ ${c.doc_no} — ${c.item_name}`,
      body:
`Kính gửi quý đối tác ${c.supplier},

Đây là lần nhắc thứ ${c.reminder_count + 1} cho đơn ${c.doc_no} - ${c.item_name} (${c.item_code}), đặt từ ${c.doc_date} (đã ${c.aging_days} ngày).

Do không nhận được phản hồi rõ ràng từ quý đối tác trong các lần liên hệ trước, chúng tôi cần xác nhận trong vòng 48 giờ tiếp theo:
- Có thực hiện đơn này không?
- Nếu có, ETA chốt là khi nào?

Nếu không nhận được trả lời, chúng tôi sẽ phải xem xét chuyển đơn sang nhà cung cấp khác.

Mong sớm có hồi âm.`,
    };
  }

  // Zalo — ngắn hơn, ít formal
  if (level === 'first-nudge') {
    return {
      subject: `Nhắc đơn ${c.doc_no}`,
      body: `Anh/chị ${c.supplier} ơi, cho em hỏi đơn ${c.doc_no} - ${c.item_name} (${c.item_code}) đặt ngày ${c.doc_date}, đã ${c.aging_days} ngày, hiện tiến độ thế nào ạ? Khi nào có hàng anh/chị báo em với.`,
    };
  }
  if (level === 'overdue') {
    return {
      subject: `Quá hạn ETA ${c.doc_no}`,
      body: `Anh/chị ${c.supplier} ơi, đơn ${c.doc_no} (${c.item_name}) ETA ${eta} đã trễ ${overdue} ngày. Anh/chị xác nhận giúp em lịch giao mới với ạ. Cảm ơn.`,
    };
  }
  return {
    subject: `Khẩn ${c.doc_no} - lần ${c.reminder_count + 1}`,
    body: `Anh/chị ${c.supplier} ơi, đơn ${c.doc_no} - ${c.item_name} đã nhắc ${c.reminder_count} lần mà em chưa nhận được phản hồi rõ. Anh/chị cố gắng trong 48h xác nhận giúp em: có làm không, ETA bao giờ. Nếu không em phải báo sếp xem xét NCC khác. Cảm ơn anh/chị.`,
  };
}

export function suggestTemplateLevel(ann: Annotation | undefined, isOverdue: boolean): TemplateLevel {
  const count = ann?.reminder_count ?? 0;
  const status = ann?.ncc_response_status ?? 'pending';
  if (count >= 3 || status === 'silent') return 'escalation';
  if (count >= 1 && isOverdue) return 'overdue';
  return 'first-nudge';
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test templates.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates.ts src/lib/templates.test.ts
git commit -m "feat(templates): 6 Vietnamese reminder templates (3 levels × 2 channels)"
```

---

## Task 2.2: `app/reminders/page.tsx` + `ReminderQueue` component

**Files:**
- Create: `back-order-dashboard/src/app/reminders/page.tsx`
- Create: `back-order-dashboard/src/components/ReminderQueue.tsx`
- Test: `back-order-dashboard/src/components/ReminderQueue.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/ReminderQueue.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import ReminderQueue from './ReminderQueue';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('ReminderQueue', () => {
  it('renders empty state when no data', () => {
    render(<ReminderQueue />, { wrapper });
    expect(screen.getByText(/Chưa có dữ liệu/i)).toBeInTheDocument();
  });

  it('orders by category strict (VOR > Bảo hành > Khẩn > Dự trữ > Khác)', () => {
    function Seed() {
      const { setRows } = useData();
      useEffect(() => {
        setRows([
          { DocDate: '01/01/2026', DocNo: 'D5', OPropertyName: 'Chiến dịch', ItemCode: 'I5', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D2', OPropertyName: 'Bảo hành',  ItemCode: 'I2', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D1', OPropertyName: 'Khẩn VOR',  ItemCode: 'I1', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D4', OPropertyName: 'Dự trữ',    ItemCode: 'I4', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D3', OPropertyName: 'Khẩn',      ItemCode: 'I3', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
        ]);
      }, []);
      return null;
    }
    render(<DataProvider><Seed /><ReminderQueue /></DataProvider>);
    const cards = screen.getAllByTestId('reminder-card');
    const docs = cards.map(c => within(c).getByTestId('doc-no').textContent);
    expect(docs).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test ReminderQueue`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Write implementation**

Tạo `src/components/ReminderQueue.tsx`:

```tsx
'use client';
import React, { useMemo, useState } from 'react';
import { useData } from './DataProvider';
import { sortByPriority } from '@/lib/priority';
import { compositeKey } from '@/lib/types';
import EmptyState from './EmptyState';
import { AlertTriangle } from 'lucide-react';
import ReminderActionPanel from './ReminderActionPanel';
import type { TransformedBOData } from '@/lib/transform';

const CATEGORY_COLOR: Record<string, string> = {
  'Khẩn VOR': 'bg-red-600 text-white',
  'Khẩn': 'bg-red-500 text-white',
  'Bảo hành': 'bg-orange-500 text-white',
  'Dự trữ': 'bg-yellow-400 text-slate-900',
};
const DEFAULT_COLOR = 'bg-slate-300 text-slate-900';

export default function ReminderQueue() {
  const { data, annotations, archive } = useData();
  const [openItem, setOpenItem] = useState<TransformedBOData | null>(null);

  const sorted = useMemo(
    () => sortByPriority(data, { annotations, today: new Date() }),
    [data, annotations]
  );

  if (data.length === 0) return <EmptyState />;

  const unsavedReminderCount = archive.length; // simplification — refined in P4

  return (
    <div className="p-4 space-y-3 max-w-5xl mx-auto">
      {unsavedReminderCount > 0 && (
        <div className="sticky top-0 z-10 bg-amber-100 border border-amber-300 text-amber-900 px-4 py-2 rounded flex items-center gap-2" data-testid="banner-unsaved">
          <AlertTriangle size={16} />
          <span>Bạn có {unsavedReminderCount} reminder chưa export.</span>
        </div>
      )}

      {sorted.map((row, idx) => {
        const key = compositeKey(row.DocNo, row.ItemCode, row.RowId);
        const ann = annotations.get(key);
        const cat = row.OPropertyName;
        const color = CATEGORY_COLOR[cat] ?? DEFAULT_COLOR;
        return (
          <div
            key={`${key}-${idx}`}
            data-testid="reminder-card"
            className="border border-slate-200 rounded-md p-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setOpenItem(row)}
          >
            <span className="text-slate-400 font-bold text-sm w-8">#{idx + 1}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${color}`}>{cat || 'Khác'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate" data-testid="doc-no">{row.DocNo}</div>
              <div className="text-xs text-slate-600 truncate">
                {row.ItemName} · NCC: {row['SR-ĐL2']} · Aging {row.AgingDays}d
                {ann ? ` · Đã nhắc ${ann.reminder_count}` : ' · Chưa nhắc'}
              </div>
            </div>
            <button className="text-blue-600 text-sm font-semibold">Mở để thúc →</button>
          </div>
        );
      })}

      {openItem && (
        <ReminderActionPanel row={openItem} onClose={() => setOpenItem(null)} />
      )}
    </div>
  );
}
```

Tạo `src/app/reminders/page.tsx`:

```tsx
import ReminderQueue from '@/components/ReminderQueue';

export default function RemindersPage() {
  return <ReminderQueue />;
}
```

**Note:** Test sẽ fail tới Task 2.3 vì `ReminderActionPanel` chưa tồn tại. Tạm thời stub:

Tạo `src/components/ReminderActionPanel.tsx` (stub):

```tsx
'use client';
import type { TransformedBOData } from '@/lib/transform';
export default function ReminderActionPanel(_props: { row: TransformedBOData; onClose: () => void }) {
  return null;
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test ReminderQueue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/reminders/page.tsx src/components/ReminderQueue.tsx src/components/ReminderActionPanel.tsx src/components/ReminderQueue.test.tsx
git commit -m "feat(ui): /reminders route + ReminderQueue with strict category ordering"
```

---

## Task 2.3: `ReminderActionPanel` + `TemplateGenerator`

**Files:**
- Modify: `back-order-dashboard/src/components/ReminderActionPanel.tsx`
- Create: `back-order-dashboard/src/components/TemplateGenerator.tsx`
- Test: `back-order-dashboard/src/components/ReminderActionPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/ReminderActionPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReminderActionPanel from './ReminderActionPanel';
import { DataProvider } from './DataProvider';
import type { TransformedBOData } from '@/lib/transform';

const sampleRow = {
  DocDate: '01/04/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn VOR',
  ItemCode: 'A1', ItemName: 'HỘP SỐ', QuantityRemainClose: '1', Quantity: 1,
  KhoNo: 'Kho MB', 'SR-ĐL2': 'Van Kim',
  ParsedDocDate: new Date('2026-04-01'),
  AgingDays: 40, AgingBucket: '31–60 ngày',
  DaysUntilETA: -5, ETAGroup: '', isUrgent: true, Region: '',
  EstimatedDate1: '29/06/2026',
} as TransformedBOData;

describe('ReminderActionPanel', () => {
  it('renders header with DocNo + Item', () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    expect(screen.getByText(/PO-1/)).toBeInTheDocument();
    expect(screen.getByText(/HỘP SỐ/)).toBeInTheDocument();
  });

  it('shows 3 template levels and lets user switch', async () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    expect(screen.getByRole('button', { name: /first-nudge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /overdue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escalation/i })).toBeInTheDocument();
  });

  it('Copy email button writes to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /Copy email/i }));
    expect(writeText).toHaveBeenCalled();
    const clipboard = writeText.mock.calls[0][0];
    expect(clipboard).toContain('PO-1');
  });

  it('"Đã gửi" opens log modal', async () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /Đã gửi/i }));
    expect(screen.getByRole('heading', { name: /Ghi log/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test ReminderActionPanel`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/TemplateGenerator.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { RenderedTemplate } from '@/lib/templates';

export default function TemplateGenerator({ rendered }: { rendered: RenderedTemplate }) {
  const [copied, setCopied] = useState<'email' | 'zalo' | null>(null);

  const copy = async (which: 'email' | 'zalo', text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-bold mb-1">Tiêu đề</div>
        <div className="font-semibold text-sm">{rendered.subject}</div>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-bold mb-1">Nội dung</div>
        <pre className="text-sm whitespace-pre-wrap font-sans">{rendered.body}</pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => copy('email', `${rendered.subject}\n\n${rendered.body}`)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold"
        >
          {copied === 'email' ? <Check size={14} /> : <Copy size={14} />}
          Copy email
        </button>
        <button
          onClick={() => copy('zalo', rendered.body)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-semibold"
        >
          {copied === 'zalo' ? <Check size={14} /> : <Copy size={14} />}
          Copy Zalo
        </button>
      </div>
    </div>
  );
}
```

Sửa `src/components/ReminderActionPanel.tsx` (REPLACE):

```tsx
'use client';
import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { TransformedBOData } from '@/lib/transform';
import { useData } from './DataProvider';
import { compositeKey, type TemplateLevel, type ReminderChannel } from '@/lib/types';
import { renderTemplate, suggestTemplateLevel } from '@/lib/templates';
import TemplateGenerator from './TemplateGenerator';
import ReminderLogModal from './ReminderLogModal';

const LEVELS: TemplateLevel[] = ['first-nudge', 'overdue', 'escalation'];

export default function ReminderActionPanel({ row, onClose }: { row: TransformedBOData; onClose: () => void }) {
  const { annotations } = useData();
  const ann = annotations.get(compositeKey(row.DocNo, row.ItemCode, row.RowId));
  const isOverdue = row.DaysUntilETA !== null && row.DaysUntilETA < 0;
  const [level, setLevel] = useState<TemplateLevel>(() => suggestTemplateLevel(ann, isOverdue));
  const [logOpen, setLogOpen] = useState(false);
  const [channel] = useState<ReminderChannel>('email');

  const ctx = {
    doc_no: row.DocNo,
    item_code: row.ItemCode,
    item_name: row.ItemName,
    supplier: row['SR-ĐL2'] ?? '(chưa rõ)',
    doc_date: row.DocDate,
    aging_days: row.AgingDays,
    estimated_date1: row.EstimatedDate1,
    days_overdue: isOverdue && row.DaysUntilETA !== null ? -row.DaysUntilETA : 0,
    reminder_count: ann?.reminder_count ?? 0,
  };

  const renderedEmail = useMemo(() => renderTemplate(level, 'email', ctx), [level, ctx]);
  const renderedZalo = useMemo(() => renderTemplate(level, 'zalo', ctx), [level, ctx]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="font-bold text-lg">{row.DocNo}</div>
            <div className="text-sm text-slate-600">{row.ItemName} · {row['SR-ĐL2']}</div>
          </div>
          <button onClick={onClose} aria-label="Đóng"><X /></button>
        </div>

        <div className="px-4 py-3 border-b bg-slate-50 flex gap-4 text-sm">
          <span><strong>Aging:</strong> {row.AgingDays}d</span>
          <span><strong>ETA cũ:</strong> {row.EstimatedDate1 ?? '(chưa có)'}</span>
          <span><strong>Đã nhắc:</strong> {ann?.reminder_count ?? 0}</span>
        </div>

        <div className="px-4 py-3">
          <div className="flex gap-2 mb-3">
            {LEVELS.map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-1 rounded text-sm font-semibold ${level === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <TemplateGenerator rendered={renderedEmail} />
            <details>
              <summary className="cursor-pointer text-sm text-slate-500">Phiên bản Zalo</summary>
              <div className="mt-2"><TemplateGenerator rendered={renderedZalo} /></div>
            </details>
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            onClick={() => setLogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold"
          >
            Đã gửi, ghi log
          </button>
        </div>

        {logOpen && (
          <ReminderLogModal
            row={row}
            level={level}
            channel={channel}
            onClose={() => setLogOpen(false)}
            onSaved={() => { setLogOpen(false); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
```

Tạo stub `src/components/ReminderLogModal.tsx`:

```tsx
'use client';
import type { TransformedBOData } from '@/lib/transform';
import type { TemplateLevel, ReminderChannel } from '@/lib/types';
export default function ReminderLogModal(_p: {
  row: TransformedBOData; level: TemplateLevel; channel: ReminderChannel;
  onClose: () => void; onSaved: () => void;
}) {
  return <div role="dialog"><h2>Ghi log</h2></div>;
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test ReminderActionPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReminderActionPanel.tsx src/components/TemplateGenerator.tsx src/components/ReminderLogModal.tsx src/components/ReminderActionPanel.test.tsx
git commit -m "feat(ui): ReminderActionPanel + TemplateGenerator with copy buttons"
```

---

## Task 2.4: `ReminderLogModal` — form ghi nhận

**Files:**
- Modify: `back-order-dashboard/src/components/ReminderLogModal.tsx`
- Test: `back-order-dashboard/src/components/ReminderLogModal.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/ReminderLogModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReminderLogModal from './ReminderLogModal';
import { DataProvider, useData } from './DataProvider';
import type { TransformedBOData } from '@/lib/transform';
import type { ReactNode } from 'react';

const sampleRow = {
  DocDate: '01/04/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn VOR',
  ItemCode: 'A1', ItemName: 'X', QuantityRemainClose: '1', Quantity: 1,
  KhoNo: 'K', 'SR-ĐL2': 'NCC1',
  ParsedDocDate: new Date(), AgingDays: 1, AgingBucket: '0–30 ngày',
  DaysUntilETA: null, ETAGroup: '', isUrgent: false, Region: '',
} as TransformedBOData;

function Probe({ children, onState }: { children: ReactNode; onState: (s: ReturnType<typeof useData>) => void }) {
  const s = useData();
  onState(s);
  return <>{children}</>;
}

describe('ReminderLogModal', () => {
  it('disables Save until kênh + status selected', async () => {
    render(
      <DataProvider>
        <ReminderLogModal row={sampleRow} level="first-nudge" channel="email" onClose={() => {}} onSaved={() => {}} />
      </DataProvider>
    );
    const save = screen.getByRole('button', { name: /^Lưu$/i });
    expect(save).toBeDisabled();
  });

  it('saves reminder via logReminder when form valid', async () => {
    const onSaved = vi.fn();
    let stateRef: ReturnType<typeof useData> | null = null;
    render(
      <DataProvider>
        <Probe onState={s => { stateRef = s; }}>
          <ReminderLogModal row={sampleRow} level="first-nudge" channel="email" onClose={() => {}} onSaved={onSaved} />
        </Probe>
      </DataProvider>
    );
    // status defaults to pending; channel email pre-selected via prop
    await userEvent.click(screen.getByLabelText(/Email/i));
    await userEvent.click(screen.getByLabelText(/^pending$/i));
    await userEvent.click(screen.getByRole('button', { name: /^Lưu$/i }));
    expect(onSaved).toHaveBeenCalled();
    expect(stateRef!.archive).toHaveLength(1);
  });

  it('prevents double-submit', async () => {
    const onSaved = vi.fn();
    render(
      <DataProvider>
        <ReminderLogModal row={sampleRow} level="first-nudge" channel="email" onClose={() => {}} onSaved={onSaved} />
      </DataProvider>
    );
    await userEvent.click(screen.getByLabelText(/Email/i));
    await userEvent.click(screen.getByLabelText(/^pending$/i));
    const save = screen.getByRole('button', { name: /^Lưu$/i });
    await userEvent.dblClick(save);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test ReminderLogModal`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Sửa `src/components/ReminderLogModal.tsx` (REPLACE):

```tsx
'use client';
import React, { useState } from 'react';
import type { TransformedBOData } from '@/lib/transform';
import { useData } from './DataProvider';
import type { TemplateLevel, ReminderChannel, ReminderStatus } from '@/lib/types';

const STATUSES: ReminderStatus[] = ['pending', 'acknowledged', 'committed', 'silent', 'closed'];
const CHANNELS: ReminderChannel[] = ['email', 'zalo', 'phone'];

export default function ReminderLogModal({
  row, level, channel: defaultChannel, onClose, onSaved,
}: {
  row: TransformedBOData; level: TemplateLevel; channel: ReminderChannel;
  onClose: () => void; onSaved: () => void;
}) {
  const { logReminder } = useData();
  const [channel, setChannel] = useState<ReminderChannel | ''>(defaultChannel);
  const [status, setStatus] = useState<ReminderStatus | ''>('');
  const [response, setResponse] = useState('');
  const [eta, setEta] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSave = channel !== '' && status !== '' && !submitting;

  const handleSave = () => {
    if (!canSave) return;
    setSubmitting(true);
    logReminder({
      doc_no: row.DocNo,
      item_code: row.ItemCode,
      row_id: row.RowId,
      item_name: row.ItemName,
      supplier: row['SR-ĐL2'] ?? '',
      channel: channel as ReminderChannel,
      template_used: level,
      ncc_response: response || undefined,
      eta_promised_new: eta || undefined,
      ncc_response_status: status as ReminderStatus,
    });
    onSaved();
  };

  return (
    <div role="dialog" aria-labelledby="log-title" className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-4 py-3 border-b">
          <h2 id="log-title" className="font-bold">Ghi log nhắc nhở</h2>
        </div>
        <div className="px-4 py-3 space-y-3">
          <fieldset>
            <legend className="text-sm font-semibold mb-1">Kênh đã dùng</legend>
            {CHANNELS.map(c => (
              <label key={c} className="inline-flex items-center mr-3">
                <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} />
                <span className="ml-1 capitalize">{c}</span>
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold">NCC trả lời</span>
            <textarea value={response} onChange={e => setResponse(e.target.value)} className="mt-1 w-full border rounded p-1 text-sm" rows={2} />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">ETA mới hứa (DD/MM/YYYY)</span>
            <input value={eta} onChange={e => setEta(e.target.value)} placeholder="15/05/2026" className="mt-1 w-full border rounded p-1 text-sm" />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold mb-1">Trạng thái</legend>
            {STATUSES.map(s => (
              <label key={s} className="inline-flex items-center mr-3">
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                <span className="ml-1">{s}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">Hủy</button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50">
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test ReminderLogModal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReminderLogModal.tsx src/components/ReminderLogModal.test.tsx
git commit -m "feat(ui): ReminderLogModal with validation + double-submit guard"
```

---

## Task 2.5: Navbar link to /reminders + currentUser prompt

**Files:**
- Modify: `back-order-dashboard/src/components/Navbar.tsx`
- Create: `back-order-dashboard/src/components/CurrentUserGuard.tsx`
- Modify: `back-order-dashboard/src/app/layout.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/CurrentUserGuard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from './DataProvider';
import CurrentUserGuard from './CurrentUserGuard';

describe('CurrentUserGuard', () => {
  beforeEach(() => localStorage.clear());

  it('shows modal when currentUser empty', () => {
    render(<DataProvider><CurrentUserGuard><div>app</div></CurrentUserGuard></DataProvider>);
    expect(screen.getByRole('heading', { name: /Tên bạn/i })).toBeInTheDocument();
  });

  it('hides modal after user enters name', async () => {
    render(<DataProvider><CurrentUserGuard><div>app</div></CurrentUserGuard></DataProvider>);
    await userEvent.type(screen.getByPlaceholderText(/Tên bạn/i), 'NV A');
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }));
    expect(screen.queryByRole('heading', { name: /Tên bạn/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('backorder.currentUser')).toBe('NV A');
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test CurrentUserGuard`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/CurrentUserGuard.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { useData } from './DataProvider';

export default function CurrentUserGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser } = useData();
  const [name, setName] = useState('');

  if (currentUser) return <>{children}</>;

  return (
    <>
      <div role="dialog" className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4">
          <h2 className="font-bold mb-2">Tên bạn là gì?</h2>
          <p className="text-sm text-slate-600 mb-3">Tên này được ghi vào log mỗi lần bạn nhắc NCC.</p>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Tên bạn"
            className="w-full border rounded p-2 text-sm mb-3"
          />
          <button
            disabled={!name.trim()}
            onClick={() => setCurrentUser(name.trim())}
            className="w-full bg-blue-600 text-white py-2 rounded font-semibold disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
```

Sửa `src/app/layout.tsx` — wrap children with `CurrentUserGuard`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import Navbar from "@/components/Navbar";
import CurrentUserGuard from "@/components/CurrentUserGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Back Order Dashboard",
  description: "Production web dashboard for tracking back orders.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <DataProvider>
          <CurrentUserGuard>
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </CurrentUserGuard>
        </DataProvider>
      </body>
    </html>
  );
}
```

Sửa `src/components/Navbar.tsx` — thêm link "Reminders" (đọc Navbar hiện tại trước, append link `/reminders`). Engineer mở file, copy link cũ làm pattern, thêm:

```tsx
<Link href="/reminders" className="...">Reminders</Link>
```

(các classes copy theo pattern hiện có).

- [ ] **Step 4: Run (must pass)**

Run: `npm test CurrentUserGuard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CurrentUserGuard.tsx src/components/CurrentUserGuard.test.tsx src/components/Navbar.tsx src/app/layout.tsx
git commit -m "feat(ui): CurrentUserGuard prompt + Navbar link to /reminders"
```

---

## Task 2.6: E2E happy path — reminder flow

**Files:**
- Create: `back-order-dashboard/e2e/reminder-happy-path.spec.ts`

- [ ] **Step 1: Write E2E**

Tạo `e2e/reminder-happy-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test.describe('E2E: reminder happy path', () => {
  test('upload sample → log first reminder → state updates', async ({ page }) => {
    await page.goto('/');

    // currentUser modal
    await page.getByPlaceholder(/Tên bạn/i).fill('Test User');
    await page.getByRole('button', { name: /Lưu/i }).click();

    // upload CSV
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Tải CSV/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve(__dirname, '../data/sample.csv'));

    // navigate to /reminders
    await page.goto('/reminders');
    await expect(page.getByTestId('reminder-card').first()).toBeVisible();

    // open first item
    await page.getByTestId('reminder-card').first().click();
    await expect(page.getByRole('button', { name: /Đã gửi/i })).toBeVisible();

    // copy email (check clipboard via override)
    await page.getByRole('button', { name: /Copy email/i }).click();

    // open log modal
    await page.getByRole('button', { name: /Đã gửi/i }).click();
    await page.getByLabel(/Email/i).first().check();
    await page.getByLabel(/^pending$/i).check();
    await page.getByRole('button', { name: /^Lưu$/i }).click();

    // banner unsaved appears
    await expect(page.getByTestId('banner-unsaved')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run (might fail — fixture deps)**

Run: `npm run test:e2e reminder-happy-path`
Expected: PASS hoặc fail nhẹ về timing.

- [ ] **Step 3: Fix flakes if any**

Add `await page.waitForLoadState('networkidle')` nếu cần. Đảm bảo locator stable.

- [ ] **Step 4: Re-run**

Run: `npm run test:e2e reminder-happy-path`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/reminder-happy-path.spec.ts
git commit -m "test(e2e): reminder happy path — upload, log, banner"
```

---

## Task 2.7: P2 acceptance — coverage gate + tag

- [ ] **Step 1: Run full coverage**

Run: `npm run test:coverage`

- [ ] **Step 2: Verify ≥80% trên các module mới**

`templates.ts`, `ReminderQueue`, `ReminderActionPanel`, `ReminderLogModal`, `TemplateGenerator`, `CurrentUserGuard`.

- [ ] **Step 3: Fill missing branches**

Add tests cho early-return, empty states, validation lỗi.

- [ ] **Step 4: Run again**

Run: `npm run test:coverage` + `npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Tag P2 done**

```bash
git tag p2-reminder-done
git commit --allow-empty -m "milestone(p2): reminder workflow complete"
```

**P2 demo:** Upload sample.csv → /reminders → log 1 reminder → confirm banner xuất hiện.

---

# Phase 3: History & Scorecard

## Task 3.0: Confirm supplier source (OQ1 resolution)

**Files:** Engineer phải dừng và hỏi user trước khi bắt đầu P3.

- [ ] **Step 1: Đọc lại `data/sample.csv`**

Run: `head -5 data/sample.csv`. Ghi nhận `SR-ĐL2` chứa "PEU HN", "Van Kim Automative Co", v.v.

- [ ] **Step 2: Hỏi user 3 lựa chọn**

Hỏi user (trong chat session): "Cột nào trong CSV chứa **tên nhà cung cấp giao hàng** (NCC) cho scorecard?"
- (a) `SR-ĐL2` — dùng giá trị hiện tại
- (b) Parse từ `EstimatedDescription` (cần regex pattern)
- (c) Bổ sung cột mới — chờ data team

- [ ] **Step 3: Implement `getSupplier`**

Tạo `src/lib/supplier.ts`:

```ts
import type { RawBOData } from './transform';

// CHỐT VỚI USER trong P3.0 — mặc định (a)
export function getSupplier(row: RawBOData): { name: string; isInferred: boolean } {
  const direct = row['SR-ĐL2'];
  if (direct && direct.trim()) return { name: direct.trim(), isInferred: false };
  return { name: '(không rõ)', isInferred: true };
}
```

Test `src/lib/supplier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSupplier } from './supplier';

describe('getSupplier', () => {
  it('returns SR-ĐL2 directly when present', () => {
    expect(getSupplier({ 'SR-ĐL2': 'PEU HN' } as any)).toEqual({ name: 'PEU HN', isInferred: false });
  });
  it('falls back to "(không rõ)" + isInferred when missing', () => {
    expect(getSupplier({ 'SR-ĐL2': '' } as any)).toEqual({ name: '(không rõ)', isInferred: true });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test supplier.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supplier.ts src/lib/supplier.test.ts
git commit -m "feat(supplier): centralize supplier resolution (defer OQ1 confirm with user)"
```

---

## Task 3.1: `lib/scorecard.ts` — aggregations

**Files:**
- Create: `back-order-dashboard/src/lib/scorecard.ts`
- Test: `back-order-dashboard/src/lib/scorecard.test.ts`

- [ ] **Step 1: Write failing test**

Tạo `src/lib/scorecard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeScorecard, reliabilityScore, type SupplierStats } from './scorecard';
import type { ReminderEntry } from './types';

function r(over: Partial<ReminderEntry>): ReminderEntry {
  return {
    uuid: Math.random().toString(36),
    created_at: '2026-05-10T08:00:00.000Z',
    doc_no: 'PO-1', item_code: 'A', item_name: 'X',
    supplier: 'Van Kim', channel: 'email', reminder_by: 'NV A',
    template_used: 'first-nudge', ncc_response_status: 'pending',
    ...over,
  };
}

describe('reliabilityScore', () => {
  it('returns 0 when no reminders', () => {
    expect(reliabilityScore({ supplier: 'X', totalOrders: 0, totalReminders: 0,
      committedCount: 0, silentCount: 0, avgEtaSlipDays: 0, avgResponseTimeHours: 0,
      pctCommitted: 0, pctSilent: 0 })).toBe(0);
  });

  it('high score for high commit + low slip + low silent', () => {
    const s = reliabilityScore({
      supplier: 'X', totalOrders: 10, totalReminders: 10,
      committedCount: 9, silentCount: 0, avgEtaSlipDays: 1, avgResponseTimeHours: 2,
      pctCommitted: 0.9, pctSilent: 0,
    });
    expect(s).toBeGreaterThan(7);
  });

  it('low score for high silent + high slip', () => {
    const s = reliabilityScore({
      supplier: 'X', totalOrders: 10, totalReminders: 10,
      committedCount: 0, silentCount: 10, avgEtaSlipDays: 30, avgResponseTimeHours: 0,
      pctCommitted: 0, pctSilent: 1,
    });
    expect(s).toBeLessThan(3);
  });
});

describe('computeScorecard', () => {
  it('groups by supplier', () => {
    const archive = [
      r({ supplier: 'A', ncc_response_status: 'committed' }),
      r({ supplier: 'A', ncc_response_status: 'silent' }),
      r({ supplier: 'B', ncc_response_status: 'committed' }),
    ];
    const stats = computeScorecard(archive);
    expect(stats.find(s => s.supplier === 'A')?.totalReminders).toBe(2);
    expect(stats.find(s => s.supplier === 'B')?.totalReminders).toBe(1);
  });

  it('filters by time window', () => {
    const archive = [
      r({ supplier: 'A', created_at: '2026-04-01T00:00:00Z' }),
      r({ supplier: 'A', created_at: '2026-05-09T00:00:00Z' }),
    ];
    const today = new Date('2026-05-10');
    const stats7d = computeScorecard(archive, { now: today, windowDays: 7 });
    expect(stats7d.find(s => s.supplier === 'A')?.totalReminders).toBe(1);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test scorecard.test`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/lib/scorecard.ts`:

```ts
import type { ReminderEntry } from './types';

export interface SupplierStats {
  supplier: string;
  totalOrders: number;
  totalReminders: number;
  committedCount: number;
  silentCount: number;
  pctCommitted: number;
  pctSilent: number;
  avgEtaSlipDays: number;
  avgResponseTimeHours: number;
}

interface Opts { now?: Date; windowDays?: number | 'all' }

export function computeScorecard(archive: ReminderEntry[], opts: Opts = {}): SupplierStats[] {
  const now = opts.now ?? new Date();
  const window = opts.windowDays ?? 'all';
  const cutoff = window === 'all' ? -Infinity : now.getTime() - window * 86_400_000;

  const filtered = archive.filter(r => new Date(r.created_at).getTime() >= cutoff);
  const bySupplier = new Map<string, ReminderEntry[]>();
  for (const r of filtered) {
    const list = bySupplier.get(r.supplier) ?? [];
    list.push(r);
    bySupplier.set(r.supplier, list);
  }

  const out: SupplierStats[] = [];
  for (const [supplier, rs] of bySupplier) {
    const orders = new Set(rs.map(r => `${r.doc_no}|${r.item_code}|${r.row_id ?? ''}`));
    const committed = rs.filter(r => r.ncc_response_status === 'committed').length;
    const silent = rs.filter(r => r.ncc_response_status === 'silent').length;
    out.push({
      supplier,
      totalOrders: orders.size,
      totalReminders: rs.length,
      committedCount: committed,
      silentCount: silent,
      pctCommitted: rs.length === 0 ? 0 : committed / rs.length,
      pctSilent: rs.length === 0 ? 0 : silent / rs.length,
      avgEtaSlipDays: 0,         // refined when richer data
      avgResponseTimeHours: 0,   // refined when richer data
    });
  }
  return out;
}

export function reliabilityScore(s: SupplierStats): number {
  if (s.totalReminders === 0) return 0;
  const normSlip = Math.min(1, Math.max(0, s.avgEtaSlipDays / 30));
  const raw = 0.4 * s.pctCommitted - 0.3 * normSlip - 0.3 * s.pctSilent;
  return Math.max(0, Math.min(10, (raw + 0.6) * 10));
}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test scorecard.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard.ts src/lib/scorecard.test.ts
git commit -m "feat(scorecard): aggregations + reliability score heuristic"
```

---

## Task 3.2: `/scorecard` page + `SupplierScorecard` component

**Files:**
- Create: `back-order-dashboard/src/app/scorecard/page.tsx`
- Create: `back-order-dashboard/src/components/SupplierScorecard.tsx`
- Test: `back-order-dashboard/src/components/SupplierScorecard.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/SupplierScorecard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SupplierScorecard from './SupplierScorecard';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

function Seed() {
  const { logReminder, setCurrentUser } = useData();
  useEffect(() => {
    setCurrentUser('NV A');
    logReminder({ doc_no: 'P1', item_code: 'A', item_name: 'X', supplier: 'Van Kim', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'committed' });
    logReminder({ doc_no: 'P2', item_code: 'B', item_name: 'Y', supplier: 'PEU HN', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'silent' });
  }, []);
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider><Seed />{children}</DataProvider>
);

describe('SupplierScorecard', () => {
  it('renders one row per supplier', () => {
    render(<SupplierScorecard />, { wrapper });
    expect(screen.getByText('Van Kim')).toBeInTheDocument();
    expect(screen.getByText('PEU HN')).toBeInTheDocument();
  });

  it('switching time window changes data', async () => {
    render(<SupplierScorecard />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /^7 ngày$/ }));
    // Both reminders are recent, so still 2 rows
    expect(screen.getAllByTestId('supplier-row')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test SupplierScorecard`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/SupplierScorecard.tsx`:

```tsx
'use client';
import React, { useState, useMemo } from 'react';
import { useData } from './DataProvider';
import { computeScorecard, reliabilityScore } from '@/lib/scorecard';

const WINDOWS = [
  { label: '7 ngày', value: 7 },
  { label: '30 ngày', value: 30 },
  { label: '90 ngày', value: 90 },
  { label: 'Tất cả', value: 'all' as const },
];

export default function SupplierScorecard() {
  const { archive } = useData();
  const [window, setWindow] = useState<number | 'all'>(30);
  const [drilldown, setDrilldown] = useState<string | null>(null);

  const stats = useMemo(() => computeScorecard(archive, { windowDays: window }), [archive, window]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex gap-2 mb-3">
        {WINDOWS.map(w => (
          <button
            key={w.label}
            onClick={() => setWindow(w.value)}
            className={`px-3 py-1 rounded text-sm font-semibold ${window === w.value ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">NCC</th>
            <th className="text-right p-2">#đơn</th>
            <th className="text-right p-2">#nhắc</th>
            <th className="text-right p-2">%commit</th>
            <th className="text-right p-2">%silent</th>
            <th className="text-right p-2">Avg slip</th>
            <th className="text-right p-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(s => (
            <tr key={s.supplier} data-testid="supplier-row" className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setDrilldown(s.supplier)}>
              <td className="p-2 font-semibold">{s.supplier}</td>
              <td className="p-2 text-right">{s.totalOrders}</td>
              <td className="p-2 text-right">{s.totalReminders}</td>
              <td className="p-2 text-right">{(s.pctCommitted * 100).toFixed(0)}%</td>
              <td className="p-2 text-right">{(s.pctSilent * 100).toFixed(0)}%</td>
              <td className="p-2 text-right">{s.avgEtaSlipDays.toFixed(0)}d</td>
              <td className="p-2 text-right font-bold">{reliabilityScore(s).toFixed(1)}/10</td>
            </tr>
          ))}
        </tbody>
      </table>

      {drilldown && <SupplierDrilldown supplier={drilldown} onClose={() => setDrilldown(null)} />}
    </div>
  );
}

function SupplierDrilldown({ supplier, onClose }: { supplier: string; onClose: () => void }) {
  const { archive } = useData();
  const reminders = archive.filter(r => r.supplier === supplier);
  return (
    <div role="dialog" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-bold">{supplier}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <ul className="text-sm space-y-1">
          {reminders.map(r => (
            <li key={r.uuid} className="border-b py-1">{r.doc_no} · {r.item_name} · {r.ncc_response_status} · {r.created_at}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

Tạo `src/app/scorecard/page.tsx`:

```tsx
import SupplierScorecard from '@/components/SupplierScorecard';
export default function Page() { return <SupplierScorecard />; }
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test SupplierScorecard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/scorecard/page.tsx src/components/SupplierScorecard.tsx src/components/SupplierScorecard.test.tsx
git commit -m "feat(ui): /scorecard with time-window filter + drill-down"
```

---

## Task 3.3: `ReminderHistoryTable` (cho 1 đơn)

**Files:**
- Create: `back-order-dashboard/src/components/ReminderHistoryTable.tsx`
- Test: `back-order-dashboard/src/components/ReminderHistoryTable.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/ReminderHistoryTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import ReminderHistoryTable from './ReminderHistoryTable';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

function Seed() {
  const { logReminder, setCurrentUser } = useData();
  useEffect(() => {
    setCurrentUser('A');
    logReminder({ doc_no: 'P1', item_code: 'A', item_name: 'X', supplier: 'NCC', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending' });
    logReminder({ doc_no: 'P1', item_code: 'A', item_name: 'X', supplier: 'NCC', channel: 'zalo',  template_used: 'overdue',     ncc_response_status: 'committed' });
    logReminder({ doc_no: 'P2', item_code: 'B', item_name: 'Y', supplier: 'NCC', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'silent' });
  }, []);
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider><Seed />{children}</DataProvider>
);

describe('ReminderHistoryTable', () => {
  it('shows only reminders for given doc+item', () => {
    render(<ReminderHistoryTable docNo="P1" itemCode="A" />, { wrapper });
    expect(screen.getAllByTestId('history-row')).toHaveLength(2);
  });

  it('sorts desc by created_at', () => {
    render(<ReminderHistoryTable docNo="P1" itemCode="A" />, { wrapper });
    const rows = screen.getAllByTestId('history-row');
    // last logged appears first
    expect(rows[0]).toHaveTextContent(/overdue/);
  });

  it('shows empty state when no reminders', () => {
    render(<ReminderHistoryTable docNo="P3" itemCode="C" />, { wrapper });
    expect(screen.getByText(/Chưa có lần nhắc nào/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test ReminderHistoryTable`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/ReminderHistoryTable.tsx`:

```tsx
'use client';
import React, { useMemo } from 'react';
import { useData } from './DataProvider';

export default function ReminderHistoryTable({ docNo, itemCode, rowId }: { docNo: string; itemCode: string; rowId?: string }) {
  const { archive } = useData();
  const filtered = useMemo(
    () => archive
      .filter(r => r.doc_no === docNo && r.item_code === itemCode && (!rowId || r.row_id === rowId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [archive, docNo, itemCode, rowId]
  );

  if (filtered.length === 0) return <p className="text-sm text-slate-500 italic">Chưa có lần nhắc nào.</p>;

  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-100">
        <tr>
          <th className="text-left p-1">Khi nào</th>
          <th className="text-left p-1">NV</th>
          <th className="text-left p-1">Kênh</th>
          <th className="text-left p-1">Mức</th>
          <th className="text-left p-1">Status</th>
          <th className="text-left p-1">NCC trả lời</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(r => (
          <tr key={r.uuid} data-testid="history-row" className="border-b">
            <td className="p-1">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
            <td className="p-1">{r.reminder_by}</td>
            <td className="p-1">{r.channel}</td>
            <td className="p-1">{r.template_used}</td>
            <td className="p-1">{r.ncc_response_status}</td>
            <td className="p-1">{r.ncc_response ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Sửa `ReminderActionPanel.tsx` — thay phần `<details>` Zalo bằng tab Lịch sử:

(Edit `ReminderActionPanel.tsx` — bỏ `<details>` block + thêm tabs:)

```tsx
import ReminderHistoryTable from './ReminderHistoryTable';
// ...
const [activeTab, setActiveTab] = useState<'template' | 'history'>('template');
// thay block <details> bằng:
<div className="flex gap-2 border-b mb-2">
  <button onClick={() => setActiveTab('template')}
    className={`px-3 py-1 text-sm font-semibold ${activeTab === 'template' ? 'border-b-2 border-blue-600' : ''}`}>Template</button>
  <button onClick={() => setActiveTab('history')}
    className={`px-3 py-1 text-sm font-semibold ${activeTab === 'history' ? 'border-b-2 border-blue-600' : ''}`}>Lịch sử</button>
</div>
{activeTab === 'template' ? (
  <TemplateGenerator rendered={renderedEmail} />
) : (
  <ReminderHistoryTable docNo={row.DocNo} itemCode={row.ItemCode} rowId={row.RowId} />
)}
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test ReminderHistoryTable && npm test ReminderActionPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReminderHistoryTable.tsx src/components/ReminderHistoryTable.test.tsx src/components/ReminderActionPanel.tsx
git commit -m "feat(ui): ReminderHistoryTable + tabbed ReminderActionPanel"
```

---

## Task 3.4: P3 acceptance — coverage + tag

- [ ] **Step 1: Run coverage**

Run: `npm run test:coverage`

- [ ] **Step 2: Verify ≥80%**

`scorecard.ts`, `supplier.ts`, `SupplierScorecard`, `ReminderHistoryTable`.

- [ ] **Step 3: Fill gaps**

- [ ] **Step 4: E2E scorecard drill-down**

Tạo `e2e/scorecard.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('scorecard drill-down', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Tên bạn/i).fill('Test');
  await page.getByRole('button', { name: /Lưu/i }).click();

  // upload + log a reminder so scorecard has data
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Tải CSV/i }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(path.resolve(__dirname, '../data/sample.csv'));
  await page.goto('/reminders');
  await page.getByTestId('reminder-card').first().click();
  await page.getByRole('button', { name: /Đã gửi/i }).click();
  await page.getByLabel(/Email/i).first().check();
  await page.getByLabel(/^committed$/i).check();
  await page.getByRole('button', { name: /^Lưu$/i }).click();

  // scorecard
  await page.goto('/scorecard');
  await expect(page.getByTestId('supplier-row').first()).toBeVisible();
  await page.getByTestId('supplier-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
```

Run: `npm run test:e2e scorecard`. Expected: PASS.

- [ ] **Step 5: Tag P3**

```bash
git add e2e/scorecard.spec.ts
git commit -m "test(e2e): scorecard drill-down"
git tag p3-scorecard-done
```

---

# Phase 4: Handoff Polish

## Task 4.1: `HandoffModal` — Export wizard

**Files:**
- Create: `back-order-dashboard/src/components/HandoffModal.tsx`
- Test: `back-order-dashboard/src/components/HandoffModal.test.tsx`
- Create: `back-order-dashboard/src/app/handoff/page.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/HandoffModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HandoffModal from './HandoffModal';
import { DataProvider, useData } from './DataProvider';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('HandoffModal', () => {
  it('renders Export and Import buttons', () => {
    render(<HandoffModal />, { wrapper });
    expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
  });

  it('clicking Export triggers download (URL.createObjectURL called)', async () => {
    const create = vi.fn(() => 'blob:mock');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    render(<HandoffModal />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /Export/i }));
    expect(create).toHaveBeenCalledTimes(2); // csv + json
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test HandoffModal`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/HandoffModal.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { useData } from './DataProvider';
import type { MergeReport } from '@/lib/persist';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HandoffModal() {
  const { exportSnapshot, importHandoff } = useData();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [report, setReport] = useState<MergeReport | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const out = exportSnapshot();
    downloadBlob(out.csv, `backorder_active_${today}.csv`);
    downloadBlob(out.json, `backorder_archive_${today}.json`);
  };

  const handleImport = async () => {
    if (!csvText || !jsonText) return;
    const r = await importHandoff(csvText, jsonText);
    setReport(r.report);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex gap-2 mb-3 border-b">
        <button onClick={() => setTab('export')}
          className={`px-3 py-1 ${tab === 'export' ? 'border-b-2 border-blue-600 font-semibold' : ''}`}>Export</button>
        <button onClick={() => setTab('import')}
          className={`px-3 py-1 ${tab === 'import' ? 'border-b-2 border-blue-600 font-semibold' : ''}`}>Import</button>
      </div>

      {tab === 'export' ? (
        <div>
          <p className="text-sm mb-3">Tải xuống 2 file (CSV + JSON) để gửi cho đồng nghiệp.</p>
          <button onClick={handleExport} className="px-4 py-2 bg-blue-600 text-white rounded font-semibold">Export</button>
        </div>
      ) : (
        <div>
          <p className="text-sm mb-3">Upload 2 file đồng nghiệp gửi qua. App sẽ merge với state hiện tại.</p>
          <label className="block mb-2">
            <span className="text-sm">CSV file</span>
            <input type="file" accept=".csv" onChange={async e => {
              const f = e.target.files?.[0]; if (f) setCsvText(await f.text());
            }} />
          </label>
          <label className="block mb-2">
            <span className="text-sm">JSON file</span>
            <input type="file" accept=".json" onChange={async e => {
              const f = e.target.files?.[0]; if (f) setJsonText(await f.text());
            }} />
          </label>
          <button onClick={handleImport} disabled={!csvText || !jsonText}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">
            Xác nhận merge
          </button>
          {report && (
            <div className="mt-3 p-3 bg-slate-50 border rounded text-sm">
              <div>Đã thêm: {report.added}</div>
              <div>Ghi đè: {report.overwritten}</div>
              <div>Tie-break: {report.tieBroken}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Tạo `src/app/handoff/page.tsx`:

```tsx
import HandoffModal from '@/components/HandoffModal';
export default function Page() { return <HandoffModal />; }
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test HandoffModal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/HandoffModal.tsx src/components/HandoffModal.test.tsx src/app/handoff/page.tsx
git commit -m "feat(ui): /handoff with Export + Import wizard"
```

---

## Task 4.2: `beforeunload` listener + auto-export prompt

**Files:**
- Create: `back-order-dashboard/src/components/UnsavedGuard.tsx`
- Test: `back-order-dashboard/src/components/UnsavedGuard.test.tsx`
- Modify: `back-order-dashboard/src/app/layout.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/UnsavedGuard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import UnsavedGuard from './UnsavedGuard';
import { DataProvider } from './DataProvider';

describe('UnsavedGuard', () => {
  it('attaches beforeunload listener on mount', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    render(<DataProvider><UnsavedGuard /></DataProvider>);
    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test UnsavedGuard`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/UnsavedGuard.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { useData } from './DataProvider';

export default function UnsavedGuard() {
  const { archive, lastExportAt } = useData();
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const lastExportTs = lastExportAt ? new Date(lastExportAt).getTime() : 0;
      const hasUnsaved = archive.some(r => new Date(r.created_at).getTime() > lastExportTs);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = 'Bạn có reminder chưa export. Vẫn đóng?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [archive, lastExportAt]);
  return null;
}
```

Sửa `src/app/layout.tsx` — thêm `<UnsavedGuard />` bên trong `CurrentUserGuard`:

```tsx
<CurrentUserGuard>
  <UnsavedGuard />
  <div className="flex flex-col min-h-screen">...</div>
</CurrentUserGuard>
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test UnsavedGuard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UnsavedGuard.tsx src/components/UnsavedGuard.test.tsx src/app/layout.tsx
git commit -m "feat(safety): UnsavedGuard with beforeunload prompt"
```

---

## Task 4.3: Sticky export banner with 4h auto-prompt

**Files:**
- Modify: `back-order-dashboard/src/components/ReminderQueue.tsx` (refine banner logic)
- Create: `back-order-dashboard/src/components/ExportBanner.tsx`
- Test: `back-order-dashboard/src/components/ExportBanner.test.tsx`

- [ ] **Step 1: Write failing test**

Tạo `src/components/ExportBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import ExportBanner from './ExportBanner';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

function SetUser() {
  const { setCurrentUser } = useData();
  useEffect(() => { setCurrentUser('NV A'); }, []);
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider><SetUser />{children}</DataProvider>;

describe('ExportBanner', () => {
  beforeEach(() => localStorage.clear());

  it('hides when no reminders', () => {
    render(<ExportBanner />, { wrapper });
    expect(screen.queryByTestId('export-banner')).not.toBeInTheDocument();
  });

  it('shows count when reminders exist after lastExportAt', () => {
    function Seed() {
      const { logReminder, setCurrentUser } = useData();
      useEffect(() => {
        setCurrentUser('A');
        logReminder({ doc_no: 'P', item_code: 'A', item_name: 'X', supplier: 'S', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending' });
      }, []);
      return null;
    }
    render(<DataProvider><Seed /><ExportBanner /></DataProvider>);
    expect(screen.getByTestId('export-banner')).toHaveTextContent(/1/);
  });
});
```

- [ ] **Step 2: Run (must fail)**

Run: `npm test ExportBanner`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Tạo `src/components/ExportBanner.tsx`:

```tsx
'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useData } from './DataProvider';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export default function ExportBanner() {
  const { archive, lastExportAt } = useData();

  const { unsavedCount, isStale } = useMemo(() => {
    const lastTs = lastExportAt ? new Date(lastExportAt).getTime() : 0;
    const unsaved = archive.filter(r => new Date(r.created_at).getTime() > lastTs);
    const isStale = lastTs > 0 && Date.now() - lastTs > FOUR_HOURS_MS;
    return { unsavedCount: unsaved.length, isStale };
  }, [archive, lastExportAt]);

  if (unsavedCount === 0 && !isStale) return null;

  return (
    <div data-testid="export-banner" className="sticky top-0 z-20 bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 flex items-center gap-2">
      <AlertTriangle size={16} />
      <span className="text-sm">
        {unsavedCount > 0
          ? `Bạn có ${unsavedCount} reminder chưa export.`
          : `Đã hơn 4 giờ chưa export — cân nhắc backup.`}
      </span>
      <Link href="/handoff" className="ml-auto bg-amber-600 text-white px-3 py-1 rounded text-sm font-semibold">Export ngay</Link>
    </div>
  );
}
```

Bỏ banner inline trong `ReminderQueue.tsx` (đã chuyển sang ExportBanner global). Thêm `<ExportBanner />` vào `layout.tsx`:

```tsx
<CurrentUserGuard>
  <UnsavedGuard />
  <div className="flex flex-col min-h-screen">
    <Navbar />
    <ExportBanner />
    <main className="flex-1 overflow-auto">{children}</main>
  </div>
</CurrentUserGuard>
```

- [ ] **Step 4: Run (must pass)**

Run: `npm test ExportBanner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportBanner.tsx src/components/ExportBanner.test.tsx src/components/ReminderQueue.tsx src/app/layout.tsx
git commit -m "feat(safety): global ExportBanner with 4h staleness check"
```

---

## Task 4.4: E2E handoff round-trip

**Files:**
- Create: `back-order-dashboard/e2e/handoff.spec.ts`

- [ ] **Step 1: Write E2E**

Tạo `e2e/handoff.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('handoff round-trip', async ({ page, context }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Tên bạn/i).fill('NV A');
  await page.getByRole('button', { name: /Lưu/i }).click();

  // upload + create 1 reminder
  const fcp = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Tải CSV/i }).click();
  const fc = await fcp;
  await fc.setFiles(path.resolve(__dirname, '../data/sample.csv'));
  await page.goto('/reminders');
  await page.getByTestId('reminder-card').first().click();
  await page.getByRole('button', { name: /Đã gửi/i }).click();
  await page.getByLabel(/Email/i).first().check();
  await page.getByLabel(/^committed$/i).check();
  await page.getByRole('button', { name: /^Lưu$/i }).click();

  // export
  await page.goto('/handoff');
  const [csvDl, jsonDl] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Export$/i }).click(),
  ]);
  const csvPath = await csvDl.path();
  const jsonPath = await jsonDl.path();
  expect(csvPath).toBeTruthy();
  expect(jsonPath).toBeTruthy();

  // open new context, import
  const page2 = await context.newPage();
  await page2.goto('/');
  await page2.getByPlaceholder(/Tên bạn/i).fill('NV B');
  await page2.getByRole('button', { name: /Lưu/i }).click();
  await page2.goto('/handoff');
  await page2.getByRole('button', { name: /Import/i }).click();
  // upload csv + json — selector via labels
  // (For this MVP test, we assert the merge report appears after upload-and-confirm)
  // engineer fills selectors per actual DOM
});
```

- [ ] **Step 2: Run**

Run: `npm run test:e2e handoff`
Expected: PASS or guided fail (engineer to refine selectors).

- [ ] **Step 3: Tweak selectors**

Engineer adjusts selectors based on actual DOM layout for file inputs.

- [ ] **Step 4: Re-run**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/handoff.spec.ts
git commit -m "test(e2e): handoff round-trip via Export + Import"
```

---

## Task 4.5: Visual regression baseline

**Files:**
- Create: `back-order-dashboard/e2e/visual.spec.ts`

- [ ] **Step 1: Write screenshot tests**

Tạo `e2e/visual.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

const VIEWPORTS = [
  { name: 'mobile-320',  width: 320,  height: 800 },
  { name: 'tablet-768',  width: 768,  height: 1024 },
  { name: 'desktop-1024',width: 1024, height: 800 },
  { name: 'desktop-1440',width: 1440, height: 900 },
];

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/Tên bạn/i).fill('Test');
    await page.getByRole('button', { name: /Lưu/i }).click();
    const fcp = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Tải CSV/i }).click();
    const fc = await fcp;
    await fc.setFiles(path.resolve(__dirname, '../data/sample.csv'));
  });

  for (const v of VIEWPORTS) {
    test(`reminders queue at ${v.name}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto('/reminders');
      await expect(page).toHaveScreenshot(`reminders-${v.name}.png`, { maxDiffPixelRatio: 0.002 });
    });

    test(`scorecard at ${v.name}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto('/scorecard');
      await expect(page).toHaveScreenshot(`scorecard-${v.name}.png`, { maxDiffPixelRatio: 0.002 });
    });
  }
});
```

- [ ] **Step 2: Run to create baseline**

Run: `npm run test:e2e:update visual`
Expected: PASS — generates screenshots in `e2e/visual.spec.ts-snapshots/`.

- [ ] **Step 3: Verify baselines look correct**

Engineer mở từng PNG check không bị blank/error state.

- [ ] **Step 4: Commit baselines**

- [ ] **Step 5: Commit**

```bash
git add e2e/visual.spec.ts e2e/visual.spec.ts-snapshots/
git commit -m "test(visual): baseline screenshots for /reminders + /scorecard 4 viewports"
```

---

## Task 4.6: Accessibility audit

**Files:**
- Create: `back-order-dashboard/e2e/a11y.spec.ts`

- [ ] **Step 1: Write a11y test**

Tạo `e2e/a11y.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const ROUTES = ['/', '/dashboard', '/action-board', '/detail', '/reminders', '/scorecard', '/handoff'];

for (const route of ROUTES) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/Tên bạn/i).fill('Test');
    await page.getByRole('button', { name: /Lưu/i }).click();
    const fcp = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Tải CSV/i }).click();
    const fc = await fcp;
    await fc.setFiles(path.resolve(__dirname, '../data/sample.csv'));
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
```

- [ ] **Step 2: Run**

Run: `npm run test:e2e a11y`
Expected: PASS hoặc list of issues.

- [ ] **Step 3: Fix issues**

Phổ biến: thiếu `aria-label`, contrast, missing label cho form input. Sửa từng component.

- [ ] **Step 4: Re-run**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/a11y.spec.ts
git commit -m "test(a11y): 7-route axe audit, no critical/serious violations"
```

---

## Task 4.7: P4 acceptance + final coverage

- [ ] **Step 1: Run all tests**

Run: `npm test && npm run test:e2e`
Expected: ALL PASS.

- [ ] **Step 2: Check coverage**

Run: `npm run test:coverage`
Expected: ≥80% lines/branches/functions/statements.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: SUCCESS — no TS errors, no Next.js errors.

- [ ] **Step 5: Tag P4 + final**

```bash
git tag p4-handoff-done
git tag backorder-mgmt-v1
git commit --allow-empty -m "milestone(backorder): all 4 phases complete, ready for review"
```

---

# Self-Review Checklist (engineer chạy trước khi PR)

- [ ] Mọi route mới (`/reminders`, `/scorecard`, `/handoff`) đều render không lỗi.
- [ ] Upload `data/sample.csv` → /reminders hiển thị đúng thứ tự VOR > Bảo hành > Khẩn > Dự trữ.
- [ ] Log 1 reminder → /scorecard hiển thị đúng supplier với pct.
- [ ] Export → file CSV và JSON có thể mở lại.
- [ ] Import → preview merge report chính xác.
- [ ] Banner export hiện khi có reminder chưa save.
- [ ] beforeunload prompt hoạt động khi đóng tab có unsaved.
- [ ] Coverage ≥ 80%.
- [ ] Lint sạch.
- [ ] Build pass.
- [ ] Visual regression baseline đã commit.
- [ ] a11y không có critical/serious.

---

# Deferred Decisions (cần user trước khi đi prod)

1. **OQ1 — Supplier source**: Task P3.0 đã hỏi user lúc bắt đầu P3. Nếu user chọn (b) parse từ EstimatedDescription hoặc (c) bổ sung cột mới — engineer cập nhật `lib/supplier.ts` (1 chỗ).
2. **OQ2 — Reliability formula**: Sau khi có data thật 1-2 tuần, user xem score có hợp lý không. Tinh chỉnh weights trong `lib/scorecard.ts:reliabilityScore()`.
3. **OQ3 — Templates wording**: User review trong UI lần đầu chạy `/reminders` — sửa `lib/templates.ts` nếu cần đổi giọng văn.
4. **Manual flag "🔥 ưu tiên"**: Spec đã defer giai đoạn 2.
5. **Auto-export schedule**: Hiện chỉ có cảnh báo. Nếu user muốn auto-download mỗi ngày — phase tiếp.
