/**
 * SnapshotMatrix — Ma Trận Cung Ứng Tổng Thể tính từ snapshot data.
 * Dùng trong OrderReviewModal để người phê duyệt thấy tổng quan sức khoẻ
 * tồn kho của các mã đang trong dự thảo.
 */
import React, { useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CtxItem {
    itemCode: string;
    loisGroup: string;
    salesHistory: number[];
    avgQty12M: number;
    avgQty3M: number;
    available: number;
    safetyStock: number;
    stockMax: number;
    totalPO: number;
    backorder: number;
    unitCost: number;
    baseForecast: number;
    mos: number;
    incomingCurrentMonth: number;
}

interface Props {
    /** Chỉ tính cho các mã đang có trong dự thảo */
    items: CtxItem[];
    /** Số lượng đang đặt (để tính simulated) */
    draftQtys?: Record<string, { air: number; sea: number }>;
    /** Chế độ compact: chỉ hiện group-level (L/O/I/S/U), ít cột hơn */
    compact?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOIS_HIERARCHY = [
    { label: 'L (REGULAR)', sub: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'], color: 'bg-blue-500' },
    { label: 'O (OBSOLETE)', sub: ['O8', 'OE', 'ON', 'OA', 'OV'], color: 'bg-amber-500' },
    { label: 'I (INACTIVE)', sub: ['I'], color: 'bg-slate-400' },
    { label: 'S (SPECIAL)', sub: ['SX', 'SY', 'SZ', 'SC', 'SK', 'SD'], color: 'bg-violet-500' },
    { label: 'U (OTHERS)', sub: ['U_OTHER'], color: 'bg-slate-300' },
];

const SUBGROUP_DESC: Record<string, string> = {
    L1: '> 300 đvt/năm', L2: '101–300', L3: '61–100', L4: '25–60',
    L5: '13–24', L6: '7–12', L7: '< 6',
    O8: 'LOIS 8', OE: 'Ngừng SX', ON: 'Lỗi thời', OA: 'Lỗi thời lâu', OV: 'NCC ngừng',
    I: 'Không giao dịch',
    SX: 'Đặc thù X', SY: 'Đặc thù Y', SZ: 'Đặc thù Z', SC: 'Đặc thù C', SK: 'Đặc thù K', SD: 'Đặc thù D',
    U_OTHER: 'Chưa phân loại',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLoisSubgroup = (loisGroup: string, salesHistory: number[], avgQty12M: number): string => {
    const lois = (loisGroup || '').trim().toUpperCase();
    const sales12M = salesHistory && salesHistory.length > 0
        ? salesHistory.reduce((a, b) => a + b, 0)
        : avgQty12M * 12;

    if (['1', '2', '3', '4', '5', '6', '7'].includes(lois)) {
        if (sales12M > 300) return 'L1';
        if (sales12M > 100) return 'L2';
        if (sales12M > 60) return 'L3';
        if (sales12M > 24) return 'L4';
        if (sales12M > 12) return 'L5';
        if (sales12M > 6) return 'L6';
        return 'L7';
    }
    if (lois === '8') return 'O8';
    if (lois === 'E') return 'OE';
    if (lois === 'N') return 'ON';
    if (lois === 'A') return 'OA';
    if (lois === 'V') return 'OV';
    if (lois === 'I') return 'I';
    if (['X', 'Y', 'Z', 'C', 'K', 'D'].includes(lois)) return `S${lois}`;
    return 'U_OTHER';
};

const fmtTr = (v: number) => {
    const m = Math.round(v / 1_000_000);
    return m > 0 ? m.toLocaleString('vi-VN') : '—';
};

// ─── Component ────────────────────────────────────────────────────────────────

export const SnapshotMatrix = ({ items, draftQtys = {}, compact = false }: Props) => {
    const [showSim, setShowSim] = useState(false);

    const { matrixData, grand } = useMemo(() => {
        const matrix: Record<string, {
            items: number; turnover: number; noStock: number; short: number;
            stockVal: number; poVal: number; excessItems: number; excessVal: number;
            boItems: number; boValue: number; trendSum: number; trendCount: number;
            simStockVal: number; simPoVal: number;
        }> = {};

        let grandTurnover = 0, grandStock = 0, grandPoVal = 0, grandExcessVal = 0;
        let grandNoStock = 0, grandShort = 0, grandExcessItems = 0, grandBOItems = 0, grandBOValue = 0;
        let grandSimStockVal = 0, grandSimPoVal = 0;

        items.forEach(ctx => {
            const sub = getLoisSubgroup(ctx.loisGroup, ctx.salesHistory || [], ctx.avgQty12M);
            const sales12M = ctx.salesHistory && ctx.salesHistory.length > 0
                ? ctx.salesHistory.reduce((a, b) => a + b, 0)
                : ctx.avgQty12M * 12;

            const unitCost = ctx.unitCost || 0;
            const avail = ctx.available || 0;
            const ss = ctx.safetyStock || 0;
            const stockMax = ctx.stockMax || 0;
            const totalPO = ctx.totalPO || 0;
            const bo = ctx.backorder || 0;

            const draftQty = (draftQtys[ctx.itemCode]?.air || 0) + (draftQtys[ctx.itemCode]?.sea || 0);

            // Current (hiện tại)
            const stockVal = avail * unitCost;
            const poVal = totalPO * unitCost;
            const excessQty = Math.max(0, avail - stockMax);
            const excessVal = excessQty * unitCost;
            const isNoStock = avail <= 0 && ctx.baseForecast > 0.02;
            const isShort = avail < ss && ctx.baseForecast > 0.02;
            const isBO = bo > avail;
            const boVal = isBO ? Math.max(0, bo - avail) * unitCost : 0;

            // Simulated (sau khi nhận hàng đặt)
            const simAvail = avail + totalPO + draftQty;
            const simExcessQty = Math.max(0, simAvail - stockMax);
            const simStockVal = simAvail * unitCost;
            const simPoVal = (totalPO + draftQty) * unitCost;

            // Trend from salesHistory
            const last6 = (ctx.salesHistory || []).slice(-6).reduce((a, b) => a + b, 0);
            const first6 = (ctx.salesHistory || []).slice(0, 6).reduce((a, b) => a + b, 0);
            const itemTrend = first6 > 0 ? ((last6 - first6) / first6) * 100 : 0;

            const turnover = sales12M * unitCost;

            grandTurnover += turnover;
            grandStock += showSim ? simStockVal : stockVal;
            grandPoVal += showSim ? simPoVal : poVal;
            grandExcessVal += showSim ? simExcessQty * unitCost : excessVal;
            grandSimStockVal += simStockVal;
            grandSimPoVal += simPoVal;
            if (!showSim && isNoStock) grandNoStock++;
            if (!showSim && isShort) grandShort++;
            if ((!showSim && excessQty > 0) || (showSim && simExcessQty > 0)) grandExcessItems++;
            if (isBO) { grandBOItems++; grandBOValue += boVal; }

            if (!matrix[sub]) matrix[sub] = {
                items: 0, turnover: 0, noStock: 0, short: 0,
                stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0,
                boItems: 0, boValue: 0, trendSum: 0, trendCount: 0,
                simStockVal: 0, simPoVal: 0,
            };

            const m = matrix[sub];
            m.items++;
            m.turnover += turnover;
            m.stockVal += stockVal;
            m.poVal += poVal;
            m.simStockVal += simStockVal;
            m.simPoVal += simPoVal;
            m.excessVal += excessVal;
            m.trendSum += itemTrend;
            m.trendCount++;
            if (isNoStock) m.noStock++;
            if (isShort) m.short++;
            if (excessQty > 0) m.excessItems++;
            if (isBO) { m.boItems++; m.boValue += boVal; }
        });

        return {
            matrixData: matrix,
            grand: { grandTurnover, grandStock, grandPoVal, grandExcessVal, grandNoStock, grandShort, grandExcessItems, grandBOItems, grandBOValue, grandSimStockVal, grandSimPoVal },
        };
    }, [items, draftQtys, showSim]);

    const renderRow = (label: string, subKeys: string[], isHeader = false, groupColor?: string) => {
        const r = { items: 0, turnover: 0, noStock: 0, short: 0, stockVal: 0, poVal: 0, excessItems: 0, excessVal: 0, boItems: 0, boValue: 0, trendSum: 0, trendCount: 0, simStockVal: 0, simPoVal: 0 };
        subKeys.forEach(k => {
            if (!matrixData[k]) return;
            const m = matrixData[k];
            r.items += m.items; r.turnover += m.turnover; r.noStock += m.noStock;
            r.short += m.short; r.stockVal += m.stockVal; r.poVal += m.poVal;
            r.excessItems += m.excessItems; r.excessVal += m.excessVal;
            r.boItems += m.boItems; r.boValue += m.boValue;
            r.trendSum += m.trendSum; r.trendCount += m.trendCount;
            r.simStockVal += m.simStockVal; r.simPoVal += m.simPoVal;
        });

        if (r.items === 0 && !isHeader) return null;

        const avgTrend = r.trendCount > 0 ? r.trendSum / r.trendCount : 0;
        const activeStockVal = showSim ? r.simStockVal : r.stockVal;
        const activePoVal = showSim ? r.simPoVal : r.poVal;
        const mos = r.turnover > 0 ? (activeStockVal * 12 / r.turnover) : 0;
        const excessPct = activeStockVal > 0 ? (r.excessVal / activeStockVal) * 100 : 0;
        const pctTurn = grand.grandTurnover > 0 ? (r.turnover / grand.grandTurnover) * 100 : 0;

        const rowBg = isHeader ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/60';
        const fontCls = isHeader ? 'font-bold text-slate-800' : 'text-slate-700';

        return (
            <tr key={label} className={`${rowBg} border-b border-slate-100 text-xs transition-colors`}>
                {/* PHÂN KHÚC */}
                <td className={`px-3 py-2 border-r border-slate-100 whitespace-nowrap ${fontCls}`}>
                    <div className="flex items-center gap-2">
                        {isHeader && groupColor && <div className={`w-1.5 h-3 ${groupColor} rounded-full shrink-0`} />}
                        <span className={isHeader ? 'font-bold' : 'font-semibold'}>
                            {label}
                            {!isHeader && SUBGROUP_DESC[label] && (
                                <span className="text-slate-400 font-normal ml-1.5 text-[10px]">— {SUBGROUP_DESC[label]}</span>
                            )}
                        </span>
                    </div>
                </td>

                {/* TURNOVER */}
                <td className="px-3 py-2 text-right font-bold text-slate-800">
                    {fmtTr(r.turnover)}
                    {!isHeader && r.trendCount > 0 && r.turnover > 0 && (
                        <span className={`ml-1 text-[9px] font-black ${avgTrend >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {avgTrend >= 0 ? '↑' : '↓'}{Math.abs(avgTrend).toFixed(0)}%
                        </span>
                    )}
                </td>

                {/* % TURN */}
                <td className="px-3 py-2 text-right text-slate-400 italic">{pctTurn.toFixed(1)}%</td>

                {/* SKU */}
                <td className="px-3 py-2 text-center text-slate-500">{r.items || '—'}</td>

                {/* OOS */}
                <td className={`px-3 py-2 text-center font-bold ${r.noStock > 0 ? 'text-rose-600 bg-rose-50/40' : 'text-slate-300'}`}>
                    {r.noStock > 0 ? r.noStock : '—'}
                </td>

                {/* RISK */}
                <td className={`px-3 py-2 text-center font-bold ${r.short > 0 ? 'text-amber-600 bg-amber-50/40' : 'text-slate-300'}`}>
                    {r.short > 0 ? r.short : '—'}
                </td>

                {/* STOCK VAL */}
                <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50/20">{fmtTr(activeStockVal)}</td>

                {/* MOS */}
                <td className={`px-3 py-2 text-center font-bold italic border-x border-blue-100 bg-blue-50/20 ${mos > 0 && mos < 1 ? 'text-rose-600' : mos > 12 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {mos > 0 ? `${mos.toFixed(1)}M` : '—'}
                </td>

                {/* PO VAL */}
                <td className="px-3 py-2 text-right text-slate-500 font-bold">{fmtTr(activePoVal)}</td>

                {/* BO # */}
                <td className={`px-3 py-2 text-center font-bold ${r.boItems > 0 ? 'text-rose-600 bg-rose-50/30' : 'text-slate-200'}`}>
                    {r.boItems > 0 ? r.boItems : '—'}
                </td>

                {/* BO VAL */}
                <td className={`px-3 py-2 text-right font-bold ${r.boValue > 0 ? 'text-rose-700 bg-rose-50/30' : 'text-slate-200'}`}>
                    {r.boValue > 0 ? fmtTr(r.boValue) : '—'}
                </td>

                {/* EXC # */}
                <td className="px-3 py-2 text-center text-slate-400 font-bold">
                    {r.excessItems > 0 ? r.excessItems : '—'}
                </td>

                {/* EXC VAL */}
                <td className="px-3 py-2 text-right text-slate-400 font-bold">{r.excessVal > 0 ? fmtTr(r.excessVal) : '—'}</td>

                {/* % EXC */}
                <td className={`px-3 py-2 text-center font-black italic ${excessPct > 20 ? 'text-rose-500' : excessPct > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {excessPct.toFixed(1)}%
                </td>
            </tr>
        );
    };

    const totalSimStockVal = Object.values(matrixData).reduce((s, m) => s + m.simStockVal, 0);
    const totalSimPoVal = Object.values(matrixData).reduce((s, m) => s + m.simPoVal, 0);
    const totalStockVal = Object.values(matrixData).reduce((s, m) => s + m.stockVal, 0);
    const totalPoVal = Object.values(matrixData).reduce((s, m) => s + m.poVal, 0);
    const totalExcessVal = Object.values(matrixData).reduce((s, m) => s + m.excessVal, 0);
    const totalBoVal = Object.values(matrixData).reduce((s, m) => s + m.boValue, 0);
    const totalBoItems = Object.values(matrixData).reduce((s, m) => s + m.boItems, 0);
    const totalExcessItems = Object.values(matrixData).reduce((s, m) => s + m.excessItems, 0);
    const totalNoStock = Object.values(matrixData).reduce((s, m) => s + m.noStock, 0);
    const totalShort = Object.values(matrixData).reduce((s, m) => s + m.short, 0);
    const totalItems = items.length;
    const activeGrandStockVal = showSim ? totalSimStockVal : totalStockVal;
    const activeGrandPoVal = showSim ? totalSimPoVal : totalPoVal;
    const grandMOS = grand.grandTurnover > 0 ? (activeGrandStockVal * 12 / grand.grandTurnover) : 0;
    const grandExcPct = activeGrandStockVal > 0 ? (totalExcessVal / activeGrandStockVal) * 100 : 0;

    // ── Compact render ──────────────────────────────────────────────────────────
    if (compact) {
        const renderCompactRow = (label: string, subKeys: string[], groupColor?: string) => {
            const r = { items: 0, noStock: 0, short: 0, stockVal: 0, boItems: 0, simStockVal: 0, turnover: 0, trendSum: 0, trendCount: 0 };
            subKeys.forEach(k => {
                if (!matrixData[k]) return;
                const m = matrixData[k];
                r.items += m.items; r.noStock += m.noStock; r.short += m.short;
                r.stockVal += m.stockVal; r.boItems += m.boItems;
                r.simStockVal += m.simStockVal; r.turnover += m.turnover;
                r.trendSum += m.trendSum; r.trendCount += m.trendCount;
            });
            if (r.items === 0) return null;
            const activeVal = showSim ? r.simStockVal : r.stockVal;
            const mos = r.turnover > 0 ? (activeVal * 12 / r.turnover) : 0;
            return (
                <tr key={label} className="border-b border-slate-100 text-xs hover:bg-slate-50/60 transition-colors">
                    <td className="px-2 py-1.5 border-r border-slate-100">
                        <div className="flex items-center gap-1.5">
                            {groupColor && <div className={`w-1 h-2.5 ${groupColor} rounded-full shrink-0`} />}
                            <span className="font-bold text-slate-800 text-[10px]">{label}</span>
                        </div>
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-500 text-[10px]">{r.items}</td>
                    <td className={`px-2 py-1.5 text-center font-bold text-[10px] ${r.noStock > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{r.noStock || '—'}</td>
                    <td className={`px-2 py-1.5 text-center font-bold text-[10px] ${r.short > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{r.short || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-blue-700 text-[10px]">{fmtTr(activeVal)}</td>
                    <td className={`px-2 py-1.5 text-center font-bold italic text-[10px] ${mos > 0 && mos < 1 ? 'text-rose-600' : mos > 12 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {mos > 0 ? `${mos.toFixed(1)}M` : '—'}
                    </td>
                    <td className={`px-2 py-1.5 text-center font-bold text-[10px] ${r.boItems > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{r.boItems || '—'}</td>
                </tr>
            );
        };

        return (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-800 text-white">
                    <span className="font-black text-[10px] uppercase tracking-widest">Ma Trận Cung Ứng</span>
                    <button
                        onClick={() => setShowSim(p => !p)}
                        className={`text-[9px] font-black px-2 py-0.5 rounded border transition-colors ${showSim ? 'bg-blue-500 border-blue-400 text-white' : 'border-slate-500 text-slate-400 hover:text-white'}`}
                    >
                        {showSim ? 'SIM' : 'TT'}
                    </button>
                </div>
                <table className="w-full text-[10px] border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[9px] uppercase tracking-wider font-black">
                            <th className="px-2 py-1.5 text-left border-r border-slate-100">Phân Khúc</th>
                            <th className="px-2 py-1.5 text-center">SKU</th>
                            <th className="px-2 py-1.5 text-center text-rose-600">OOS</th>
                            <th className="px-2 py-1.5 text-center text-amber-600">Risk</th>
                            <th className="px-2 py-1.5 text-right text-blue-600">Val</th>
                            <th className="px-2 py-1.5 text-center">MOS</th>
                            <th className="px-2 py-1.5 text-center text-rose-600">BO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {LOIS_HIERARCHY.map(group => renderCompactRow(group.label, group.sub, group.color))}
                        <tr className="bg-slate-800 text-white text-[9px] font-black">
                            <td className="px-2 py-1.5 border-r border-slate-600">TOTAL</td>
                            <td className="px-2 py-1.5 text-center">{totalItems}</td>
                            <td className={`px-2 py-1.5 text-center ${totalNoStock > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{totalNoStock || '0'}</td>
                            <td className={`px-2 py-1.5 text-center ${totalShort > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{totalShort || '0'}</td>
                            <td className="px-2 py-1.5 text-right text-blue-300">{fmtTr(activeGrandStockVal)}</td>
                            <td className={`px-2 py-1.5 text-center italic ${grandMOS < 1 ? 'text-rose-400' : grandMOS > 12 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {grandMOS > 0 ? `${grandMOS.toFixed(1)}M` : '—'}
                            </td>
                            <td className={`px-2 py-1.5 text-center ${totalBoItems > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{totalBoItems || '0'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    // ── Full render ─────────────────────────────────────────────────────────────
    return (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                <div>
                    <h3 className="font-black text-sm uppercase tracking-widest">Ma Trận Cung Ứng Tổng Thể</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Tính cho {totalItems} mã trong dự thảo</p>
                </div>
                <button
                    onClick={() => setShowSim(p => !p)}
                    className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-colors ${showSim ? 'bg-blue-500 border-blue-400 text-white' : 'border-slate-500 text-slate-400 hover:text-white hover:border-slate-400'}`}
                >
                    {showSim ? 'SIMULATED' : 'HIỆN TẠI'}
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-separate border-spacing-0 min-w-[900px]">
                    <thead>
                        <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-black">
                            <th className="px-3 py-2.5 text-left border-r border-slate-100">Phân Khúc Chiến Lược</th>
                            <th className="px-3 py-2.5 text-right">Turnover (tr)</th>
                            <th className="px-3 py-2.5 text-right">% Turn</th>
                            <th className="px-3 py-2.5 text-center">SKU</th>
                            <th className="px-3 py-2.5 text-center text-rose-600">OOS</th>
                            <th className="px-3 py-2.5 text-center text-amber-600">Risk</th>
                            <th className="px-3 py-2.5 text-right text-blue-600 bg-blue-50/30">Stock Val</th>
                            <th className="px-3 py-2.5 text-center text-slate-600 bg-blue-50/30 border-x border-blue-100">MOS</th>
                            <th className="px-3 py-2.5 text-right text-indigo-600">PO Val</th>
                            <th className="px-3 py-2.5 text-center text-rose-600">BO #</th>
                            <th className="px-3 py-2.5 text-right text-rose-600">BO Val</th>
                            <th className="px-3 py-2.5 text-center">Exc #</th>
                            <th className="px-3 py-2.5 text-right">Exc Val</th>
                            <th className="px-3 py-2.5 text-center">% Exc</th>
                        </tr>
                    </thead>
                    <tbody>
                        {LOIS_HIERARCHY.map(group => {
                            const headerRow = renderRow(group.label, group.sub, true, group.color);
                            const subRows = group.sub.map(sub => renderRow(sub, [sub], false));
                            if (!headerRow) return null;
                            return (
                                <React.Fragment key={group.label}>
                                    {headerRow}
                                    {subRows}
                                </React.Fragment>
                            );
                        })}

                        {/* Grand Total */}
                        <tr className="bg-slate-800 text-white text-xs font-black border-t-2 border-slate-600">
                            <td className="px-3 py-3 border-r border-slate-600">TỔNG CỘNG</td>
                            <td className="px-3 py-3 text-right">{fmtTr(grand.grandTurnover)}</td>
                            <td className="px-3 py-3 text-right text-slate-400 italic">100%</td>
                            <td className="px-3 py-3 text-center">{totalItems}</td>
                            <td className={`px-3 py-3 text-center ${totalNoStock > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{totalNoStock || '0'}</td>
                            <td className={`px-3 py-3 text-center ${totalShort > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{totalShort || '0'}</td>
                            <td className="px-3 py-3 text-right text-blue-300">{fmtTr(activeGrandStockVal)}</td>
                            <td className={`px-3 py-3 text-center italic ${grandMOS < 1 ? 'text-rose-400' : grandMOS > 12 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {grandMOS > 0 ? `${grandMOS.toFixed(1)}M` : '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-300">{fmtTr(activeGrandPoVal)}</td>
                            <td className={`px-3 py-3 text-center ${totalBoItems > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{totalBoItems || '0'}</td>
                            <td className={`px-3 py-3 text-right ${totalBoVal > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{totalBoVal > 0 ? fmtTr(totalBoVal) : '0'}</td>
                            <td className="px-3 py-3 text-center text-slate-400">{totalExcessItems || '0'}</td>
                            <td className="px-3 py-3 text-right text-slate-400">{fmtTr(totalExcessVal)}</td>
                            <td className={`px-3 py-3 text-center italic ${grandExcPct > 20 ? 'text-rose-400' : grandExcPct > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {grandExcPct.toFixed(1)}%
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};
