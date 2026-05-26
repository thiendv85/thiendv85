import React, { useMemo } from 'react';
import { InventoryItem } from '../../types/inventory';
import { Typography } from '../../components/Typography';
import { FaIcon } from '../../components/Icon';
import { useLanguage } from '../../utils/i18n';

const currencyFormatterVND = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
});
const currencyFormatterEUR = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
});

export interface DraftAnalysisChartsProps {
    itemMap: Map<string, InventoryItem>;
    orderQuantities: Record<string, { air: number; sea: number }>;
    costBasis: 'PP' | 'FOB';
}

export const DraftAnalysisCharts = ({ itemMap, orderQuantities, costBasis }: DraftAnalysisChartsProps) => {
    const { t } = useLanguage();
    const formatter = costBasis === 'PP' ? currencyFormatterVND : currencyFormatterEUR;
    const stats = useMemo(() => {
        let airVal = 0,
            seaVal = 0,
            airQty = 0,
            seaQty = 0,
            airSkus = 0,
            seaSkus = 0,
            totalSkus = 0;
        (Object.entries(orderQuantities) as [string, { air: number; sea: number }][]).forEach(([code, qty]) => {
            const item = itemMap.get(code);
            if (!item) return;
            const unitCost = costBasis === 'PP' ? item.UnitCost_PP : item.UnitCost_FOB;
            airVal += qty.air * unitCost;
            seaVal += qty.sea * unitCost;
            airQty += qty.air;
            seaQty += qty.sea;
            if (qty.air > 0) airSkus++;
            if (qty.sea > 0) seaSkus++;
            if (qty.air > 0 || qty.sea > 0) totalSkus++;
        });
        return { airVal, seaVal, airQty, seaQty, airSkus, seaSkus, totalSkus, totalVal: airVal + seaVal };
    }, [itemMap, orderQuantities, costBasis]);
    if (stats.totalVal === 0) return null;
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-atp-action/30 shadow-sm transition-all group/air">
                <div>
                    <Typography
                        variant="label"
                        className="text-slate-500 mb-4 flex items-center gap-2 transition-transform group-hover/air:translate-x-1"
                    >
                        <FaIcon className="fas fa-plane-up text-atp-action" /> {t('ord_air_title')}
                    </Typography>
                    <Typography variant="h1" className="text-atp-action tabular-nums">
                        {formatter.format(stats.airVal)}
                    </Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold tabular-nums uppercase">
                        {stats.airQty.toLocaleString()} units &bull; {stats.airSkus.toLocaleString()} SKUs
                    </Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div
                        className="h-full bg-atp-action transition-all duration-1000 shadow-[0_0_8px_rgba(220,38,38,0.3)]"
                        style={{ width: `${(stats.airVal / stats.totalVal) * 100}%` }}
                    ></div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-atp-secondary/30 shadow-sm transition-all group/sea">
                <div>
                    <Typography
                        variant="label"
                        className="text-slate-500 mb-4 flex items-center gap-2 transition-transform group-hover/sea:translate-x-1"
                    >
                        <FaIcon className="fas fa-ship text-atp-secondary" /> {t('ord_sea_title')}
                    </Typography>
                    <Typography variant="h1" className="text-atp-secondary tabular-nums">
                        {formatter.format(stats.seaVal)}
                    </Typography>
                    <Typography variant="label" className="text-slate-600 mt-1 font-bold tabular-nums uppercase">
                        {stats.seaQty.toLocaleString()} units &bull; {stats.seaSkus.toLocaleString()} SKUs
                    </Typography>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200">
                    <div
                        className="h-full bg-atp-secondary transition-all duration-1000 shadow-[0_0_8px_rgba(51,65,85,0.3)]"
                        style={{ width: `${(stats.seaVal / stats.totalVal) * 100}%` }}
                    ></div>
                </div>
            </div>
            <div className="bg-atp-primary p-6 rounded-2xl flex flex-col justify-center text-white relative overflow-hidden shadow-glass group/total">
                <div className="absolute -right-4 -bottom-4 opacity-10 text-8xl transform -rotate-12 transition-transform group-hover/total:scale-125 duration-700">
                    <FaIcon className="fas fa-cart-flatbed-boxes" />
                </div>
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,#ffffff10,transparent)] pointer-events-none"></div>
                <Typography variant="label" className="text-slate-300 mb-2">
                    {t('ord_total_val')}
                </Typography>
                <Typography variant="h1" className="text-white text-4xl tabular-nums">
                    {formatter.format(stats.totalVal)}
                </Typography>
                <Typography variant="label" className="text-slate-300 mt-1 font-bold tabular-nums uppercase">
                    {(stats.airQty + stats.seaQty).toLocaleString()} units &bull; {stats.totalSkus.toLocaleString()}{' '}
                    SKUs
                </Typography>
                <Typography
                    variant="label"
                    className="text-slate-400 mt-2 block !text-[10px] uppercase tracking-widest"
                >
                    {t('ord_total_hint')}
                </Typography>
            </div>
        </div>
    );
};
