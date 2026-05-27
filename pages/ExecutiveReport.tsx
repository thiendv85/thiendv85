import React, { useMemo, useRef } from 'react';
import { InventoryItem, SourceProfile, LoisProfile } from '../types/inventory';
import { FaIcon } from '../components/Icon';

// ── Types ──
interface Props {
    data: InventoryItem[];
    enrichedData: InventoryItem[];
    appSettings: {
        sourceProfiles?: SourceProfile[];
        loisProfiles?: LoisProfile[];
        activeSourceId?: string;
    };
}

interface GrandStats {
    totalSKUs: number;
    turnover: number;
    stockValue: number;
    poValue: number;
    oosCount: number;
    riskCount: number;
    excessValue: number;
    excessPct: number;
    excessItems: number;
    boItems: number;
    boValue: number;
    mosAvg: number;
    dealerStock: number;
    // Research-based metrics (2026-05-22)
    wmape: number; // Weighted MAPE — forecast accuracy error %
    bias: number; // Forecast bias % (dương = over-forecast)
    capitalTurn: number; // Vòng quay vốn = turnover / stockValue (lần/năm)
    serviceScore: number; // 0-100
    efficiencyScore: number; // 0-100
    freshnessScore: number; // 0-100
    healthScore: number; // 0-100 composite
}

interface LoisRow {
    label: string;
    items: number;
    turnover: number;
    turnoverPct: number;
    stockVal: number;
    mos: number;
    poVal: number;
    oosCount: number;
    riskCount: number;
    excessVal: number;
    excessPct: number;
    boItems: number;
    boValue: number;
    trend: number;
}

interface AgingBucket {
    qty30: number;
    qty60: number;
    qty90: number;
    qtyOver90: number;
    totalQty: number;
    totalValue: number;
}

// ── Helpers ──
const fmtM = (v: number) => {
    const m = Math.round((v || 0) / 1_000_000);
    return m.toLocaleString('vi-VN') + ' tr';
};
const fmtN = (v: number) => (v || 0).toLocaleString('vi-VN');
const pct = (v: number) => (v || 0).toFixed(1) + '%';

// ── SVG Charts ──
const SparklineSVG = ({ data, width = 260, height = 60 }: { data: number[]; width?: number; height?: number }) => {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data
        .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 8) - 4}`)
        .join(' ');
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const avgY = height - ((avg - min) / range) * (height - 8) - 4;
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block' }}
            role="img"
            aria-label="Biểu đồ sparkline"
        >
            <line x1={0} y1={avgY} x2={width} y2={avgY} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="3,3" />
            <polyline
                points={points}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {data.map((v, i) => {
                const x = (i / (data.length - 1)) * width;
                const y = height - ((v - min) / range) * (height - 8) - 4;
                return (
                    <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={i === data.length - 1 ? 3.5 : 2}
                        fill={i === data.length - 1 ? '#3b82f6' : '#cbd5e1'}
                    />
                );
            })}
        </svg>
    );
};

const PieChartSVG = ({
    slices,
    size = 120,
}: {
    slices: { label: string; value: number; color: string }[];
    size?: number;
}) => {
    const total = slices.reduce((a, s) => a + s.value, 0) || 1;
    const r = size / 2 - 2;
    const cx = size / 2;
    const cy = size / 2;
    let cumAngle = -Math.PI / 2;
    const paths = slices
        .filter(s => s.value > 0)
        .map(s => {
            const angle = (s.value / total) * 2 * Math.PI;
            const x1 = cx + r * Math.cos(cumAngle);
            const y1 = cy + r * Math.sin(cumAngle);
            cumAngle += angle;
            const x2 = cx + r * Math.cos(cumAngle);
            const y2 = cy + r * Math.sin(cumAngle);
            const large = angle > Math.PI ? 1 : 0;
            return (
                <path
                    key={s.label}
                    d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
                    fill={s.color}
                    stroke="white"
                    strokeWidth={1}
                />
            );
        });
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ display: 'block' }}
            role="img"
            aria-label="Biểu đồ tròn"
        >
            {paths}
        </svg>
    );
};

const BarChartSVG = ({
    buckets,
    width = 220,
    height = 60,
}: {
    buckets: { label: string; value: number; color: string }[];
    width?: number;
    height?: number;
}) => {
    const max = Math.max(...buckets.map(b => b.value), 1);
    const gap = 4;
    const bw = (width - gap * (buckets.length - 1)) / buckets.length;
    return (
        <svg
            width={width}
            height={height + 14}
            viewBox={`0 0 ${width} ${height + 14}`}
            style={{ display: 'block' }}
            role="img"
            aria-label="Biểu đồ cột"
        >
            {buckets.map((b, i) => {
                const h = Math.max(2, (b.value / max) * height);
                const x = i * (bw + gap);
                return (
                    <g key={b.label}>
                        <rect x={x} y={height - h} width={bw} height={h} rx={2} fill={b.color} />
                        <text
                            x={x + bw / 2}
                            y={height + 11}
                            textAnchor="middle"
                            fontSize={7}
                            fill="#64748b"
                            fontWeight={600}
                        >
                            {b.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

// ── Rule-based Commentary ──
const generateCommentary = (stats: GrandStats, loisRows: LoisRow[], aging: AgingBucket): string[] => {
    const bullets: string[] = [];

    // OOS warning
    if (stats.oosCount > 0) {
        const worstLois = [...loisRows].sort((a, b) => b.oosCount - a.oosCount)[0];
        bullets.push(
            `⚠️ ${stats.oosCount} SKU hết hàng (OOS)${worstLois?.oosCount > 0 ? `, tập trung nhóm ${worstLois.label} (${worstLois.oosCount} SKU)` : ''}.`,
        );
    }

    // Excess warning
    if (stats.excessPct > 15) {
        bullets.push(
            `📦 Tỷ lệ tồn dư ${pct(stats.excessPct)} vượt ngưỡng 15%. Giá trị dư thừa: ${fmtM(stats.excessValue)}.`,
        );
    } else if (stats.excessPct > 10) {
        bullets.push(`📊 Tỷ lệ tồn dư ${pct(stats.excessPct)} — trong tầm kiểm soát nhưng cần theo dõi.`);
    }

    // MOS insight
    if (stats.mosAvg > 6) {
        bullets.push(
            `🔴 MOS trung bình ${stats.mosAvg.toFixed(1)} tháng — vốn tồn kho cao, cần xem xét giảm đặt hàng.`,
        );
    } else if (stats.mosAvg > 3) {
        bullets.push(`🟡 MOS trung bình ${stats.mosAvg.toFixed(1)} tháng — mức tồn kho chấp nhận được.`);
    } else {
        bullets.push(`🟢 MOS trung bình ${stats.mosAvg.toFixed(1)} tháng — tồn kho gọn, cần đảm bảo không thiếu hàng.`);
    }

    // Backorder
    if (stats.boItems > 0) {
        bullets.push(`🔄 ${fmtN(stats.boItems)} SKU có nợ hàng, tổng giá trị: ${fmtM(stats.boValue)}.`);
    }

    // Aging
    if (aging.qtyOver90 > 0) {
        bullets.push(`⏰ ${fmtN(aging.qtyOver90)} đơn nợ >90 ngày — cần ưu tiên giải quyết.`);
    }

    // PO pipeline
    if (stats.poValue > 0) {
        const poPct = stats.stockValue > 0 ? (stats.poValue / stats.stockValue) * 100 : 0;
        bullets.push(`🚢 Pipeline PO: ${fmtM(stats.poValue)} (${pct(poPct)} so với tồn kho hiện hữu).`);
    }

    // Forecast accuracy
    if (stats.wmape > 40) {
        bullets.push(`🎯 WMAPE ${stats.wmape.toFixed(1)}% — dự báo sai lệch cao, cần review mô hình forecast.`);
    } else if (stats.wmape > 0 && stats.wmape <= 20) {
        bullets.push(`🎯 WMAPE ${stats.wmape.toFixed(1)}% — dự báo chính xác tốt.`);
    }
    if (Math.abs(stats.bias) > 10) {
        bullets.push(
            `📐 Bias ${stats.bias > 0 ? '+' : ''}${stats.bias.toFixed(1)}% — dự báo ${stats.bias > 0 ? 'cao hơn' : 'thấp hơn'} thực tế hệ thống, cần hiệu chỉnh.`,
        );
    }

    // Health score
    if (stats.healthScore < 50) {
        bullets.push(`🔴 Điểm sức khỏe tồn kho ${stats.healthScore.toFixed(0)}/100 — cần hành động khẩn.`);
    } else if (stats.healthScore >= 75) {
        bullets.push(`🟢 Điểm sức khỏe tồn kho ${stats.healthScore.toFixed(0)}/100 — vận hành tốt.`);
    }

    return bullets.length > 0 ? bullets : ['✅ Hệ thống hoạt động ổn định, không có cảnh báo đáng chú ý.'];
};

// ── Main Component ──
export const ExecutiveReport = ({ data, enrichedData, appSettings }: Props) => {
    const printRef = useRef<HTMLDivElement>(null);
    const loisProfiles = appSettings?.loisProfiles || [];

    // Brand label
    const brandLabel = useMemo(() => {
        const brands = Array.from(new Set(data.map(i => i.BrandName).filter(Boolean)));
        const sources = Array.from(new Set(data.map(i => i.SourceId).filter(Boolean)));
        if (brands.length === 1 && sources.length === 1) {
            const p = appSettings?.sourceProfiles?.find(
                p =>
                    p.brand?.toLowerCase() === (brands[0] ?? '').toLowerCase() &&
                    (p.id.toUpperCase() === (sources[0] ?? '').toUpperCase() ||
                        p.name.toLowerCase().includes((sources[0] ?? '').toLowerCase())),
            );
            if (p) return `${p.brand} · ${p.id} – ${p.name}`;
            return `${brands[0]} · ${sources[0]}`;
        }
        if (brands.length === 1) return `${brands[0]} · ${sources.length} nguồn`;
        if (brands.length > 1) return `Hỗn hợp · ${brands.length} thương hiệu`;
        return 'Tất cả thương hiệu';
    }, [data, appSettings]);

    // LOIS hierarchy
    const loisHierarchy = useMemo(() => {
        const groups: Record<string, string[]> = {};
        loisProfiles.forEach(p => {
            const pg = p.parentGroup || 'U';
            if (!groups[pg]) groups[pg] = [];
            groups[pg].push(p.id);
        });
        return Object.entries(groups).map(([label, sub]) => ({ label, sub }));
    }, [loisProfiles]);

    // Compute all stats in single pass
    const { stats, loisRows, aging, sparklineData, mosBuckets, loisSlices } = useMemo(() => {
        const matrix: Record<
            string,
            {
                items: number;
                turnover: number;
                stockVal: number;
                poVal: number;
                oosCount: number;
                riskCount: number;
                excessVal: number;
                excessItems: number;
                boItems: number;
                boValue: number;
                trendSum: number;
                trendCount: number;
            }
        > = {};
        let turnover = 0,
            stockValue = 0,
            poValue = 0,
            oosCount = 0,
            riskCount = 0;
        let excessValue = 0,
            excessItems = 0,
            boItems = 0,
            boValue = 0;
        let mosSum = 0,
            mosCount = 0,
            dealerStock = 0;
        // Forecast accuracy accumulators (WMAPE + Bias) — recent month actual vs BaseForecast
        let sumAbsErr = 0,
            sumActual = 0,
            sumSignedErr = 0;
        const agingAcc: AgingBucket = { qty30: 0, qty60: 0, qty90: 0, qtyOver90: 0, totalQty: 0, totalValue: 0 };
        // MOS distribution
        const mosDistribution = { '<1': 0, '1-3': 0, '3-6': 0, '6-12': 0, '>12': 0 };
        // Monthly turnover for sparkline
        const monthlyTurnover = new Array(12).fill(0);

        for (const item of enrichedData) {
            const c = item.computed;
            if (!c) continue;
            const unitCost = c.unitCost || item.UnitCost_PP || 0;
            const sales12M = item.SalesHistory.reduce((a, b) => a + b, 0);
            const turnVal = sales12M * unitCost;
            const sub = item.LOISGroup || 'U';

            turnover += turnVal;
            stockValue += c.stockValue || 0;
            poValue += (item.TotalPO || 0) * unitCost;
            dealerStock += (item.DealerInventory || 0) * unitCost;

            if (c.available <= 0 && item.BaseForecast > 0.02) oosCount++;
            if (c.stockoutRiskFlag) riskCount++;
            if ((c.excessQty || 0) > 0) {
                excessItems++;
                excessValue += c.excessValue || 0;
            }

            const isBO = (item.Backorder || 0) > (c.available || 0);
            if (isBO) {
                boItems++;
                boValue += Math.max(0, (item.Backorder || 0) - (c.available || 0)) * unitCost;
            }

            // MOS
            const mos = c.mos ?? (turnVal > 0 ? ((c.stockValue || 0) * 12) / turnVal : 0);
            if (mos > 0) {
                mosSum += mos;
                mosCount++;
            }
            if (mos < 1) mosDistribution['<1']++;
            else if (mos <= 3) mosDistribution['1-3']++;
            else if (mos <= 6) mosDistribution['3-6']++;
            else if (mos <= 12) mosDistribution['6-12']++;
            else mosDistribution['>12']++;

            // Sparkline: monthly sales value
            item.SalesHistory.forEach((q, i) => {
                monthlyTurnover[i] += q * unitCost;
            });

            // Forecast accuracy: actual = tháng gần nhất, forecast = BaseForecast (monthly)
            const actualRecent = item.SalesHistory.length > 0 ? item.SalesHistory[item.SalesHistory.length - 1] : 0;
            const forecastMonthly = item.BaseForecast || 0;
            if (actualRecent > 0 || forecastMonthly > 0) {
                sumAbsErr += Math.abs(actualRecent - forecastMonthly);
                sumActual += actualRecent;
                sumSignedErr += forecastMonthly - actualRecent;
            }

            // Aging
            const ba = c.boAging;
            if (ba) {
                agingAcc.qty30 += ba.qty30 || 0;
                agingAcc.qty60 += ba.qty60 || 0;
                agingAcc.qty90 += ba.qty90 || 0;
                agingAcc.qtyOver90 += ba.qtyOver90 || 0;
                agingAcc.totalQty += ba.totalQty || 0;
                agingAcc.totalValue += ba.totalValue || 0;
            }

            // LOIS matrix
            const last6 = item.SalesHistory.slice(-6).reduce((a, b) => a + b, 0);
            const first6 = item.SalesHistory.slice(0, 6).reduce((a, b) => a + b, 0);
            const trend = first6 > 0 ? ((last6 - first6) / first6) * 100 : 0;

            if (!matrix[sub])
                matrix[sub] = {
                    items: 0,
                    turnover: 0,
                    stockVal: 0,
                    poVal: 0,
                    oosCount: 0,
                    riskCount: 0,
                    excessVal: 0,
                    excessItems: 0,
                    boItems: 0,
                    boValue: 0,
                    trendSum: 0,
                    trendCount: 0,
                };
            const m = matrix[sub];
            m.items++;
            m.turnover += turnVal;
            m.stockVal += c.stockValue || 0;
            m.poVal += (item.TotalPO || 0) * unitCost;
            if (c.available <= 0 && item.BaseForecast > 0.02) m.oosCount++;
            if (c.stockoutRiskFlag) m.riskCount++;
            if ((c.excessQty || 0) > 0) {
                m.excessItems++;
                m.excessVal += c.excessValue || 0;
            }
            if (isBO) {
                m.boItems++;
                m.boValue += Math.max(0, (item.Backorder || 0) - (c.available || 0)) * unitCost;
            }
            m.trendSum += trend;
            m.trendCount++;
        }

        const mosAvg = mosCount > 0 ? mosSum / mosCount : 0;
        const excessPct = stockValue > 0 ? (excessValue / stockValue) * 100 : 0;
        const skuCount = enrichedData.length || 1;

        // WMAPE = Σ|A−F| / ΣA × 100 (chuẩn ngành 2026, ổn định cho SKU bán chậm)
        const wmape = sumActual > 0 ? (sumAbsErr / sumActual) * 100 : 0;
        // Bias = Σ(F−A) / ΣA × 100 (dương = over-forecast)
        const bias = sumActual > 0 ? (sumSignedErr / sumActual) * 100 : 0;
        // Capital Turn = turnover (giá vốn) / stockValue — vòng quay vốn tồn/năm
        const capitalTurn = stockValue > 0 ? turnover / stockValue : 0;

        // Composite Health Score (research formula)
        const oosPct = (oosCount / skuCount) * 100;
        const riskPct = (riskCount / skuCount) * 100;
        const serviceScore = Math.max(0, Math.min(100, 100 - oosPct - riskPct * 0.5));
        // Efficiency: MOS trong khoảng tối ưu [2, 4] tháng → 100, lệch → giảm dần
        const MOS_LOW = 2,
            MOS_HIGH = 4;
        const efficiencyScore = Math.max(
            0,
            Math.min(
                100,
                mosAvg < MOS_LOW
                    ? 100 - (MOS_LOW - mosAvg) * 25
                    : mosAvg > MOS_HIGH
                      ? 100 - (mosAvg - MOS_HIGH) * 15
                      : 100,
            ),
        );
        const freshnessScore = Math.max(0, Math.min(100, 100 - excessPct));
        // Weighted composite: Service 40% / Efficiency 30% / Freshness 30%
        const healthScore = serviceScore * 0.4 + efficiencyScore * 0.3 + freshnessScore * 0.3;

        const grandStats: GrandStats = {
            totalSKUs: enrichedData.length,
            turnover,
            stockValue,
            poValue,
            oosCount,
            riskCount,
            excessValue,
            excessPct,
            excessItems,
            boItems,
            boValue,
            mosAvg,
            dealerStock,
            wmape,
            bias,
            capitalTurn,
            serviceScore,
            efficiencyScore,
            freshnessScore,
            healthScore,
        };

        // Build LOIS rows
        const loisColors = ['#3b82f6', '#f59e0b', '#64748b', '#10b981', '#a78bfa'];
        const rows: LoisRow[] = [];
        const slices: { label: string; value: number; color: string }[] = [];
        loisHierarchy.forEach((g, gi) => {
            let gItems = 0,
                gTurnover = 0,
                gStockVal = 0,
                gPoVal = 0,
                gOOS = 0,
                gRisk = 0,
                gExVal = 0,
                gBO = 0,
                gBOVal = 0,
                gTrendSum = 0,
                gTrendCount = 0;
            g.sub.forEach(k => {
                const m = matrix[k];
                if (!m) return;
                gItems += m.items;
                gTurnover += m.turnover;
                gStockVal += m.stockVal;
                gPoVal += m.poVal;
                gOOS += m.oosCount;
                gRisk += m.riskCount;
                gExVal += m.excessVal;
                gBO += m.boItems;
                gBOVal += m.boValue;
                gTrendSum += m.trendSum;
                gTrendCount += m.trendCount;
            });
            if (gItems === 0) return;
            const mos = gTurnover > 0 ? (gStockVal * 12) / gTurnover : 0;
            const exPct = gStockVal > 0 ? (gExVal / gStockVal) * 100 : 0;
            const tPct = turnover > 0 ? (gTurnover / turnover) * 100 : 0;
            const trend = gTrendCount > 0 ? gTrendSum / gTrendCount : 0;
            rows.push({
                label: g.label,
                items: gItems,
                turnover: gTurnover,
                turnoverPct: tPct,
                stockVal: gStockVal,
                mos,
                poVal: gPoVal,
                oosCount: gOOS,
                riskCount: gRisk,
                excessVal: gExVal,
                excessPct: exPct,
                boItems: gBO,
                boValue: gBOVal,
                trend,
            });
            slices.push({ label: g.label, value: gTurnover, color: loisColors[gi % loisColors.length] });
        });

        const mosBucketsArr = [
            { label: '<1M', value: mosDistribution['<1'], color: '#ef4444' },
            { label: '1-3M', value: mosDistribution['1-3'], color: '#22c55e' },
            { label: '3-6M', value: mosDistribution['3-6'], color: '#f59e0b' },
            { label: '6-12M', value: mosDistribution['6-12'], color: '#f97316' },
            { label: '>12M', value: mosDistribution['>12'], color: '#dc2626' },
        ];

        return {
            stats: grandStats,
            loisRows: rows,
            aging: agingAcc,
            sparklineData: monthlyTurnover,
            mosBuckets: mosBucketsArr,
            loisSlices: slices,
        };
    }, [enrichedData, loisHierarchy]);

    const commentary = useMemo(() => generateCommentary(stats, loisRows, aging), [stats, loisRows, aging]);

    const dateStr = new Date().toLocaleDateString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const handlePrint = () => {
        const el = printRef.current;
        if (!el) return;
        const w = window.open('', '_blank', 'width=1200,height=800');
        if (!w) return alert('Trình duyệt đã chặn popup. Hãy cho phép popup để in.');
        w.document.write(`<!DOCTYPE html><html lang="vi"><head>
            <meta charset="UTF-8"><title>Báo cáo Tổng hợp KPI – ${dateStr}</title>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700;900&display=swap" rel="stylesheet">
            <style>
                @page { size: A4 landscape; margin: 8mm; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Noto Sans', sans-serif; font-size: 8pt; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .report { padding: 0; }
                ${el.querySelector('style')?.textContent || ''}
            </style>
        </head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
    };

    // KPI cards config
    const kpiCards = [
        { label: 'Doanh số 12 tháng', value: fmtM(stats.turnover), icon: 'fa-chart-line', color: '#3b82f6' },
        { label: 'Tồn kho hiện hữu', value: fmtM(stats.stockValue), icon: 'fa-warehouse', color: '#10b981' },
        { label: 'PO Pipeline', value: fmtM(stats.poValue), icon: 'fa-ship', color: '#6366f1' },
        {
            label: 'Hết hàng (OOS)',
            value: fmtN(stats.oosCount),
            icon: 'fa-circle-xmark',
            color: '#ef4444',
            alert: stats.oosCount > 0,
        },
        {
            label: 'Tồn dư thừa',
            value: fmtM(stats.excessValue),
            sub: pct(stats.excessPct),
            icon: 'fa-box-open',
            color: '#f59e0b',
            alert: stats.excessPct > 15,
        },
        {
            label: 'Nợ hàng (BO)',
            value: fmtN(stats.boItems),
            sub: fmtM(stats.boValue),
            icon: 'fa-clock-rotate-left',
            color: '#dc2626',
            alert: stats.boItems > 0,
        },
    ];

    return (
        <div className="animate-fadeIn space-y-4 pb-32">
            {/* Screen Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl text-white p-6 shadow-xl border border-white/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                            <FaIcon className="fas fa-file-chart-line text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight uppercase">Báo Cáo Tổng Hợp KPI</h1>
                            <p className="text-white/50 text-xs font-medium">
                                {brandLabel} · {dateStr}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 transition-all text-sm font-bold"
                    >
                        <FaIcon className="fas fa-print" /> In báo cáo
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {kpiCards.map(c => (
                    <div
                        key={c.label}
                        className={`rounded-xl border p-4 ${c.alert ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'} shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <FaIcon className={`fas ${c.icon} text-sm`} style={{ color: c.color }} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {c.label}
                            </span>
                        </div>
                        <div className="text-xl font-black text-slate-900">{c.value}</div>
                        {c.sub && <div className="text-xs text-slate-500 font-semibold mt-0.5">{c.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Xu hướng doanh số 12 tháng
                    </h3>
                    <SparklineSVG data={sparklineData} width={300} height={70} />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Phân bổ LOIS (theo doanh số)
                    </h3>
                    <div className="flex items-center gap-4">
                        <PieChartSVG slices={loisSlices} size={100} />
                        <div className="space-y-1">
                            {loisSlices.map(s => (
                                <div key={s.label} className="flex items-center gap-2 text-xs">
                                    <div className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                                    <span className="font-bold text-slate-700">{s.label}</span>
                                    <span className="text-slate-400">{fmtM(s.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Phân bổ MOS (SKU count)
                    </h3>
                    <BarChartSVG buckets={mosBuckets} width={240} height={65} />
                </div>
            </div>

            {/* LOIS Matrix Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Ma trận LOIS — Tổng hợp
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="text-left px-3 py-2 font-bold text-slate-600">Phân khúc</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">SKU</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">Doanh số</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">% DS</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">Tồn kho</th>
                                <th className="text-center px-2 py-2 font-bold text-slate-600">MOS</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">PO</th>
                                <th className="text-center px-2 py-2 font-bold text-red-500">OOS</th>
                                <th className="text-center px-2 py-2 font-bold text-amber-500">Risk</th>
                                <th className="text-right px-2 py-2 font-bold text-slate-600">Dư thừa</th>
                                <th className="text-center px-2 py-2 font-bold text-slate-600">% Dư</th>
                                <th className="text-center px-2 py-2 font-bold text-slate-600">Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loisRows.map(r => (
                                <tr key={r.label} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold text-slate-800">{r.label}</td>
                                    <td className="text-right px-2 py-2 tabular-nums">{fmtN(r.items)}</td>
                                    <td className="text-right px-2 py-2 tabular-nums font-semibold">
                                        {fmtM(r.turnover)}
                                    </td>
                                    <td className="text-right px-2 py-2 tabular-nums text-blue-600">
                                        {pct(r.turnoverPct)}
                                    </td>
                                    <td className="text-right px-2 py-2 tabular-nums text-emerald-600">
                                        {fmtM(r.stockVal)}
                                    </td>
                                    <td
                                        className={`text-center px-2 py-2 tabular-nums font-bold ${r.mos > 6 ? 'text-red-600' : r.mos > 3 ? 'text-amber-600' : 'text-emerald-600'}`}
                                    >
                                        {r.mos.toFixed(1)}
                                    </td>
                                    <td className="text-right px-2 py-2 tabular-nums text-indigo-600">
                                        {fmtM(r.poVal)}
                                    </td>
                                    <td
                                        className={`text-center px-2 py-2 font-bold ${r.oosCount > 0 ? 'text-red-600' : 'text-slate-300'}`}
                                    >
                                        {r.oosCount || '-'}
                                    </td>
                                    <td
                                        className={`text-center px-2 py-2 font-bold ${r.riskCount > 0 ? 'text-amber-600' : 'text-slate-300'}`}
                                    >
                                        {r.riskCount || '-'}
                                    </td>
                                    <td className="text-right px-2 py-2 tabular-nums text-slate-500">
                                        {fmtM(r.excessVal)}
                                    </td>
                                    <td
                                        className={`text-center px-2 py-2 font-bold ${r.excessPct > 15 ? 'text-red-600' : 'text-slate-500'}`}
                                    >
                                        {pct(r.excessPct)}
                                    </td>
                                    <td
                                        className={`text-center px-2 py-2 font-bold ${r.trend > 0 ? 'text-emerald-600' : 'text-red-600'}`}
                                    >
                                        {r.trend > 0 ? '↑' : '↓'}
                                        {Math.abs(r.trend).toFixed(0)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                                <td className="px-3 py-2 text-slate-800">TỔNG</td>
                                <td className="text-right px-2 py-2 tabular-nums">{fmtN(stats.totalSKUs)}</td>
                                <td className="text-right px-2 py-2 tabular-nums">{fmtM(stats.turnover)}</td>
                                <td className="text-right px-2 py-2 tabular-nums text-blue-600">100%</td>
                                <td className="text-right px-2 py-2 tabular-nums text-emerald-600">
                                    {fmtM(stats.stockValue)}
                                </td>
                                <td
                                    className={`text-center px-2 py-2 ${stats.mosAvg > 6 ? 'text-red-600' : 'text-amber-600'}`}
                                >
                                    {stats.mosAvg.toFixed(1)}
                                </td>
                                <td className="text-right px-2 py-2 tabular-nums text-indigo-600">
                                    {fmtM(stats.poValue)}
                                </td>
                                <td className="text-center px-2 py-2 text-red-600">{stats.oosCount}</td>
                                <td className="text-center px-2 py-2 text-amber-600">{stats.riskCount}</td>
                                <td className="text-right px-2 py-2 tabular-nums">{fmtM(stats.excessValue)}</td>
                                <td className="text-center px-2 py-2">{pct(stats.excessPct)}</td>
                                <td className="text-center px-2 py-2">—</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Secondary: Aging + Dealer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Aging Nợ Hàng</h3>
                    <div className="grid grid-cols-4 gap-3 text-center">
                        {[
                            { label: '≤30 ngày', value: aging.qty30, color: '#64748b' },
                            { label: '31-60', value: aging.qty60, color: '#f59e0b' },
                            { label: '61-90', value: aging.qty90, color: '#ef4444' },
                            { label: '>90', value: aging.qtyOver90, color: '#991b1b' },
                        ].map(b => (
                            <div key={b.label}>
                                <div
                                    className="text-[10px] font-bold uppercase tracking-wider"
                                    style={{ color: b.color }}
                                >
                                    {b.label}
                                </div>
                                <div className="text-lg font-black mt-1" style={{ color: b.color }}>
                                    {fmtN(b.value)}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                        <span>
                            Tổng SL nợ: <strong className="text-slate-800">{fmtN(aging.totalQty)}</strong>
                        </span>
                        <span>
                            Giá trị: <strong className="text-slate-800">{fmtM(aging.totalValue)}</strong>
                        </span>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tổng quan khác</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Tồn đại lý (ước)</span>
                            <span className="font-bold text-slate-800">{fmtM(stats.dealerStock)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">MOS trung bình</span>
                            <span
                                className={`font-bold ${stats.mosAvg > 6 ? 'text-red-600' : stats.mosAvg > 3 ? 'text-amber-600' : 'text-emerald-600'}`}
                            >
                                {stats.mosAvg.toFixed(1)} tháng
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">SKU có rủi ro</span>
                            <span className="font-bold text-amber-600">{fmtN(stats.riskCount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">SKU dư thừa</span>
                            <span className="font-bold text-slate-600">{fmtN(stats.excessItems)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Health Score + Forecast Accuracy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Composite Health Score */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Điểm Sức Khỏe Tồn Kho
                    </h3>
                    <div className="flex items-center gap-5">
                        <div
                            className={`text-4xl font-black ${stats.healthScore >= 75 ? 'text-emerald-600' : stats.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}
                        >
                            {stats.healthScore.toFixed(0)}
                            <span className="text-base text-slate-400 font-bold">/100</span>
                        </div>
                        <div className="flex-1 space-y-1.5">
                            {[
                                { label: 'Phục vụ', score: stats.serviceScore, w: '40%' },
                                { label: 'Hiệu quả', score: stats.efficiencyScore, w: '30%' },
                                { label: 'Tươi mới', score: stats.freshnessScore, w: '30%' },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2 text-xs">
                                    <span className="w-16 font-bold text-slate-600">{s.label}</span>
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${Math.max(0, Math.min(100, s.score))}%`,
                                                background:
                                                    s.score >= 75 ? '#10b981' : s.score >= 50 ? '#f59e0b' : '#ef4444',
                                            }}
                                        />
                                    </div>
                                    <span className="w-9 text-right tabular-nums font-bold text-slate-700">
                                        {s.score.toFixed(0)}
                                    </span>
                                    <span className="w-8 text-right text-slate-400">{s.w}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                {/* Forecast Accuracy + Capital Turn */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dự Báo & Vốn</h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">WMAPE</div>
                            <div
                                className={`text-lg font-black mt-1 ${stats.wmape <= 20 ? 'text-emerald-600' : stats.wmape <= 40 ? 'text-amber-600' : 'text-red-600'}`}
                            >
                                {stats.wmape.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-400">sai số dự báo</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bias</div>
                            <div
                                className={`text-lg font-black mt-1 ${Math.abs(stats.bias) <= 10 ? 'text-emerald-600' : 'text-amber-600'}`}
                            >
                                {stats.bias > 0 ? '+' : ''}
                                {stats.bias.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-400">
                                {stats.bias > 5 ? 'dự báo cao' : stats.bias < -5 ? 'dự báo thấp' : 'cân bằng'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Vòng quay vốn
                            </div>
                            <div
                                className={`text-lg font-black mt-1 ${stats.capitalTurn >= 3 ? 'text-emerald-600' : stats.capitalTurn >= 1.5 ? 'text-amber-600' : 'text-red-600'}`}
                            >
                                {stats.capitalTurn.toFixed(1)}x
                            </div>
                            <div className="text-[9px] text-slate-400">lần/năm</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Commentary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <FaIcon className="fas fa-lightbulb text-blue-500" />
                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Nhận xét & Đề xuất</h3>
                </div>
                <ul className="space-y-2">
                    {commentary.map((c, i) => (
                        <li key={i} className="text-sm text-slate-700 leading-relaxed">
                            {c}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Hidden print container */}
            <div ref={printRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
                <style>{`
                    .rpt { font-family: 'Noto Sans', sans-serif; font-size: 8pt; color: #1e293b; }
                    .rpt-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 8px; }
                    .rpt-logo { width: 28px; height: 28px; background: #1e293b; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 8pt; margin-right: 8px; }
                    .rpt-title { font-size: 13pt; font-weight: 900; }
                    .rpt-sub { font-size: 7pt; color: #64748b; }
                    .rpt-kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 8px; }
                    .rpt-kpi { border: 1px solid #e2e8f0; border-radius: 4px; padding: 5px 7px; }
                    .rpt-kpi-label { font-size: 6pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
                    .rpt-kpi-value { font-size: 11pt; font-weight: 900; margin-top: 1px; }
                    .rpt-kpi-sub { font-size: 6pt; color: #94a3b8; }
                    .rpt-kpi.alert { background: #fef2f2; border-color: #fecaca; }
                    .rpt-charts { display: flex; gap: 10px; margin-bottom: 8px; }
                    .rpt-chart-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; }
                    .rpt-chart-title { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
                    table.rpt-table { width: 100%; border-collapse: collapse; font-size: 7pt; }
                    table.rpt-table th { background: #f1f5f9; font-size: 6.5pt; font-weight: 800; text-transform: uppercase; padding: 3px 4px; border: 1px solid #e2e8f0; }
                    table.rpt-table td { padding: 2px 4px; border: 1px solid #e2e8f0; }
                    table.rpt-table tfoot td { background: #f1f5f9; font-weight: 800; }
                    .rpt-commentary { margin-top: 8px; border: 1px solid #bfdbfe; border-radius: 4px; padding: 6px 8px; background: #eff6ff; }
                    .rpt-commentary h4 { font-size: 7pt; font-weight: 800; color: #2563eb; text-transform: uppercase; margin-bottom: 4px; }
                    .rpt-commentary li { font-size: 7.5pt; line-height: 1.4; margin-bottom: 2px; }
                    .rpt-footer { margin-top: 6px; font-size: 6pt; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 3px; }
                    .r { text-align: right; } .c { text-align: center; }
                    .red { color: #dc2626; } .amb { color: #d97706; } .grn { color: #16a34a; } .blue { color: #2563eb; }
                `}</style>
                <div className="rpt">
                    <div className="rpt-header">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className="rpt-logo">ATP</div>
                            <div>
                                <div className="rpt-title">Báo Cáo Tổng Hợp KPI</div>
                                <div className="rpt-sub">
                                    {brandLabel} · {dateStr} — {timeStr}
                                </div>
                            </div>
                        </div>
                        <div className="rpt-sub">
                            SKU: {fmtN(stats.totalSKUs)} · OOS: {stats.oosCount} · Risk: {stats.riskCount}
                        </div>
                    </div>

                    <div className="rpt-kpi-grid">
                        {kpiCards.map(c => (
                            <div key={c.label} className={`rpt-kpi ${c.alert ? 'alert' : ''}`}>
                                <div className="rpt-kpi-label">{c.label}</div>
                                <div className="rpt-kpi-value">{c.value}</div>
                                {c.sub && <div className="rpt-kpi-sub">{c.sub}</div>}
                            </div>
                        ))}
                    </div>

                    <div className="rpt-charts">
                        <div className="rpt-chart-box">
                            <div className="rpt-chart-title">Doanh số 12 tháng</div>
                            <SparklineSVG data={sparklineData} width={240} height={50} />
                        </div>
                        <div className="rpt-chart-box">
                            <div className="rpt-chart-title">LOIS Distribution</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PieChartSVG slices={loisSlices} size={70} />
                                <div>
                                    {loisSlices.map(s => (
                                        <div
                                            key={s.label}
                                            style={{ fontSize: '6pt', display: 'flex', alignItems: 'center', gap: 3 }}
                                        >
                                            <div
                                                style={{ width: 6, height: 6, borderRadius: 1, background: s.color }}
                                            />
                                            <span style={{ fontWeight: 700 }}>{s.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="rpt-chart-box">
                            <div className="rpt-chart-title">MOS Distribution</div>
                            <BarChartSVG buckets={mosBuckets} width={200} height={50} />
                        </div>
                    </div>

                    <div className="rpt-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className="rpt-kpi">
                            <div className="rpt-kpi-label">Điểm sức khỏe</div>
                            <div className="rpt-kpi-value">{stats.healthScore.toFixed(0)}/100</div>
                            <div className="rpt-kpi-sub">
                                SV {stats.serviceScore.toFixed(0)} · EF {stats.efficiencyScore.toFixed(0)} · FR{' '}
                                {stats.freshnessScore.toFixed(0)}
                            </div>
                        </div>
                        <div className="rpt-kpi">
                            <div className="rpt-kpi-label">WMAPE</div>
                            <div className="rpt-kpi-value">{stats.wmape.toFixed(1)}%</div>
                            <div className="rpt-kpi-sub">sai số dự báo</div>
                        </div>
                        <div className="rpt-kpi">
                            <div className="rpt-kpi-label">Forecast Bias</div>
                            <div className="rpt-kpi-value">
                                {stats.bias > 0 ? '+' : ''}
                                {stats.bias.toFixed(1)}%
                            </div>
                            <div className="rpt-kpi-sub">
                                {stats.bias > 5 ? 'dự báo cao' : stats.bias < -5 ? 'dự báo thấp' : 'cân bằng'}
                            </div>
                        </div>
                        <div className="rpt-kpi">
                            <div className="rpt-kpi-label">Vòng quay vốn</div>
                            <div className="rpt-kpi-value">{stats.capitalTurn.toFixed(1)}x</div>
                            <div className="rpt-kpi-sub">lần/năm</div>
                        </div>
                    </div>

                    <table className="rpt-table">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Phân khúc</th>
                                <th className="r">SKU</th>
                                <th className="r">Doanh số</th>
                                <th className="r">% DS</th>
                                <th className="r">Tồn kho</th>
                                <th className="c">MOS</th>
                                <th className="r">PO</th>
                                <th className="c">OOS</th>
                                <th className="c">Risk</th>
                                <th className="r">Dư thừa</th>
                                <th className="c">% Dư</th>
                                <th className="c">Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loisRows.map(r => (
                                <tr key={r.label}>
                                    <td style={{ fontWeight: 800 }}>{r.label}</td>
                                    <td className="r">{fmtN(r.items)}</td>
                                    <td className="r" style={{ fontWeight: 700 }}>
                                        {fmtM(r.turnover)}
                                    </td>
                                    <td className="r blue">{pct(r.turnoverPct)}</td>
                                    <td className="r grn">{fmtM(r.stockVal)}</td>
                                    <td
                                        className={`c ${r.mos > 6 ? 'red' : r.mos > 3 ? 'amb' : 'grn'}`}
                                        style={{ fontWeight: 700 }}
                                    >
                                        {r.mos.toFixed(1)}
                                    </td>
                                    <td className="r blue">{fmtM(r.poVal)}</td>
                                    <td className={`c ${r.oosCount > 0 ? 'red' : ''}`} style={{ fontWeight: 700 }}>
                                        {r.oosCount || '-'}
                                    </td>
                                    <td className={`c ${r.riskCount > 0 ? 'amb' : ''}`} style={{ fontWeight: 700 }}>
                                        {r.riskCount || '-'}
                                    </td>
                                    <td className="r">{fmtM(r.excessVal)}</td>
                                    <td className={`c ${r.excessPct > 15 ? 'red' : ''}`}>{pct(r.excessPct)}</td>
                                    <td className={`c ${r.trend > 0 ? 'grn' : 'red'}`} style={{ fontWeight: 700 }}>
                                        {r.trend > 0 ? '↑' : '↓'}
                                        {Math.abs(r.trend).toFixed(0)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td style={{ fontWeight: 900 }}>TỔNG</td>
                                <td className="r">{fmtN(stats.totalSKUs)}</td>
                                <td className="r">{fmtM(stats.turnover)}</td>
                                <td className="r blue">100%</td>
                                <td className="r grn">{fmtM(stats.stockValue)}</td>
                                <td className={`c ${stats.mosAvg > 6 ? 'red' : 'amb'}`}>{stats.mosAvg.toFixed(1)}</td>
                                <td className="r blue">{fmtM(stats.poValue)}</td>
                                <td className="c red">{stats.oosCount}</td>
                                <td className="c amb">{stats.riskCount}</td>
                                <td className="r">{fmtM(stats.excessValue)}</td>
                                <td className="c">{pct(stats.excessPct)}</td>
                                <td className="c">—</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="rpt-commentary">
                        <h4>💡 Nhận xét & Đề xuất</h4>
                        <ul>
                            {commentary.map((c, i) => (
                                <li key={i}>{c}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="rpt-footer">
                        <span>Auto Parts Governance · {brandLabel}</span>
                        <span>
                            In lúc: {dateStr} — {timeStr}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExecutiveReport;
