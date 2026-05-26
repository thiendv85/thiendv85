import type { PartAffinityPair, AffinitySuggestion } from '../types/inventory';

/**
 * Normalize part code: uppercase + bỏ whitespace + bỏ ký tự đặc biệt (-, ., /).
 * Đảm bảo "16 11 9 468 618" và "16119468618" match.
 */
export function normalizePartCode(s: string): string {
    return (s || '').toUpperCase().replace(/[\s\-_.\/]+/g, '');
}

/**
 * Sort 2 part codes thành canonical order (smaller=partA).
 * Throws nếu A === B sau normalize hoặc rỗng.
 */
export function canonicalSort(a: string, b: string): [string, string] {
    const A = normalizePartCode(a);
    const B = normalizePartCode(b);
    if (!A || !B) throw new Error('Part A và Part B không được rỗng');
    if (A === B) throw new Error('Part A và Part B không được trùng');
    return A < B ? [A, B] : [B, A];
}

/**
 * Build Map<sku, pairs[]> để lookup O(1) cho 1 sku.
 * Mỗi pair xuất hiện ở 2 key (partA và partB).
 */
export function buildAffinityIndex(pairs: PartAffinityPair[]): Map<string, PartAffinityPair[]> {
    const index = new Map<string, PartAffinityPair[]>();
    for (const p of pairs) {
        const a = normalizePartCode(p.partA);
        const b = normalizePartCode(p.partB);
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
    for (const s of orderedSet) normalized.add(normalizePartCode(s));

    const collected = new Map<string, AffinitySuggestion>();
    for (const sku of normalized) {
        const pairs = index.get(sku) || [];
        for (const p of pairs) {
            const partA = normalizePartCode(p.partA);
            const partB = normalizePartCode(p.partB);
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
