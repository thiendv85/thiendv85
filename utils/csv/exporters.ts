
import { InventoryItem, getDebtStatus } from '../../types/inventory';
import { SupersessionMapping } from '../supersessionGraph';
import { splitDraftQty } from '../splitDraft';
import { safeCSV, calculatePickingPriority } from './helpers';

// --- GENERIC EXPORT UTILITY ---
export const exportToExcelCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    // 1. Extract Headers dynamically from the first object
    const headers = Object.keys(data[0]);

    // 2. Build Body
    const csvContent = [
        headers.map(h => safeCSV(h)).join(","),
        ...data.map(row =>
            headers.map(field => safeCSV(row[field])).join(",")
        )
    ].join("\n");

    // 3. Download with BOM (﻿) for Excel UTF-8 recognition
    const blob = new Blob(["﻿" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Export general inventory data to CSV
 * UPDATED: Includes Regional Analysis and PO Arriving This Month + Enhanced UI Columns
 */
// --- CSV EXPORT OPTIONS ---
export interface CsvExportOptions {
    separator?: ',' | ';' | '\t';
    encoding?: 'utf8-bom' | 'utf8';
    decimalPrecision?: number;
    exportColumns?: {
        itemCode?: boolean; itemName?: boolean; typeCar?: boolean; loisGroup?: boolean;
        trendFlag?: boolean; status?: boolean; backorder?: boolean; backorderNB?: boolean;
        backorderBB?: boolean; stockNB?: boolean; stockBB?: boolean; totalInventory?: boolean;
        totalPO?: boolean; poThisMonth?: boolean; debtPriority?: boolean; debtStatus?: boolean;
        baseForecast?: boolean; avgQty3M?: boolean; avgQty6M?: boolean; avgQty12M?: boolean;
        mos?: boolean; rop?: boolean; stockMax?: boolean; safetyStock?: boolean;
        unitCostPP?: boolean; unitCostFOB?: boolean; stockValue?: boolean;
        excessQty?: boolean; excessValue?: boolean; dealerInventory?: boolean;
        note?: boolean; snp?: boolean;
    };
}

const getSep = (options?: CsvExportOptions) => {
    if (options?.separator === ';') return ';';
    if (options?.separator === '\t') return '\t';
    return ',';
};

const getBOM = (options?: CsvExportOptions) => options?.encoding === 'utf8' ? '' : '﻿';

const getPrec = (options?: CsvExportOptions) => options?.decimalPrecision ?? 2;

export const exportToCSV = (data: InventoryItem[], filename: string, options?: CsvExportOptions) => {
    if (data.length === 0) return;
    const sep = getSep(options);
    const bom = getBOM(options);
    const prec = getPrec(options);
    const cols = options?.exportColumns;

    // Build column definitions: [key, header, valueFunc]
    type ColDef = { key: string; header: string; value: (item: InventoryItem, stockNB: number, stockBB: number) => any };
    const allCols: ColDef[] = [
        { key: 'itemCode', header: 'ItemCode', value: (i) => safeCSV(i.ItemCode) },
        { key: 'itemName', header: 'ItemName', value: (i) => safeCSV(i.ItemName) },
        { key: 'status', header: 'Status', value: (i) => safeCSV(i.Status) },
        { key: 'typeCar', header: 'TypeCar', value: (i) => safeCSV(i.TypeCar) },
        { key: 'loisGroup', header: 'LOISGroup', value: (i) => safeCSV(i.LOISGroup) },
        { key: 'trendFlag', header: 'TrendFlag', value: (i) => safeCSV(i.TrendFlag) },
        { key: 'backorder', header: 'Backorder_Total', value: (i) => safeCSV(i.Backorder) },
        { key: 'backorderNB', header: 'Backorder_NB', value: (i) => safeCSV(i.Backorder_NB || 0) },
        { key: 'backorderBB', header: 'Backorder_BB', value: (i) => safeCSV(i.Backorder_BB || 0) },
        { key: 'stockNB', header: 'Stock_NB_OH_DC', value: (_, sNB) => safeCSV(sNB) },
        { key: 'stockBB', header: 'Stock_BB_OH_DC', value: (_, _sNB, sBB) => safeCSV(sBB) },
        { key: 'totalInventory', header: 'Total_Inventory', value: (i) => safeCSV(i.TotalInventory) },
        { key: 'totalPO', header: 'TotalPO', value: (i) => safeCSV(i.TotalPO) },
        { key: 'poThisMonth', header: 'PO_ThisMonth', value: (i) => safeCSV(i.computed?.incomingCurrentMonth || 0) },
        { key: 'debtPriority', header: 'Debt_Priority', value: (i) => safeCSV(`P${calculatePickingPriority(i)}`) },
        { key: 'debtStatus', header: 'Debt_Status', value: (i) => safeCSV(getDebtStatus(i)) },
        { key: 'avgQty3M', header: 'AVG_3M', value: (i) => safeCSV(i.AvgQty3M || 0) },
        { key: 'avgQty6M', header: 'AVG_6M', value: (i) => safeCSV(i.AvgQty6M || 0) },
        { key: 'avgQty12M', header: 'AVG_12M', value: (i) => safeCSV(i.AvgQty12M || 0) },
        { key: 'baseForecast', header: 'BaseForecast', value: (i) => safeCSV(i.BaseForecast || 0) },
        { key: 'mos', header: 'MOS', value: (i) => safeCSV((i.computed?.mos || 0).toFixed(prec)) },
        { key: 'rop', header: 'ROP', value: (i) => safeCSV((i.computed?.rop || 0).toFixed(prec)) },
        { key: 'stockMax', header: 'StockMax', value: (i) => safeCSV((i.computed?.stockMax || 0).toFixed(prec)) },
        { key: 'safetyStock', header: 'SafetyStock', value: (i) => safeCSV((i.computed?.safetyStock || 0).toFixed(prec)) },
        { key: 'unitCostPP', header: 'UnitCost_PP', value: (i) => safeCSV(i.UnitCost_PP) },
        { key: 'unitCostFOB', header: 'UnitCost_FOB', value: (i) => safeCSV(i.UnitCost_FOB) },
        { key: 'stockValue', header: 'StockValue', value: (i) => safeCSV((i.computed?.stockValue || 0).toFixed(prec)) },
        { key: 'excessQty', header: 'ExcessQty', value: (i) => safeCSV((i.computed?.excessQty || 0).toFixed(prec)) },
        { key: 'excessValue', header: 'ExcessValue', value: (i) => safeCSV((i.computed?.excessValue || 0).toFixed(prec)) },
        { key: 'dealerInventory', header: 'DealerInventory', value: (i) => safeCSV(i.DealerInventory || 0) },
        { key: 'note', header: 'Note', value: (i) => safeCSV(i.Note || '') },
        { key: 'snp', header: 'SNP', value: (i) => safeCSV(i.SNP || 1) },
    ];

    // Filter columns: if exportColumns is provided, only include those set to true
    const activeCols = cols
        ? allCols.filter(c => (cols as any)[c.key] !== false)
        : allCols.filter(c => ['itemCode', 'itemName', 'status', 'loisGroup', 'trendFlag', 'backorder', 'stockNB', 'stockBB', 'totalInventory', 'totalPO', 'poThisMonth', 'debtPriority', 'debtStatus', 'avgQty3M', 'baseForecast', 'mos', 'unitCostPP', 'stockValue', 'dealerInventory'].includes(c.key));

    const csvContent = [
        activeCols.map(c => c.header).join(sep),
        ...data.map(item => {
            const stockNB = (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0);
            const stockBB = (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0);
            return activeCols.map(c => c.value(item, stockNB, stockBB)).join(sep);
        })
    ].join('\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportOrderDraftToCSV = (list: any[], filename: string, costBasis: string, options?: CsvExportOptions) => {
    if (list.length === 0) return;
    const sep = getSep(options);
    const bom = getBOM(options);
    const prec = getPrec(options);
    const cols = options?.exportColumns;

    // Each col: key (matches orderDraftColumns key), header, valueFunc
    type DraftColDef = { key: string; header: string; value: (entry: any, item: any, derived: any) => any };
    const allCols: DraftColDef[] = [
        { key: 'itemCode', header: 'Mã Hàng (ItemCode)', value: (_, i) => safeCSV(i.ItemCode) },
        { key: 'itemName', header: 'Tên Hàng (ItemName)', value: (_, i) => safeCSV(i.ItemName) },
        { key: 'status', header: 'Trạng Thái', value: (_, i) => safeCSV(i.Status || '') },
        { key: 'typeCar', header: 'TypeCar', value: (_, i) => safeCSV(i.TypeCar || '') },
        { key: 'airQty', header: 'SL Đặt (AIR)', value: (e) => safeCSV(e.airQty) },
        { key: 'seaQty', header: 'SL Đặt (SEA)', value: (e) => safeCSV(e.seaQty) },
        { key: 'orderNB', header: 'Đề Xuất Đặt (Kho NB)', value: (_, __, d) => safeCSV(d.splitNB) },
        { key: 'orderBB', header: 'Đề Xuất Đặt (Kho BB)', value: (_, __, d) => safeCSV(d.splitBB) },
        { key: 'splitNote', header: 'Ghi chú chia kho', value: (_, __, d) => safeCSV(d.splitNote || '') },
        { key: 'totalQty', header: 'Tổng SL Đặt', value: (_, __, d) => safeCSV(d.totalQty) },
        { key: 'totalAmount', header: 'Thành Tiền', value: (_, __, d) => safeCSV(d.totalAmount.toFixed(prec)) },
        { key: 'currency', header: 'Tiền Tệ', value: (_, __, d) => safeCSV(d.currency) },
        { key: 'unitCost', header: 'Đơn Giá', value: (_, __, d) => safeCSV(d.unitCost) },
        { key: 'unitCostPP', header: 'Đơn Giá PP (VND)', value: (_, i) => safeCSV(i.UnitCost_PP || 0) },
        { key: 'unitCostFOB', header: 'Đơn Giá FOB (EUR)', value: (_, i) => safeCSV(i.UnitCost_FOB || 0) },
        // --- DRP / MULTI-ECHELON METRICS ---
        { key: 'forecastNB', header: 'Forecast NB', value: (_, i) => safeCSV(i.Forecast_NB || 0) },
        { key: 'forecastBB', header: 'Forecast BB', value: (_, i) => safeCSV(i.Forecast_BB || 0) },
        { key: 'poNB', header: 'Pipeline NB', value: (_, i) => safeCSV(i.TotalPO_NB || 0) },
        { key: 'poBB', header: 'Pipeline BB', value: (_, i) => safeCSV(i.TotalPO_BB || 0) },
        { key: 'reserveNB', header: 'Reserve NB (Net)', value: (_, i) => safeCSV(i.computed?.transfer?.reserveNB || 0) },
        { key: 'reserveBB', header: 'Reserve BB (Net)', value: (_, i) => safeCSV(i.computed?.transfer?.reserveBB || 0) },
        { key: 'transferNBtoBB', header: 'ĐK: Cấp đi (NB -> BB)', value: (_, i) => safeCSV(i.computed?.transfer?.transferNBtoBB || 0) },
        { key: 'transferBBtoNB', header: 'ĐK: Cấp đi (BB -> NB)', value: (_, i) => safeCSV(i.computed?.transfer?.transferBBtoNB || 0) },
        { key: 'suggestedOrderNB', header: 'Gợi Ý Đặt Hãng (NB)', value: (_, i) => safeCSV(i.computed?.transfer?.suggestedOrderNB || 0) },
        { key: 'suggestedOrderBB', header: 'Gợi Ý Đặt Hãng (BB)', value: (_, i) => safeCSV(i.computed?.transfer?.suggestedOrderBB || 0) },
        // -----------------------------------
        { key: 'noteOrder', header: 'Ghi chú (Order)', value: (e) => safeCSV(e.note) },
        { key: 'noteData', header: 'Ghi chú (Data)', value: (_, i) => safeCSV(i.Note) },
        { key: 'snp', header: 'SNP', value: (_, i) => safeCSV(i.SNP) },
        { key: 'loisGroup', header: 'LOIS', value: (_, i) => safeCSV(i.LOISGroup) },
        { key: 'trendFlag', header: 'Trend', value: (_, i) => safeCSV(i.TrendFlag) },
        { key: 'available', header: 'Tồn Kho (Available)', value: (_, i) => safeCSV(i.computed?.available || 0) },
        { key: 'netDemand', header: 'Tồn Ròng (NetDemand)', value: (_, i) => safeCSV(i.NetDemand || 0) },
        { key: 'dealerInventory', header: 'Tồn Đại Lý (Dealer)', value: (_, i) => safeCSV(i.DealerInventory || 0) },
        { key: 'safetyStock', header: 'Safety Stock', value: (_, i) => safeCSV(i.computed?.safetyStock || 0) },
        { key: 'incomingMonth', header: 'Hàng Về T.Này (Incoming)', value: (_, i) => safeCSV(i.computed?.incomingCurrentMonth || 0) },
        { key: 'totalPO', header: 'Tổng PO', value: (_, i) => safeCSV(i.TotalPO || 0) },
        { key: 'backorder', header: 'Nợ Đơn (BO)', value: (_, i) => safeCSV(i.Backorder || 0) },
        { key: 'debtPriority', header: 'Mức Ưũ Tiên (P)', value: (_, __, d) => safeCSV(`P${d.debtPriority}`) },
        { key: 'debtStatus', header: 'Trạng Thái Nợ', value: (_, __, d) => safeCSV(d.debtStatus) },
        { key: 'suggestQty', header: 'SL Gợi Ý (SEA)', value: (_, i) => safeCSV(i.computed?.gapOrExcess || 0) },
        { key: 'suggestBOQty', header: 'SL Gợi Ý (BO/AIR)', value: (_, i) => safeCSV(i.computed?.suggestedBO || 0) },
        { key: 'avgQty3M', header: 'AVG 3M', value: (_, i) => safeCSV(i.AvgQty3M || 0) },
        { key: 'avgQty6M', header: 'AVG 6M', value: (_, i) => safeCSV(i.AvgQty6M || 0) },
        { key: 'avgQty12M', header: 'AVG 12M', value: (_, i) => safeCSV(i.AvgQty12M || 0) },
        { key: 'avgQty24M', header: 'AVG 24M', value: (_, i) => safeCSV(i.AvgQty24M || 0) },
        { key: 'baseForecast', header: 'Base FC', value: (_, i) => safeCSV(i.BaseForecast || 0) },
        { key: 'salesM1', header: 'Bán T.Gần (M1)', value: (_, i) => safeCSV(i.SalesHistory?.slice(-1)[0] || 0) },
        { key: 'mos', header: 'MOS', value: (_, i) => safeCSV((i.computed?.mos || 0).toFixed(prec)) },
        { key: 'currentCst', header: 'CST Hiện Tại', value: (_, __, d) => safeCSV(d.currentCst.toFixed(prec)) },
        { key: 'cstAfterOrder', header: 'CST Sau Đặt', value: (_, __, d) => safeCSV(d.cstProjected.toFixed(prec)) },
        { key: 'rop', header: 'ROP (Point)', value: (_, i) => safeCSV(i.computed?.rop || 0) },
        { key: 'stockMax', header: 'Stock Max', value: (_, i) => safeCSV(i.computed?.stockMax || 0) },
    ];

    // Filter: if exportColumns provided use it, otherwise show all
    const activeCols = cols
        ? allCols.filter(c => (cols as any)[c.key] !== false)
        : allCols;

    const csvContent = [
        activeCols.map(c => c.header).join(sep),
        ...list.map(entry => {
            const item = entry.item;
            const unitCost = costBasis === 'PP' ? item.UnitCost_PP : item.UnitCost_FOB;
            const currency = costBasis === 'PP' ? 'VND' : 'EUR';
            const totalQty = entry.airQty + entry.seaQty;
            const totalAmount = totalQty * unitCost;
            const dailyDemand = item.computed?.demandRateDaily || 0;
            const monthlyDemand = dailyDemand * 30;
            const currentCst = monthlyDemand > 0
                ? (item.NetDemand + item.DealerInventory) / monthlyDemand
                : 99.9;
            const cstProjected = monthlyDemand > 0
                ? (item.NetDemand + item.DealerInventory + totalQty) / monthlyDemand
                : 99.9;
            const sugNB = item.computed?.transfer?.suggestedOrderNB || 0;
            const sugBB = item.computed?.transfer?.suggestedOrderBB || 0;
            const split = splitDraftQty(totalQty, sugNB, sugBB, {
                backorderNB: item.Backorder_NB,
                backorderBB: item.Backorder_BB,
                availableNB: (item.QuantityInventory_NB || 0) + (item.QuantityDC_NB || 0),
                availableBB: (item.QuantityInventory_BB || 0) + (item.QuantityDC_BB || 0),
            });
            const derived = {
                totalQty, totalAmount, currency, unitCost, currentCst, cstProjected,
                splitNB: split.nb,
                splitBB: split.bb,
                splitNote: split.note,
                debtPriority: calculatePickingPriority(item, totalQty),
                debtStatus: getDebtStatus(item),
            };
            return activeCols.map(c => c.value(entry, item, derived)).join(sep);
        })
    ].join('\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 150);
};

export const exportBoResolutionToCSV = (rows: any[], filename: string, options?: CsvExportOptions) => {
    if (rows.length === 0) return;
    const sep = getSep(options);
    const bom = getBOM(options);
    const header = Object.keys(rows[0]).join(sep);
    const body = rows.map(r => Object.values(r).map(val => safeCSV(val)).join(sep)).join('\n');
    const blob = new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Fix for RepairPackageOptimizer missing export
export const generateMatrixCSV = (data: any[], filename: string) => {
    exportToExcelCSV(data, filename);
};

export const exportSupersessionMappingCSV = (mappings: SupersessionMapping[], filename: string) => {
    const headers = ["OldPartNumber", "NewPartNumber", "Interchangeable"];
    const rows = mappings.map(m => [
        safeCSV(m.oldPart),
        safeCSV(m.newPart),
        safeCSV(m.interchangeable)
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
