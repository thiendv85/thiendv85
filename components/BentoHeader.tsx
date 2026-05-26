import React, { useMemo } from 'react';
import { InventoryItem } from '../types/inventory';

interface Props {
    items: InventoryItem[];
    sparkline?: number[];
    actions?: React.ReactNode;
}

const fmtNum = (n: number) => (n || 0).toLocaleString('vi-VN');
const fmtTr = (v: number) => Math.round((v || 0) / 1_000_000).toLocaleString('vi-VN');

export const BentoHeader = ({ items, sparkline, actions }: Props) => {
    const totals = useMemo(() => {
        let qty = 0, val = 0, critQty = 0, critVal = 0, oldQty = 0, oldVal = 0;
        let skusCrit = 0;
        for (const it of items) {
            const u = it.computed?.unitCost || it.UnitCost_PP || 0;
            const b = it.computed?.boAging;
            const total = it.Backorder || b?.totalQty || 0;
            qty += total; val += total * u;
            const over = b?.qtyOver90 || 0;
            const nine = b?.qty90 || 0;
            oldQty += over + nine; oldVal += (over + nine) * u;
            if ((b?.oldestDebtDays || 0) > 90) { critQty += total; critVal += total * u; skusCrit++; }
        }
        return { qty, val, critQty, critVal, oldQty, oldVal, skus: items.length, skusCrit };
    }, [items]);

    const tiles: Array<{ label: string; value: string; sub: string; accent?: boolean; warn?: boolean }> = [
        { label: 'SKU đang nợ', value: fmtNum(totals.skus), sub: `${fmtNum(totals.skusCrit)} critical` },
        { label: 'Tổng SL nợ', value: fmtNum(totals.qty), sub: `${fmtTr(totals.val)} Tr ₫` },
        { label: 'Nợ > 60 ngày', value: fmtNum(totals.oldQty), sub: `${fmtTr(totals.oldVal)} Tr ₫`, warn: true },
        { label: 'Critical >90d', value: fmtNum(totals.critQty), sub: `${fmtTr(totals.critVal)} Tr ₫`, accent: true },
    ];

    return (
        <section className="bo-tile-feature" style={{ padding: '20px 24px 18px', position: 'relative' }}>
            {actions && (
                <div style={{ position: 'absolute', top: 16, right: 20, display: 'flex', gap: 8, alignItems: 'center', zIndex: 5 }}>
                    {actions}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                {sparkline && (
                    <div style={{ width: 200, minWidth: 160, marginRight: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div className="bo-eyebrow" style={{ fontSize: 11, marginBottom: 10 }}>Xu hướng 12 tháng</div>
                        <Spark data={sparkline} />
                    </div>
                )}

                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 0,
                }}>
                    {tiles.map((t, i) => (
                        <div key={t.label} style={{
                            padding: '0 20px',
                            borderLeft: i > 0 ? '1px solid rgba(244, 226, 180, 0.12)' : 'none',
                        }}>
                            <div style={{
                                fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                                textTransform: 'uppercase' as const,
                                color: 'rgba(244, 226, 180, 0.5)',
                                marginBottom: 6,
                            }}>{t.label}</div>
                            <div className="bo-metric-xl" style={{
                                fontFamily: "var(--bo-font-display)",
                                fontSize: 28, fontWeight: 800, lineHeight: 1.1,
                                fontVariantNumeric: 'tabular-nums',
                            }}>{t.value}</div>
                            <div style={{
                                marginTop: 4, fontSize: 12.5,
                                color: t.accent ? 'var(--bo-accent)' : t.warn ? 'rgba(229, 180, 49, 0.7)' : 'rgba(244, 241, 235, 0.5)',
                                fontWeight: 600,
                                fontFamily: "var(--bo-font-mono)",
                                fontVariantNumeric: 'tabular-nums',
                            }}>{t.sub}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const Spark = ({ data }: { data: number[] }) => {
    const max = Math.max(...data, 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
            {data.map((v, i) => (
                <div key={i} style={{
                    flex: 1,
                    height: `${Math.max(3, (v / max) * 44)}px`,
                    background: i === data.length - 1
                        ? 'var(--bo-accent)'
                        : 'rgba(244, 226, 180, 0.22)',
                    borderRadius: 2,
                    transition: 'height 400ms ease',
                }} />
            ))}
        </div>
    );
};
