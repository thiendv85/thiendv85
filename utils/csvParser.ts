
import { InventoryItem, DealerDetail, BackorderDetail, KittingDefinition, MonthlyData, getDebtStatus } from '../types/inventory';
import { SupersessionMapping } from './supersessionGraph';


// Logic tính toán mức độ ưu tiên pick hàng cho NCC (1: Cao nhất, 3: Thấp nhất)
export const calculatePickingPriority = (item: InventoryItem, draftQty: number = 0): number => {
    const comp = item.computed;
    if (!comp) return 3;

    const available = comp.available || 0;
    const reserve = available + Math.max(0, item.TotalPO || 0) + draftQty;
    const isBackorder = item.Backorder > 0;
    const isOut = reserve <= 0;
    const isBelowSS = reserve < (comp.safetyStock || 0);
    const isBelowROP = reserve < (comp.rop || 0);
    const isFastMover = ['1', '2', '3'].includes(item.LOISGroup);

    // Mức 1: Có nợ khách hoặc hết sạch hàng (kể cả PO)
    if (isBackorder || isOut) return 1;
    // Mức 2: Dưới tồn kho an toàn hoặc hàng FAST đang hụt ROP
    if (isBelowSS || (isFastMover && isBelowROP)) return 2;
    // Mức 3: Đặt bổ sung định kỳ hoặc hàng chậm
    return 3;
};

// Helper: Detect delimiter (comma, semicolon, tab)
const detectDelimiter = (text: string): string => {
    const firstLine = text.split('\n')[0] || '';
    if (firstLine.includes(';') && !firstLine.includes(',')) return ';';
    if (firstLine.includes('\t')) return '\t';
    return ',';
};

// Helper: Parse line with specific delimiter handling quotes
const parseLine = (line: string, delimiter: string): string[] => {
    const row: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuote = !inQuote; }
        else if (char === delimiter && !inQuote) { row.push(current); current = ''; }
        else { current += char; }
    }
    row.push(current);
    return row;
};

// --- SAFE EXPORT HELPER ---
export const safeCSV = (val: any): string => {
    if (val === null || val === undefined) return '';
    // IMPORTANT: Return numbers as plain text (no quotes) so Excel treats them as integers
    if (typeof val === 'number') return val.toString();
    // Wrap strings in quotes and escape existing quotes (" becomes "")
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
};

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

    // 3. Download with BOM (\uFEFF) for Excel UTF-8 recognition
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

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

        const itemCode = row[idxCode]?.trim();
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
    const cleanHeaderLine = lines[0].replace(/^\uFEFF/, '').trim();
    const headers = parseLine(cleanHeaderLine, delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());

    const getIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxMap = {
        DocDate: getIdx(['doc date', 'ngày ct', 'date', 'ngay chung tu', 'docdate']),
        DocNo: getIdx(['doc no', 'số ct', 'document number', 'so chung tu', 'order no', 'docno']),
        ItemCode: getIdx(['item no', 'item code', 'mã hàng', 'ma hang', 'part no', 'part number', 'product code', 'mã sp', 'itemcode']),
        ItemName: getIdx(['item name', 'tên hàng', 'ten hang', 'description', 'diễn giải', 'itemname']),
        Qty: getIdx(['quantity', 'số lượng', 'sl', 'so luong', 'bo qty', 'backorder', 'open qty', 'balance', 'quantityremainclose', 'booking', 'book qty']),
        Warehouse: getIdx(['warehouse', 'kho', 'wh', 'kho no']),
        Note: getIdx(['note', 'ghi chú', 'diễn giải', 'remark', 'estimateddescription']),
        Showroom: getIdx(['showroom', 'sr', 'cửa hàng', 'sr-đl2', 'sr-dl2']),
        OrderType: getIdx(['order type', 'loại đơn']),
        ETA: getIdx(['eta', 'ngày về', 'expected', 'estimateddate1']),
    };

    if (idxMap.ItemCode === -1 || idxMap.Qty === -1) {
        return {};
    }

    const boMap: Record<string, BackorderDetail[]> = {};

    lines.slice(1).forEach(line => {
        const row = parseLine(line, delimiter);
        if (row.length < headers.length && row.length < 2) return;

        const itemCode = row[idxMap.ItemCode]?.trim();
        const qty = parseFloat(row[idxMap.Qty]?.replace(/,/g, '') || '0');

        if (itemCode && qty > 0) {
            if (!boMap[itemCode]) boMap[itemCode] = [];
            const docDateStr = idxMap.DocDate > -1 ? row[idxMap.DocDate]?.trim() : '';
            let rawDate = 0;
            if (docDateStr) {
                try {
                    const cleanDate = docDateStr.split(' ')[0];
                    const parts = cleanDate.split(/[-/]/);
                    if (parts.length === 3) {
                        if (parts[2].length === 4) rawDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                        else if (parts[0].length === 4) rawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
                    }
                } catch (e) { }
            }

            boMap[itemCode].push({
                ItemCode: itemCode,
                ItemName: idxMap.ItemName > -1 ? row[idxMap.ItemName]?.trim() : '',
                DocDate: docDateStr,
                DocNo: idxMap.DocNo > -1 ? row[idxMap.DocNo]?.trim() : '',
                Qty: qty,
                Warehouse: idxMap.Warehouse > -1 ? row[idxMap.Warehouse]?.trim() : 'Unknown',
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
    const headers = parseLine(lines[0].replace(/^\uFEFF/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));

    const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    const headers = parseLine(lines[0].replace(/^\uFEFF/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));

    const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
        Backorder: getFuzzyIdx(['Backorder', 'BO', 'Nợ đơn', 'Total Booking', 'TQ. BO2']),
        BookTotalNB: getFuzzyIdx(['QuantityBookTotal_NB', 'BookTotal_NB', 'Booking_NB', 'Nợ NB']),
        BookTotalBB: getFuzzyIdx(['QuantityBookTotal_BB', 'BookTotal_BB', 'Booking_BB', 'Nợ BB']),
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

        headers.forEach((h, i) => {
            const hUpper = h.toUpperCase();
            if (hUpper.startsWith('O O ') || hUpper.startsWith('OONB') || hUpper.startsWith('OOBB')) {
                const val = parseNum(row[i]);
                if (val > 0) {
                    if (hUpper.startsWith('O O NB') || hUpper.startsWith('OONB')) {
                        const dateKey = h.replace(/o o nb\.?|oonb\.?\s?/i, '').trim();
                        pipelineNB[dateKey] = val;
                        totalPONB += val;
                        // Đồng thời lưu vào mảng chung cho backward compatibility
                        pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                        totalPO += val;
                    } else if (hUpper.startsWith('O O BB') || hUpper.startsWith('OOBB')) {
                        const dateKey = h.replace(/o o bb\.?|oobb\.?\s?/i, '').trim();
                        pipelineBB[dateKey] = val;
                        totalPOBB += val;
                        // Đồng thời lưu vào mảng chung
                        pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                        totalPO += val;
                    } else if (hUpper.startsWith('O O.')) {
                        const dateKey = h.replace(/o o\./i, '').trim();
                        pipeline[dateKey] = (pipeline[dateKey] || 0) + val;
                        totalPO += val;
                    }
                }
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

        // LOISGroup & TrendFlag: File B wins if available
        const loisGroup = monthly?.LOISGroup || row[idxMap.LOISGroup]?.trim() || '';
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

const getBOM = (options?: CsvExportOptions) => options?.encoding === 'utf8' ? '' : '\uFEFF';

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
            const derived = {
                totalQty, totalAmount, currency, unitCost, currentCst, cstProjected,
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
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    const headers = parseLine(lines[0].replace(/^\uFEFF/, '').trim(), delimiter).map(h => h.trim().replace(/"/g, ''));
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

// Fix for BackorderProcessing missing export
export const parseResolutionCSV = (text: string): Record<string, any> => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return {};
    const delimiter = detectDelimiter(text);
    const headers = parseLine(lines[0].replace(/^\uFEFF/, '').trim(), delimiter).map(h => h.trim().toLowerCase());

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

// Fix for RepairPackageOptimizer missing export
export const generateMatrixCSV = (data: any[], filename: string) => {
    exportToExcelCSV(data, filename);
};

export const parseSupersessionMappingCSV = (text: string): SupersessionMapping[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(text);
    const cleanHeaderLine = lines[0].replace(/^\uFEFF/, '').trim();
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

export const exportSupersessionMappingCSV = (mappings: SupersessionMapping[], filename: string) => {
    const headers = ["OldPartNumber", "NewPartNumber", "Interchangeable"];
    const rows = mappings.map(m => [
        safeCSV(m.oldPart),
        safeCSV(m.newPart),
        safeCSV(m.interchangeable)
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
