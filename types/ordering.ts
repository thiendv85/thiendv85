// ─────────────────────────────────────────────────────────────────────────────
// ORDERING TYPES — Draft, Kitting, Part Affinity
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderingDraft {
    quantities: Record<string, { air: number; sea: number }>;
    notes: Record<string, string>;
}

export interface KittingDefinition {
    SetPartsCode: string;
    SetPartsName: string;
    ItemCode: string;
    ItemNameEng?: string;
    QtyRequired: number;
    ModelCar?: string;
    EngineCode?: string;
    UnitPrice?: number;
}

// ─── Part Affinity (2026-05-26) ──────────────────────────────────────────────
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
