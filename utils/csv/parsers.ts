
import { InventoryItem, DealerDetail, BackorderDetail, KittingDefinition, MonthlyData, getDebtStatus } from '../../types/inventory';
import { SupersessionMapping } from '../supersessionGraph';
import { detectDelimiter, parseLine, parseFlexibleDate } from './helpers';

export const parseDealerStockCSV = (text: string): Record<string, DealerDetail[]> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return {};

    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0], delimiter).map(h => h.trim().replace(/"/g, ''));

    const idxCode = headers.findIndex(h => h === 'ItemCode' || h.includes('Mã hàng'));
    const idxBranch = headers.findIndex(h => h === 'BranchName' || h.includes('Chi nhánh'));
    const idxShowroom = headers.findIndex(h => h === 'Showroom');
    const idxQty = headers.findIndex(h => h === 'Qty' || h.includes('Số lượng'));

    if (idxCode === -1 || idxQty === -1) return {};

    const dealerMap: Record<string, DealerDetail[]> = {};

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 2) return;

        const itemCode = row[idxCode]?.trim()?.toUpperCase();
        const qty = parseFloat(row[idxQty]?.replace(/,/g, '') || '0');
        const branchName = idxBranch > -1 ? row[idxBranch]?.trim() : 'Unknown';
        const showroom = idxShowroom > -1 ? row[idxShowroom]?.trim() : branchName;

        if (itemCode && qty > 0) {
            if (!dealerMap[itemCode]) dealerMap[itemCode] = [];
            dealerMap[itemCode].push({
                BranchName: branchName,
                Showroom: showroom,
                Qty: qty
            });
        }
    });

    return dealerMap;
};

export const parseBackorderCSV = (text: string): Record<string, BackorderDetail[]> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return {};

    const delimiter = detectDelimiter(text);
    const cleanHeaderLine = lines[0].replace(/^﻿/, '').trim();
    const headers = parseLine(cleanHeaderLine, delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());

    const getIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxMap = {
        DocDate: getIdx(['doc date', 'ngày ct', 'date', 'ngay chung tu', 'docdate']),
        DocNo: getIdx(['doc no', 'số ct', 'document number', 'so chung tu', 'order no', 'docno']),
        ItemCode: getIdx(['item no', 'item code', 'mã hàng', 'ma hang', 'part no', 'part number', 'product code', 'mã sp', 'itemcode']),
        ItemName: getIdx(['item name', 'tên hàng', 'ten hang', 'description', 'diễn giải', 'itemname']),
        Qty: getIdx(['quantity', 'số lượng', 'sl', 'so luong', 'bo qty', 'backorder', 'open qty', 'balance', 'quantityremain', 'booking', 'book qty']),
        Warehouse: getIdx(['warehouse', 'kho', 'wh', 'kho mb']),
        BranchCode: getIdx(['branch code', 'mã chi nhánh', 'branchcode']),
        BranchName: getIdx(['branch name', 'tên chi nhánh', 'branchname']),
        BranchCodeReceipt: getIdx(['branchcodereceipt', 'branch code receipt', 'mã chi nhánh nhận', 'branch_receipt']),
        TypeCar: getIdx(['type car', 'loại xe', 'typecar', 'model']),
        RowId: getIdx(['rowid', 'mã dòng']),
        KhoNo: getIdx(['khono', 'mã kho']),
        Note: getIdx(['note', 'ghi chú', 'diễn giải', 'remark', 'estimateddescription', 'ghi chu']),
        Showroom: getIdx(['showroom', 'sr', 'cửa hàng', 'sr-đl2', 'sr-dl2']),
        OrderType: getIdx(['order type', 'loại đơn', 'oproperty', 'loại yêu cầu']),
        ETA: getIdx(['eta', 'ngày về', 'expected', 'estimateddate']),
    };

    if (idxMap.ItemCode === -1 || idxMap.Qty === -1) {
        return {};
    }

    const boMap: Record<string, BackorderDetail[]> = {};

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < headers.length && row.length < 2) return;

        const itemCode = row[idxMap.ItemCode]?.trim()?.toUpperCase();
        const qty = parseFloat(row[idxMap.Qty]?.replace(/,/g, '') || '0');

        if (itemCode && qty > 0) {
            if (!boMap[itemCode]) boMap[itemCode] = [];
            const docDateStr = idxMap.DocDate > -1 ? row[idxMap.DocDate]?.trim() : '';
            const rawDate = parseFlexibleDate(docDateStr);

            boMap[itemCode].push({
                ItemCode: itemCode,
                ItemName: idxMap.ItemName > -1 ? row[idxMap.ItemName]?.trim() : '',
                DocDate: docDateStr,
                DocNo: idxMap.DocNo > -1 ? row[idxMap.DocNo]?.trim() : '',
                Qty: qty,
                Warehouse: idxMap.Warehouse > -1 ? row[idxMap.Warehouse]?.trim() : 'Unknown',
                BranchCode: idxMap.BranchCode > -1 ? row[idxMap.BranchCode]?.trim() : undefined,
                BranchName: idxMap.BranchName > -1 ? row[idxMap.BranchName]?.trim() : undefined,
                BranchCodeReceipt: idxMap.BranchCodeReceipt > -1 ? row[idxMap.BranchCodeReceipt]?.trim() : undefined,
                TypeCar: idxMap.TypeCar > -1 ? row[idxMap.TypeCar]?.trim() : undefined,
                RowId: idxMap.RowId > -1 ? row[idxMap.RowId]?.trim() : undefined,
                KhoNo: idxMap.KhoNo > -1 ? row[idxMap.KhoNo]?.trim() : undefined,
                Note: idxMap.Note > -1 ? row[idxMap.Note]?.trim() : undefined,
                Showroom: idxMap.Showroom > -1 ? row[idxMap.Showroom]?.trim() : undefined,
                OrderType: idxMap.OrderType > -1 ? row[idxMap.OrderType]?.trim() : undefined,
                ETA: idxMap.ETA > -1 ? row[idxMap.ETA]?.trim() : undefined,
                RawDate: rawDate
            });
        }
    });

    return boMap;
};

/**
 * parseMonthlyCSV — Parses File B (monthly coefficient CSV).
 * Returns a Record<ItemCode, MonthlyData> for merging into daily items.
 * All columns are optional; ItemCode is the only required key.
 */
export const parseMonthlyCSV = (text: string): Record<string, MonthlyData> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return {};

    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0].replace(/^﻿/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));

    const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const getIdx = (names: string[]) => {
        const ns = names.map(normalize);
        let idx = headers.findIndex(h => ns.includes(normalize(h)));
        if (idx !== -1) return idx;
        return headers.findIndex(h => ns.some(n => normalize(h).includes(n)));
    };

    const parseNum = (v: string) => { const n = parseFloat((v || '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };

    const idxCode = getIdx(['ItemCode', 'Ma hang', 'Mã hàng']);
    if (idxCode === -1) return {};

    const f = (names: string[]) => getIdx(names);

    const idxMap = {
        ItemName:     f(['ItemName', 'Tên hàng']),
        LOISGroup:    f(['LOISGroup', 'LOIS']),
        AvgQty3M:     f(['AvgQty3M', 'Bán 3T']),
        AvgQty6M:     f(['AvgQty6M', 'Bán 6T']),
        AvgQty12M:    f(['AvgQty12M', 'Bán 12T']),
        AvgQty24M:    f(['AvgQty24M', 'Bán 24T']),
        TrendFlag:    f(['TrendFlag', 'Xu hướng']),
        SafetyStock:  f(['SafetyStock']),
        ROPFinal:     f(['ROPFinal']),
        MaxHigh:      f(['MaxInventory_High']),
        MaxLow:       f(['MaxInventory_Low']),
        MaxMid:       f(['MaxInventory_Mid']),
        MOS:          f(['MOS']),
        BaseForecast: f(['BaseForecast']),
        ForecastNB:   f(['Forecast_NB']),
        ForecastBB:   f(['Forecast_BB']),
        OrderType:    f(['OrderType']),
        BranchGroup:  f(['BranchGroup']),
        ForecastEff:  f(['Forecast_eff']),
        ForecastM1:   f(['Forecast_M1']),
        ForecastM2:   f(['Forecast_M2']),
        ForecastM3:   f(['Forecast_M3']),
        SeasonFactor: f(['SeasonalityFactor']),
        SeasonM1:     f(['SeasonalityFactor_M1']),
        SeasonM2:     f(['SeasonalityFactor_M2']),
        SeasonM3:     f(['SeasonalityFactor_M3']),
        ForecastMethod:   f(['ForecastMethod']),
        ForecastDetail:   f(['ForecastMethodDetail']),
        TrendAdjMethod:   f(['TrendAdjMethod']),
        OrigForecast:     f(['BaseForecast_Orig']),
        LinRegSlope:      f(['LinRegSlope']),
        LinRegForecast:   f(['LinRegForecast']),
        SigmaEff:         f(['Sigma_eff']),
        CV:               f(['CV']),
        AlphaUsed:        f(['AlphaUsed']),
        RiskLevel:        f(['InventoryRiskLevel']),
        MAD:              f(['MAD']),
        MAPE:             f(['MAPE']),
    };

    // Detect M columns (M0..M11 or M1..M12)
    const hasM12 = headers.some(h => h.toUpperCase().replace(/\s/g, '') === 'M12');

    const result: Record<string, MonthlyData> = {};

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        const rawItemCode = row[idxCode]?.trim();
        if (!rawItemCode) return;
        const itemCode = rawItemCode.toUpperCase();

        // Parse sales history (M columns)
        const salesHistory: number[] = [];
        if (hasM12) {
            for (let i = 12; i >= 1; i--) {
                const mi = headers.findIndex(h => h.toUpperCase().replace(/\s/g, '') === `M${i}`);
                salesHistory.push(mi > -1 ? parseNum(row[mi]) : 0);
            }
        } else {
            for (let i = 0; i < 12; i++) {
                const mi = headers.findIndex(h => h.toUpperCase().replace(/\s/g, '') === `M${i}`);
                salesHistory.push(mi > -1 ? parseNum(row[mi]) : 0);
            }
        }

        const get = (idx: number) => (idx > -1 ? row[idx]?.trim() : undefined);
        const getN = (idx: number) => (idx > -1 ? parseNum(row[idx]) : undefined);

        result[itemCode] = {
            ItemCode: itemCode,
            ItemName:         get(idxMap.ItemName),
            LOISGroup:        get(idxMap.LOISGroup),
            AvgQty3M:         getN(idxMap.AvgQty3M),
            AvgQty6M:         getN(idxMap.AvgQty6M),
            AvgQty12M:        getN(idxMap.AvgQty12M),
            AvgQty24M:        getN(idxMap.AvgQty24M),
            TrendFlag:        get(idxMap.TrendFlag),
            SafetyStock_Raw:  getN(idxMap.SafetyStock),
            ROPFinal_Raw:     getN(idxMap.ROPFinal),
            MaxInventory_High_Raw: getN(idxMap.MaxHigh),
            MaxInventory_Low_Raw:  getN(idxMap.MaxLow),
            MaxInventory_Mid_Raw:  getN(idxMap.MaxMid),
            MOS:              getN(idxMap.MOS),
            BaseForecast:     getN(idxMap.BaseForecast),
            Forecast_NB:      getN(idxMap.ForecastNB),
            Forecast_BB:      getN(idxMap.ForecastBB),
            SalesHistory:     salesHistory,
            OrderType:        get(idxMap.OrderType),
            BranchGroup:      get(idxMap.BranchGroup),
            Forecast_eff:     getN(idxMap.ForecastEff),
            Forecast_M1:      getN(idxMap.ForecastM1),
            Forecast_M2:      getN(idxMap.ForecastM2),
            Forecast_M3:      getN(idxMap.ForecastM3),
            SeasonalityFactor:    getN(idxMap.SeasonFactor),
            SeasonalityFactor_M1: getN(idxMap.SeasonM1),
            SeasonalityFactor_M2: getN(idxMap.SeasonM2),
            SeasonalityFactor_M3: getN(idxMap.SeasonM3),
            ForecastMethod:       get(idxMap.ForecastMethod),
            ForecastMethodDetail: get(idxMap.ForecastDetail),
            TrendAdjMethod:       get(idxMap.TrendAdjMethod),
            BaseForecast_Orig:    getN(idxMap.OrigForecast),
            LinRegSlope:          getN(idxMap.LinRegSlope),
            LinRegForecast:       getN(idxMap.LinRegForecast),
            Sigma_eff:            getN(idxMap.SigmaEff),
            CV:                   getN(idxMap.CV),
            AlphaUsed:            getN(idxMap.AlphaUsed),
            InventoryRiskLevel:   get(idxMap.RiskLevel),
            MAD:                  getN(idxMap.MAD),
            MAPE:                 getN(idxMap.MAPE),
        };
    });

    return result;
};

export const parseCSV = (text: string, monthlyData?: Record<string, MonthlyData>): InventoryItem[] => {

    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0].replace(/^﻿/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));

    const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const getIdx = (name: string) => headers.findIndex(h => h === name);
    const getFuzzyIdx = (keywords: string[]) => {
        const normalizedKeywords = keywords.map(normalize);
        // Priority 1: Exact match on normalized strings
        let idx = headers.findIndex(h => normalizedKeywords.includes(normalize(h)));
        if (idx !== -1) return idx;

        // Priority 2: Safe includes match
        return headers.findIndex(h => {
            const nh = normalize(h);
            return normalizedKeywords.some(nk => {
                // Safeguards against aggressive matches
                if (nk === 'bo' && nh.includes('book')) return false;
                if (nk === 'fc' && (nh.includes('nb') || nh.includes('bb'))) return false;
                if (nk === 'quantityinventory' && (nh.includes('nb') || nh.includes('bb'))) return false;
                return nh.includes(nk) || nk.includes(nh);
            });
        });
    };

    const idxMap = {
        ItemCode: getFuzzyIdx(['ItemCode', 'Mã hàng', 'Ma hang', 'Part No', 'PartNumber']),
        ItemName: getFuzzyIdx(['ItemName', 'Tên hàng', 'Ten hang', 'Description']),
        TypeCar: getFuzzyIdx(['TypeCar', 'Loại xe', 'Loai xe', 'Model']),
        LOISGroup: getFuzzyIdx(['LOISGroup', 'LOIS', 'Cluster']),
        InvNB: getFuzzyIdx(['QuantityInventory_NB', 'Tồn kho NB', 'Stock NB']),
        InvBB: getFuzzyIdx(['QuantityInventory_BB', 'Tồn kho BB', 'Stock BB']),
        DCNB: getFuzzyIdx(['QuantityDC_NB', 'Tồn DC NB', 'DC NB']),
        DCBB: getFuzzyIdx(['QuantityDC_BB', 'Tồn DC BB', 'DC BB']),
        Backorder: getFuzzyIdx(['Backorder', 'BO', 'Nợ đơn', 'Total Booking', 'TQ. BO2', 'Nợ', 'Số lượng nợ', 'Hàng nợ', 'Open Qty', 'Balance', 'Qty BO']),
        BookTotalNB: getFuzzyIdx(['QuantityBookTotal_NB', 'BookTotal_NB', 'Booking_NB', 'Nợ NB', 'Nợ Miền Bắc', 'Nợ MB']),
        BookTotalBB: getFuzzyIdx(['QuantityBookTotal_BB', 'BookTotal_BB', 'Booking_BB', 'Nợ BB', 'Nợ Miền Nam', 'Nợ MN']),
        DealerInv: getFuzzyIdx(['DealerInventory', 'Tồn ĐL', 'Ton Kho Dai Ly', 'O H.Tồn ĐL']),
        OH: getFuzzyIdx(['Total Stock', 'QuantityInventory', 'Tổng tồn', 'TQ O.H']),
        TrendFlag: getFuzzyIdx(['TrendFlag', 'Xu hướng']),
        AvgQty3M: getFuzzyIdx(['AvgQty3M', 'Bán 3T']),
        AvgQty6M: getFuzzyIdx(['AvgQty6M', 'Bán 6T']),
        AvgQty12M: getFuzzyIdx(['AvgQty12M', 'Bán 12T']),
        AvgQty24M: getFuzzyIdx(['AvgQty24M', 'Bán 24T']),
        BaseForecast: getFuzzyIdx(['BaseForecast', 'FC', 'Dự báo']),
        ForecastNB: getFuzzyIdx(['Forecast_NB', 'FC NB', 'Dự báo NB']),
        ForecastBB: getFuzzyIdx(['Forecast_BB', 'FC BB', 'Dự báo BB']),
        PricePP: getFuzzyIdx(['Giá Vốn PP', 'Price', 'Giá', 'UnitCost_PP', 'Đơn giá']),
        PriceFOB: getFuzzyIdx(['Giá FOB (USD)', 'FOB', 'UnitCost_FOB', 'Giá FOB']),
        Note: getFuzzyIdx(['Note', 'Ghi chú']),
        SNP: getFuzzyIdx(['SNP', 'Pack', 'Quy cách']),
        SourceId: getFuzzyIdx(['NguonHang', 'Source', 'Nguồn', 'Plant', 'NCC', 'Vendor', 'SourceId', 'Nguồn hàng']),
        BrandName: getFuzzyIdx(['ThuongHieu', 'Brand', 'Thương hiệu', 'Hãng']),
    };

    const parseNum = (val: string) => {
        if (!val) return 0;
        const cleanVal = val.replace(/,/g, '');
        const num = parseFloat(cleanVal);
        return isNaN(num) ? 0 : num;
    };

    return lines.slice(1).map(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 5) return null;

        const invNB = parseNum(row[idxMap.InvNB]);
        const invBB = parseNum(row[idxMap.InvBB]);
        const dcNB = parseNum(row[idxMap.DCNB]);
        const dcBB = parseNum(row[idxMap.DCBB]);
        const btNB = idxMap.BookTotalNB > -1 ? parseNum(row[idxMap.BookTotalNB]) : 0;
        const btBB = idxMap.BookTotalBB > -1 ? parseNum(row[idxMap.BookTotalBB]) : 0;
        const backorderTotal = (btNB + btBB > 0) ? (btNB + btBB) : parseNum(row[idxMap.Backorder]);

        let unitCostPP = idxMap.PricePP > -1 ? parseNum(row[idxMap.PricePP]) : 0;
        let unitCostFOB = idxMap.PriceFOB > -1 ? parseNum(row[idxMap.PriceFOB]) : 0;
        if (unitCostPP === 0) unitCostPP = unitCostFOB * 32000 * 1.32;

        const pipeline: Record<string, number> = {};
        const pipelineNB: Record<string, number> = {};
        const pipelineBB: Record<string, number> = {};
        let totalPO = 0;
        let totalPONB = 0;
        let totalPOBB = 0;

        // Pipeline (PO) headers come in many shapes from upstream exports:
        //   "O O NB.250515", "OONB 250515", "O O BB 250515", "OOBB.250515",
        //   "O O.250515", "OO.250515", "OO 250515", "OO250515".
        // Strategy: detect whether header starts with the OO/O O prefix, then strip the prefix
        // (incl. NB/BB suffix and any '.' / spaces) to get a clean date key.
        const stripOOPrefix = (header: string): { key: string; bucket: 'NB' | 'BB' | null } | null => {
            const m = header.match(/^\s*o\s*o\s*(nb|bb)?\s*[.\s]*(.+)$/i);
            if (!m) return null;
            const bucket = m[1] ? (m[1].toUpperCase() as 'NB' | 'BB') : null;
            const key = (m[2] || '').trim();
            return key ? { key, bucket } : null;
        };

        headers.forEach((h, i) => {
            const parsed = stripOOPrefix(h);
            if (!parsed) return;
            const val = parseNum(row[i]);
            if (val <= 0) return;
            const { key: dateKey, bucket } = parsed;

            if (bucket === 'NB') {
                pipelineNB[dateKey] = val;
                totalPONB += val;
                pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                totalPO += val;
            } else if (bucket === 'BB') {
                pipelineBB[dateKey] = val;
                totalPOBB += val;
                pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                totalPO += val;
            } else {
                pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                totalPO += val;
            }
        });

        const salesHistory: number[] = [];

        const hasM12 = headers.some(h => {
            const nh = h.toUpperCase().replace(/\s/g, '');
            return nh === 'M12' || nh === 'MONTH12';
        });

        if (hasM12) {
            // Format: M1 (Newest) to M12 (Oldest) -> Array must be Oldest to Newest
            for (let i = 12; i >= 1; i--) {
                const mIdx = headers.findIndex(h => {
                    const nh = h.toUpperCase().replace(/\s/g, '');
                    return nh === `M${i}` || nh === `MONTH${i}`;
                });
                salesHistory.push(mIdx > -1 ? parseNum(row[mIdx]) : 0);
            }
        } else {
            // Legacy Format: M0 (Oldest) to M11 (Newest)
            for (let i = 0; i < 12; i++) {
                const mIdx = headers.findIndex(h => {
                    const nh = h.toUpperCase().replace(/\s/g, '');
                    return nh === `M${i}` || nh === `MONTH${i}`;
                });
                salesHistory.push(mIdx > -1 ? parseNum(row[mIdx]) : 0);
            }
        }

        // ── Merge Monthly Data (File B) if provided ──────────────────────────
        const rawItemCode = row[idxMap.ItemCode]?.trim();
        const itemCode = rawItemCode?.toUpperCase() || "";
        const monthly = monthlyData ? monthlyData[itemCode] : undefined;

        // LOISGroup: Daily (File A) wins if present and not empty, fallback to Monthly (File B)
        const dailyLois = row[idxMap.LOISGroup]?.trim();
        const loisGroup = dailyLois ? dailyLois : (monthly?.LOISGroup || '');
        const rawTrend = (monthly?.TrendFlag || row[idxMap.TrendFlag]?.trim() || 'Stable').toUpperCase();

        let trendFlag = 'Stable';
        if (rawTrend.includes('UP') || rawTrend.includes('TANG')) trendFlag = 'Up';
        else if (rawTrend.includes('DOWN') || rawTrend.includes('GIAM')) trendFlag = 'Down';
        else if (rawTrend.includes('DINH') || rawTrend.includes('STABLE')) trendFlag = 'Stable';

        // Avg & Forecast: File B wins
        const avgQty3M  = monthly?.AvgQty3M  ?? parseNum(row[idxMap.AvgQty3M]);
        const avgQty6M  = monthly?.AvgQty6M  ?? parseNum(row[idxMap.AvgQty6M]);
        const avgQty12M = monthly?.AvgQty12M ?? parseNum(row[idxMap.AvgQty12M]);
        const avgQty24M = monthly?.AvgQty24M ?? parseNum(row[idxMap.AvgQty24M]);
        const baseForecast = monthly?.BaseForecast ?? (idxMap.BaseForecast > -1 ? parseNum(row[idxMap.BaseForecast]) : 0);
        const forecastNB = monthly?.Forecast_NB ?? (idxMap.ForecastNB > -1 ? parseNum(row[idxMap.ForecastNB]) : undefined);
        const forecastBB = monthly?.Forecast_BB ?? (idxMap.ForecastBB > -1 ? parseNum(row[idxMap.ForecastBB]) : undefined);

        // SalesHistory: File B wins (has M0..M11 normalized)
        const finalSalesHistory = (monthly?.SalesHistory && monthly.SalesHistory.length > 0)
            ? monthly.SalesHistory
            : salesHistory;

        // Note: if no monthly data, append annotation
        const baseNote = idxMap.Note > -1 ? row[idxMap.Note]?.trim() : '';
        const noteAppend = (monthlyData && !monthly) ? ' [⚠ Chưa có dữ liệu tháng]' : '';
        const finalNote = (baseNote + noteAppend).trim();

        return {
            ItemCode: itemCode,
            ItemName: row[idxMap.ItemName]?.trim(),
            TypeCar: row[idxMap.TypeCar]?.trim(),
            LOISGroup: loisGroup,
            TrendFlag: trendFlag,
            Status: 'Active',
            Note: finalNote,
            SNP: idxMap.SNP > -1 ? parseNum(row[idxMap.SNP]) : 1,
            QuantityInventory_NB: invNB,
            QuantityInventory_BB: invBB,
            QuantityDC_NB: dcNB,
            QuantityDC_BB: dcBB,
            Backorder: backorderTotal,
            Backorder_NB: btNB,
            Backorder_BB: btBB,
            DealerInventory: idxMap.DealerInv > -1 ? parseNum(row[idxMap.DealerInv]) : 0,
            TotalInventory: invNB + invBB,
            TotalDC: dcNB + dcBB,
            TotalPO: totalPO,
            TotalSupply: invNB + invBB + dcNB + dcBB + totalPO,
            NetDemand: (invNB + invBB + dcNB + dcBB + totalPO) - backorderTotal,
            AvgQty3M: avgQty3M,
            AvgQty6M: avgQty6M,
            AvgQty12M: avgQty12M,
            AvgQty24M: avgQty24M,
            BaseForecast: baseForecast,
            Forecast_NB: forecastNB,
            Forecast_BB: forecastBB,
            SalesHistory: finalSalesHistory,
            Pipeline: pipeline,
            Pipeline_NB: pipelineNB,
            Pipeline_BB: pipelineBB,
            TotalPO_NB: totalPONB,
            TotalPO_BB: totalPOBB,
            UnitCost_PP: unitCostPP,
            UnitCost_FOB: unitCostFOB,
            SourceId: idxMap.SourceId > -1 ? row[idxMap.SourceId]?.trim() : undefined,
            BrandName: idxMap.BrandName > -1 ? row[idxMap.BrandName]?.trim() : undefined,
        };
    }).filter(Boolean) as InventoryItem[];
};

export const parseOrderingDraftCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { quantities: {}, notes: {} };
    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
    const idxCode = headers.findIndex(h => h.includes('itemcode') || h.includes('mã hàng'));
    const idxAir = headers.findIndex(h => h.includes('air') || h.includes('sl đặt (air)'));
    const idxSea = headers.findIndex(h => h.includes('sea') || h.includes('sl đặt (sea)'));
    const idxNote = headers.findIndex(h => h.includes('note') || h.includes('ghi chú'));
    const quantities: any = {};
    const notes: any = {};
    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        const code = row[idxCode]?.trim();
        if (code) {
            quantities[code] = { air: parseFloat(row[idxAir] || '0'), sea: parseFloat(row[idxSea] || '0') };
            if (idxNote > -1) notes[code] = row[idxNote]?.trim() || '';
        }
    });
    return { quantities, notes };
};

export const parseKittingCSV = (text: string): KittingDefinition[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0].replace(/^﻿/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));
    const idxMap = {
        SetPartsCode: headers.findIndex(h => h === 'SetPartsCode'),
        SetPartsName: headers.findIndex(h => h === 'SetParts'),
        ItemCode: headers.findIndex(h => h === 'ItemCode'),
        ItemNameEng: headers.findIndex(h => h === 'ItemNameEng'),
        Qty: headers.findIndex(h => h === 'Qty'),
        ModelCar: headers.findIndex(h => h === 'ModelCar'),
        EngineCode: headers.findIndex(h => h === 'EngineCode'),
        UnitPrice: headers.findIndex(h => h.toLowerCase().includes('price') || h.toLowerCase().includes('cost')),
    };
    return lines.slice(1).map(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 2) return null;
        return {
            SetPartsCode: row[idxMap.SetPartsCode]?.trim(),
            SetPartsName: row[idxMap.SetPartsName]?.trim() || row[idxMap.SetPartsCode]?.trim(),
            ItemCode: row[idxMap.ItemCode]?.trim(),
            ItemNameEng: row[idxMap.ItemNameEng]?.trim(),
            QtyRequired: Math.max(1, parseFloat(row[idxMap.Qty]?.replace(/,/g, '') || '1')),
            ModelCar: idxMap.ModelCar > -1 ? row[idxMap.ModelCar]?.trim() : '',
            EngineCode: idxMap.EngineCode > -1 ? row[idxMap.EngineCode]?.trim() : '',
            UnitPrice: idxMap.UnitPrice > -1 ? parseFloat(row[idxMap.UnitPrice]?.replace(/,/g, '') || '0') : 0,
        };
    }).filter(Boolean) as KittingDefinition[];
};

// Fix for BackorderProcessing missing export
export const parseResolutionCSV = (text: string): Record<string, any> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return {};
    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0].replace(/^﻿/, '').trim(), delimiter).map(h => h.trim().toLowerCase());

    const idxItem = headers.findIndex(h => h.includes('itemcode'));
    const idxDoc = headers.findIndex(h => h.includes('docno'));
    const idxMethod = headers.findIndex(h => h.includes('method'));
    const idxQty = headers.findIndex(h => h.includes('allocatedqty'));
    const idxNote = headers.findIndex(h => h.includes('source/note'));
    const idxEta = headers.findIndex(h => h.includes('eta'));
    const idxUpdated = headers.findIndex(h => h.includes('updated'));

    const resolutions: Record<string, any> = {};

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        const itemCode = row[idxItem]?.trim();
        const docNo = row[idxDoc]?.trim();
        if (!itemCode || !docNo) return;

        const key = `${itemCode}_${docNo}`;
        if (!resolutions[key]) {
            resolutions[key] = {
                id: key,
                docNo,
                itemCode,
                allocations: [],
                updatedAt: (idxUpdated > -1 && row[idxUpdated]) ? new Date(row[idxUpdated]).getTime() : Date.now()
            };
        }

        resolutions[key].allocations.push({
            id: Math.random().toString(36).substr(2, 9),
            method: row[idxMethod]?.trim() || 'WAIT',
            qty: parseFloat(row[idxQty]?.replace(/,/g, '') || '0'),
            note: row[idxNote]?.trim(),
            eta: row[idxEta]?.trim()
        });
    });

    return resolutions;
};

export const parseSupersessionMappingCSV = (text: string): SupersessionMapping[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(text);
    const cleanHeaderLine = lines[0].replace(/^﻿/, '').trim();
    const headers = parseLine(cleanHeaderLine, delimiter).map(h => h.trim().toLowerCase());

    const findCol = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxOld = findCol(["old", "mã cũ", "ma cu", "superseded", "from", "part number old"]);
    const idxNew = findCol(["new", "mã mới", "ma moi", "replacement", "current", "to", "part number new"]);
    const idxInter = findCol(["interchangeable", "hai chiều", "2 chiều", "bidirectional"]);

    if (idxOld === -1 || idxNew === -1) return [];

    const mappings: SupersessionMapping[] = [];

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 2) return;

        const oldPart = row[idxOld]?.trim();
        const newPart = row[idxNew]?.trim();

        if (!oldPart || !newPart || oldPart === newPart) return;

        let interchangeable = false;
        if (idxInter > -1) {
            const val = row[idxInter]?.trim().toLowerCase();
            if (["true", "yes", "y", "1", "có", "co", "hai chiều"].includes(val)) {
                interchangeable = true;
            }
        }

        mappings.push({
            oldPart,
            newPart,
            interchangeable
        });
    });

    return mappings;
};

// ─── Part Affinity CSV (2026-05-26) ──────────────────────────────────────────
export const parsePartAffinityCSV = (
    text: string
): Array<Omit<import('../../types/inventory').PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(text);
    const cleanHeaderLine = lines[0].replace(/^﻿/, '').trim();
    const headers = parseLine(cleanHeaderLine, delimiter).map(h => h.trim().toLowerCase());

    const findCol = (keywords: string[]) =>
        headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxA = findCol(['parta', 'part_a', 'mã a', 'ma a', 'partno1', 'sku1']);
    const idxB = findCol(['partb', 'part_b', 'mã b', 'ma b', 'partno2', 'sku2']);
    const idxType = findCol(['type', 'loại', 'loai']);
    const idxScore = findCol(['score', 'điểm', 'diem']);
    const idxNote = findCol(['note', 'ghi chú', 'ghi chu']);

    if (idxA === -1 || idxB === -1 || idxType === -1) return [];

    const pairs: Array<Omit<import('../../types/inventory').PartAffinityPair, 'id' | 'createdAt' | 'createdBy'>> = [];

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < 3) return;

        const a = row[idxA]?.trim();
        const b = row[idxB]?.trim();
        if (!a || !b || a.toUpperCase() === b.toUpperCase()) return;

        const typeRaw = (row[idxType] || '').trim().toLowerCase();
        let type: 'mandatory' | 'recommended';
        if (['mandatory', 'bắt buộc', 'bat buoc', 'required'].some(k => typeRaw.includes(k)) || typeRaw === 'm') {
            type = 'mandatory';
        } else if (['recommended', 'khuyến nghị', 'khuyen nghi'].some(k => typeRaw.includes(k)) || typeRaw === 'r') {
            type = 'recommended';
        } else {
            return;
        }

        let score = 50;
        if (idxScore > -1 && row[idxScore]) {
            const n = parseInt(row[idxScore]);
            if (!isNaN(n)) score = Math.max(0, Math.min(100, n));
        }

        const note = idxNote > -1 ? (row[idxNote]?.trim() || undefined) : undefined;

        pairs.push({ partA: a, partB: b, type, score, note });
    });

    return pairs;
};
