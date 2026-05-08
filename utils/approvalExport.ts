import type { ApprovalRequest, InventoryItem } from '../types/inventory';
import { exportOrderDraftToCSV, type CsvExportOptions } from './csvParser';

/**
 * Adapter: chuyển snapshot_data của ApprovalRequest thành shape mà
 * exportOrderDraftToCSV (Ordering page) cần, để dùng đúng rule
 * `appSettings.orderDraftColumns`.
 */
export interface ApprovalExportEntry {
    item: InventoryItem;
    airQty: number;
    seaQty: number;
    note: string;
}

const buildEntries = (request: ApprovalRequest): ApprovalExportEntry[] => {
    const snap = request.snapshot_data;
    const ctxList = snap?.inventory_context || [];
    const qtys = snap?.quantities || {};
    const notes = snap?.notes || {};

    const entries: ApprovalExportEntry[] = [];
    ctxList.forEach((ctx) => {
        const q = qtys[ctx.itemCode] || { air: 0, sea: 0 };
        if ((q.air || 0) <= 0 && (q.sea || 0) <= 0) return; // chỉ xuất SKU thực sự đặt

        const stockNB = ctx.available_NB ?? 0;
        const stockBB = ctx.available_BB ?? 0;
        const totalPO_NB = ctx.totalPO_NB ?? 0;
        const totalPO_BB = ctx.totalPO_BB ?? 0;
        const backorderNB = ctx.backorder_NB ?? 0;
        const backorderBB = ctx.backorder_BB ?? 0;

        const totalQty = (q.air || 0) + (q.sea || 0);
        const totalSugRaw = (ctx.qtyNB ?? 0) + (ctx.qtyBB ?? 0);
        const sugNB = ctx.qtyNB ?? 0;
        const sugBB = ctx.qtyBB ?? 0;

        // Compose minimal InventoryItem-like object matching what
        // exportOrderDraftToCSV reads. Unknown fields default to 0/empty.
        const item: any = {
            ItemCode: ctx.itemCode,
            ItemName: ctx.itemName,
            Status: ctx.status || '',
            TypeCar: ctx.typecar || '',
            LOISGroup: ctx.loisGroup || '',
            TrendFlag: ctx.trendFlag || '',
            UnitCost_PP: ctx.unitCost || 0,
            UnitCost_FOB: ctx.unitCost || 0,
            Forecast_NB: 0,
            Forecast_BB: 0,
            TotalPO: ctx.totalPO || 0,
            TotalPO_NB: totalPO_NB,
            TotalPO_BB: totalPO_BB,
            Backorder: ctx.backorder || 0,
            Backorder_NB: backorderNB,
            Backorder_BB: backorderBB,
            DealerInventory: ctx.dealerInventory || 0,
            NetDemand: ctx.available || 0,
            BaseForecast: ctx.baseForecast || 0,
            AvgQty3M: ctx.avgQty3M || 0,
            AvgQty6M: ctx.avgQty6M || 0,
            AvgQty12M: ctx.avgQty12M || 0,
            AvgQty24M: ctx.avgQty24M || 0,
            SalesHistory: ctx.salesHistory || [],
            Note: '',
            SNP: 1,
            QuantityInventory_NB: stockNB,
            QuantityInventory_BB: stockBB,
            QuantityDC_NB: 0,
            QuantityDC_BB: 0,
            computed: {
                available: ctx.available || 0,
                mos: ctx.mos || 0,
                rop: ctx.rop || 0,
                stockMax: ctx.stockMax || 0,
                safetyStock: ctx.safetyStock || 0,
                stockValue: (ctx.unitCost || 0) * (ctx.available || 0),
                excessQty: 0,
                excessValue: 0,
                incomingCurrentMonth: ctx.incomingCurrentMonth || 0,
                gapOrExcess: 0,
                suggestedBO: 0,
                demandRateDaily: ctx.baseForecast ? ctx.baseForecast / 30 : 0,
                transfer: {
                    suggestedOrderNB: sugNB,
                    suggestedOrderBB: sugBB,
                    reserveNB: 0,
                    reserveBB: 0,
                    transferNBtoBB: 0,
                    transferBBtoNB: 0,
                },
            },
        };

        // Tham chiếu để giữ totalQty / totalSugRaw không bị unused
        void totalQty;
        void totalSugRaw;

        entries.push({
            item: item as InventoryItem,
            airQty: q.air || 0,
            seaQty: q.sea || 0,
            note: notes[ctx.itemCode] || '',
        });
    });

    return entries;
};

/**
 * Xuất đơn phê duyệt ra CSV theo rule cột của Ordering page
 * (`appSettings.orderDraftColumns`).
 */
export const exportApprovalRequestToCSV = (
    request: ApprovalRequest,
    costBasis: 'PP' | 'FOB',
    options?: CsvExportOptions,
) => {
    const entries = buildEntries(request);
    if (entries.length === 0) return false;

    const safeName = (request.draft_name || 'don-hang')
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 60);
    const dateStr = new Date(request.submitted_at || Date.now()).toISOString().slice(0, 10);
    const filename = `Approval_${safeName}_${dateStr}.csv`;

    exportOrderDraftToCSV(entries, filename, costBasis, options);
    return true;
};
