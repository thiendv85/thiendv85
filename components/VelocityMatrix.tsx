/**
 * VelocityMatrix — Ma trận tốc độ bán × nguồn cung cho trang Hàng nợ.
 * Design: SAP Fiori + Stripe + Oracle SCM enterprise style.
 */
import React, { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';

interface Props {
    items: InventoryItem[];
    resolveMotherGroup: (item: InventoryItem) => string;
    getScopedBOQty: (item: InventoryItem) => number;
    onSelectBand?: (bandId: string) => void;
}

type BandId = 'hot' | 'warm' | 'slow' | 'cold';
interface Band {
    id: BandId;
    label: string;
    sub: string;
    test: (demandMonthly: number) => boolean;
}

const BANDS: Band[] = [
    { id: 'hot',  label: 'Bán nhanh', sub: '≥ 30 đv/tháng', test: v => v >= 30 },
    { id: 'warm', label: 'Bán đều',   sub: '10 – 29',        test: v => v >= 10 && v < 30 },
    { id: 'slow', label: 'Bán chậm',  sub: '3 – 9',          test: v => v >= 3 && v < 10 },
    { id: 'cold', label: 'Tồn đọng',  sub: '< 3 đv/tháng',   test: v => v < 3 },
];

const HEAT_BG = ['#F9FAFB', '#F3F4F6', '#D1D5DB', '#9CA3AF', '#4B5563', '#111827'];
const HEAT_FG = ['#9CA3AF', '#1F2937', '#1F2937', '#FFFFFF', '#FFFFFF', '#FFFFFF'];
const HEAT_SUB = ['#D1D5DB', '#9CA3AF', '#6B7280', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.5)'];

const velocityOf = (item: InventoryItem): number => {
    const dm = item.computed?.demandMonthly;
    if (typeof dm === 'number' && dm >= 0) return dm;
    return item.AvgQty3M || item.AvgQty6M || item.AvgQty12M || 0;
};

const fmtNum = (n: number) => (n || 0).toLocaleString('vi-VN');
const fmtTr = (v: number) => {
    const m = Math.round((v || 0) / 1_000_000);
    return m > 0 ? m.toLocaleString('vi-VN') + ' Tr' : '—';
};

export const VelocityMatrix = ({ items, resolveMotherGroup, getScopedBOQty, onSelectBand }: Props) => {
    const { groups, cell, max } = useMemo(() => {
        const order = ['KIA', 'MAZDA', 'PEUGEOT', 'BMW', 'HÀN QUỐC', 'NHẬT BẢN', 'CHÂU ÂU'];
        const present = new Set(items.map(resolveMotherGroup));
        const groups = order.filter(g => present.has(g));
        items.forEach(it => {
            const g = resolveMotherGroup(it);
            if (!groups.includes(g)) groups.push(g);
        });

        const cell = (bandId: BandId, group: string) => {
            const band = BANDS.find(b => b.id === bandId)!;
            const rows = items.filter(it =>
                resolveMotherGroup(it) === group && band.test(velocityOf(it)),
            );
            const qty = rows.reduce((s, r) => s + getScopedBOQty(r), 0);
            const val = rows.reduce(
                (s, r) => s + getScopedBOQty(r) * (r.computed?.unitCost || r.UnitCost_PP || 0),
                0,
            );
            return { skus: rows.length, qty, val };
        };

        const max = Math.max(
            1,
            ...BANDS.flatMap(b => groups.map(g => cell(b.id, g).qty)),
        );
        return { groups, cell, max };
    }, [items, resolveMotherGroup, getScopedBOQty]);

    const heat = (q: number): number => {
        if (q === 0) return 0;
        const r = q / max;
        if (r > 0.66) return 5;
        if (r > 0.42) return 4;
        if (r > 0.22) return 3;
        if (r > 0.08) return 2;
        return 1;
    };

    return (
        <section style={CARD}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                    <h3 style={TITLE}>Tốc độ bán × Nguồn cung</h3>
                    <p style={SUBTITLE}>Hàng nợ theo tốc độ bán và nguồn cung</p>
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <span style={LEGEND_LABEL}>Thấp</span>
                    {[1, 2, 3, 4, 5].map(h => (
                        <span key={h} style={{
                            width: 16, height: 8, borderRadius: 2,
                            background: HEAT_BG[h], display: 'inline-block',
                            border: h <= 1 ? '1px solid #E5E7EB' : 'none',
                        }} />
                    ))}
                    <span style={LEGEND_LABEL}>Cao</span>
                </div>
            </header>

            <div
                role="grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: `132px repeat(${groups.length}, 1fr) 1.15fr`,
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    overflow: 'hidden',
                }}
            >
                {/* Column headers */}
                <div style={TH_CORNER} />
                {groups.map(g => (
                    <div key={g} style={TH}>{g}</div>
                ))}
                <div style={{ ...TH, borderRight: 'none' }}>TỔNG</div>

                {/* Data rows */}
                {BANDS.map((b, bi) => {
                    const rowSkus = groups.reduce((s, g) => s + cell(b.id, g).skus, 0);
                    const rowQty  = groups.reduce((s, g) => s + cell(b.id, g).qty,  0);
                    const rowVal  = groups.reduce((s, g) => s + cell(b.id, g).val,  0);
                    const stripe = bi % 2 === 1;
                    return (
                        <React.Fragment key={b.id}>
                            <div
                                style={{ ...TD_LABEL, background: stripe ? '#FAFBFC' : '#FFFFFF', cursor: onSelectBand ? 'pointer' : 'default' }}
                                onClick={() => onSelectBand?.(b.id)}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1F2937' }}>{b.label}</div>
                                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1, letterSpacing: '0.02em' }}>{b.sub}</div>
                                </div>
                            </div>
                            {groups.map(g => {
                                const c = cell(b.id, g);
                                const h = heat(c.qty);
                                const pct = rowQty > 0 ? Math.round(c.qty / rowQty * 100) : 0;
                                return (
                                    <div key={g} style={{ ...TD, background: HEAT_BG[h], position: 'relative' }}>
                                        {c.qty > 0 && (
                                            <span style={{ ...PCT_BADGE, color: HEAT_SUB[h] }}>{pct}%</span>
                                        )}
                                        <div style={{ ...QTY, color: HEAT_FG[h] }}>
                                            {fmtNum(c.qty)}{' '}
                                            <span style={{ fontSize: 10, color: HEAT_SUB[h], fontWeight: 500 }}>· {c.skus} SKU</span>
                                        </div>
                                        <div style={{ ...VAL, color: HEAT_SUB[h] }}>{fmtTr(c.val)}</div>
                                    </div>
                                );
                            })}
                            <div style={{ ...TD_TOTAL, background: stripe ? '#F3F4F6' : '#F9FAFB' }}>
                                <div style={{ ...QTY, color: '#1F2937' }}>
                                    {fmtNum(rowQty)}{' '}
                                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>· {rowSkus} SKU</span>
                                </div>
                                <div style={VAL}>{fmtTr(rowVal)}</div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </section>
    );
};

// ─── Enterprise Design Tokens ───────────────────────────────────────────────

const CARD: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    padding: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    marginBottom: 0,
};

const TITLE: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
    letterSpacing: '-0.01em',
};

const SUBTITLE: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    color: '#9CA3AF',
    margin: '2px 0 0',
    letterSpacing: '0.01em',
};

const LEGEND_LABEL: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: 500,
};

const TH_CORNER: React.CSSProperties = {
    background: '#F1F3F5',
    padding: '8px 12px',
    borderBottom: '1px solid #E5E7EB',
    borderRight: '1px solid #E5E7EB',
};

const TH: React.CSSProperties = {
    background: '#F1F3F5',
    padding: '8px 10px',
    borderBottom: '1px solid #E5E7EB',
    borderRight: '1px solid #E5E7EB',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 700,
    color: '#6B7280',
    textAlign: 'center',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
};

const TD_LABEL: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #F3F4F6',
    borderRight: '1px solid #E5E7EB',
};

const TD: React.CSSProperties = {
    padding: '7px 10px',
    borderBottom: '1px solid rgba(229,231,235,0.5)',
    borderRight: '1px solid rgba(229,231,235,0.3)',
    minHeight: 44,
    fontFamily: "'Inter', system-ui, sans-serif",
};

const TD_TOTAL: React.CSSProperties = {
    padding: '7px 10px',
    borderBottom: '1px solid #F3F4F6',
    borderRight: 'none',
    minHeight: 44,
};

const QTY: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontVariantNumeric: 'tabular-nums',
    fontSize: 13,
    fontWeight: 600,
    color: '#1F2937',
    lineHeight: 1.3,
};

const VAL: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontVariantNumeric: 'tabular-nums',
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
    lineHeight: 1.3,
};

const PCT_BADGE: React.CSSProperties = {
    position: 'absolute',
    top: 5,
    right: 6,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '-0.02em',
};
