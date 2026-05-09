# Backorder Management Upgrade — Design Spec

- **Date:** 2026-05-10
- **Project:** V16 ATP Inventory App — sub-app `back-order-dashboard`
- **Owner:** nguyenhoangthien@gmail.com
- **Status:** Draft, awaiting user approval

## 1. Goals

Nâng cấp sub-app `back-order-dashboard` (Next.js 14 standalone, hiện CSV-only) để đạt 3 mục tiêu:

1. **Quản lý đơn nợ** — đơn đã đặt nhưng nhà cung cấp chưa giao đủ.
2. **Bám sát tiến độ hàng về** — tích lũy lịch sử ETA để biết NCC đã dời lịch bao nhiêu lần.
3. **Thúc giục NCC giao sớm** — workflow gợi ý đơn cần thúc, sinh template email/Zalo, log lịch sử nhắc + phản hồi.

### Non-goals

- Không tích hợp Supabase / backend server (đã quyết tại brainstorm).
- Không tự động gửi email/Zalo (chỉ sinh template để user copy-paste).
- Không thay đổi sub-app khác hoặc V16 main app.
- Không real-time sync giữa nhiều NV (handoff thưa 1-2 lần/tuần là đủ).

## 2. Architecture

### 2.1 Storage layer — Approach A: "Annotated CSV + Archive JSON"

State sống trong **2 file user kiểm soát** (files-as-state):

- **`backorder_active.csv`** — CSV gốc + 6 cột annotation (active state, replace mỗi lần upload).
- **`backorder_archive.json`** — append-only log mọi reminder từng tạo (audit trail vĩnh viễn).

In-memory only trong React Context khi app chạy. Refresh tab = mất state → user phải upload lại 2 file. Banner sticky cảnh báo nếu có reminder chưa export.

### 2.2 Data model

#### 2.2.1 Annotated CSV — 6 cột thêm vào CSV gốc 16 cột

| Cột | Type | Mô tả |
|---|---|---|
| `last_reminded_at` | ISO datetime | Lần nhắc gần nhất (rỗng nếu chưa nhắc) |
| `reminder_count` | int | Tổng số lần đã nhắc |
| `ncc_response_status` | enum | `pending` \| `acknowledged` \| `committed` \| `silent` \| `closed` |
| `eta_promised_new` | DD/MM/YYYY | ETA mới NCC hứa |
| `updated_by` | string | Tên NV log lần đổi gần nhất |
| `reminder_uuid_last` | UUID | Trỏ tới reminder gần nhất trong archive |

**Composite key đơn:** `DocNo + ItemCode + RowId` (RowId fallback rỗng nếu chỉ có 1 row).

#### 2.2.2 Archive JSON

```json
{
  "version": 1,
  "exported_at": "2026-05-10T08:30:00+07:00",
  "reminders": [
    {
      "uuid": "01H8...",
      "created_at": "2026-05-10T08:25:12+07:00",
      "doc_no": "PO-2026-0123",
      "item_code": "A6A-001",
      "item_name": "...",
      "supplier": "Van Kim Automative Co",
      "channel": "email | zalo | phone",
      "reminder_by": "Nguyễn Văn A",
      "template_used": "first-nudge | overdue | escalation",
      "ncc_response": "Đang đóng container, ETA 15/5",
      "eta_promised_new": "15/05/2026",
      "ncc_response_status": "committed"
    }
  ]
}
```

**Quy tắc bất biến:**
- Entry không xóa, không edit retroactive.
- Sửa = thêm entry mới với `supersedes: <uuid_cũ>`.
- Timestamp client (chấp nhận tradeoff không có server).

### 2.3 Module layout

```
src/
├── app/
│   ├── reminders/        # NEW: priority queue + template generator
│   ├── scorecard/        # NEW: NCC scorecard
│   └── handoff/          # NEW: export/import workflow
├── components/
│   ├── ReminderQueue.tsx           # NEW
│   ├── ReminderActionPanel.tsx     # NEW
│   ├── TemplateGenerator.tsx       # NEW
│   ├── ReminderLogModal.tsx        # NEW
│   ├── ReminderHistoryTable.tsx    # NEW
│   ├── SupplierScorecard.tsx       # NEW
│   └── HandoffModal.tsx            # NEW
└── lib/
    ├── reminder.ts        # NEW: CRUD reminders, UUID gen, status transitions
    ├── templates.ts       # NEW: Vietnamese email/Zalo templates (3 mức)
    ├── scorecard.ts       # NEW: aggregations từ archive
    ├── persist.ts         # NEW: export/import annotated CSV + archive.json
    ├── priority.ts        # NEW: thuật toán sắp xếp đơn cần thúc
    └── transform.ts, utils.ts (existing, mở rộng)
```

### 2.4 State management

Mở rộng `DataProvider.tsx` (React Context) đã có — không thêm Zustand/Redux.

```ts
DataProviderContext = {
  rawData, transformedData, filters, /* existing */

  annotations: Map<compositeKey, Annotation>,
  archive: ReminderEntry[],
  currentUser: string,                 // localStorage, hỏi 1 lần đầu

  logReminder(entry: NewReminderEntry): void
  importHandoff(csv, json): MergeResult
  exportSnapshot(): { csv: Blob, json: Blob }
}
```

## 3. Workflows

### 3.1 Daily nudge

```
Upload CSV (gốc hoặc annotated)
    → priority engine sắp xếp đơn
    → /reminders queue hiển thị
    → user click 1 đơn → ReminderActionPanel
    → chọn template (first-nudge / overdue / escalation)
    → copy email hoặc Zalo
    → user gửi tay (ngoài app)
    → quay lại click [Đã gửi, ghi log]
    → ReminderLogModal: kênh, NCC trả lời, ETA mới, status
    → logReminder() append archive + update annotation
    → đơn tụt xuống queue, priority recalculate
```

### 3.2 Priority algorithm (`priority.ts`)

**Trục chính (strict order theo `OPropertyName`):**

1. Khẩn VOR
2. Bảo hành
3. Khẩn
4. Dự trữ
5. Khác (mọi giá trị còn lại — Chiến dịch, v.v.)

**Tie-break trong cùng loại:** aging days desc → days overdue ETA desc → days since last reminder desc.

→ Đơn `Khẩn VOR aging 5 ngày` luôn đứng trên đơn `Bảo hành aging 100 ngày`.

User có thể manual flag "🔥 ưu tiên" để override sau (giai đoạn 2).

### 3.3 Review history

`/detail` hoặc click đơn → `ReminderHistoryTable` đọc từ `archive.reminders.filter(r => r.doc_no === X && r.item_code === Y)`, sort desc theo `created_at`.

### 3.4 Scorecard NCC

`/scorecard` → `SupplierScorecard` group by `supplier`, tính:

| KPI | Công thức |
|---|---|
| Tổng đơn | count distinct (DocNo + ItemCode) |
| Tổng nhắc | count reminders |
| % committed | committed / total reminders |
| % silent | silent / total reminders |
| Avg response time | mean(eta_promised_new − last reminder timestamp) |
| Avg ETA slip | mean(eta_promised_new − EstimatedDate1 gốc) |
| Reliability score | Heuristic 0-10 (công thức cuối định ở implementation phase) |

Filter time window: 7d / 30d / 90d / all.

### 3.5 Handoff

NV A: `/handoff` → Export → 2 file `backorder_active_YYYY-MM-DD.csv` + `backorder_archive_YYYY-MM-DD.json` → gửi qua Zalo/email.

NV B: `/handoff` → Import 2 file → preview merge:

```
Local: 50 reminder, 320 đơn active
Import: 73 reminder, 401 đơn active
→ Thêm mới: 61 reminder, 92 đơn
→ Trùng UUID (12): file mới hơn ghi đè
→ Đơn đã đóng: giữ trong archive
[Hủy] [Xác nhận merge]
```

Conflict resolution: UUID collision → `created_at` mới hơn thắng. Cùng giây → giữ cả 2 với suffix.

### 3.6 Cảnh báo "chưa export"

Banner sticky khi `unsavedReminderCount > 0` hoặc 4h không export. Click banner → mở Wizard export.

## 4. UI

### 4.1 Reminder Queue (`/reminders`)

Color coding theo loại: 🔴 VOR/Khẩn — 🟠 Bảo hành — 🟡 Dự trữ — ⚪ khác.

Mỗi card hiển thị: rank, badge loại đơn, DocNo, item, NCC, aging, ETA cũ + overdue, lần nhắc cuối + status, nút `[Mở để thúc]`.

Filter: loại đơn, NCC, aging bucket, search free-text.

### 4.2 ReminderActionPanel (modal)

3 vùng:
- **Header** — tóm tắt đơn (DocNo, item, NCC, aging, ETA cũ, ETA mới hứa).
- **Tab Template** — chọn 1 trong 3 mức, preview tiếng Việt, 2 nút `[Copy email]` `[Copy Zalo]`.
- **Tab Lịch sử** — `ReminderHistoryTable` cho đơn này.
- **Footer** — `[Đã gửi, ghi log]` mở `ReminderLogModal`.

### 4.3 ReminderLogModal

Form: kênh (radio: email/zalo/phone), NCC trả lời (textarea), ETA mới hứa (date picker, optional), status (radio).

`reminder_by` tự fill từ `currentUser`.

### 4.4 SupplierScorecard (`/scorecard`)

Bảng 7 cột: NCC, #đơn, #nhắc, %commit, %silent, Avg slip, Reliability score.

Filter time window. Click NCC → drill-down xem từng đơn.

### 4.5 HandoffModal (`/handoff`)

Wizard 2 bước (Export / Import). Bước Import có preview merge trước khi xác nhận.

### 4.6 Banner cảnh báo

Sticky top khi count > 0 hoặc 4h chưa export. Nút `[Export ngay]`.

## 5. Error Handling

### 5.1 CSV parse

- Encoding sai → hỏi user xác nhận.
- Thiếu cột bắt buộc → block import, hiện rõ cột thiếu.
- Cột annotation thiếu (lần đầu) → treat as empty, không lỗi (backward-compat).
- Annotation sai format → skip cell, banner warning.
- File rỗng → "Không có dữ liệu".

### 5.2 Archive JSON

- Invalid JSON → block, "File archive bị hỏng".
- `version` lớn hơn app biết → reject; v1→v2 → migrate runtime.
- Entry thiếu trường bắt buộc → bỏ qua, đếm + báo.
- Duplicate UUID trong cùng file → giữ entry đầu, log warning.

### 5.3 Import handoff conflicts

- Trùng UUID → file `created_at` mới hơn thắng.
- Cùng giây cùng UUID → giữ cả 2 với suffix `-A`/`-B`.
- Đơn trong import nhưng không có trong CSV active → vẫn merge reminder vào archive, không hiện queue (đơn đã đóng).
- Đơn trong CSV active không có annotation từ import → giữ annotation local.

### 5.4 Orphaned reminders

- Archive **không xóa**.
- `/reminders` queue mặc định ẩn orphaned (đơn đã đóng).
- `/scorecard` vẫn dùng orphaned (NCC đó đã giao = data quan trọng).
- `ReminderHistoryTable` hiện orphaned với badge "Đã đóng".

### 5.5 Date parse

DD/MM/YYYY. Parse fail → null, fallback. Không bao giờ throw.

### 5.6 currentUser

Lần đầu mở app → modal hỏi tên, lưu `localStorage`. Clear cache → hỏi lại.

### 5.7 Tab refresh / close không export

- `beforeunload` listener: confirm nếu `unsavedReminderCount > 0`.
- Banner sticky cảnh báo trước.
- Auto-prompt sau 4h không export.

### 5.8 Concurrent reminder same order same user

Nút `[Đã gửi]` disable khi modal mở. Modal submit chặn double-submit. UUID sinh khi submit thành công.

### 5.9 Template missing fields

Placeholder thay bằng "(chưa có)". Banner trong template panel khuyến nghị bổ sung CSV.

### 5.10 Composite key xung đột

Key = `DocNo + ItemCode + RowId`. Cả 3 trùng → cộng quantity, banner cảnh báo "Phát hiện duplicate, đã merge".

## 6. Testing

Coverage tối thiểu **80%** (rule global). Gồm unit + integration + E2E.

### 6.1 Unit (Vitest, target 90%+ trên `lib/`)

| Module | Trọng tâm |
|---|---|
| `priority.ts` | Strict order 5 loại; tie-break; orphaned không vào queue; manual override |
| `reminder.ts` | UUID gen; immutability; supersedes chain; status transitions hợp lệ |
| `templates.ts` | 3 mức × 2 channel = 6 outputs; placeholder thiếu fields; escape ký tự VN |
| `scorecard.ts` | Aggregation by supplier × time; orphaned vẫn count; division-by-zero; reliability score |
| `persist.ts` | Round-trip export→import; backward-compat CSV không annotation; merge UUID conflict; corrupt JSON reject |
| `transform.ts` | Test hiện có + cột annotation mới |

### 6.2 Component (React Testing Library)

| Component | Trọng tâm |
|---|---|
| `ReminderQueue` | Thứ tự ưu tiên; filter; banner chưa export khi count > 0 |
| `ReminderActionPanel` | Tab switch; copy clipboard đúng content; nút [Đã gửi] mở modal |
| `ReminderLogModal` | Validate required fields; submit payload đúng; double-submit prevention |
| `SupplierScorecard` | Time window đổi data; drill-down; sort cột |
| `HandoffModal` | Preview merge đúng; conflict highlight; cancel không thay đổi state |

### 6.3 Integration (Vitest + DataProvider thật)

3 luồng end-to-end ở data layer:

1. **Daily nudge** — upload → priority → log → annotation → export → import lại → state khôi phục.
2. **Handoff** — NV A export → NV B import vào local đã có data → merge → conflict resolution → cả 2 set reminder đều có.
3. **Scorecard accuracy** — mock 100 reminders mix supplier/status/eta → assert KPI đúng.

### 6.4 E2E (Playwright)

| Path | Steps |
|---|---|
| **E1 Reminder happy** | Upload sample.csv → /reminders → click VOR top → template "first-nudge" → Copy → [Đã gửi] → fill form → save → đơn tụt queue |
| **E2 Handoff** | Tạo 3 reminder → Export → clear state → Import 2 file → 3 reminder vẫn còn |
| **E3 Scorecard drill-down** | Mock 30 reminders/3 NCC → /scorecard → click PEU HN → thấy danh sách đơn |

### 6.5 Visual regression (Playwright screenshots)

Breakpoints 320 / 768 / 1024 / 1440 cho:
- `/reminders` queue (top-3 cards)
- `/scorecard` table
- `ReminderActionPanel` mở
- `HandoffModal` step 2 preview

Diff > 0.2% → CI fail.

### 6.6 Accessibility

`@axe-core/playwright` trên 4 route mới. Critical/serious → fail build. Test keyboard nav: Tab → Enter → Tab tabs → Esc.

### 6.7 Test fixtures

- `tests/fixtures/sample-orders.csv` — 30 đơn, đủ 5 loại OPropertyName, mix ETA/no-ETA, aging spread.
- `tests/fixtures/archive-30-reminders.json` — 30 reminders / 3 NCC, mix status.
- `tests/fixtures/conflict-import.json` — 5 trùng UUID + 10 mới.

### 6.8 CI gates

`pnpm test` (unit + component + integration). `pnpm test:e2e` (Playwright). Block merge nếu:

- Coverage < 80%
- Bất kỳ E2E fail
- Visual regression diff > 0.2%
- a11y critical/serious

## 7. Open Questions

1. **Supplier field trong CSV** — giả định `SR-ĐL2` (giá trị mẫu: PEU HN, Van Kim Automative Co...). Cần xác nhận trong implementation phase.
2. **Reliability score formula** — chốt khi có data thật để calibrate. Tạm thời dùng heuristic: `0.4 × %committed - 0.3 × normalized(avg_slip) - 0.3 × %silent`.
3. **Templates tiếng Việt** — 3 mức (first-nudge / overdue / escalation), nội dung cụ thể chốt khi viết template.

## 8. Out of Scope (giai đoạn 2 nếu cần)

- Tự động gửi email/Zalo qua API.
- Real-time sync giữa nhiều NV (cần backend).
- Manual flag "🔥 ưu tiên" override priority.
- Mobile app native.
- Tích hợp với V16 main app (Supabase).
- Notification push (cảnh báo VOR overdue qua mobile).
