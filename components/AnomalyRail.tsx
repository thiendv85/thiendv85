import React, { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';
import { ANOMALY_META, type OrderAnomaly } from '../utils/supplierAnomaly';

interface Props {
    items: InventoryItem[];
    getAggregate: (item: InventoryItem) => { counts: Record<OrderAnomaly, number>; maxScore: number; worst: OrderAnomaly; abnormalCount: number };
    activeTier: OrderAnomaly | 'NONE' | null;
    onTierClick: (tier: OrderAnomaly | 'NONE' | null) => void;
}

const TIERS: Array<OrderAnomaly | 'NONE'> = ['CRITICAL', 'HIGH', 'WARNING', 'DUE_SOON', 'NONE'];

const TIER_COLORS: Record<string, { dot: string; activeBg: string }> = {
    CRITICAL: { dot: 'var(--bo-accent)', activeBg: 'rgba(229, 180, 49, 0.12)' },
    HIGH:     { dot: 'var(--bo-bronze-strong)', activeBg: 'rgba(45, 56, 102, 0.10)' },
    WARNING:  { dot: 'var(--bo-bronze)', activeBg: 'rgba(79, 92, 143, 0.08)' },
    DUE_SOON: { dot: 'var(--bo-ink-muted)', activeBg: 'rgba(92, 101, 128, 0.08)' },
    NONE:     { dot: 'var(--bo-ok)', activeBg: 'rgba(60, 122, 107, 0.08)' },
};

export const AnomalyRail = ({ items, getAggregate, activeTier, onTierClick }: Props) => {
    const stats = useMemo(() => {
        const out: Record<string, number> = {};
        for (const t of TIERS) out[t] = 0;
        for (const it of items) {
            const agg = getAggregate(it);
            const tier = agg.abnormalCount > 0 ? agg.worst : 'NONE';
            out[tier]++;
        }
        return out;
    }, [items, getAggregate]);

    const total = items.length || 1;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 2px',
        }}>
            {TIERS.map(t => {
                const count = stats[t] || 0;
                const isActive = activeTier === t;
                const { dot, activeBg } = TIER_COLORS[t];
                const label = t === 'NONE' ? 'OK' : (ANOMALY_META[t as OrderAnomaly]?.label || t);
                const pct = Math.round((count / total) * 100);

                return (
                    <button key={t}
                        onClick={() => onTierClick(isActive ? null : t)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            height: 30, padding: '0 10px',
                            borderRadius: 'var(--bo-radius-sm)',
                            background: isActive ? activeBg : 'transparent',
                            border: isActive ? `1px solid ${dot}` : '1px solid transparent',
                            cursor: 'pointer',
                            fontFamily: "var(--bo-font-body)",
                            fontSize: 13, fontWeight: 700,
                            color: isActive ? dot : 'var(--bo-ink-muted)',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase' as const,
                            transition: 'all 140ms ease',
                            whiteSpace: 'nowrap' as const,
                        }}>
                        <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: dot, flexShrink: 0,
                            boxShadow: isActive ? `0 0 6px ${dot}` : 'none',
                        }} />
                        <span>{label}</span>
                        <span style={{
                            fontFamily: "var(--bo-font-mono)",
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: 13, fontWeight: 800,
                            color: isActive ? dot : 'var(--bo-ink)',
                        }}>
                            {count.toLocaleString('vi-VN')}
                        </span>
                        {pct > 0 && (
                            <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: 'var(--bo-ink-muted)', opacity: 0.7,
                            }}>
                                {pct}%
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
