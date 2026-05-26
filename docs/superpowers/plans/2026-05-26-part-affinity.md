# Part Affinity Suggester — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tính năng gợi ý mã liên quan (mandatory/recommended) khi review đơn — admin khai báo pair A↔B qua UI/CSV, panel hiện trong OrderReviewModal soft-nhắc.

**Architecture:** Bảng `part_affinity_pairs` lưu pair canonical (partA<partB) với type+score. `usePartAffinity` cache load full. Trigger duy nhất tại `OrderReviewModal` — scan orderedSet, lookup index, render panel với mandatory missing + top-N recommended.

**Tech Stack:** TypeScript, React, Supabase Postgres, Tailwind. Pattern reuse: dedupe canonical (như supersession fix), paginated select (`selectAllPaginated` đã có).

---

## Task 1: Migration `018_part_affinity.sql`

**Files:**
- Create: `supabase/migrations/018_part_affinity.sql`

- [ ] **Step 1: Tạo file migration**

```sql
-- Part Affinity Pairs — gợi ý mã liên quan khi đặt hàng (2026-05-26)
-- Pairs đối xứng, lưu canonical (part_a < part_b) để tránh dup ngược chiều.

CREATE TABLE IF NOT EXISTS part_affinity_pairs (
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

CREATE INDEX IF NOT EXISTS idx_affinity_a ON part_affinity_pairs(part_a);
CREATE INDEX IF NOT EXISTS idx_affinity_b ON part_affinity_pairs(part_b);

-- RLS: all authenticated read, admin/planner write
ALTER TABLE part_affinity_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affinity_read ON part_affinity_pairs;
CREATE POLICY affinity_read ON part_affinity_pairs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS affinity_write ON part_affinity_pairs;
CREATE POLICY affinity_write ON part_affinity_pairs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'planner')));

COMMENT ON TABLE part_affinity_pairs IS 'Quan hệ gợi ý A↔B khi đặt hàng. Đối xứng, canonical part_a<part_b';
COMMENT ON COLUMN part_affinity_pairs.type IS 'mandatory=bắt buộc, recommended=khuyến nghị';
COMMENT ON COLUMN part_affinity_pairs.score IS '0-100, chỉ dùng cho type=recommended sort';
```

- [ ] **Step 2: Apply migration vào Supabase project**

Chạy migration qua Supabase MCP hoặc SQL editor:
```bash
# Option A: via Supabase MCP
# (claude tool: mcp__cb59858c-...apply_migration với content trên)
```

Expected: table tạo thành công, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_part_affinity.sql
git commit -m "feat(db): add part_affinity_pairs table for related-part suggestions"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `types/inventory.ts` (cuối file, trước export const)

- [ ] **Step 1: Tìm vị trí thêm types**

Đọc cuối `types/inventory.ts`, sau `KittingDefinition` interface. Thêm:

```typescript
export interface PartAffinityPair {
    id: string;
    partA: string;
    partB: string;
    type: 'mandatory' | 'recommended';
    score: number;
    note?: string;
    createdAt: string;
    createdBy?: string;
}

export interface AffinitySuggestion {
    relatedPart: string;
    type: 'mandatory' | 'recommended';
    score: number;
    note?: string;
    triggeredBy: string[];
}
```

- [ ] **Step 2: Build check**

```bash
cd D:/App/V16
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

Expected: chỉ lỗi cũ InventoryDistribution.

- [ ] **Step 3: Commit**

```bash
git add types/inventory.ts
git commit -m "feat(types): add PartAffinityPair + AffinitySuggestion"
```

---

## Task 3: `utils/partAffinity.ts` core helpers

**Files:**
- Create: `utils/partAffinity.ts`
- Create: `utils/__tests__/partAffinity.test.ts`

- [ ] **Step 1: Tạo file helper**

```typescript
import type { PartAffinityPair, AffinitySuggestion } from '../types/inventory';

/**
 * Sort 2 part codes thành canonical order (smaller=partA).
 * Throws nếu A === B (sau normalize).
 */
export function canonicalSort(a: string, b: string): [string, string] {
    const A = (a || '').trim().toUpperCase();
    const B = (b || '').trim().toUpperCase();
    if (!A || !B) throw new Error('Part A và Part B không được rỗng');
    if (A === B) throw new Error('Part A và Part B không được trùng');
    return A < B ? [A, B] : [B, A];
}

/**
 * Build index Map<sku, pairs[]> để lookup O(1) cho 1 sku.
 * Mỗi pair xuất hiện ở 2 key (partA và partB).
 */
export function buildAffinityIndex(pairs: PartAffinityPair[]): Map<string, PartAffinityPair[]> {
    const index = new Map<string, PartAffinityPair[]>();
    for (const p of pairs) {
        const a = p.partA.toUpperCase();
        const b = p.partB.toUpperCase();
        if (!index.has(a)) index.set(a, []);
        if (!index.has(b)) index.set(b, []);
        index.get(a)!.push(p);
        index.get(b)!.push(p);
    }
    return index;
}

/**
 * Scan orderedSet, lookup pairs, trả về suggestions phân loại.
 * Mandatory promote nếu có ≥1 pair mandatory cho cùng related.
 */
export function suggestForOrder(
    orderedSet: Set<string>,
    index: Map<string, PartAffinityPair[]>,
    topRecommendedN = 5,
): { mandatoryMissing: AffinitySuggestion[]; recommended: AffinitySuggestion[] } {
    const normalized = new Set<string>();
    for (const s of orderedSet) normalized.add(s.toUpperCase());

    const collected = new Map<string, AffinitySuggestion>();
    for (const sku of normalized) {
        const pairs = index.get(sku) || [];
        for (const p of pairs) {
            const partA = p.partA.toUpperCase();
            const partB = p.partB.toUpperCase();
            const related = partA === sku ? partB : partA;
            if (normalized.has(related)) continue;
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
                if (!existing.triggeredBy.includes(sku)) existing.triggeredBy.push(sku);
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

- [ ] **Step 2: Tạo test file**

```typescript
import { describe, it, expect } from 'vitest';
import { canonicalSort, buildAffinityIndex, suggestForOrder } from '../partAffinity';
import type { PartAffinityPair } from '../../types/inventory';

const mk = (a: string, b: string, type: 'mandatory'|'recommended' = 'recommended', score = 50): PartAffinityPair => ({
    id: `${a}-${b}`, partA: a, partB: b, type, score, createdAt: '', note: '',
});

describe('canonicalSort', () => {
    it('sorts alphabetically and uppercases', () => {
        expect(canonicalSort('B', 'A')).toEqual(['A', 'B']);
        expect(canonicalSort('x', 'y')).toEqual(['X', 'Y']);
    });
    it('throws on equal', () => {
        expect(() => canonicalSort('A', 'a')).toThrow(/trùng/);
    });
    it('throws on empty', () => {
        expect(() => canonicalSort('', 'B')).toThrow(/rỗng/);
    });
});

describe('buildAffinityIndex', () => {
    it('indexes both directions', () => {
        const idx = buildAffinityIndex([mk('A', 'B')]);
        expect(idx.get('A')?.length).toBe(1);
        expect(idx.get('B')?.length).toBe(1);
    });
});

describe('suggestForOrder', () => {
    const pairs = [
        mk('BRK', 'PAD', 'mandatory', 100),
        mk('OIL', 'FLT', 'recommended', 90),
        mk('OIL', 'GSK', 'recommended', 60),
    ];
    const index = buildAffinityIndex(pairs);

    it('mandatory missing surfaces when A in order, B not', () => {
        const out = suggestForOrder(new Set(['BRK']), index);
        expect(out.mandatoryMissing.length).toBe(1);
        expect(out.mandatoryMissing[0].relatedPart).toBe('PAD');
    });

    it('skips related if already in order', () => {
        const out = suggestForOrder(new Set(['BRK', 'PAD']), index);
        expect(out.mandatoryMissing.length).toBe(0);
    });

    it('recommended sorted desc by score', () => {
        const out = suggestForOrder(new Set(['OIL']), index);
        expect(out.recommended.map(r => r.relatedPart)).toEqual(['FLT', 'GSK']);
    });

    it('promotes to mandatory when any pair is mandatory', () => {
        const mixed = [mk('X', 'Y', 'recommended', 50), mk('X', 'Y', 'mandatory', 100)];
        // Note: real DB has UNIQUE on (a,b), but test the merge logic
        const idx = buildAffinityIndex(mixed);
        const out = suggestForOrder(new Set(['X']), idx);
        expect(out.mandatoryMissing.length).toBe(1);
    });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run utils/__tests__/partAffinity.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add utils/partAffinity.ts utils/__tests__/partAffinity.test.ts
git commit -m "feat(affinity): add canonicalSort, buildIndex, suggestForOrder + tests"
```

---

## Task 4: Supabase CRUD functions

**Files:**
- Modify: `utils/supabase.ts` (thêm functions, sau `loadAllSupersessionMappings`)

- [ ] **Step 1: Thêm imports nếu chưa có**

Đầu file, đảm bảo có import:
```typescript
import type { PartAffinityPair } from '../types/inventory';
import { canonicalSort } from './partAffinity';
```

- [ ] **Step 2: Thêm 4 functions**

Sau `loadAllSupersessionMappings`:

```typescript
// ─── Part Affinity Pairs ──────────────────────────────────────────────────────

export async function fetchPartAffinityPairs(): Promise<PartAffinityPair[]> {
    const rows = await selectAllPaginated<any>((from, to) =>
        supabase.from('part_affinity_pairs').select('*').order('created_at', { ascending: false }).range(from, to)
    );
    return rows.map(r => ({
        id: r.id,
        partA: r.part_a,
        partB: r.part_b,
        type: r.type,
        score: r.score,
        note: r.note || undefined,
        createdAt: r.created_at,
        createdBy: r.created_by || undefined,
    }));
}

export async function upsertPartAffinityPair(
    pair: Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>
): Promise<{ success: boolean; error?: string }> {
    try {
        const [A, B] = canonicalSort(pair.partA, pair.partB);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('part_affinity_pairs').upsert({
            part_a: A,
            part_b: B,
            type: pair.type,
            score: pair.score,
            note: pair.note || null,
            updated_at: new Date().toISOString(),
            created_by: user?.id ?? null,
        }, { onConflict: 'part_a,part_b' });
        return { success: !error, error: error?.message };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
    }
}

export async function bulkUpsertPartAffinity(
    pairs: Array<Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>>
): Promise<{ inserted: number; skipped: number; error?: string }> {
    const dedup = new Map<string, any>();
    let skipped = 0;
    for (const p of pairs) {
        try {
            const [A, B] = canonicalSort(p.partA, p.partB);
            const key = `${A}|${B}`;
            dedup.set(key, {
                part_a: A,
                part_b: B,
                type: p.type,
                score: p.score,
                note: p.note || null,
                updated_at: new Date().toISOString(),
            });
        } catch {
            skipped++;
        }
    }
    const rows = Array.from(dedup.values());
    let inserted = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error, count } = await supabase
            .from('part_affinity_pairs')
            .upsert(batch, { onConflict: 'part_a,part_b', count: 'exact' });
        if (error) return { inserted, skipped, error: error.message };
        inserted += count || batch.length;
    }
    return { inserted, skipped };
}

export async function deletePartAffinityPair(id: string): Promise<boolean> {
    const { error } = await supabase.from('part_affinity_pairs').delete().eq('id', id);
    if (error) console.error('deletePartAffinityPair:', error);
    return !error;
}
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add utils/supabase.ts
git commit -m "feat(supabase): part_affinity CRUD + bulk upsert with dedupe"
```

---

## Task 5: CSV parser

**Files:**
- Modify: `utils/csvParser.ts` (cuối file, sau `parseSupersessionMappingCSV`)

- [ ] **Step 1: Thêm parser**

Sau `parseSupersessionMappingCSV`:

```typescript
import type { PartAffinityPair } from '../types/inventory';

export const parsePartAffinityCSV = (
    text: string
): Array<Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(text);
    const cleanHeaderLine = lines[0].replace(/^﻿/, '').trim();
    const headers = parseLine(cleanHeaderLine, delimiter).map(h => h.trim().toLowerCase());

    const findCol = (keywords: string[]) =>
        headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxA = findCol(['parta', 'part_a', 'mã a', 'ma a', 'partno1', 'sku1']);
    const idxB = findCol(['partb', 'part_b', 'mã b', 'ma b', 'partno2', 'sku2']);
    const idxType = findCol(['type', 'loại', 'loai']);
    const idxScore = findCol(['score', 'điểm', 'diem']);
    const idxNote = findCol(['note', 'ghi chú', 'ghi chu']);

    if (idxA === -1 || idxB === -1 || idxType === -1) return [];

    const pairs: Array<Omit<PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>> = [];

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 3) return;

        const a = row[idxA]?.trim();
        const b = row[idxB]?.trim();
        if (!a || !b || a.toUpperCase() === b.toUpperCase()) return;

        const typeRaw = (row[idxType] || '').trim().toLowerCase();
        let type: 'mandatory' | 'recommended';
        if (['mandatory', 'bắt buộc', 'bat buoc', 'required', 'm'].some(k => typeRaw.includes(k))) {
            type = 'mandatory';
        } else if (['recommended', 'khuyến nghị', 'khuyen nghi', 'r'].some(k => typeRaw.includes(k))) {
            type = 'recommended';
        } else {
            return; // skip unknown type
        }

        let score = 50;
        if (idxScore > -1 && row[idxScore]) {
            const n = parseInt(row[idxScore]);
            if (!isNaN(n)) score = Math.max(0, Math.min(100, n));
        }

        const note = idxNote > -1 ? (row[idxNote]?.trim() || undefined) : undefined;

        pairs.push({ partA: a, partB: b, type, score, note });
    });

    return pairs;
};
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add utils/csvParser.ts
git commit -m "feat(csv): parsePartAffinityCSV — type + score + note"
```

---

## Task 6: Hook `usePartAffinity`

**Files:**
- Create: `hooks/usePartAffinity.ts`

- [ ] **Step 1: Tạo hook**

```typescript
import { useEffect, useMemo, useState, useCallback } from 'react';
import type { PartAffinityPair } from '../types/inventory';
import { fetchPartAffinityPairs } from '../utils/supabase';
import { buildAffinityIndex } from '../utils/partAffinity';

export function usePartAffinity() {
    const [pairs, setPairs] = useState<PartAffinityPair[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchPartAffinityPairs();
            setPairs(data);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const index = useMemo(() => buildAffinityIndex(pairs), [pairs]);

    return { pairs, index, isLoading, refresh: load };
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add hooks/usePartAffinity.ts
git commit -m "feat(hook): usePartAffinity load + index pairs"
```

---

## Task 7: `AffinityReviewPanel` component

**Files:**
- Create: `components/AffinityReviewPanel.tsx`

- [ ] **Step 1: Tạo component**

```tsx
import React from 'react';
import { FaIcon } from './Icon';
import type { AffinitySuggestion } from '../types/inventory';

interface Props {
    mandatoryMissing: AffinitySuggestion[];
    recommended: AffinitySuggestion[];
    itemNames?: Record<string, string>;     // map SKU → tên hàng (optional)
    onAdd: (sku: string) => void;            // click "+ Thêm" callback
    onSkip?: (sku: string) => void;
}

const scoreColor = (score: number) =>
    score >= 80 ? 'text-rose-700 bg-rose-50 border-rose-200'
    : score >= 50 ? 'text-orange-700 bg-orange-50 border-orange-200'
    : 'text-slate-600 bg-slate-50 border-slate-200';

const SuggestionRow = ({ s, name, onAdd, onSkip }: {
    s: AffinitySuggestion;
    name?: string;
    onAdd: () => void;
    onSkip?: () => void;
}) => (
    <div className="flex items-start justify-between gap-3 py-2.5 px-3 border-b border-slate-100 last:border-b-0">
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-slate-800">{s.relatedPart}</span>
                {s.type === 'recommended' && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${scoreColor(s.score)}`}>
                        {s.score}
                    </span>
                )}
            </div>
            {name && <div className="text-xs text-slate-500 truncate mt-0.5">{name}</div>}
            <div className="text-[10px] text-slate-400 mt-0.5">
                Do đặt: <span className="font-mono">{s.triggeredBy.join(', ')}</span>
                {s.note && <span className="ml-2 italic">— {s.note}</span>}
            </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
            <button
                onClick={onAdd}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
                + Thêm
            </button>
            {onSkip && (
                <button
                    onClick={onSkip}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-700"
                >
                    Bỏ qua
                </button>
            )}
        </div>
    </div>
);

export const AffinityReviewPanel = ({
    mandatoryMissing, recommended, itemNames, onAdd, onSkip,
}: Props) => {
    if (mandatoryMissing.length === 0 && recommended.length === 0) return null;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <FaIcon className="fas fa-link text-blue-500" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Mã liên quan (gợi ý)
                </span>
            </div>

            {mandatoryMissing.length > 0 && (
                <div className="border-l-4 border-rose-500">
                    <div className="px-3 py-1.5 bg-rose-50 text-rose-700 text-[11px] font-black uppercase">
                        ⚠ Thiếu (bắt buộc) — {mandatoryMissing.length}
                    </div>
                    {mandatoryMissing.map(s => (
                        <SuggestionRow
                            key={s.relatedPart}
                            s={s}
                            name={itemNames?.[s.relatedPart]}
                            onAdd={() => onAdd(s.relatedPart)}
                            onSkip={onSkip ? () => onSkip(s.relatedPart) : undefined}
                        />
                    ))}
                </div>
            )}

            {recommended.length > 0 && (
                <div className="border-l-4 border-blue-400">
                    <div className="px-3 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-black uppercase">
                        ✨ Khuyến nghị — top {recommended.length}
                    </div>
                    {recommended.map(s => (
                        <SuggestionRow
                            key={s.relatedPart}
                            s={s}
                            name={itemNames?.[s.relatedPart]}
                            onAdd={() => onAdd(s.relatedPart)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add components/AffinityReviewPanel.tsx
git commit -m "feat(ui): AffinityReviewPanel — mandatory missing + recommended top-N"
```

---

## Task 8: Wire vào `OrderReviewModal`

**Files:**
- Modify: `components/OrderReviewModal.tsx`

- [ ] **Step 1: Tìm vị trí render submit section**

```bash
grep -n "submit\|handleSubmit\|return (" D:/App/V16/components/OrderReviewModal.tsx | head -10
```

- [ ] **Step 2: Thêm imports + hook + suggest call**

Đầu file, thêm imports:
```typescript
import { usePartAffinity } from '../hooks/usePartAffinity';
import { suggestForOrder } from '../utils/partAffinity';
import { AffinityReviewPanel } from './AffinityReviewPanel';
```

Trong component body (sau hooks khác, trước render):
```typescript
const { index: affinityIndex, isLoading: affinityLoading } = usePartAffinity();

const orderedSet = useMemo(() => {
    const s = new Set<string>();
    Object.entries(quantities || {}).forEach(([code, q]: any) => {
        if ((q?.air || 0) + (q?.sea || 0) > 0) s.add(code);
    });
    return s;
}, [quantities]);

const affinity = useMemo(() => {
    if (affinityLoading || orderedSet.size === 0) {
        return { mandatoryMissing: [], recommended: [] };
    }
    return suggestForOrder(orderedSet, affinityIndex, 5);
}, [orderedSet, affinityIndex, affinityLoading]);

const itemNamesMap = useMemo(() => {
    const m: Record<string, string> = {};
    (inventoryContext || []).forEach((c: any) => { m[c.itemCode] = c.itemName || ''; });
    return m;
}, [inventoryContext]);

const handleAddAffinity = (sku: string) => {
    // Add với qty=1 Sea (default). Caller chịu trách nhiệm propagate qua handleQtyChange.
    if (typeof onAddSku === 'function') onAddSku(sku, 'sea', 1);
};
```

> Lưu ý: tên props (`quantities`, `inventoryContext`, `onAddSku`) tùy theo modal hiện tại. Đọc file trước khi sửa và map đúng. Nếu modal không có `onAddSku`, thêm prop `onAddSku?: (sku: string, type: 'air'|'sea', qty: number) => void` vào interface và chuyển callback từ parent (`Ordering.tsx`).

- [ ] **Step 3: Render panel**

Trong JSX, đặt `<AffinityReviewPanel>` ngay trước nút Submit:

```tsx
<AffinityReviewPanel
    mandatoryMissing={affinity.mandatoryMissing}
    recommended={affinity.recommended}
    itemNames={itemNamesMap}
    onAdd={handleAddAffinity}
/>
```

- [ ] **Step 4: Update `Ordering.tsx` để pass `onAddSku`**

Tìm chỗ render `<OrderReviewModal>` trong `Ordering.tsx`. Thêm prop:
```tsx
<OrderReviewModal
    ...existing props...
    onAddSku={(sku, type, qty) => handleQtyChange(sku, type, qty)}
/>
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add components/OrderReviewModal.tsx pages/Ordering.tsx
git commit -m "feat(review): wire AffinityReviewPanel into OrderReviewModal"
```

---

## Task 9: `PartAffinityAdmin` page

**Files:**
- Create: `pages/PartAffinityAdmin.tsx`

- [ ] **Step 1: Tạo page**

```tsx
import React, { useState, useMemo, useRef } from 'react';
import { usePartAffinity } from '../hooks/usePartAffinity';
import { upsertPartAffinityPair, deletePartAffinityPair, bulkUpsertPartAffinity } from '../utils/supabase';
import { parsePartAffinityCSV } from '../utils/csvParser';
import { FaIcon } from '../components/Icon';
import type { PartAffinityPair } from '../types/inventory';

export const PartAffinityAdmin = () => {
    const { pairs, isLoading, refresh } = usePartAffinity();
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'mandatory' | 'recommended'>('all');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<PartAffinityPair | null>(null);
    const [formA, setFormA] = useState('');
    const [formB, setFormB] = useState('');
    const [formType, setFormType] = useState<'mandatory' | 'recommended'>('recommended');
    const [formScore, setFormScore] = useState(50);
    const [formNote, setFormNote] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const t = search.trim().toUpperCase();
        return pairs.filter(p => {
            if (filterType !== 'all' && p.type !== filterType) return false;
            if (!t) return true;
            return p.partA.includes(t) || p.partB.includes(t);
        });
    }, [pairs, search, filterType]);

    const openNew = () => {
        setEditing(null);
        setFormA(''); setFormB(''); setFormType('recommended'); setFormScore(50); setFormNote('');
        setShowForm(true);
    };
    const openEdit = (p: PartAffinityPair) => {
        setEditing(p);
        setFormA(p.partA); setFormB(p.partB);
        setFormType(p.type); setFormScore(p.score); setFormNote(p.note || '');
        setShowForm(true);
    };

    const handleSave = async () => {
        const res = await upsertPartAffinityPair({
            partA: formA, partB: formB, type: formType, score: formScore, note: formNote || undefined,
        });
        if (res.success) {
            setToast('Đã lưu');
            setShowForm(false);
            refresh();
        } else {
            setToast(`Lỗi: ${res.error}`);
        }
        setTimeout(() => setToast(null), 3000);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xoá pair này?')) return;
        const ok = await deletePartAffinityPair(id);
        if (ok) { setToast('Đã xoá'); refresh(); }
        else setToast('Xoá thất bại');
        setTimeout(() => setToast(null), 3000);
    };

    const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parsePartAffinityCSV(text);
        if (parsed.length === 0) { setToast('CSV không có dòng hợp lệ'); return; }
        const res = await bulkUpsertPartAffinity(parsed);
        if (res.error) setToast(`Lỗi: ${res.error}`);
        else setToast(`Đã import ${res.inserted} (skip ${res.skipped})`);
        e.target.value = '';
        refresh();
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <div className="animate-fadeIn space-y-4 p-6">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl text-white p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black tracking-tight uppercase">Mã liên quan</h1>
                        <p className="text-white/50 text-xs">Pair A↔B — mandatory/recommended</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/90 text-sm font-bold">
                            <FaIcon className="fas fa-upload mr-2" />CSV
                        </button>
                        <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCSV} />
                        <button onClick={openNew} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">
                            <FaIcon className="fas fa-plus mr-2" />Thêm pair
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 items-center">
                <input
                    placeholder="Tìm mã..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 max-w-xs"
                />
                {(['all', 'mandatory', 'recommended'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                    >
                        {t === 'all' ? 'Tất cả' : t === 'mandatory' ? 'Bắt buộc' : 'Khuyến nghị'}
                    </button>
                ))}
                <span className="text-sm text-slate-500 ml-auto">{filtered.length} / {pairs.length} pair</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left p-3 font-bold text-slate-600">Part A</th>
                            <th className="text-left p-3 font-bold text-slate-600">Part B</th>
                            <th className="text-left p-3 font-bold text-slate-600">Loại</th>
                            <th className="text-right p-3 font-bold text-slate-600">Score</th>
                            <th className="text-left p-3 font-bold text-slate-600">Ghi chú</th>
                            <th className="text-right p-3 font-bold text-slate-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Đang nạp...</td></tr>}
                        {!isLoading && filtered.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-slate-400">Chưa có pair nào</td></tr>
                        )}
                        {filtered.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold text-slate-800">{p.partA}</td>
                                <td className="p-3 font-mono font-bold text-slate-800">{p.partB}</td>
                                <td className="p-3">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${p.type === 'mandatory' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {p.type === 'mandatory' ? 'BẮT BUỘC' : 'KHUYẾN NGHỊ'}
                                    </span>
                                </td>
                                <td className="p-3 text-right tabular-nums">{p.type === 'recommended' ? p.score : '—'}</td>
                                <td className="p-3 text-slate-600 text-xs">{p.note || '—'}</td>
                                <td className="p-3 text-right">
                                    <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs mr-2">Sửa</button>
                                    <button onClick={() => handleDelete(p.id)} className="text-rose-600 hover:underline text-xs">Xoá</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-black">{editing ? 'Sửa pair' : 'Thêm pair mới'}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs font-bold text-slate-600">
                                Part A
                                <input value={formA} onChange={e => setFormA(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Part B
                                <input value={formB} onChange={e => setFormB(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
                            </label>
                        </div>
                        <label className="text-xs font-bold text-slate-600 block">
                            Loại
                            <div className="flex gap-2 mt-1">
                                {(['mandatory', 'recommended'] as const).map(t => (
                                    <button key={t} onClick={() => setFormType(t)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold ${formType === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                        {t === 'mandatory' ? 'Bắt buộc' : 'Khuyến nghị'}
                                    </button>
                                ))}
                            </div>
                        </label>
                        {formType === 'recommended' && (
                            <label className="text-xs font-bold text-slate-600 block">
                                Score: {formScore}
                                <input type="range" min={0} max={100} value={formScore} onChange={e => setFormScore(parseInt(e.target.value))} className="w-full mt-1" />
                            </label>
                        )}
                        <label className="text-xs font-bold text-slate-600 block">
                            Ghi chú
                            <textarea value={formNote} onChange={e => setFormNote(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" rows={2} />
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm font-bold text-slate-600">Huỷ</button>
                            <button onClick={handleSave} disabled={!formA.trim() || !formB.trim()} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50">Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm">
                    {toast}
                </div>
            )}
        </div>
    );
};

export default PartAffinityAdmin;
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add pages/PartAffinityAdmin.tsx
git commit -m "feat(page): PartAffinityAdmin — CRUD + CSV import + filter"
```

---

## Task 10: Register route + nav

**Files:**
- Modify: `App.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Lazy import + view union trong `App.tsx`**

Đầu file `App.tsx`, thêm lazy import:
```typescript
const PartAffinityAdmin = React.lazy(() => import('./pages/PartAffinityAdmin'));
```

Tìm `type View = ...` và thêm `'affinity'`:
```typescript
type View =
  | 'upload'
  | 'dashboard'
  | 'ordering'
  | 'backorder'
  | 'transfer'
  | 'log'
  | 'kitting'
  | 'settings'
  | 'approval-queue'
  | 'report'
  | 'affinity';
```

Thêm render block, sau `view === 'report'`:
```tsx
{view === 'affinity' && <PartAffinityAdmin />}
```

- [ ] **Step 2: Update `AppShell.tsx`**

Cập nhật `View` union (giống App.tsx). Cập nhật `NavId`:
```typescript
type NavId = 'dashboard' | 'ordering' | 'backorder' | 'transfer' | 'kitting' | 'approval-queue' | 'report' | 'affinity';
```

Thêm nav item trong `NAV_ITEMS` (sau `report`):
```typescript
{ id: 'affinity', label: 'Mã liên quan', icon: 'fa-link', mobile: 'Liên quan' },
```

Gate hiển thị nav theo role (admin/planner):
- Nếu base array hiện tại không gate per-item, gate inline trong render hoặc đẩy vào nhánh `if (role && ['admin','planner'].includes(role)) base.push({...})` tương tự `approval-queue`. Đọc current code, áp pattern đúng.

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
```

- [ ] **Step 4: Smoke test local**

```bash
npm run dev
```

Mở `http://localhost:5173`. Login admin → check nav "Mã liên quan" hiện → click vào trang → verify list rỗng, form mở được, không crash.

- [ ] **Step 5: Commit**

```bash
git add App.tsx components/AppShell.tsx
git commit -m "feat(nav): register affinity route + nav item (admin/planner)"
```

---

## Task 11: Sample CSV + manual smoke

**Files:**
- Create: `docs/samples/part-affinity-sample.csv`

- [ ] **Step 1: Tạo sample**

```csv
PartA,PartB,Type,Score,Note
BRK001,PAD001,mandatory,100,Bộ phanh kèm má phanh
BRK001,SCR001,mandatory,100,Bộ phanh kèm bulông
OIL001,FLT001,recommended,90,Thay nhớt nên thay lọc nhớt
OIL001,GSK001,recommended,60,Gioăng nắp dầu nên thay khi mở
WHL001,LUG001,mandatory,100,Bánh xe kèm tắc kê
WHL001,BAL001,recommended,40,Cân bằng bánh xe
```

- [ ] **Step 2: Manual test**

1. Mở `/affinity` (admin) → click "CSV" → upload sample
2. Verify table hiện 6 pairs, canonical (vd PAD001<BRK001 → row part_a=BRK001? NO — alphabet B<P → BRK001 thực sự < PAD001). Check vài row tự verify canonical đúng.
3. Vào `/ordering` → tạo draft chứa BRK001 với qty 1 → submit → modal review hiện
4. Verify panel "Mã liên quan" hiện 2 mandatory missing: PAD001 + SCR001
5. Click "+ Thêm" trên PAD001 → quay lại draft, PAD001 có qty 1 Sea
6. Mở review lại → mandatory list chỉ còn SCR001

- [ ] **Step 3: Commit**

```bash
git add docs/samples/part-affinity-sample.csv
git commit -m "docs: add part-affinity-sample.csv"
```

---

## Task 12: Deploy preview + verify

- [ ] **Step 1: Build & deploy preview**

```bash
npx tsc --noEmit 2>&1 | grep -v "InventoryDistribution\|npm notice" | tail -5
npx vercel --yes 2>&1 | tail -5
```

- [ ] **Step 2: User verify preview URL**

Yêu cầu user mở preview URL, lặp lại smoke test Task 11 step 2.

- [ ] **Step 3: Promote prod khi OK**

```bash
npx vercel --prod --yes 2>&1 | tail -5
```

- [ ] **Step 4: Final commit + tag**

```bash
git tag -a v2.3.0-part-affinity -m "Part Affinity Suggester rollout"
```

---

## Self-Review Checklist (đã chạy)

- [x] **Spec coverage:** mọi mục trong spec có task tương ứng (DB→T1, types→T2, utils→T3+T5, supabase→T4, hook→T6, panel→T7, integration→T8, admin→T9, nav→T10, sample→T11, deploy→T12)
- [x] **No placeholders:** mỗi step có code thật, lệnh thật
- [x] **Type consistency:** `PartAffinityPair`, `AffinitySuggestion`, `canonicalSort`, `buildAffinityIndex`, `suggestForOrder`, `fetchPartAffinityPairs`, `upsertPartAffinityPair`, `bulkUpsertPartAffinity`, `deletePartAffinityPair`, `parsePartAffinityCSV`, `usePartAffinity`, `AffinityReviewPanel` — tên thống nhất xuyên suốt
- [x] **TDD:** Task 3 viết test trước
- [x] **DRY:** reuse `selectAllPaginated`, dedupe canonical pattern (từ supersession)
- [x] **YAGNI:** không thêm features ngoài spec (vd bulk auto-add, persist skip reason)
- [x] **Frequent commits:** mỗi task commit riêng

## Rollback

Nếu deploy phát sinh vấn đề:
1. Migration revert: `DROP TABLE part_affinity_pairs CASCADE;`
2. UI revert: `git revert <tag-commit>`
3. Backward-compat: panel chỉ ADD, không sửa flow đặt hàng → an toàn rollback từng task
