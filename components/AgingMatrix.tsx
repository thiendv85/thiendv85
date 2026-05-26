/**
 * AgingMatrix — Ma trận tuổi nợ × nguồn cung cho V16.
 * Design: SAP Fiori + Stripe + Oracle SCM enterprise style.
 */
import React, { useMemo } from 'react';
import { InventoryItem, BackorderDetail } from '../types/inventory';

interface Props {
    items: InventoryItem[];
    resolveMotherGroup: (item: InventoryItem) => string;
    getScopedBreakdown: (item: InventoryItem) => BackorderDetail[];
    now: number;
    onSelectBucket?: (b: '30' | '60' | '90' | 'over90') => void;
}

const BUCKETS = [
    { id: '30',     label: '≤ 30 ngày', test: (d: number) => d <= 30 },
    { id: '60',     label: '31 – 60',   test: (d: number) => d > 30 && d <= 60 },
    { id: '90',     label: '61 – 90',   test: (d: number) => d > 60 && d <= 90 },
    { id: 'over90', label: '> 90 ngày', test: (d: number) => d > 90 },
] as const;
type BucketId = (typeof BUCKETS)[number]['id'];

const HEAT_BG = ['#F9FAFB', '#F3F4F6', '#D1D5DB', '#9CA3AF', '#4B5563', '#111827'];
const HEAT_FG = ['#9CA3AF', '#1F2937', '#1F2937', '#FFFFFF', '#FFFFFF', '#FFFFFF'];
const HEAT_SUB = ['#D1D5DB', '#9CA3AF', '#6B7280', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.5)'];
const DAY_MS = 86_400_000;

const fmtNum = (n: number) => (n || 0).toLocaleString('vi-VN');
const fmtTr  = (v: number) => {
    const m = Math.round((v || 0) / 1_000_000);
    return m > 0 ? m.toLocaleString('vi-VN') + ' Tr' : '—';
};

export const AgingMatrix = ({ items, resolveMotherGroup, getScopedBreakdown, now, onSelectBucket }: Props) => {
    const { groups, cell, rowOrders, colOrders, max } = useMemo(() => {
        const order = ['KIA', 'MAZDA', 'PEUGEOT', 'BMW', 'HÀN QUỐC', 'NHẬT BẢN', 'CHÂU ÂU'];
        const present = new Set(items.map(resolveMotherGroup));
        const groups: string[] = order.filter(g => present.has(g));
        items.forEach(it => {
            const g = resolveMotherGroup(it);
            if (!groups.includes(g)) groups.push(g);
        });

        const cell = (bid: BucketId, group: string) => {
            const test = BUCKETS.find(b => b.id === bid)!.test;
            let qty = 0, val = 0;
            const docs = new Set<string>();
            for (const it of items) {
                if (resolveMotherGroup(it) !== group) continue;
                const unit = it.computed?.unitCost || it.UnitCost_PP || 0;
                for (const bo of getScopedBreakdown(it)) {
                    const ts = bo.RawDate || 0;
                    if (ts <= 0) continue;
                    const days = (now - ts) / DAY_MS;
                    if (!test(days)) continue;
                    qty += bo.Qty || 0;
                    val += (bo.Qty || 0) * unit;
                    if (bo.DocNo) docs.add(bo.DocNo);
                }
            }
            return { qty, val, orders: docs.size };
        };

        // Unique orders per group across all buckets
        const rowOrders = (group: string) => {
            const docs = new Set<string>();
            for (const it of items) {
                if (resolveMotherGroup(it) !== group) continue;
                for (const bo of getScopedBreakdown(it)) {
                    if ((bo.RawDate || 0) <= 0) continue;
                    if (bo.DocNo) docs.add(bo.DocNo);
                }
            }
            return docs.size;
        };

        // Unique orders per bucket across all groups
        const colOrders = (bid: BucketId) => {
            const test = BUCKETS.find(b => b.id === bid)!.test;
            const docs = new Set<string>();
            for (const it of items) {
                for (const bo of getScopedBreakdown(it)) {
                    const ts = bo.RawDate || 0;
                    if (ts <= 0) continue;
                    const days = (now - ts) / DAY_MS;
                    if (test(days) && bo.DocNo) docs.add(bo.DocNo);
                }
            }
            return docs.size;
        };

        const max = Math.max(1, ...BUCKETS.flatMap(b => groups.map(g => cell(b.id, g).qty)));
        return { groups, cell, rowOrders, colOrders, max };
    }, [items, resolveMotherGroup, getScopedBreakdown, now]);

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
                    <h3 style={TITLE}>Tuổi nợ × Nguồn cung</h3>
                    <p style={SUBTITLE}>Phân bố hàng nợ theo nhóm hãng và khoảng tuổi</p>
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <span style={LEGEND_LABEL}>Thấp</span>
                    {[1, 2, 3, 4, 5].map(h => (
                        <span key={h} style={{ width: 16, height: 8, borderRadius: 2, background: HEAT_BG[h], display: 'inline-block', border: h <= 1 ? '1px solid #E5E7EB' : 'none' }} />
                    ))}
                    <span style={LEGEND_LABEL}>Cao</span>
                </div>
            </header>

            <div role="grid" style={{
                display: 'grid',
                gridTemplateColumns: `132px repeat(${BUCKETS.length}, 1fr) 1.15fr`,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                overflow: 'hidden',
            }}>
                {/* Column headers */}
                <div style={TH_CORNER} />
                {BUCKETS.map(b => (
                    <div key={b.id}
                         style={{ ...TH, cursor: onSelectBucket ? 'pointer' : 'default' }}
                         onClick={() => onSelectBucket?.(b.id)}>
                        {b.label}
                    </div>
                ))}
                <div style={{ ...TH, borderRight: 'none' }}>TỔNG</div>

                {/* Data rows */}
                {groups.map((g, gi) => {
                    const row = BUCKETS.map(b => cell(b.id, g));
                    const rowQty = row.reduce((s, c) => s + c.qty, 0);
                    const rowVal = row.reduce((s, c) => s + c.val, 0);
                    const stripe = gi % 2 === 1;
                    return (
                        <React.Fragment key={g}>
                            <div style={{ ...TD_LABEL, background: stripe ? '#FAFBFC' : '#FFFFFF' }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: '#1F2937' }}>{g}</span>
                            </div>
                            {row.map((c, i) => {
                                const h = heat(c.qty);
                                const pct = rowQty > 0 ? Math.round(c.qty / rowQty * 100) : 0;
                                return (
                                    <div key={i} style={{ ...TD, background: HEAT_BG[h], position: 'relative' }}>
                                        {c.qty > 0 && (
                                            <span style={{ ...PCT_BADGE, color: HEAT_SUB[h] }}>{pct}%</span>
                                        )}
                                        <div style={{ ...QTY, color: HEAT_FG[h] }}>{fmtNum(c.qty)}</div>
                                        {c.orders > 0 && (
                                            <div style={{ ...SKU_LINE, color: HEAT_SUB[h] }}>{c.orders} đơn</div>
                                        )}
                                        <div style={{ ...VAL, color: HEAT_SUB[h] }}>{fmtTr(c.val)}</div>
                                    </div>
                                );
                            })}
                            <div style={{ ...TD_TOTAL, background: stripe ? '#F3F4F6' : '#F9FAFB' }}>
                                <div style={{ ...QTY, color: '#1F2937' }}>{fmtNum(rowQty)}</div>
                                {rowOrders(g) > 0 && (
                                    <div style={{ ...SKU_LINE, color: '#9CA3AF' }}>{rowOrders(g)} đơn</div>
                                )}
                                <div style={VAL}>{fmtTr(rowVal)}</div>
                            </div>
                        </React.Fragment>
                    );
                })}

                {/* Grand total row */}
                {(() => {
                    const colTotals = BUCKETS.map(b => {
                        let qty = 0, val = 0;
                        for (const g of groups) { const c = cell(b.id, g); qty += c.qty; val += c.val; }
                        return { qty, val };
                    });
                    const grandQty = colTotals.reduce((s, c) => s + c.qty, 0);
                    const grandVal = colTotals.reduce((s, c) => s + c.val, 0);
                    return (
                        <>
                            <div style={TFOOT_LABEL}>TỔNG CỘNG</div>
                            {colTotals.map((c, i) => (
                                <div key={i} style={TFOOT}>
                                    <div style={{ ...QTY, fontWeight: 700, color: '#111827' }}>{fmtNum(c.qty)}</div>
                                    {colOrders(BUCKETS[i].id) > 0 && (
                                        <div style={{ ...SKU_LINE, color: '#9CA3AF' }}>{colOrders(BUCKETS[i].id)} đơn</div>
                                    )}
                                    <div style={{ ...VAL, color: '#6B7280' }}>{fmtTr(c.val)}</div>
                                </div>
                            ))}
                            <div style={{ ...TFOOT, background: '#E5E7EB', borderRight: 'none' }}>
                                <div style={{ ...QTY, fontWeight: 700, color: '#111827', fontSize: 14 }}>{fmtNum(grandQty)}</div>
                                {(() => { const docs = new Set(items.flatMap(it => getScopedBreakdown(it).filter(bo => (bo.RawDate || 0) > 0 && bo.DocNo).map(bo => bo.DocNo!))); return docs.size > 0 ? <div style={{ ...SKU_LINE, color: '#6B7280' }}>{docs.size} đơn</div> : null; })()}
                                <div style={{ ...VAL, color: '#4B5563' }}>{fmtTr(grandVal)}</div>
                            </div>
                        </>
                    );
                })()}
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
    display: 'flex',
    alignItems: 'center',
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

const TFOOT_LABEL: React.CSSProperties = {
    background: '#F1F3F5',
    padding: '8px 12px',
    borderRight: '1px solid #E5E7EB',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 700,
    color: '#1F2937',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
};

const TFOOT: React.CSSProperties = {
    background: '#F1F3F5',
    padding: '7px 10px',
    borderRight: '1px solid #E5E7EB',
};

const QTY: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontVariantNumeric: 'tabular-nums',
    fontSize: 13,
    fontWeight: 600,
    color: '#1F2937',
    lineHeight: 1.3,
};

const SKU_LINE: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 10,
    fontWeight: 600,
    marginTop: 1,
    lineHeight: 1.3,
    letterSpacing: '0.02em',
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
