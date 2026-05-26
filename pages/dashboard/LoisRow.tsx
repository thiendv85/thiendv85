import React from 'react';
import { LoisProfile } from '../../types/inventory';
import { Typography } from '../../components/Typography';
import { FaIcon } from '../../components/Icon';
import { useDevice } from '../../hooks/useDevice';

export interface LoisRowProps {
    label: string;
    subKeys: string[];
    isHeader?: boolean;
    groupColor?: string;
    matrixData: Record<string, any>;
    grandStats: any;
    loisProfiles: LoisProfile[];
    selectedSubgroup: string | null;
    onToggleSubgroup: (subgroup: string) => void;
    formatNum: (val: number) => string;
}

export const LoisRow = React.memo(
    ({
        label,
        subKeys,
        isHeader = false,
        groupColor,
        matrixData,
        grandStats,
        loisProfiles,
        selectedSubgroup,
        onToggleSubgroup,
        formatNum,
    }: LoisRowProps) => {
        const { isMobile } = useDevice();

        const row = {
            items: 0,
            turnover: 0,
            noStock: 0,
            short: 0,
            stockVal: 0,
            poVal: 0,
            excessItems: 0,
            excessVal: 0,
            boItems: 0,
            boValue: 0,
            bmwCount: 0,
            trendSum: 0,
            trendCount: 0,
        };
        subKeys.forEach(k => {
            if (matrixData[k]) {
                row.items += matrixData[k].items;
                row.turnover += matrixData[k].turnover;
                row.noStock += matrixData[k].noStock;
                row.short += matrixData[k].short;
                row.stockVal += matrixData[k].stockVal;
                row.poVal += matrixData[k].poVal;
                row.excessItems += matrixData[k].excessItems;
                row.excessVal += matrixData[k].excessVal;
                row.boItems += matrixData[k].boItems;
                row.boValue += matrixData[k].boValue;
                row.bmwCount += matrixData[k].bmwCount;
                row.trendSum += matrixData[k].trendSum;
                row.trendCount += matrixData[k].trendCount;
            }
        });

        if (row.items === 0 && !isHeader) return null;

        const isActive = !isHeader && subKeys.length === 1 && selectedSubgroup === subKeys[0];
        const avgTrend = row.trendCount > 0 ? row.trendSum / row.trendCount : 0;
        const excessPct = row.stockVal > 0 ? (row.excessVal / row.stockVal) * 100 : 0;
        const actualMOS = row.turnover > 0 ? (row.stockVal * 12) / row.turnover : 0;

        const profile = !isHeader && subKeys.length === 1 ? loisProfiles.find(p => p.id === subKeys[0]) || null : null;
        const targetMOS = profile ? profile.targetMOS : null;
        const targetExcess = profile ? profile.targetExcessPct : null;
        const subDesc = profile ? profile.name : '';

        const mosOk = targetMOS && actualMOS > 0 ? actualMOS >= targetMOS * 0.5 && actualMOS <= targetMOS * 1.5 : null;
        const excessOk = targetExcess ? excessPct <= targetExcess : null;

        return (
            <tr
                onClick={() => !isHeader && subKeys.length === 1 && onToggleSubgroup(subKeys[0])}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        !isHeader && subKeys.length === 1 && onToggleSubgroup(subKeys[0]);
                    }
                }}
                role={isHeader ? 'presentation' : 'button'}
                tabIndex={isHeader ? -1 : 0}
                aria-label={isHeader ? undefined : `${label} — filter group`}
                className={`${isHeader ? 'bg-slate-50/50 uppercase tracking-widest' : isActive ? 'bg-blue-50/80 shadow-inner' : 'bg-white hover:bg-slate-50/80'} border-b border-slate-100 transition-all cursor-pointer text-sm hover:translate-x-1 duration-200 focus:outline-none focus:bg-blue-50`}
            >
                <td
                    className={`px-3 py-2 border-r border-slate-100 ${isHeader ? 'text-slate-900 font-black' : 'text-slate-700'}`}
                >
                    <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                        {isHeader ? (
                            <>
                                <div className={`w-1.5 h-3.5 ${groupColor} rounded-full shadow-sm flex-shrink-0`}></div>
                                <Typography variant="body" className="font-black truncate">
                                    {label}
                                </Typography>
                            </>
                        ) : (
                            <div
                                className={`segment-pill ${
                                    row.noStock > 0
                                        ? 'segment-pill-alert'
                                        : row.short > 0
                                          ? 'segment-pill-warning'
                                          : 'segment-pill-success'
                                }`}
                            >
                                {label}
                            </div>
                        )}
                        {!isHeader && subDesc && (
                            <span className="text-slate-400 font-bold ml-1.5 text-[9px] tracking-tight truncate opacity-70">
                                — {subDesc}
                            </span>
                        )}
                    </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-slate-800">
                    <Typography variant="body-sm" className="font-bold tabular-nums">
                        {formatNum(row.turnover)}
                    </Typography>
                    {!isHeader && !isMobile && subKeys.length === 1 && row.turnover > 0 && (
                        <Typography
                            variant="label"
                            className={`ml-1 ${avgTrend > 0 ? 'text-atp-success' : 'text-atp-action'}`}
                        >
                            {avgTrend > 0 ? '↑' : '↓'}
                            {Math.abs(avgTrend).toFixed(0)}%
                        </Typography>
                    )}
                </td>
                <td className={`px-3 py-1.5 text-right ${isMobile ? 'hidden' : ''}`}>
                    <Typography variant="label" className="text-slate-400 font-bold !italic">
                        {((row.turnover / (grandStats.grandTurnover || 1)) * 100).toFixed(1)}%
                    </Typography>
                </td>
                <td className="px-3 py-2 text-center">
                    <Typography variant="body-sm" className="text-slate-500 tabular-nums">
                        {row.items.toLocaleString()}
                    </Typography>
                </td>
                <td className={`px-3 py-2 text-center ${row.noStock > 0 ? 'bg-atp-action/5' : ''}`}>
                    <Typography
                        variant="body-sm"
                        className={`font-bold tabular-nums ${row.noStock > 0 ? 'text-atp-action' : 'text-slate-300'}`}
                    >
                        {row.noStock > 0 ? row.noStock.toLocaleString() : '—'}
                    </Typography>
                </td>
                <td
                    className={`px-3 py-2 text-center ${row.short > 0 ? 'bg-atp-accent/5' : ''} ${isMobile ? 'hidden' : ''}`}
                >
                    <Typography
                        variant="body-sm"
                        className={`font-bold tabular-nums ${row.short > 0 ? 'text-atp-accent' : 'text-slate-300'}`}
                    >
                        {row.short > 0 ? row.short.toLocaleString() : '—'}
                    </Typography>
                </td>
                <td className={`px-3 py-1.5 text-right bg-blue-50/20 ${isMobile ? 'hidden' : ''}`}>
                    <Typography variant="body-sm" className="font-bold text-blue-700 tabular-nums">
                        {formatNum(row.stockVal)}
                    </Typography>
                </td>
                <td
                    className={`px-3 py-1 text-center border-x border-blue-100 bg-blue-50/20 ${isMobile ? 'hidden' : ''}`}
                >
                    <Typography
                        variant="label"
                        className={`!italic tabular-nums ${mosOk === true ? 'text-emerald-600' : mosOk === false ? 'text-rose-500' : 'text-slate-600'}`}
                    >
                        {actualMOS > 0 ? actualMOS.toFixed(1) : '-'}M
                    </Typography>
                    {targetMOS && (
                        <Typography
                            variant="label"
                            className="text-slate-400 font-bold leading-none mt-0.5 whitespace-nowrap block !text-[9px]"
                        >
                            <FaIcon className="fas fa-bullseye mr-0.5 opacity-70" />
                            {targetMOS}M
                        </Typography>
                    )}
                </td>
                <td className={`px-3 py-1.5 text-right uppercase ${isMobile ? 'hidden' : ''}`}>
                    <Typography variant="body-sm" className="font-bold text-slate-500 tabular-nums">
                        {formatNum(row.poVal)}
                    </Typography>
                </td>
                <td className={`px-3 py-2 text-center ${row.boItems > 0 ? 'bg-rose-50/30' : ''}`}>
                    <Typography
                        variant="body-sm"
                        className={`font-bold tabular-nums ${row.boItems > 0 ? 'text-rose-600' : 'text-slate-200'}`}
                    >
                        {row.boItems > 0 ? row.boItems.toLocaleString() : '—'}
                    </Typography>
                </td>
                <td
                    className={`px-3 py-2 text-right ${row.boValue > 0 ? 'bg-rose-50/30' : ''} ${isMobile ? 'hidden' : ''}`}
                >
                    <Typography
                        variant="body-sm"
                        className={`font-bold tabular-nums ${row.boValue > 0 ? 'text-rose-700' : 'text-slate-200'}`}
                    >
                        {row.boValue > 0 ? formatNum(row.boValue) : '—'}
                    </Typography>
                </td>
                <td className="px-3 py-2 text-center">
                    <Typography variant="body-sm" className="font-black text-slate-400 tabular-nums">
                        {row.excessItems > 0 ? row.excessItems.toLocaleString() : '—'}
                    </Typography>
                </td>
                <td className="px-3 py-2 text-right text-slate-400">
                    <Typography variant="body-sm" className="font-bold tabular-nums">
                        {formatNum(row.excessVal)}
                    </Typography>
                </td>
                <td className="px-3 py-1 text-center border-l border-slate-100">
                    <div
                        className={`font-black text-xs !italic tabular-nums ${excessOk === true ? 'text-emerald-600' : excessOk === false ? 'text-rose-500' : 'text-slate-600'}`}
                    >
                        {excessPct.toFixed(1)}%
                    </div>
                    {targetExcess && (
                        <div className="text-3xs text-slate-600 font-bold leading-none mt-0.5 whitespace-nowrap">
                            <FaIcon className="fas fa-bullseye mr-0.5 opacity-80" />≤{targetExcess}%
                        </div>
                    )}
                </td>
            </tr>
        );
    },
);
