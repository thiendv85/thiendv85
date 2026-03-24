# Hướng dẫn Hệ thống Phê duyệt Đặt hàng (v2.0)

> Cập nhật: 24/03/2026 — 8 Phase cải tiến quy trình phê duyệt

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Phase 1: Phân quyền & RBAC](#2-phase-1-phân-quyền--rbac)
3. [Phase 2: Kiểm soát chuyển trạng thái](#3-phase-2-kiểm-soát-chuyển-trạng-thái)
4. [Phase 3: Lý do Từ chối & Trả lại](#4-phase-3-lý-do-từ-chối--trả-lại)
5. [Phase 4: Phê duyệt tuần tự theo cấp](#5-phase-4-phê-duyệt-tuần-tự-theo-cấp)
6. [Phase 5: Optimistic Locking](#6-phase-5-optimistic-locking)
7. [Phase 6: Audit Log nâng cao](#7-phase-6-audit-log-nâng-cao)
8. [Phase 7: Quy tắc kiểm tra trước phê duyệt](#8-phase-7-quy-tắc-kiểm-tra-trước-phê-duyệt)
9. [Phase 8: Escalation & Deadline](#9-phase-8-escalation--deadline)
10. [Cấu trúc file](#10-cấu-trúc-file)
11. [Hướng dẫn quản trị](#11-hướng-dẫn-quản-trị)

---

## 1. Tổng quan kiến trúc

### Sơ đồ trạng thái đơn hàng

```
                    ┌──────────┐
        ┌──────────►│ returned  │◄─────────────┐
        │           └─────┬────┘               │
        │                 │ resubmit           │
        │                 ▼                    │
  ┌─────┴────┐     ┌──────────┐        ┌──────┴─────┐
  │ unlocked │◄────┤ pending  ├───────►│ in_progress│
  └──────────┘     └────┬─────┘        └──────┬─────┘
        ▲               │                     │
        │               │                     │
        │               ▼                     ▼
  ┌─────┴────┐     ┌──────────┐        ┌──────────┐
  │ approved │     │ rejected │        │ approved │
  └──────────┘     └──────────┘        └──────────┘
                   (trạng thái cuối)
```

### Vai trò người dùng

| Vai trò | Mô tả | Quyền |
|---------|--------|-------|
| `admin` | Quản trị viên | Tất cả quyền, duyệt mọi cấp |
| `planner` | Người lập kế hoạch | Tạo & gửi đơn đặt hàng |
| `approver` | Người phê duyệt | Duyệt theo cấp được gán |
| `viewer` | Người xem | Chỉ xem, không thao tác |

### Công nghệ

- **Frontend:** React 19 + TypeScript 5.8 + Vite 6.2 + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Hosting:** Vercel (production: dvptdl.com)

---

## 2. Phase 1: Phân quyền & RBAC

### Mô tả
Hệ thống phân quyền dựa trên **vai trò** (`role`) kết hợp **cấp phê duyệt** (`approval_levels`). Mỗi user được gán một mảng cấp mà họ được phép duyệt.

### Cấu trúc dữ liệu

```sql
-- Bảng profiles (đã mở rộng)
profiles.approval_levels  INT[]   -- Ví dụ: [1], [1,2], [1,2,3]
profiles.department       TEXT    -- Ví dụ: 'sales', 'procurement'
```

**Mặc định khi seed:**
- `admin` → `approval_levels = [1, 2, 3]` (duyệt được tất cả cấp)
- `approver` → `approval_levels = [1]` (chỉ duyệt cấp 1)

### Cách sử dụng trong code

```tsx
import { useApprovalAuth } from '../hooks/useApprovalAuth';

function MyComponent() {
    const {
        hasApprovalRole,    // true nếu là admin hoặc approver
        allowedLevels,      // [1, 2] — cấp được duyệt
        canApproveLevel,    // (level) => boolean
        canSubmit,          // true nếu là planner hoặc admin
        canUnlock,          // true nếu là admin
        canViewAll,         // true nếu là admin
        department,         // 'sales' | null
    } = useApprovalAuth();

    if (canApproveLevel(2)) {
        // Hiện nút Phê duyệt cho cấp 2
    }
}
```

### AuthGuard Component

Bọc bất kỳ component nào cần bảo vệ:

```tsx
import { AuthGuard } from '../components/AuthGuard';

<AuthGuard requiredRoles={['admin', 'approver']} requiredLevel={2}>
    <SensitiveApprovalContent />
</AuthGuard>
```

Nếu user không đủ quyền → hiện thông báo "Access Denied" thay vì nội dung.

### Quản trị: Gán cấp phê duyệt

```sql
-- Gán user có thể duyệt cấp 1 và 2
UPDATE profiles
SET approval_levels = ARRAY[1, 2]
WHERE id = 'user-uuid-here';

-- Gán phòng ban
UPDATE profiles
SET department = 'procurement'
WHERE id = 'user-uuid-here';
```

---

## 3. Phase 2: Kiểm soát chuyển trạng thái

### Mô tả
Mọi thay đổi trạng thái đều được kiểm tra **cả ở client lẫn database**. Không thể hack để chuyển trạng thái bất hợp lệ.

### Bảng chuyển trạng thái hợp lệ

| Trạng thái hiện tại | Có thể chuyển sang |
|---------------------|-------------------|
| `pending` | `in_progress`, `rejected`, `returned` |
| `in_progress` | `in_progress`, `approved`, `rejected`, `returned` |
| `approved` | `unlocked` (trong 24h) |
| `rejected` | ❌ Không thể chuyển (trạng thái cuối) |
| `unlocked` | `pending` (gửi lại) |
| `returned` | `pending` (sửa & gửi lại) |

### Quy tắc đặc biệt

1. **`rejected` là trạng thái cuối** — đơn bị từ chối không thể mở lại, phải tạo đơn mới
2. **Mở khóa chỉ trong 24h** — sau khi duyệt, chỉ admin được mở khóa trong 24 giờ đầu
3. **Kiểm tra cấp phê duyệt** — chỉ user có cấp tương ứng mới được duyệt

### DB Trigger (lớp bảo vệ cuối)

```sql
-- Trigger tự động kiểm tra MỌI update trên approval_requests
CREATE TRIGGER trg_check_status_transition
BEFORE UPDATE ON approval_requests
FOR EACH ROW EXECUTE FUNCTION check_status_transition();
```

Nếu ai đó gửi request trực tiếp qua API để chuyển `rejected → approved` → **DB sẽ block** với lỗi `Invalid status transition`.

### Sử dụng trong code

```tsx
import { validateStateTransition, getAvailableActions } from '../utils/approval-validation';

// Kiểm tra chuyển trạng thái
const result = validateStateTransition('pending', 'approved', {
    userRole: 'approver',
    approvalLevels: [1],
    requestLevel: 2,
});
// result.valid = false
// result.error = "Chỉ có người duyệt cấp 2 mới được phê duyệt"

// Lấy danh sách actions user được thực hiện
const actions = getAvailableActions('pending', 'approver', [1], 1);
// ['commented', 'approved', 'returned', 'rejected']
```

---

## 4. Phase 3: Lý do Từ chối & Trả lại

### Mô tả
Khi **từ chối** hoặc **trả lại** đơn, người duyệt **bắt buộc** phải nhập lý do chi tiết (tối thiểu 10 ký tự).

### Cấu trúc dữ liệu

```sql
approval_requests.rejection_reason   TEXT  -- Lý do từ chối
approval_requests.returned_reason    TEXT  -- Lý do trả lại
```

### Quy tắc nhập lý do

| Hành động | Bắt buộc? | Ký tự tối thiểu | Ký tự tối đa |
|-----------|-----------|-----------------|--------------|
| Phê duyệt (`approved`) | ❌ Không | — | 500 |
| Từ chối (`rejected`) | ✅ Bắt buộc | 10 | 500 |
| Trả lại (`returned`) | ✅ Bắt buộc | 10 | 500 |
| Bình luận (`commented`) | ❌ Không | — | 500 |

### Validation trong code

```tsx
import { validateReason } from '../utils/approval-validation';

const result = validateReason('rejected', 'quá giá');
// result.valid = false
// result.error = "Lý do phải có ít nhất 10 ký tự (hiện 6)"

const result2 = validateReason('rejected', 'Vượt quá ngân sách tháng, cần duyệt từ CFO');
// result2.valid = true
```

### UI hành vi
- Khi chọn **Từ chối/Trả lại** → textarea lý do hiện ra (riêng biệt với comment chung)
- Nút thao tác bị disable cho đến khi nhập đủ 10 ký tự
- Lý do được lưu trong cột riêng (`rejection_reason` / `returned_reason`), hiển thị trong tab lịch sử

---

## 5. Phase 4: Phê duyệt tuần tự theo cấp

### Mô tả
Đơn hàng phải được duyệt **tuần tự** qua từng cấp: Level 1 → Level 2 → Level 3. Không thể nhảy cấp.

### DB Trigger

```sql
-- Ngăn nhảy cấp: level 1 → level 3 bị block
CREATE TRIGGER trg_sequential_level
BEFORE UPDATE ON approval_requests
WHEN (OLD.current_level IS DISTINCT FROM NEW.current_level)
EXECUTE FUNCTION enforce_sequential_level();
```

**Ví dụ:**
- Level 1 → Level 2 ✅ Hợp lệ
- Level 1 → Level 3 ❌ Lỗi: "Cannot skip approval levels: 1 → 3"

### Luồng phê duyệt nhiều cấp

```
1. Planner tạo đơn → status: pending, level: 1
2. Approver Level 1 duyệt → status: in_progress, level: 2
3. Approver Level 2 duyệt → status: in_progress, level: 3
4. Approver Level 3 duyệt → status: approved (hoàn tất)
```

### Ai duyệt được gì?

- **Admin:** Duyệt được tất cả cấp (không cần gán `approval_levels`)
- **Approver với `approval_levels = [1]`:** Chỉ duyệt cấp 1
- **Approver với `approval_levels = [1, 2]`:** Duyệt được cấp 1 và 2

---

## 6. Phase 5: Optimistic Locking

### Mô tả
Ngăn xung đột khi **2 người cùng thao tác** trên 1 đơn. Mỗi đơn có `version` tăng dần sau mỗi thay đổi.

### Cơ chế hoạt động

```
1. User A mở đơn (version = 3)
2. User B mở đơn (version = 3)
3. User A duyệt → version 3 → 4 ✅ thành công
4. User B duyệt → version 3 → nhưng DB đã là 4 ❌ CONFLICT
```

### Cấu trúc dữ liệu

```sql
approval_requests.version  INT DEFAULT 1  -- Tăng +1 mỗi lần update
```

### Xử lý xung đột

Khi phát hiện conflict:
- Hiện thông báo: **"Đơn đã bị thay đổi bởi người khác, vui lòng refresh"**
- User cần reload lại trang để lấy dữ liệu mới nhất
- Không có dữ liệu nào bị mất

### Trong code

```tsx
// Mọi hàm update đều truyền expectedVersion
await processApprovalAction(
    requestId,
    actorId,
    'approved',
    comment,
    modifiedQuantities,
    reason,
    request.version  // ← optimistic locking
);
```

Các hàm bị ảnh hưởng: `processApprovalAction()`, `resubmitApprovalRequest()`, `unlockRequest()`

---

## 7. Phase 6: Audit Log nâng cao

### Mô tả
Mọi hành động trên đơn hàng đều được ghi log chi tiết trong `approval_actions`, kèm theo metadata JSON.

### Cấu trúc metadata

```sql
approval_actions.metadata  JSONB DEFAULT '{}'
```

```json
{
    "old_status": "pending",
    "new_status": "in_progress",
    "old_level": 1,
    "new_level": 2,
    "changed_fields": ["status", "current_level"],
    "version_before": 1,
    "version_after": 2,
    "reason": "Nội dung lý do nếu có"
}
```

### Hiển thị trong UI
Tab **Lịch sử** trong OrderReviewModal hiện:
- Ai thao tác
- Thời gian
- Trạng thái cũ → mới
- Cấp duyệt thay đổi
- Lý do từ chối/trả lại (nếu có)

---

## 8. Phase 7: Quy tắc kiểm tra trước phê duyệt

### Mô tả
Khi approver mở đơn, hệ thống **tự động kiểm tra** các quy tắc nghiệp vụ và hiện cảnh báo (không block, chỉ cảnh báo).

### 5 quy tắc kiểm tra

| # | Mã | Điều kiện | Mức độ |
|---|-----|-----------|--------|
| 1 | `BUDGET_HIGH` | Tổng giá trị đơn > **500 triệu VND** | ⚠️ Warning |
| 2 | `EXCESS_MOS` | Mã hàng có MOS > **6 tháng** nhưng vẫn đặt | ⚠️ Warning |
| 3 | `CRITICAL_STOCK` | Mã hàng tồn kho cực thấp (MOS < **0.5 tháng**) | ℹ️ Info |
| 4 | `OOS_NOT_ORDERED` | Mã hàng hết hàng (OOS) nhưng không đặt | ℹ️ Info |
| 5 | `LARGE_ITEM_ORDER` | Đơn lẻ 1 mã hàng > **100 triệu VND** | ⚠️ Warning |

### Mức độ cảnh báo

- **error** (đỏ): Chặn phê duyệt, bắt buộc sửa
- **warning** (vàng): Cảnh báo, người duyệt tự quyết định
- **info** (xanh): Thông tin tham khảo

> Hiện tại chưa có rule nào mức `error` — tất cả chỉ là warning/info, người duyệt có thể bỏ qua.

### Sử dụng

```tsx
import { validatePreApproval } from '../utils/approval-rules';

const result = validatePreApproval(request);
// result.passed = true (không có lỗi blocking)
// result.warnings = [
//   { code: 'BUDGET_HIGH', message: 'Tổng giá trị: 650.0M VND (vượt ngưỡng 500M)', severity: 'warning' },
//   { code: 'EXCESS_MOS', message: 'SKU001: MOS = 8.5 tháng, tồn kho đang cao', severity: 'warning' }
// ]
```

### Tùy chỉnh ngưỡng

Sửa file `utils/approval-rules.ts`:

```ts
const BUDGET_THRESHOLD = 500_000_000;  // 500M VND → đổi thành giá trị mong muốn
const HIGH_MOS_THRESHOLD = 6;          // 6 tháng
const LOW_MOS_THRESHOLD = 0.5;         // 0.5 tháng
```

---

## 9. Phase 8: Escalation & Deadline

### Mô tả
Mỗi đơn có **deadline 3 ngày làm việc**. Quá hạn → tự động escalate lên cấp trên.

### Cấu trúc dữ liệu

```sql
approval_requests.deadline       TIMESTAMPTZ  -- Hạn chót phê duyệt
approval_requests.escalated_at   TIMESTAMPTZ  -- Thời điểm escalate
approval_requests.escalated_to   TEXT         -- ID người được escalate (comma-separated)
```

### Tính deadline

Khi tạo đơn, hệ thống tự động tính deadline = **ngày gửi + 3 ngày làm việc** (bỏ thứ 7, CN):

```
Gửi thứ 2 → Deadline thứ 5
Gửi thứ 4 → Deadline thứ 2 tuần sau
Gửi thứ 6 → Deadline thứ 4 tuần sau
```

### Cron Job Escalation

**Edge Function:** `supabase/functions/check-escalation/index.ts`

Chạy **hàng ngày** qua Supabase Cron, thực hiện:

1. Tìm đơn quá hạn: `deadline < now()` + `status IN (pending, in_progress)` + `escalated_at IS NULL`
2. Lấy workflow để tìm approver cấp tiếp theo
3. Đánh dấu `escalated_at` = thời gian hiện tại
4. Gửi email thông báo escalation

### UI hiển thị

Trên trang **Phê duyệt Đặt hàng** (ApprovalQueue):
- 🔴 **Badge "Quá hạn"** — nếu deadline < now
- ⏰ **Thời gian còn lại** — countdown đến deadline
- 📧 **Đã escalate** — nếu đơn đã bị escalate

---

## 10. Cấu trúc file

### Files mới tạo

```
hooks/
  └── useApprovalAuth.ts          # Hook phân quyền approval

components/
  └── AuthGuard.tsx                # Component bảo vệ quyền truy cập

types/
  └── approval.ts                  # Types, constants, transition map

utils/
  ├── approval-validation.ts       # Validation: state, reason, actions
  └── approval-rules.ts            # Pre-approval business rules

supabase/
  ├── functions/
  │   └── check-escalation/
  │       └── index.ts             # Edge Function: cron escalation
  └── migrations/
      ├── 001_add_approval_profile_fields.sql
      ├── 002_status_transition_validation.sql
      ├── 003_add_reason_columns.sql
      ├── 004_enforce_sequential_levels.sql
      ├── 005_add_version_column.sql
      ├── 006_enhance_audit_logging.sql
      └── 007_add_deadline_escalation.sql
```

### Files đã sửa

```
utils/authContext.tsx              # Thêm approval_levels, department vào UserProfile
utils/supabase.ts                 # Rewrite processApprovalAction, thêm locking + audit
types/inventory.ts                # Thêm fields mới vào ApprovalRequest, ApprovalAction
pages/ApprovalQueue.tsx           # RBAC filtering, level badges
components/OrderReviewModal.tsx   # Reason UI, validation, pre-approval warnings
```

---

## 11. Hướng dẫn quản trị

### Gán cấp phê duyệt cho user mới

```sql
-- Xem danh sách user hiện tại
SELECT id, full_name, role, approval_levels, department
FROM profiles
ORDER BY role, full_name;

-- Gán cấp 1 và 2 cho user
UPDATE profiles
SET approval_levels = ARRAY[1, 2],
    department = 'procurement'
WHERE id = 'uuid-cua-user';
```

### Thêm ngưỡng budget mới

Sửa `utils/approval-rules.ts`, thêm rule mới trong function `validatePreApproval()`:

```ts
// Ví dụ: cảnh báo khi số lượng air > 50% tổng đơn
const totalAir = Object.values(snap.quantities).reduce((sum, q) => sum + (q.air || 0), 0);
const totalSea = Object.values(snap.quantities).reduce((sum, q) => sum + (q.sea || 0), 0);
if (totalAir > 0 && totalAir / (totalAir + totalSea) > 0.5) {
    warnings.push({
        code: 'HIGH_AIR_RATIO',
        message: `Tỷ lệ air shipping: ${((totalAir / (totalAir + totalSea)) * 100).toFixed(0)}%`,
        severity: 'warning',
    });
}
```

### Thay đổi deadline mặc định

Sửa `utils/supabase.ts` trong hàm `submitApprovalRequest()` — tìm phần tính deadline và đổi số ngày:

```ts
// Mặc định: 3 ngày làm việc
// Đổi thành 5 ngày:
let daysToAdd = 5; // thay vì 3
```

### Deploy cron escalation

```bash
# Deploy Edge Function lên Supabase
supabase functions deploy check-escalation --project-ref jczdnlydozcftvnqnixt

# Setup cron schedule (chạy hàng ngày lúc 8h sáng VN = 1h UTC)
# Trong Supabase Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule(
    'check-escalation-daily',
    '0 1 * * *',  -- 1:00 UTC = 8:00 VN
    $$SELECT net.http_post(
        url := 'https://jczdnlydozcftvnqnixt.supabase.co/functions/v1/check-escalation',
        headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    )$$
);
```

### Rollback migration (nếu cần)

```sql
-- Ví dụ: rollback Phase 5 (optimistic locking)
ALTER TABLE approval_requests DROP COLUMN IF EXISTS version;

-- Rollback Phase 2 (state validation trigger)
DROP TRIGGER IF EXISTS trg_check_status_transition ON approval_requests;
DROP FUNCTION IF EXISTS check_status_transition();
DROP FUNCTION IF EXISTS validate_status_transition(TEXT, TEXT);
```

---

## FAQ

**Q: User bị lỗi "Đơn đã bị thay đổi, vui lòng refresh" khi duyệt?**
A: Có người khác đã thao tác trên đơn đó trước. Reload trang để lấy dữ liệu mới nhất.

**Q: Approver không thấy nút "Phê duyệt"?**
A: Kiểm tra `approval_levels` của user. Nếu đơn ở cấp 2 mà user chỉ có `approval_levels = [1]` thì không thể duyệt.

**Q: Đơn bị từ chối, muốn sửa lại?**
A: `rejected` là trạng thái cuối. Planner cần **tạo đơn mới**. Nếu muốn cho sửa, dùng **Trả lại** (`returned`) thay vì Từ chối.

**Q: Cách xem lịch sử chi tiết 1 đơn?**
A: Mở đơn trong OrderReviewModal → tab **Lịch sử**. Mỗi dòng hiện: ai, lúc nào, thay đổi gì, lý do.

**Q: Escalation email không gửi?**
A: Kiểm tra Edge Function `check-escalation` đã deploy chưa, và cron job đã setup trong pg_cron chưa. Xem logs trong Supabase Dashboard → Edge Functions → Logs.
