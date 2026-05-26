# Kế Hoạch Cải Thiện Codebase V16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Tách file lớn, dọn dead code, thêm test cho business logic cốt lõi, cải thiện kiến trúc tổng thể.

**Kiến trúc:** Tách `utils/supabase.ts` (2006 dòng) thành modules theo domain. Tách pages lớn thành sub-components. Thêm unit test cho các engine tính toán. Dọn backup/scratch files.

**Tech Stack:** React 19, TypeScript, Vitest, Supabase, Vite

---

## Giai đoạn 1: Dọn Dẹp Dead Code & Backup Files

### Task 1: Xóa backup files và scripts không cần thiết

**Files:**
- Xóa: `pages/BackorderAnalytics.backup.tsx`
- Xóa: `utils/searchLogic.backup_v1.ts`
- Xóa: `_fix_all.js`
- Xóa: `check_schema.js`
- Xóa: `init_db.js`
- Xóa: `log_profiles.js`
- Xóa: `test_parser.js`
- Xóa: `test_parser.ts`
- Di chuyển: `scratch/` → xóa hoặc thêm vào `.gitignore`

- [ ] **Bước 1: Kiểm tra không có import nào tham chiếu các file này**

```bash
grep -r "backup\|_fix_all\|check_schema\|init_db\|log_profiles\|test_parser" --include="*.ts" --include="*.tsx" --include="*.js" pages/ components/ hooks/ utils/ App.tsx
```

Kỳ vọng: Không có kết quả (các file này standalone).

- [ ] **Bước 2: Xóa các file**

```bash
git rm pages/BackorderAnalytics.backup.tsx
git rm utils/searchLogic.backup_v1.ts
git rm _fix_all.js check_schema.js init_db.js log_profiles.js test_parser.js test_parser.ts
git rm -r scratch/
```

- [ ] **Bước 3: Build kiểm tra**

```bash
npm run build
```

Kỳ vọng: Build thành công, không lỗi.

- [ ] **Bước 4: Commit**

```bash
git add -A
git commit -m "chore: xóa backup files, scratch, và scripts debug không dùng"
```

---

## Giai đoạn 2: Tách `utils/supabase.ts` (2006 dòng → 7 modules)

### Task 2: Tạo cấu trúc thư mục và module `supabase/client.ts`

**Files:**
- Tạo: `utils/supabase/client.ts`
- Tạo: `utils/supabase/helpers.ts`
- Tạo: `utils/supabase/index.ts` (barrel export)

- [ ] **Bước 1: Tạo `utils/supabase/client.ts`** — Supabase client singleton + helpers cơ bản

```typescript
// utils/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or Vercel environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

- [ ] **Bước 2: Tạo `utils/supabase/helpers.ts`** — Hàm tiện ích dùng chung

```typescript
// utils/supabase/helpers.ts
export async function selectAllPaginated<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  // Copy nguyên từ supabase.ts dòng 17-30
}

export const normalizeBrand = (brandText?: string | null): string | null => {
  // Copy nguyên từ supabase.ts dòng 94-106
};
```

- [ ] **Bước 3: Tạo barrel `utils/supabase/index.ts`**

```typescript
// utils/supabase/index.ts
export { supabase } from './client';
export { selectAllPaginated, normalizeBrand } from './helpers';
```

- [ ] **Bước 4: Build kiểm tra** — chưa thay đổi imports, chỉ tạo file mới

```bash
npx tsc --noEmit
```

- [ ] **Bước 5: Commit**

```bash
git add utils/supabase/
git commit -m "refactor: tạo cấu trúc utils/supabase/ với client và helpers"
```

### Task 3: Tách module `supabase/approval.ts`

**Files:**
- Tạo: `utils/supabase/approval.ts`
- Sửa: `utils/supabase/index.ts`

- [ ] **Bước 1: Tạo `utils/supabase/approval.ts`**

Di chuyển tất cả functions liên quan approval từ `utils/supabase.ts`:
- `computeSnapshotSummary` (dòng 38-58)
- `verifyAdminPin` (dòng 80-90)
- `submitApprovalRequest` (dòng 951-1044)
- `submitApprovalRequestPrecompressed` (dòng 1046-1138)
- `fetchMyRequests` (dòng 1140-1158)
- `fetchPendingForApprover` (dòng 1161-1190)
- `fetchAllRequests` (dòng 1192-1211)
- `fetchRequestById` (dòng 1213-1257)
- `fetchRequestByDraftName` (dòng 1259-1285)
- `fetchRequestActions` (dòng 1287-1303)
- `processApprovalAction` (dòng 1305-1505)
- `resubmitApprovalRequest` (dòng 1507-1535)
- `resubmitApprovalRequestPrecompressed` (dòng 1537-1601)
- `unlockRequest` (dòng 1603-1623)
- `sendApprovalEmail` + type `EmailEvent` (dòng 1625-1649)
- `updateRequestStatus` (dòng 890-919)
- `deleteApprovalRequests` (dòng 921-926)
- Interface `SubmitRequestPayload` (dòng 943-949)

Import `supabase` từ `./client` và `selectAllPaginated` từ `./helpers`.

- [ ] **Bước 2: Cập nhật barrel export `utils/supabase/index.ts`**

```typescript
export { supabase } from './client';
export { selectAllPaginated, normalizeBrand } from './helpers';
export * from './approval';
```

- [ ] **Bước 3: Commit**

```bash
git add utils/supabase/
git commit -m "refactor: tách approval functions từ supabase.ts → supabase/approval.ts"
```

### Task 4: Tách module `supabase/workflows.ts`

**Files:**
- Tạo: `utils/supabase/workflows.ts`
- Sửa: `utils/supabase/index.ts`

- [ ] **Bước 1: Tạo `utils/supabase/workflows.ts`**

Di chuyển:
- `listWorkflows` (dòng 841)
- `fetchWorkflowById` (dòng 847)
- `fetchWorkflowMembership` (dòng 857)
- `fetchWorkflowsByIds` (dòng 874)
- `fetchActionsByRequestIds` (dòng 882)
- `createWorkflow` (dòng 928)
- `updateWorkflow` (dòng 934)

- [ ] **Bước 2: Cập nhật barrel, commit**

```bash
git add utils/supabase/
git commit -m "refactor: tách workflow functions → supabase/workflows.ts"
```

### Task 5: Tách module `supabase/profiles.ts`

**Files:**
- Tạo: `utils/supabase/profiles.ts`

- [ ] **Bước 1: Tạo `utils/supabase/profiles.ts`**

Di chuyển:
- `fetchUserProfile` (dòng 744)
- `listProfiles` (dòng 750)
- Interface `ProfileDirectoryEntry` (dòng 764)
- `fetchProfileDirectory` (dòng 773)
- `displayNameFromEntry` (dòng 801)
- `updateProfileRole` (dòng 811)
- `toggleUserActive` (dòng 816)
- `createUserByAdmin` (dòng 821)
- `adminResetPassword` (dòng 829)

- [ ] **Bước 2: Cập nhật barrel, commit**

```bash
git commit -m "refactor: tách profile functions → supabase/profiles.ts"
```

### Task 6: Tách module `supabase/snapshots.ts`

**Files:**
- Tạo: `utils/supabase/snapshots.ts`

- [ ] **Bước 1: Tạo `utils/supabase/snapshots.ts`**

Di chuyển:
- Interface `SnapshotMetadataRow` (dòng 1651)
- `compressData` (dòng 1697)
- `uploadSnapshot` (dòng 1794)
- `listSnapshots` (dòng 1891)
- `getStorageUsage` (dòng 1922)
- `loadSnapshot` (dòng 1937)
- `deleteSnapshot` (dòng 1954)

- [ ] **Bước 2: Cập nhật barrel, commit**

```bash
git commit -m "refactor: tách snapshot functions → supabase/snapshots.ts"
```

### Task 7: Tách module `supabase/monthly-data.ts` và `supabase/storage.ts`

**Files:**
- Tạo: `utils/supabase/monthly-data.ts`
- Tạo: `utils/supabase/storage.ts`

- [ ] **Bước 1: Tạo `utils/supabase/monthly-data.ts`**

Di chuyển:
- `saveMonthlyData` (dòng 443)
- `loadLatestMonthlyData` (dòng 526)
- `listMonthlyVersions` (dòng 610)
- `loadSpecificMonthlyData` (dòng 632)
- `deleteMonthlyData` (dòng 706)
- `listMonthlyDataSnapshots` (dòng 1991)

- [ ] **Bước 2: Tạo `utils/supabase/storage.ts`**

Di chuyển:
- `saveToCloudStorage` (dòng 108)
- `saveOrderDraft` (dòng 123)
- `loadFromCloudStorage` (dòng 138)
- `listOrderDrafts` (dòng 162)

- [ ] **Bước 3: Tạo `utils/supabase/supersession.ts`**

Di chuyển:
- Interface `SupersessionUpload` (dòng 181)
- `listSupersessionUploads` (dòng 191)
- `uploadSupersessionFile` (dòng 200)
- `deleteSupersessionUpload` (dòng 273)
- `migrateLocalMappingsToDB` (dòng 282)
- `loadAllSupersessionMappings` (dòng 338)
- `dbMappingsToApp` (dòng 344)
- `fetchPartAffinityPairs` (dòng 354)
- `upsertPartAffinityPair` (dòng 370)
- `bulkUpsertPartAffinity` (dòng 392)
- `deletePartAffinityPair` (dòng 428)

- [ ] **Bước 4: Cập nhật barrel export đầy đủ**

```typescript
// utils/supabase/index.ts
export { supabase } from './client';
export { selectAllPaginated, normalizeBrand } from './helpers';
export * from './approval';
export * from './workflows';
export * from './profiles';
export * from './snapshots';
export * from './monthly-data';
export * from './storage';
export * from './supersession';
```

- [ ] **Bước 5: Commit**

```bash
git commit -m "refactor: tách monthly-data, storage, supersession → modules riêng"
```

### Task 8: Chuyển imports và xóa file gốc

**Files:**
- Xóa: `utils/supabase.ts` (file gốc)
- Sửa: Tất cả file import từ `utils/supabase`

- [ ] **Bước 1: Kiểm tra tất cả file import từ `utils/supabase`**

```bash
grep -r "from.*['\"].*utils/supabase['\"]" --include="*.ts" --include="*.tsx" -l
```

- [ ] **Bước 2: Cập nhật imports**

Không cần thay đổi import paths vì barrel `utils/supabase/index.ts` có cùng đường dẫn `utils/supabase`. Chỉ cần xóa file gốc:

```bash
git rm utils/supabase.ts
```

- [ ] **Bước 3: Build và verify**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Bước 4: Commit**

```bash
git commit -m "refactor: hoàn tất tách supabase.ts → 7 modules (2006 dòng → ~300 dòng/module)"
```

---

## Giai đoạn 3: Thêm Unit Tests cho Business Logic

### Task 9: Setup Vitest

**Files:**
- Tạo: `vitest.config.ts`
- Sửa: `package.json`

- [ ] **Bước 1: Cài đặt Vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Bước 2: Tạo `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['utils/**', 'hooks/**'],
    },
  },
});
```

- [ ] **Bước 3: Thêm script vào `package.json`**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Bước 4: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: setup Vitest cho unit testing"
```

### Task 10: Test `utils/inventoryEngine.ts` — core calculations

**Files:**
- Tạo: `utils/__tests__/inventoryEngine.test.ts`

- [ ] **Bước 1: Viết test cho `computeInventory`**

```typescript
import { describe, test, expect } from 'vitest';
import { computeInventory } from '../inventoryEngine';

describe('computeInventory', () => {
  test('tính MOS chính xác khi có sales history', () => {
    const item = {
      itemCode: 'TEST-001',
      currentStock: 100,
      salesHistory: [10, 12, 8, 15, 10, 11], // avg = 11
    };
    const result = computeInventory(item);
    expect(result.mos).toBeCloseTo(100 / 11, 1);
  });

  test('MOS = Infinity khi không có sales', () => {
    const item = {
      itemCode: 'TEST-002',
      currentStock: 50,
      salesHistory: [0, 0, 0, 0, 0, 0],
    };
    const result = computeInventory(item);
    expect(result.mos).toBe(Infinity);
  });

  test('phân loại LOIS đúng — L khi MOS < 1', () => {
    const item = {
      itemCode: 'TEST-003',
      currentStock: 5,
      salesHistory: [10, 12, 8, 15, 10, 11],
    };
    const result = computeInventory(item);
    expect(result.loisGroup).toBe('L');
  });

  test('phân loại LOIS đúng — S khi MOS > 12', () => {
    const item = {
      itemCode: 'TEST-004',
      currentStock: 500,
      salesHistory: [2, 3, 1, 2, 3, 1],
    };
    const result = computeInventory(item);
    expect(result.loisGroup).toBe('S');
  });
});
```

- [ ] **Bước 2: Chạy test — kỳ vọng PASS (nếu logic đúng) hoặc FAIL (phát hiện bug)**

```bash
npx vitest run utils/__tests__/inventoryEngine.test.ts
```

- [ ] **Bước 3: Commit**

```bash
git add utils/__tests__/
git commit -m "test: thêm unit tests cho inventoryEngine — MOS, LOIS"
```

### Task 11: Test `utils/searchLogic.ts`

**Files:**
- Tạo: `utils/__tests__/searchLogic.test.ts`

- [ ] **Bước 1: Viết test**

```typescript
import { describe, test, expect } from 'vitest';
import { searchItems } from '../searchLogic';

describe('searchItems', () => {
  const items = [
    { itemCode: 'KIA-001', description: 'Brake pad front' },
    { itemCode: 'MAZ-002', description: 'Oil filter' },
    { itemCode: 'BMW-003', description: 'Brake disc rear' },
  ];

  test('tìm theo itemCode', () => {
    const result = searchItems(items, 'KIA');
    expect(result).toHaveLength(1);
    expect(result[0].itemCode).toBe('KIA-001');
  });

  test('tìm theo description — case insensitive', () => {
    const result = searchItems(items, 'brake');
    expect(result).toHaveLength(2);
  });

  test('trả array rỗng khi không match', () => {
    const result = searchItems(items, 'xyz123');
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Bước 2: Chạy test, commit**

```bash
npx vitest run utils/__tests__/searchLogic.test.ts
git commit -m "test: thêm unit tests cho searchLogic"
```

### Task 12: Test `utils/approval-validation.ts` và `utils/approval-rules.ts`

**Files:**
- Tạo: `utils/__tests__/approval-validation.test.ts`
- Tạo: `utils/__tests__/approval-rules.test.ts`

- [ ] **Bước 1: Viết test cho approval-validation**

Test các scenario:
- User có quyền approve ở level đúng
- User không có quyền approve
- Request đã bị lock
- Concurrent approval conflict

- [ ] **Bước 2: Viết test cho approval-rules**

Test các scenario:
- Rule matching theo brand
- Rule matching theo total value threshold
- Số approval levels cần thiết

- [ ] **Bước 3: Chạy test, commit**

```bash
npx vitest run utils/__tests__/approval-*.test.ts
git commit -m "test: thêm unit tests cho approval validation và rules"
```

### Task 13: Test `utils/transferEngine.ts`

**Files:**
- Tạo: `utils/__tests__/transferEngine.test.ts`

- [ ] **Bước 1: Viết test cho transfer calculation**

Test:
- Tính toán chuyển hàng giữa 2 kho
- Ưu tiên theo cost optimization
- Xử lý khi không đủ hàng

- [ ] **Bước 2: Chạy test, commit**

```bash
npx vitest run utils/__tests__/transferEngine.test.ts
git commit -m "test: thêm unit tests cho transferEngine"
```

---

## Giai đoạn 4: Tách Types

### Task 14: Tách `types/inventory.ts` (567 dòng) thành domain types

**Files:**
- Tạo: `types/common.ts` — shared types (Brand, LoisGroup, etc.)
- Tạo: `types/ordering.ts` — ordering-specific types
- Tạo: `types/snapshot.ts` — snapshot/storage types
- Sửa: `types/inventory.ts` — giữ lại InventoryItem + re-export
- Sửa: `types/approval.ts` — import từ common thay vì inventory

- [ ] **Bước 1: Đọc `types/inventory.ts`, phân loại types theo domain**

- [ ] **Bước 2: Tạo các file type mới, di chuyển types**

- [ ] **Bước 3: Cập nhật `types/inventory.ts` thành barrel re-export**

```typescript
// types/inventory.ts — backward-compatible barrel
export * from './common';
export * from './ordering';
export * from './snapshot';
// Giữ InventoryItem, MonthlyData ở đây (core types)
```

- [ ] **Bước 4: Build verify, commit**

```bash
npx tsc --noEmit && npm run build
git commit -m "refactor: tách types/inventory.ts → domain-specific type files"
```

---

## Giai đoạn 5: Tách Pages Lớn (tùy chọn — ưu tiên thấp hơn)

### Task 15: Tách `pages/Settings.tsx` (2270 dòng)

**Files:**
- Tạo: `pages/settings/GeneralSettings.tsx`
- Tạo: `pages/settings/UserManagement.tsx`
- Tạo: `pages/settings/WorkflowSettings.tsx`
- Tạo: `pages/settings/DataManagement.tsx`
- Sửa: `pages/Settings.tsx` → orchestrator nhỏ

- [ ] **Bước 1: Xác định các tab/section trong Settings**
- [ ] **Bước 2: Tách từng tab thành component riêng**
- [ ] **Bước 3: Settings.tsx chỉ giữ tab navigation + lazy load**
- [ ] **Bước 4: Build verify, commit**

### Task 16: Tách `pages/Ordering.tsx` (1858 dòng)

**Files:**
- Tạo: `pages/ordering/OrderingTable.tsx`
- Tạo: `pages/ordering/OrderingToolbar.tsx`
- Tạo: `pages/ordering/OrderingSummary.tsx`
- Sửa: `pages/Ordering.tsx` → orchestrator

- [ ] **Bước 1-4:** Tương tự Task 15

### Task 17: Tách `components/OrderReviewModal.tsx` (1084 dòng)

**Files:**
- Tạo: `components/order-review/OrderReviewHeader.tsx`
- Tạo: `components/order-review/OrderReviewTable.tsx`
- Tạo: `components/order-review/OrderReviewActions.tsx`
- Sửa: `components/OrderReviewModal.tsx` → orchestrator

- [ ] **Bước 1-4:** Tương tự Task 15

---

## Thứ Tự Ưu Tiên

| # | Giai đoạn | Ảnh hưởng | Rủi ro | Thời gian |
|---|-----------|-----------|--------|-----------|
| 1 | Dọn dead code (Task 1) | Thấp | Rất thấp | 10 phút |
| 2 | Tách supabase.ts (Task 2-8) | Cao | Trung bình | 2-3 giờ |
| 3 | Setup + viết tests (Task 9-13) | Cao | Thấp | 2-3 giờ |
| 4 | Tách types (Task 14) | Trung bình | Thấp | 1 giờ |
| 5 | Tách pages (Task 15-17) | Trung bình | Trung bình | 3-4 giờ |

**Tổng ước tính:** 8-11 giờ cho toàn bộ. Giai đoạn 1-3 nên làm trước.
