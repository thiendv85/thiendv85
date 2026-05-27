import React, { useMemo, useState } from 'react';
import { Typography } from './Typography';
import { useLanguage } from '../utils/i18n';

import { FaIcon } from './Icon';
interface SalesHistoryChartProps {
    history: number[];
    forecast?: number;
    currentStock?: number;
    rop?: number;
    netDemand?: number;
}

// Constants
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 562;
const PADDING = { top: 50, right: 90, bottom: 50, left: 70 };
const POINT_RADIUS = 5;
const POINT_STROKE_WIDTH = 2.5;
const LINE_STROKE_WIDTH = 4;
const COLORS = {
    line: '#10b981',
    forecast: '#f59e0b',
    stock: '#8b5cf6',
    rop: '#ec4899',
    grid: '#e2e8f0',
    gridStrong: '#cbd5e1',
    text: '#64748b',
    textStrong: '#1e293b',
    peak: '#ef4444',
    low: '#3b82f6',
    ma3: '#60a5fa',
    ma6: '#a78bfa',
    ma12: '#f472b6',
    netDemand: '#6366f1',
};

export const SalesHistoryChart = ({ history, forecast, currentStock, rop, netDemand }: SalesHistoryChartProps) => {
    const { t } = useLanguage();
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [showMA, setShowMA] = useState({ ma3: true, ma6: true });
    const [showConfidenceBands, setShowConfidenceBands] = useState(true);

    // Early return for empty data
    if (!history || history.length === 0 || history.every(v => v === 0)) {
        return (
            <div className="h-40 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-widest">
                No Sales Data
            </div>
        );
    }

    // Memoized calculations
    const { chartWidth, chartHeight, dataMax, dataMin, yMax, yMin, monthLabels, average, peakIndex, lowIndex } = useMemo(() => {
        const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
        const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

        const dataMin = Math.min(0, ...history);
        const dataMax = Math.max(...history, forecast || 0, currentStock || 0, rop || 0, netDemand || 0);

        const yMax = dataMax * 1.3 || 1;
        const yMin = dataMin * 1.1;

        const monthLabels = history.map((_, i) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - 1 - (history.length - 1 - i));
            return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;
        });

        const average = history.reduce((sum, val) => sum + val, 0) / history.length;
        const peakIndex = history.indexOf(Math.max(...history));
        const lowIndex = history.indexOf(Math.min(...history));

        return { chartWidth, chartHeight, dataMax, dataMin, yMax, yMin, monthLabels, average, peakIndex, lowIndex };
    }, [history, forecast, currentStock, rop]);

    // Scaling functions
    const scaleX = (index: number) => {
        if (history.length === 1) return PADDING.left + chartWidth / 2;
        return PADDING.left + (index / (history.length - 1)) * chartWidth;
    };

    const scaleY = (value: number) => {
        const diff = yMax - yMin || 1;
        const val = isFinite(value) ? value : 0;
        return PADDING.top + chartHeight - ((val - yMin) / diff) * chartHeight;
    };

    // Format large numbers
    const formatValue = (val: number) => {
        if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
        if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}K`;
        return val.toFixed(0);
    };

    // Generate points
    const points = history.map((val, i) => ({
        x: scaleX(i),
        y: scaleY(val),
        value: val,
        label: monthLabels[i],
    }));

    // Generate path data
    const pathData = points.reduce((acc, point, i) => {
        const x = isFinite(point.x) ? point.x : 0;
        const y = isFinite(point.y) ? point.y : 0;
        return i === 0 ? `M ${x},${y}` : `${acc} L ${x},${y}`;
    }, '');

    // Y-axis ticks
    const yTicks = [
        yMin,
        yMin + (yMax - yMin) * 0.25,
        yMin + (yMax - yMin) * 0.5,
        yMin + (yMax - yMin) * 0.75,
        yMax,
    ];

    // Trend calculation
    const trend = useMemo(() => {
        if (history.length < 2) return null;
        const recent3 = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const previous3 = history.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
        if (previous3 === 0) return null;
        const change = ((recent3 - previous3) / previous3) * 100;
        return { change, direction: change > 0 ? 'up' : 'down' };
    }, [history]);

    // Linear Regression Trend Line
    const trendLine = useMemo(() => {
        if (history.length < 3) return null;

        const n = history.length;
        const xValues = Array.from({ length: n }, (_, i) => i);
        const yValues = history;

        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R²
        const yMean = sumY / n;
        const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const ssResidual = yValues.reduce((sum, y, i) => sum + Math.pow(y - (slope * i + intercept), 2), 0);
        const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

        const trendPoints = xValues.map(x => ({
            x: scaleX(x),
            y: scaleY(slope * x + intercept),
            value: slope * x + intercept
        }));

        return { slope, intercept, points: trendPoints, rSquared };
    }, [history, scaleX, scaleY]);

    // Moving Averages
    const movingAverages = useMemo(() => {
        if (history.length < 3) return null;

        const calculateSMA = (period: number) => {
            return history.map((_, i) => {
                if (i < period - 1) return null;
                const sum = history.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
                return sum / period;
            });
        };

        const ma3 = calculateSMA(3);
        const ma6 = calculateSMA(6);
        const ma12 = calculateSMA(12);

        return {
            ma3: ma3.map((val, i) => val !== null ? { x: scaleX(i), y: scaleY(val), value: val } : null).filter(Boolean) as Array<{ x: number; y: number; value: number }>,
            ma6: ma6.map((val, i) => val !== null ? { x: scaleX(i), y: scaleY(val), value: val } : null).filter(Boolean) as Array<{ x: number; y: number; value: number }>,
            ma12: ma12.map((val, i) => val !== null ? { x: scaleX(i), y: scaleY(val), value: val } : null).filter(Boolean) as Array<{ x: number; y: number; value: number }>,
        };
    }, [history, scaleX, scaleY]);

    // Confidence Bands
    const confidenceBands = useMemo(() => {
        if (!trendLine || history.length < 3) return null;

        const n = history.length;
        const stdError = Math.sqrt(
            history.reduce((sum, y, i) => {
                const predicted = trendLine.slope * i + trendLine.intercept;
                return sum + Math.pow(y - predicted, 2);
            }, 0) / (n - 2)
        );

        const tValue = 1.96;
        const margin = tValue * stdError;

        return Array.from({ length: n }, (_, i) => {
            const predicted = trendLine.slope * i + trendLine.intercept;
            return {
                upper: { x: scaleX(i), y: scaleY(predicted + margin) },
                lower: { x: scaleX(i), y: scaleY(predicted - margin) }
            };
        });
    }, [trendLine, history, scaleX, scaleY]);

    // Volatility Metrics
    const volatility = useMemo(() => {
        if (history.length < 2) return null;

        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
        const stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

        let stability: 'high' | 'medium' | 'low';
        if (cv < 20) stability = 'high';
        else if (cv < 50) stability = 'medium';
        else stability = 'low';

        return { stdDev, cv, stability, mean };
    }, [history]);

    // Anomaly Detection
    const anomalies = useMemo(() => {
        if (!volatility || history.length < 3) return [];

        return history.map((val, i) => {
            const zScore = volatility.stdDev > 0 ? (val - volatility.mean) / volatility.stdDev : 0;
            if (Math.abs(zScore) > 2) {
                return {
                    index: i,
                    value: val,
                    type: zScore > 0 ? ('spike' as const) : ('drop' as const),
                    zScore
                };
            }
            return null;
        }).filter((a): a is NonNullable<typeof a> => a !== null);
    }, [history, volatility]);

    // Demand Classification
    const demandPattern = useMemo(() => {
        if (history.length < 3 || !volatility) return null;

        const nonZeroCount = history.filter(v => v > 0).length;
        const adi = nonZeroCount > 0 ? history.length / nonZeroCount : history.length;
        const cv2 = Math.pow(volatility.cv / 100, 2);

        let type: 'fast' | 'slow' | 'intermittent' | 'lumpy';
        if (adi < 1.32 && cv2 < 0.49) type = 'fast';
        else if (adi < 1.32 && cv2 >= 0.49) type = 'lumpy';
        else if (adi >= 1.32 && cv2 < 0.49) type = 'slow';
        else type = 'intermittent';

        return { type, adi, cv2 };
    }, [history, volatility]);

    // Seasonality Detection
    const seasonality = useMemo(() => {
        if (history.length < 12) return null;

        const monthlyAvg = new Array(12).fill(0);
        const monthlyCount = new Array(12).fill(0);

        const now = new Date();
        now.setDate(1);
        const startMonthIndex = (now.getMonth() - 1 - (history.length - 1)) % 12;
        const normalizedStartMonth = (startMonthIndex + 12) % 12;

        history.forEach((val, i) => {
            const actualMonth = (normalizedStartMonth + i) % 12;
            monthlyAvg[actualMonth] += val;
            monthlyCount[actualMonth]++;
        });

        monthlyAvg.forEach((sum, i) => {
            monthlyAvg[i] = monthlyCount[i] > 0 ? sum / monthlyCount[i] : 0;
        });

        const overallMean = monthlyAvg.reduce((a, b) => a + b, 0) / 12;
        const variance = monthlyAvg.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0) / 12;
        const strength = overallMean > 0 ? Math.sqrt(variance) / overallMean : 0;

        const peakSet = new Set<number>();
        const ma3 = new Array(12).fill(0);

        for (let i = 0; i < 12; i++) {
            const sum = monthlyAvg[i] + monthlyAvg[(i + 1) % 12] + monthlyAvg[(i + 2) % 12];
            ma3[(i + 1) % 12] = sum / 3;
        }

        const ma3Threshold = overallMean * 1.3;
        ma3.forEach((val, i) => {
            if (val > ma3Threshold) {
                // If a 3-month window is a peak, flag all 3 months
                peakSet.add((i + 11) % 12);
                peakSet.add(i);
                peakSet.add((i + 1) % 12);
            }
        });

        const peakMonths = Array.from(peakSet).sort((a, b) => a - b);

        // Calculate approaching peaks (1-2 months ahead) for lead time warning
        const currentMonth = new Date().getMonth();
        const nextMonth = (currentMonth + 1) % 12;
        const monthAfterNext = (currentMonth + 2) % 12;

        let approachingPeak: number | null = null;
        if (peakMonths.length > 0) {
            if (peakMonths.includes(nextMonth)) approachingPeak = nextMonth;
            else if (peakMonths.includes(monthAfterNext)) approachingPeak = monthAfterNext;
        }

        return {
            detected: (strength > 0.15 || peakMonths.length > 0) && overallMean > 10,
            strength,
            peakMonths: overallMean > 10 ? peakMonths : [],
            approachingPeak: overallMean > 10 ? approachingPeak : null,
            monthlyPattern: monthlyAvg
        };
    }, [history]);

    return (
        <div className="space-y-4">
            <div className="w-full relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border border-slate-200 shadow-sm">
                {/* Trend Badge */}
                {trend && (
                    <div className={`absolute top-3 right-3 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 z-10 ${trend.direction === 'up'
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-100 text-rose-700 border border-rose-200'
                        }`}>
                        <FaIcon className={`fas fa-arrow-${trend.direction === 'up' ? 'up' : 'down'}`} />
                        {Math.abs(trend.change).toFixed(1)}%
                    </div>
                )}

                <svg
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    className="w-full h-auto overflow-visible p-2"
                    role="img"
                    aria-label={`Sales history chart showing ${history.length} months of data`}
                >
                    <title>Sales History Chart</title>

                    <defs>
                        <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={COLORS.line} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={COLORS.line} stopOpacity="0" />
                        </linearGradient>
                        <filter id="shadow">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
                        </filter>
                    </defs>

                    {/* Y-axis Grid Lines & Labels */}
                    {yTicks.map((tick, i) => (
                        <g key={i}>
                            <line
                                x1={PADDING.left}
                                y1={scaleY(tick)}
                                x2={SVG_WIDTH - PADDING.right}
                                y2={scaleY(tick)}
                                stroke={i === 0 ? COLORS.gridStrong : COLORS.grid}
                                strokeWidth={i === 0 ? 1.5 : 1}
                                strokeDasharray={i === 0 ? "0" : "4 4"}
                            />
                            <text
                                x={PADDING.left - 10}
                                y={scaleY(tick) + 4}
                                textAnchor="end"
                                fill={COLORS.text}
                                fontSize="12"
                                fontWeight="600"
                            >
                                {formatValue(tick)}
                            </text>
                        </g>
                    ))}

                    {/* Average Line */}
                    <g opacity="0.5">
                        <line
                            x1={PADDING.left}
                            y1={scaleY(average)}
                            x2={SVG_WIDTH - PADDING.right}
                            y2={scaleY(average)}
                            stroke="#6366f1"
                            strokeWidth="2"
                            strokeDasharray="8 4"
                        />
                        <text
                            x={SVG_WIDTH - PADDING.right + 6}
                            y={scaleY(average) - 4}
                            fill="#6366f1"
                            fontSize="11"
                            fontWeight="bold"
                        >
                            AVG
                        </text>
                    </g>

                    {/* Current Stock Line */}
                    {currentStock !== undefined && currentStock > 0 && (
                        <g>
                            <line
                                x1={PADDING.left}
                                y1={scaleY(currentStock)}
                                x2={SVG_WIDTH - PADDING.right}
                                y2={scaleY(currentStock)}
                                stroke={COLORS.stock}
                                strokeWidth="3"
                                strokeDasharray="10 5"
                                opacity="0.8"
                            />
                            <rect
                                x={SVG_WIDTH - PADDING.right + 6}
                                y={scaleY(currentStock) - 12}
                                width="75"
                                height="22"
                                fill={COLORS.stock}
                                rx="5"
                                opacity="0.9"
                            />
                            <text
                                x={SVG_WIDTH - PADDING.right + 43}
                                y={scaleY(currentStock) + 3}
                                fill="white"
                                fontSize="12"
                                fontWeight="900"
                                textAnchor="middle"
                            >
                                📦 {formatValue(currentStock)}
                            </text>
                        </g>
                    )}

                    {/* ROP Line */}
                    {rop !== undefined && rop > 0 && (
                        <g>
                            <line
                                x1={PADDING.left}
                                y1={scaleY(rop)}
                                x2={SVG_WIDTH - PADDING.right}
                                y2={scaleY(rop)}
                                stroke={COLORS.rop}
                                strokeWidth="2.5"
                                strokeDasharray="8 3"
                                opacity="0.75"
                            />
                            <rect
                                x={SVG_WIDTH - PADDING.right + 6}
                                y={scaleY(rop) - 12}
                                width="75"
                                height="22"
                                fill={COLORS.rop}
                                rx="5"
                                opacity="0.9"
                            />
                            <text
                                x={SVG_WIDTH - PADDING.right + 43}
                                y={scaleY(rop) + 3}
                                fill="white"
                                fontSize="12"
                                fontWeight="900"
                                textAnchor="middle"
                            >
                                🎯 {formatValue(rop)}
                            </text>
                        </g>
                    )}

                    {/* Net Demand Line */}
                    {netDemand !== undefined && netDemand !== 0 && (
                        <g>
                            <line
                                x1={PADDING.left}
                                y1={scaleY(netDemand)}
                                x2={SVG_WIDTH - PADDING.right}
                                y2={scaleY(netDemand)}
                                stroke={COLORS.netDemand}
                                strokeWidth="2.5"
                                strokeDasharray="12 6"
                                opacity="0.8"
                            />
                            <rect
                                x={SVG_WIDTH - PADDING.right + 6}
                                y={scaleY(netDemand) - 12}
                                width="95"
                                height="22"
                                fill={COLORS.netDemand}
                                rx="5"
                                opacity="0.9"
                            />
                            <text
                                x={SVG_WIDTH - PADDING.right + 53}
                                y={scaleY(netDemand) + 3}
                                fill="white"
                                fontSize="11"
                                fontWeight="900"
                                textAnchor="middle"
                            >
                                NET DEM: {formatValue(netDemand)}
                            </text>
                        </g>
                    )}

                    {/* Forecast Line */}
                    {forecast && forecast > 0 && (
                        <g>
                            <line
                                x1={PADDING.left}
                                y1={scaleY(forecast)}
                                x2={SVG_WIDTH - PADDING.right}
                                y2={scaleY(forecast)}
                                stroke={COLORS.forecast}
                                strokeWidth="2.5"
                                strokeDasharray="6 4"
                                opacity="0.7"
                            />
                            <text
                                x={SVG_WIDTH - PADDING.right + 6}
                                y={scaleY(forecast) + 4}
                                fill={COLORS.forecast}
                                fontSize="11"
                                fontWeight="bold"
                            >
                                FC: {formatValue(forecast)}
                            </text>
                        </g>
                    )}

                    {/* Confidence Bands */}
                    {showConfidenceBands && confidenceBands && (
                        <path
                            d={`M ${confidenceBands[0].upper.x},${confidenceBands[0].upper.y} ${confidenceBands.map(b => `L ${b.upper.x},${b.upper.y}`).join(' ')} ${confidenceBands.slice().reverse().map(b => `L ${b.lower.x},${b.lower.y}`).join(' ')} Z`}
                            fill={trendLine && trendLine.slope > 0 ? '#10b981' : '#ef4444'}
                            opacity="0.1"
                        />
                    )}

                    {/* Area under curve */}
                    <path
                        d={`${pathData} L ${points[points.length - 1].x},${scaleY(yMin)} L ${points[0].x},${scaleY(yMin)} Z`}
                        fill="url(#areaGradient)"
                    />

                    {/* Trend Line */}
                    {trendLine && trendLine.points.length > 0 && (
                        <g opacity="0.5">
                            <path
                                d={trendLine.points.reduce((acc, point, i) =>
                                    i === 0 ? `M ${point.x},${point.y}` : `${acc} L ${point.x},${point.y}`,
                                    '')}
                                fill="none"
                                stroke={trendLine.slope > 0 ? '#10b981' : '#ef4444'}
                                strokeWidth="2"
                                strokeDasharray="6 3"
                            />
                            <text
                                x={PADDING.left + 6}
                                y={PADDING.top - 15}
                                fill={trendLine.slope > 0 ? '#10b981' : '#ef4444'}
                                fontSize="11"
                                fontWeight="bold"
                            >
                                Trend: {trendLine.slope > 0 ? '↗' : '↘'} {(trendLine.slope > 0 ? '+' : '')}{trendLine.slope.toFixed(2)}/mo (R²={trendLine.rSquared.toFixed(2)})
                            </text>
                        </g>
                    )}

                    {/* Moving Averages */}
                    {movingAverages && showMA.ma3 && movingAverages.ma3.length > 0 && (
                        <path
                            d={movingAverages.ma3.reduce((acc, point, i) =>
                                i === 0 ? `M ${point.x},${point.y}` : `${acc} L ${point.x},${point.y}`,
                                '')}
                            fill="none"
                            stroke={COLORS.ma3}
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                            opacity="1"
                        />
                    )}
                    {movingAverages && showMA.ma6 && movingAverages.ma6.length > 0 && (
                        <path
                            d={movingAverages.ma6.reduce((acc, point, i) =>
                                i === 0 ? `M ${point.x},${point.y}` : `${acc} L ${point.x},${point.y}`,
                                '')}
                            fill="none"
                            stroke={COLORS.ma6}
                            strokeWidth="2.5"
                            strokeDasharray="6 3"
                            opacity="1"
                        />
                    )}

                    {/* Main Line */}
                    <path
                        d={pathData}
                        fill="none"
                        stroke={COLORS.line}
                        strokeWidth={LINE_STROKE_WIDTH}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#shadow)"
                    />

                    {/* Data Points */}
                    {points.map((p, i) => {
                        const isPeak = i === peakIndex && history.length > 3;
                        const isLow = i === lowIndex && history.length > 3;
                        const isHovered = hoveredIndex === i;
                        const isAnomaly = anomalies.some(a => a.index === i);

                        return (
                            <g
                                key={i}
                                className="cursor-pointer transition-all"
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                            >
                                {isHovered && (
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={POINT_RADIUS + 8}
                                        fill={COLORS.line}
                                        opacity="0.1"
                                        className="animate-pulse"
                                    />
                                )}

                                {(isPeak || isLow) && (
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={POINT_RADIUS + 4}
                                        fill="none"
                                        stroke={isPeak ? COLORS.peak : COLORS.low}
                                        strokeWidth="2"
                                        opacity="0.5"
                                    />
                                )}

                                {isAnomaly && (
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={POINT_RADIUS + 6}
                                        fill="none"
                                        stroke="#f59e0b"
                                        strokeWidth="2"
                                        opacity="0.6"
                                        className="animate-pulse"
                                    />
                                )}

                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={isHovered ? POINT_RADIUS + 2 : POINT_RADIUS}
                                    fill="white"
                                    stroke={isPeak ? COLORS.peak : isLow ? COLORS.low : COLORS.line}
                                    strokeWidth={POINT_STROKE_WIDTH}
                                    filter="url(#shadow)"
                                    className="transition-all"
                                />

                                <text
                                    x={p.x}
                                    y={PADDING.top + chartHeight + 25}
                                    textAnchor="middle"
                                    fill={COLORS.text}
                                    fontSize={history.length > 12 ? "11" : "12"}
                                    fontWeight="600"
                                >
                                    {monthLabels[i]}
                                </text>

                                <text
                                    x={p.x}
                                    y={p.y - 15}
                                    textAnchor="middle"
                                    fill={isHovered ? COLORS.line : COLORS.textStrong}
                                    fontSize={isHovered ? "18" : "16"}
                                    fontWeight="900"
                                    className="drop-shadow-sm transition-all"
                                >
                                    {formatValue(p.value)}
                                </text>

                                {isHovered && (
                                    <g>
                                        <rect
                                            x={p.x - 55}
                                            y={p.y - 75}
                                            width="110"
                                            height="50"
                                            fill="white"
                                            stroke={COLORS.line}
                                            strokeWidth="2"
                                            rx="8"
                                            filter="url(#shadow)"
                                        />
                                        <text
                                            x={p.x}
                                            y={p.y - 55}
                                            textAnchor="middle"
                                            fill={COLORS.textStrong}
                                            fontSize="16"
                                            fontWeight="900"
                                        >
                                            {p.value} units
                                        </text>
                                        <text
                                            x={p.x}
                                            y={p.y - 38}
                                            textAnchor="middle"
                                            fill={COLORS.text}
                                            fontSize="12"
                                            fontWeight="600"
                                        >
                                            {p.label}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}

                    {/* Legend */}
                    {history.length > 3 && (
                        <g>
                            <circle cx={PADDING.left + 10} cy={15} r="4" fill="none" stroke={COLORS.peak} strokeWidth="2" />
                            <text x={PADDING.left + 20} y={19} fill={COLORS.text} fontSize="12" fontWeight="600">Peak: {formatValue(history[peakIndex])}</text>

                            <circle cx={PADDING.left + 120} cy={15} r="4" fill="none" stroke={COLORS.low} strokeWidth="2" />
                            <text x={PADDING.left + 130} y={19} fill={COLORS.text} fontSize="12" fontWeight="600">Low: {formatValue(history[lowIndex])}</text>
                        </g>
                    )}
                </svg>

                {/* Toggle Controls */}
                <div className="px-4 pb-3 flex gap-2 flex-wrap">
                    <button
                        onClick={() => setShowMA({ ...showMA, ma3: !showMA.ma3 })}
                        className={`px-2.5 py-1.5 rounded text-2xs font-bold transition-all ${showMA.ma3 ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                    >
                        MA3
                    </button>
                    <button
                        onClick={() => setShowMA({ ...showMA, ma6: !showMA.ma6 })}
                        className={`px-2.5 py-1.5 rounded text-2xs font-bold transition-all ${showMA.ma6 ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                    >
                        MA6
                    </button>
                    <button
                        onClick={() => setShowConfidenceBands(!showConfidenceBands)}
                        className={`px-2.5 py-1.5 rounded text-2xs font-bold transition-all ${showConfidenceBands ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                    >
                        Confidence
                    </button>
                </div>
            </div>

            {/* Analytics Summary Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-glass-sm p-5">
                <Typography variant="h3" className="text-slate-800 flex items-center gap-2 mb-4">
                    <FaIcon className="fas fa-chart-line text-blue-600" />
                    {t('sd_trend_analysis') || 'Phân tích xu hướng'}
                </Typography>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {trendLine && (
                    <div className="bg-gradient-to-br from-emerald-50 to-white p-4 rounded-2xl border border-emerald-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <FaIcon className={`fas fa-arrow-trend-${trendLine.slope > 0 ? 'up' : 'down'} text-base ${trendLine.slope > 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
                            <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Xu hướng</Typography>
                        </div>
                        <Typography variant="h3" className={`${trendLine.slope > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {trendLine.slope > 0 ? '+' : ''}{trendLine.slope.toFixed(2)}/tháng
                        </Typography>
                        <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px]">
                            Độ mạnh: <span className="font-bold text-slate-600">{(trendLine.rSquared * 100).toFixed(0)}%</span>
                        </Typography>
                    </div>
                    )}

                    {/* Volatility */}
                    {volatility && (
                        <div className="bg-gradient-to-br from-amber-50 to-white p-4 rounded-2xl border border-amber-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <FaIcon className="fas fa-wave-square text-base text-amber-600" />
                                <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Độ biến động</Typography>
                            </div>
                            <Typography variant="h3" className="text-amber-700">
                                {volatility.cv.toFixed(1)}%
                            </Typography>
                            <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px]">
                                Ổn định: <span className={`font-bold ${volatility.stability === 'high' ? 'text-emerald-600' : volatility.stability === 'medium' ? 'text-amber-600' : 'text-rose-600'}`}>
                                    {volatility.stability === 'high' ? 'Cao' : volatility.stability === 'medium' ? 'Trung bình' : 'Thấp'}
                                </span>
                            </Typography>
                        </div>
                    )}

                    {/* Demand Pattern */}
                    {demandPattern && (
                        <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-2xl border border-blue-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <FaIcon className="fas fa-chart-bar text-base text-blue-600" />
                                <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Loại demand</Typography>
                            </div>
                            <Typography variant="h3" className="text-blue-700 uppercase">
                                {demandPattern.type === 'fast' ? 'Nhanh' : demandPattern.type === 'slow' ? 'Chậm' : demandPattern.type === 'lumpy' ? 'Đợt lớn' : 'Không đều'}
                            </Typography>
                            <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px]">
                                ADI: <span className="font-bold text-slate-600">{demandPattern.adi.toFixed(2)}</span> | CV²: <span className="font-bold text-slate-600">{demandPattern.cv2.toFixed(2)}</span>
                            </Typography>
                        </div>
                    )}

                    {/* Seasonality */}
                    {seasonality && (
                        <div className="bg-gradient-to-br from-purple-50 to-white p-4 rounded-2xl border border-purple-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <FaIcon className="fas fa-calendar-alt text-base text-purple-600" />
                                <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Mùa vụ</Typography>
                            </div>
                            <Typography variant="h3" className="text-purple-700">
                                {seasonality.detected ? 'Có' : 'Không'}
                            </Typography>
                            <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px] truncate">
                                {seasonality.detected && seasonality.peakMonths.length > 0 ? (
                                    <>Tháng cao điểm: <span className="font-bold text-slate-600">{seasonality.peakMonths.map(m => m + 1).join(', ')}</span></>
                                ) : 'Không phát hiện chu kỳ'}
                            </Typography>
                            {seasonality.approachingPeak !== null && (
                                <Typography variant="body-sm" className="text-amber-600 font-bold mt-1.5 !text-[10px] flex items-center gap-1 animate-pulse">
                                    <FaIcon className="fas fa-exclamation-triangle" />
                                    Sắp đến mùa cao điểm (Tháng {seasonality.approachingPeak + 1}) - Cần đặt hàng ngay!
                                </Typography>
                            )}
                        </div>
                    )}

                    {/* Anomalies */}
                    <div className="bg-gradient-to-br from-rose-50 to-white p-4 rounded-2xl border border-rose-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <FaIcon className="fas fa-exclamation-triangle text-base text-rose-600" />
                            <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Bất thường</Typography>
                        </div>
                        <Typography variant="h3" className="text-rose-700">
                            {anomalies.length}
                        </Typography>
                        <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px]">
                            {anomalies.length > 0 ? (
                                <>Gần nhất: <span className="font-bold text-slate-600">{anomalies[anomalies.length - 1].type === 'spike' ? 'Tăng đột biến' : 'Giảm đột ngột'}</span></>
                            ) : 'Không có bất thường'}
                        </Typography>
                    </div>

                    {/* Average */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white p-4 rounded-2xl border border-indigo-100 shadow-glass-sm transition-all hover:shadow-glass hover:-translate-y-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <FaIcon className="fas fa-chart-line text-base text-indigo-600" />
                            <Typography variant="label" className="text-slate-500 uppercase tracking-tight">Trung bình</Typography>
                        </div>
                        <Typography variant="h3" className="text-indigo-700">
                            {average.toFixed(1)}
                        </Typography>
                        <Typography variant="body-sm" className="text-slate-400 mt-1 !text-[11px]">
                            Dữ liệu từ <span className="font-bold text-slate-600">{history.length}</span> tháng
                        </Typography>
                    </div>
                </div>
            </div>
        </div>
    );
};

