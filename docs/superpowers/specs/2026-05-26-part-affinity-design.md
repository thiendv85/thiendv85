# Part Affinity Suggester — Design Spec

**Date:** 2026-05-26
**Status:** Approved (brainstorming complete)
**Author:** thiendv85

## Mục tiêu

Thêm tính năng gợi ý mã liên quan khi đặt hàng:
- Khi user đặt mã A, app gợi ý mã B/C có quan hệ
- 2 loại quan hệ: **mandatory** (bắt buộc) và **recommended** (khuyến nghị có score)
- Admin khai báo thủ công qua UI hoặc CSV upload
- Trigger khi review đơn (trước submit), không block

Đây là feature **song song** với Kitting hiện tại — Kitting = group N parts (vd "Gói nhớt 10K km"); Affinity = pair A↔B độc lập.

## Quyết định thiết kế đã chốt (brainstorming)

| Quyết định | Giá trị | Lý do |
|------------|---------|-------|
| Quan hệ với Kitting | Song song, không trộn | Kitting đã lo group; Affinity lo pair |
| Source data | User khai báo manual (UI + CSV) | Đơn giản, no AI/heuristic |
| Trigger UI | Khi review đơn (OrderReviewModal) | Final check trước submit, không nhiễu khi nhập qty |
| Mandatory enforcement | Soft — chỉ hiện nhắc, không block | User tự quyết |
| Recommended display | Score 0-100, sort cao→thấp | Top N relevant |
| Qty rule | Binary — chỉ check B có mặt, không quan tâm qty | Đơn giản, requirements chốt |
| Direction | 2-chiều (đối xứng A↔B) | Canonical sort lưu 1 row |

## Data Model

### Bảng `part_affinity_pairs`

```sql
CREATE TABLE part_affinity_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_a TEXT NOT NULL,
    part_b TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mandatory', 'recommended')),
    score INT DEFAULT 50 CHECK (score >= 0 AND score <= 100),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    UNIQUE (part_a, part_b),
    CONSTRAINT canonical_order CHECK (part_a < part_b)
);
CREATE INDEX idx_affinity_a ON part_affinity_pairs(part_a);
CREATE INDEX idx_affinity_b ON part_affinity_pairs(part_b);

-- RLS: admin/planner write, all authenticated read
ALTER TABLE part_affinity_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY affinity_read ON part_affinity_pairs FOR SELECT TO authenticated USING (true);
CREATE POLICY affinity_write ON part_affinity_pairs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')));
```

**Canonical sort:** trước khi insert, app sort `(A, B)` alphabet → smaller = `part_a`. DB constraint enforces.

**Score field:** chỉ ý nghĩa cho `type='recommended'`. Mandatory ignore score (treat as 100).

### TypeScript types (`types/inventory.ts`)

```typescript
export interface PartAffinityPair {
    id: string;
    partA: string;        // canonical: partA < partB
    partB: string;
    type: 'mandatory' | 'recommended';
    score: number;        // 0-100, dùng cho recommended sort
    note?: string;
    createdAt: string;
    createdBy?: string;
}

export interface AffinitySuggestion {
    relatedPart: string;          // SKU gợi ý
    type: 'mandatory' | 'recommended';
    score: number;
    note?: string;
    triggeredBy: string[];        // [SKU đã đặt khiến gợi ý này lên]
}
```

## Module Structure

```
supabase/migrations/018_part_affinity.sql   — schema + RLS
types/inventory.ts                           — PartAffinityPair + AffinitySuggestion
utils/partAffinity.ts                        — canonical sort, lookup helpers
utils/supabase.ts                            — fetchPartAffinityPairs (paginated),
                                                upsertPair, deletePair, bulkUpsert
utils/csvParser.ts                           — parsePartAffinityCSV
hooks/usePartAffinity.ts                     — load + cache pairs, lookup(sku) → related[]
pages/PartAffinityAdmin.tsx                  — CRUD + CSV (route /affinity)
components/AffinityReviewPanel.tsx           — hiển thị trong OrderReviewModal
components/OrderReviewModal.tsx              — modify: thêm AffinityReviewPanel
components/AppShell.tsx                      — nav item "Mã liên quan"
App.tsx                                      — register route
```

## Data Flow

### 1. Khai báo (admin/planner)
```
PartAffinityAdmin.tsx
  → form CRUD: (PartA, PartB, Type, Score, Note)
  → utils/partAffinity.canonicalSort([A,B])
  → upsertPair(canonical) qua supabase.ts
  → DB validate UNIQUE + canonical_order constraint
  → reload list
```

### 2. CSV upload
```
PartAffinityAdmin → file input
  → csvParser.parsePartAffinityCSV(text) → PartAffinityPair[]
  → dedupe canonical (như supersession fix)
  → bulkUpsertPairs(batch 500)
  → show: inserted, dups, errors
```

CSV format:
```csv
PartA,PartB,Type,Score,Note
BRK001,PAD001,mandatory,100,Bộ phanh kèm má phanh
OIL001,FLT001,recommended,90,Thay nhớt nên thay lọc
```

### 3. Review đơn (trigger chính)
```
OrderReviewModal mở (existing component)
  → useEffect: load tất cả pairs (cached via usePartAffinity)
  → build orderedSet = Set(quantities keys với air+sea > 0)
  → cho mỗi SKU X trong orderedSet:
      lookupAffinityPairs(X) → returns pairs containing X
      cho mỗi pair, related = pair.partA === X ? pair.partB : pair.partA
      nếu related ∉ orderedSet → add to suggestions
  → group suggestions:
      mandatory_missing: [{related, triggeredBy: [X,Y,...], type='mandatory'}]
      recommended_top: top N theo score DESC
  → render AffinityReviewPanel
```

### 4. AffinityReviewPanel render

```
┌─────────────────────────────────────────────────┐
│ 💡 Mã liên quan (gợi ý)                        │
├─────────────────────────────────────────────────┤
│ ⚠ THIẾU (BẮT BUỘC) — 2 mục                     │
│  • PAD001 — Má phanh (do BRK001)                │
│    [+ Thêm với qty 1]  [Bỏ qua: lý do__]       │
│  • ...                                          │
├─────────────────────────────────────────────────┤
│ ✨ KHUYẾN NGHỊ — top 5                         │
│  • FLT001 (score 90) — Lọc nhớt (do OIL001)    │
│  • GSK001 (score 60) ...                        │
└─────────────────────────────────────────────────┘
```

Click "+ Thêm" → callback to OrderReviewModal.handleQtyChange(related, 'sea', 1) — default Sea, qty 1.

## Functions Detail

### `utils/partAffinity.ts`

```typescript
export function canonicalSort(a: string, b: string): [string, string] {
    const A = a.trim().toUpperCase();
    const B = b.trim().toUpperCase();
    if (A === B) throw new Error('Part A và Part B không được trùng');
    return A < B ? [A, B] : [B, A];
}

export function buildAffinityIndex(pairs: PartAffinityPair[]): Map<string, PartAffinityPair[]> {
    const index = new Map<string, PartAffinityPair[]>();
    for (const p of pairs) {
        if (!index.has(p.partA)) index.set(p.partA, []);
        if (!index.has(p.partB)) index.set(p.partB, []);
        index.get(p.partA)!.push(p);
        index.get(p.partB)!.push(p);
    }
    return index;
}

export function suggestForOrder(
    orderedSet: Set<string>,
    index: Map<string, PartAffinityPair[]>,
    topRecommendedN = 5,
): { mandatoryMissing: AffinitySuggestion[]; recommended: AffinitySuggestion[] } {
    const collected = new Map<string, AffinitySuggestion>();
    for (const sku of orderedSet) {
        const pairs = index.get(sku.toUpperCase()) || [];
        for (const p of pairs) {
            const related = p.partA === sku.toUpperCase() ? p.partB : p.partA;
            if (orderedSet.has(related)) continue;
            const existing = collected.get(related);
            if (!existing) {
                collected.set(related, {
                    relatedPart: related,
                    type: p.type,
                    score: p.type === 'mandatory' ? 100 : p.score,
                    note: p.note,
                    triggeredBy: [sku],
                });
            } else {
                existing.triggeredBy.push(sku);
                // Promote to mandatory if any pair is mandatory
                if (p.type === 'mandatory') {
                    existing.type = 'mandatory';
                    existing.score = 100;
                }
            }
        }
    }
    const all = Array.from(collected.values());
    return {
        mandatoryMissing: all.filter(s => s.type === 'mandatory'),
        recommended: all
            .filter(s => s.type === 'recommended')
            .sort((a, b) => b.score - a.score)
            .slice(0, topRecommendedN),
    };
}
```

### `hooks/usePartAffinity.ts`

```typescript
export function usePartAffinity() {
    const [pairs, setPairs] = useState<PartAffinityPair[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchPartAffinityPairs().then(data => {
            setPairs(data);
            setIsLoading(false);
        });
    }, []);

    const index = useMemo(() => buildAffinityIndex(pairs), [pairs]);
    return { pairs, index, isLoading, refresh: () => fetchPartAffinityPairs().then(setPairs) };
}
```

### `utils/supabase.ts` additions

```typescript
export async function fetchPartAffinityPairs(): Promise<PartAffinityPair[]> {
    const rows = await selectAllPaginated<any>((from, to) =>
        supabase.from('part_affinity_pairs').select('*').range(from, to)
    );
    return rows.map(r => ({
        id: r.id, partA: r.part_a, partB: r.part_b,
        type: r.type, score: r.score, note: r.note,
        createdAt: r.created_at, createdBy: r.created_by,
    }));
}

export async function upsertPartAffinityPair(pair: Omit<PartAffinityPair, 'id'|'createdAt'>): Promise<{ success: boolean; error?: string }> {
    const [A, B] = canonicalSort(pair.partA, pair.partB);
    const { error } = await supabase.from('part_affinity_pairs').upsert({
        part_a: A, part_b: B,
        type: pair.type,
        score: pair.score,
        note: pair.note || null,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'part_a,part_b' });
    return { success: !error, error: error?.message };
}

export async function bulkUpsertPartAffinity(pairs: Array<Omit<PartAffinityPair, 'id'|'createdAt'>>): Promise<{ inserted: number; error?: string }> {
    // Dedupe canonical trước upsert (pattern giống supersession fix)
    const dedup = new Map<string, any>();
    for (const p of pairs) {
        try {
            const [A, B] = canonicalSort(p.partA, p.partB);
            const key = `${A}|${B}`;
            dedup.set(key, {
                part_a: A, part_b: B,
                type: p.type,
                score: p.score,
                note: p.note || null,
                updated_at: new Date().toISOString(),
            });
        } catch { /* skip invalid */ }
    }
    const rows = Array.from(dedup.values());
    let inserted = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error, count } = await supabase
            .from('part_affinity_pairs')
            .upsert(batch, { onConflict: 'part_a,part_b', count: 'exact' });
        if (error) return { inserted, error: error.message };
        inserted += count || batch.length;
    }
    return { inserted };
}

export async function deletePartAffinityPair(id: string): Promise<boolean> {
    const { error } = await supabase.from('part_affinity_pairs').delete().eq('id', id);
    return !error;
}
```

## UI Components

### PartAffinityAdmin (page)

- Header: "Quản lý Mã liên quan" + nút "Thêm pair", "Upload CSV"
- Filter: search by part code, filter by type
- Table: PartA | PartB | Type badge | Score | Note | Created | Actions (edit/delete)
- Modal add/edit: 2 input parts + radio type + slider score (0-100) + note textarea
- CSV upload: dropzone + preview + confirm
- Admin/planner only (gate by role)

### AffinityReviewPanel (component)

Trong `OrderReviewModal`:
- Position: dưới phần inventory_context summary, trên submit button
- Hidden nếu không có suggestion (cả mandatory + recommended rỗng)
- Mandatory section: red border, badge "BẮT BUỘC", icon ⚠
- Recommended section: blue border, sort by score desc, top 5
- Each row: SKU code (click → SkuDetail), tên hàng, trigger source, [+ Thêm] button
- "+ Thêm" → `handleQtyChange(sku, 'sea', 1)` (default Sea, qty 1)
- "Bỏ qua" → tùy chọn ghi lý do trong modal state (không persist DB, chỉ log trong action metadata)

### Nav item

`AppShell.tsx`: thêm nav "Mã liên quan" (icon `fa-link`), gate `role ∈ ['admin','planner']`.
Route mới: `'affinity'` trong View union.

## Error Handling

- Invalid pair (A === B): UI validate, server constraint (canonical_order)
- Duplicate upsert: dedupe trước call (pattern giống supersession)
- CSV parse error: hiện row số + lỗi
- DB error: toast "Lỗi lưu pair: ..."
- Pair lookup miss: trả [] (graceful, no crash)

## Testing

- Unit: `canonicalSort`, `buildAffinityIndex`, `suggestForOrder` (Vitest)
- Integration: upsert pair → fetch → assert canonical
- E2E (Playwright): tạo pair → add A vào draft → review → expect B trong panel
- Edge: A=B reject, duplicate pair update không nhân bản

## Performance

- Pairs table thường nhỏ (<10K rows kể cả enterprise), load full + cache
- `usePartAffinity` cache 1 lần mount, refresh manual khi CRUD
- `suggestForOrder` O(N×M) với N=orderedSet size, M=avg pairs/SKU — nhanh

## Rollout

1. Migration 018 → DB schema
2. Backend functions (supabase.ts)
3. Types + utils + hook
4. Admin page + nav
5. AffinityReviewPanel + wire vào OrderReviewModal
6. CSV parser + import
7. E2E test
8. Deploy preview → user verify → prod

## Open Questions

- Default qty khi click "+ Thêm" = 1 Sea — đúng cho mọi case? (chấp nhận tạm, user adjust)
- "Bỏ qua + lý do" có persist không? Spec hiện chỉ in-memory action metadata. Future iteration có thể lưu DB nếu cần audit.
- Bulk auto-add tất cả mandatory? Hiện chỉ click từng cái. Có thể thêm "Thêm tất cả thiếu" button.

## Rollback Plan

- Migration reversible (DROP TABLE part_affinity_pairs)
- UI: hide `AffinityReviewPanel` + nav item bằng feature flag nếu cần
- Backward-compat: existing flows không ảnh hưởng (panel chỉ ADD, không sửa đơn flow chính)
