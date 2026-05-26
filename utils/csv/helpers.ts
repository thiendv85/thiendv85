
import { InventoryItem, MonthlyData } from '../../types/inventory';


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
    const lois = (item.LOISGroup || '').trim().toUpperCase().substring(0, 2);
    const isFastMover = ['1', '2', '3', 'L1', 'L2', 'L3'].includes(lois);

    // Mức 1: Có nợ khách hoặc hết sạch hàng (kể cả PO)
    if (isBackorder || isOut) return 1;
    // Mức 2: Dưới tồn kho an toàn hoặc hàng FAST đang hụt ROP
    if (isBelowSS || (isFastMover && isBelowROP)) return 2;
    // Mức 3: Đặt bổ sung định kỳ hoặc hàng chậm
    return 3;
};

// Helper: Detect delimiter (comma, semicolon, tab)
export const detectDelimiter = (text: string): string => {
    const firstLine = text.split('\n')[0] || '';
    if (firstLine.includes(';') && !firstLine.includes(',')) return ';';
    if (firstLine.includes('\t')) return '\t';
    return ',';
};

/**
 * Parse a date string in any of the formats Vietnamese ERP exports use:
 *   DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY      (4-digit year, day-first)
 *   YYYY-MM-DD, YYYY/MM/DD                  (4-digit year, ISO)
 *   DD/MM/YY                                (2-digit year — assumed 20YY for YY < 50, else 19YY)
 *   "25 / 3 / 2026"                         (whitespace as separator)
 *   "25/3/2026 09:30:00", "...T10:00:00Z"   (trailing time portion is ignored)
 *
 * Uses a regex match so leading/trailing whitespace, time suffixes, and
 * whitespace-as-separator all work without fragile split/trim chains.
 * Returns 0 on any parse failure so callers can distinguish "no date" from "epoch".
 */
export const parseFlexibleDate = (str?: string | null): number => {
    if (!str) return 0;
    // Match three numeric groups separated by `-`, `/`, `.`, or whitespace runs.
    // First match wins, so a trailing time component (e.g. "...09:30:00") is ignored.
    const m = str.match(/(\d{1,4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,4})/);
    if (!m) return 0;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
    let day: number, month: number, year: number;
    if (m[1].length === 4) {
        // YYYY-MM-DD
        year = a; month = b; day = c;
    } else if (m[3].length === 4) {
        // DD-MM-YYYY
        day = a; month = b; year = c;
    } else {
        // 2-digit year — heuristic: < 50 → 20YY, else → 19YY (typical VN ERP convention)
        day = a; month = b;
        year = c < 50 ? 2000 + c : 1900 + c;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return 0;
    const ts = new Date(year, month - 1, day).getTime();
    return Number.isFinite(ts) ? ts : 0;
};

// Helper: Parse line with specific delimiter handling quotes
export const parseLine = (line: string, delimiter: string): string[] => {
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

/**
 * mergeMonthlyIntoItems — Re-applies File B (monthly coefficients) to an existing list of InventoryItems.
 * Useful when switching monthly data without re-parsing the main File A.
 */
export const mergeMonthlyIntoItems = (items: InventoryItem[], monthlyData: Record<string, MonthlyData>): InventoryItem[] => {
    return items.map(item => {
        const monthly = monthlyData[item.ItemCode];

        // Remove warning if it existed
        const cleanNote = (item.Note || '').replace(' [⚠ Chưa có dữ liệu tháng]', '').trim();

        if (!monthly) {
            return {
                ...item,
                Note: (cleanNote + ' [⚠ Chưa có dữ liệu tháng]').trim()
            };
        }

        // Normalize TrendFlag
        const rawTrend = (monthly.TrendFlag || item.TrendFlag || 'Stable').toUpperCase();
        let trendFlag = 'Stable';
        if (rawTrend.includes('UP') || rawTrend.includes('TANG')) trendFlag = 'Up';
        else if (rawTrend.includes('DOWN') || rawTrend.includes('GIAM')) trendFlag = 'Down';
        else if (rawTrend.includes('DINH') || rawTrend.includes('STABLE')) trendFlag = 'Stable';

        return {
            ...item,
            LOISGroup: item.LOISGroup ? item.LOISGroup : (monthly.LOISGroup || ''),
            TrendFlag: trendFlag,
            AvgQty3M:  monthly.AvgQty3M  ?? item.AvgQty3M,
            AvgQty6M:  monthly.AvgQty6M  ?? item.AvgQty6M,
            AvgQty12M: monthly.AvgQty12M ?? item.AvgQty12M,
            AvgQty24M: monthly.AvgQty24M ?? item.AvgQty24M,
            BaseForecast: monthly.BaseForecast ?? item.BaseForecast,
            Forecast_NB: monthly.Forecast_NB ?? item.Forecast_NB,
            Forecast_BB: monthly.Forecast_BB ?? item.Forecast_BB,
            SalesHistory: (monthly.SalesHistory && monthly.SalesHistory.length > 0) ? monthly.SalesHistory : item.SalesHistory,
            Note: cleanNote
        };
    });
};
