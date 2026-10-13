/**
 * Cảnh báo đột biến hằng tuần — dữ liệu từ proc SQL `usp_WeeklySpikeAlert` (apg-data/deploy/weekly-spike-alert).
 * Quy tắc: bán 28 ngày ≥ 1.5 × mức thường (AvgQty12M quy 28 ngày) và vượt ≥ 20 đv; mã mới ≥ 20 đv.
 * Chỉ để cảnh báo — KHÔNG đổi ROP / số đặt (63% đột biến quay về mức cũ). Người đặt hàng quyết định
 * dùng kênh hàng nhanh (đặt khẩn / điều chuyển chi nhánh) và ghi kết luận.
 */
import { detectDelimiter, parseLine } from './csv/helpers';

export type SpikeAlertType = 'ABOVE' | 'NEW';
export type SpikeConclusion = 'one_off' | 'real_increase' | 'project';
export type SpikeAction = 'urgent_order' | 'branch_transfer' | 'none';

/** One row of `spike_alerts` (one item × week). */
export interface SpikeAlert {
    week_end: string; // YYYY-MM-DD, last day of the 28-day window
    item_code: string;
    alert_type: SpikeAlertType;
    qty_28d: number;
    qty_7d: number;
    normal_28d: number;
    ratio: number | null;
    unit_cost: number | null;
    excess_value: number | null;
    brand_group: string | null; // OGroupName bán nhiều nhất trong 28 ngày (KIA, Nội địa MAZDA...)
}

/** One row of `spike_alert_notes` — what the ordering team concluded and did. */
export interface SpikeAlertNote {
    week_end: string;
    item_code: string;
    conclusion: SpikeConclusion | null;
    dealer_code: string | null;
    action: SpikeAction | null;
    note: string | null;
    updated_by?: string | null;
    updated_at?: string | null;
    updated_by_name?: string | null;
}

export interface SpikeAlertWithNote extends SpikeAlert {
    note?: SpikeAlertNote;
}

export const SPIKE_CONCLUSION_LABELS: Record<SpikeConclusion, string> = {
    one_off: 'Đơn lớn một lần',
    real_increase: 'Tăng thật',
    project: 'Dự án / chiến dịch',
};

export const SPIKE_ACTION_LABELS: Record<SpikeAction, string> = {
    urgent_order: 'Đặt khẩn',
    branch_transfer: 'Điều chuyển chi nhánh',
    none: 'Không cần làm gì',
};

const COLUMNS = [
    'WeekEnd',
    'ItemCode',
    'AlertType',
    'Qty28D',
    'Qty7D',
    'Normal28D',
    'Ratio',
    'UnitCost',
    'ExcessValue',
];

/** With a ';' or tab delimiter (Vietnamese-locale export) a comma is the decimal mark: "1,5" = 1.5. */
const numOrNull = (v: string, decimalComma: boolean): number | null => {
    const s = (v || '').trim().replace(/"/g, '');
    if (!s || s.toUpperCase() === 'NULL') return null;
    const n = parseFloat(decimalComma ? s.replace(',', '.') : s.replace(/,/g, ''));
    return isNaN(n) ? null : n;
};

/** Parse the CSV exported from `EXEC dbo.usp_WeeklySpikeAlert` (header row required, one week per file). */
export const parseSpikeAlertCSV = (text: string): { rows: SpikeAlert[]; error?: string } => {
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(l => l.trim());
    if (lines.length === 0) return { rows: [], error: 'File rỗng.' };

    const delimiter = detectDelimiter(text);
    const num = (v: string) => numOrNull(v, delimiter !== ',');
    const headers = parseLine(lines[0].trim(), delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());
    const idx = Object.fromEntries(COLUMNS.map(c => [c, headers.indexOf(c.toLowerCase())]));
    const missing = COLUMNS.filter(c => idx[c] === -1);
    const groupIdx = headers.indexOf('brandgroup'); // optional: CSV from the proc before 2026-10-13 lacks it
    if (missing.length > 0) {
        return {
            rows: [],
            error:
                `Thiếu dòng tiêu đề hoặc cột: ${missing.join(', ')}. Trong SSMS bật ` +
                '"Include column headers when copying or saving the results" rồi xuất lại.',
        };
    }

    const byCode = new Map<string, SpikeAlert>();
    for (const line of lines.slice(1)) {
        const c = parseLine(line, delimiter).map(v => v.trim().replace(/"/g, ''));
        const code = (c[idx.ItemCode] || '').trim().toUpperCase();
        if (!code) continue;
        byCode.set(code, {
            week_end: (c[idx.WeekEnd] || '').slice(0, 10),
            item_code: code,
            alert_type: (c[idx.AlertType] || '').toUpperCase() === 'NEW' ? 'NEW' : 'ABOVE',
            qty_28d: num(c[idx.Qty28D]) ?? 0,
            qty_7d: num(c[idx.Qty7D]) ?? 0,
            normal_28d: num(c[idx.Normal28D]) ?? 0,
            ratio: num(c[idx.Ratio]),
            unit_cost: num(c[idx.UnitCost]),
            excess_value: num(c[idx.ExcessValue]),
            brand_group: (groupIdx >= 0 && c[groupIdx]) || null,
        });
    }

    const rows = [...byCode.values()];
    const weeks = new Set(rows.map(r => r.week_end));
    if (weeks.size > 1) return { rows: [], error: `File chứa ${weeks.size} tuần khác nhau; mỗi lần chỉ nạp 1 tuần.` };
    if (rows.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.week_end))) {
        return { rows: [], error: 'Cột WeekEnd không đúng dạng ngày YYYY-MM-DD.' };
    }
    return { rows };
};

/** item_code → alert of the loaded week, with the ordering team's note for that same week. */
export const buildSpikeAlertMap = (alerts: SpikeAlert[], notes: SpikeAlertNote[]): Map<string, SpikeAlertWithNote> => {
    const noteByKey = new Map(notes.map(n => [`${n.week_end}|${n.item_code}`, n]));
    return new Map(alerts.map(a => [a.item_code, { ...a, note: noteByKey.get(`${a.week_end}|${a.item_code}`) }]));
};

const LINE = '━━━━━━━━━━━━━━';
const vn = (n: number, digits = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits });
const money = (v: number) => (v >= 1e9 ? `${vn(v / 1e9, 1)} tỷ đ` : `${vn(v / 1e6, v >= 1e8 ? 0 : 1)} tr đ`);
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** "24/09–30/09/2026": the last 7 days of the 28-day window. */
const weekLabel = (weekEnd: string) => {
    const end = new Date(`${weekEnd}T00:00:00Z`);
    const start = new Date(end.getTime() - 6 * 86_400_000);
    return `${ddmm(start)}–${ddmm(end)}/${end.getUTCFullYear()}`;
};

const itemLines = (a: SpikeAlert, i: number): string[] =>
    a.alert_type === 'NEW'
        ? [`${i + 1}. ${a.item_code} 🆕 mã mới`, `   28 ngày: ${vn(a.qty_28d)} | 7 ngày: ${vn(a.qty_7d)}`]
        : [
              `${i + 1}. ${a.item_code}`,
              `   28 ngày: ${vn(a.qty_28d)} | thường: ${vn(a.normal_28d, a.normal_28d >= 100 ? 0 : 1)}` +
                  (a.ratio == null ? '' : ` (×${vn(a.ratio, 1)})`),
              `   7 ngày: ${vn(a.qty_7d)}` + (a.excess_value ? ` | vượt ~${money(a.excess_value)}` : ''),
          ];

export interface ZaloMessage {
    group: string;
    count: number;
    excess: number;
    text: string;
}

/** One copy-paste Zalo message per brand group (one group chat each), biggest excess first. */
export const buildZaloMessages = (alerts: SpikeAlert[]): ZaloMessage[] => {
    const groups = new Map<string, SpikeAlert[]>();
    for (const a of alerts) {
        const g = a.brand_group || 'Khác';
        groups.set(g, [...(groups.get(g) ?? []), a]);
    }
    return [...groups.entries()]
        .map(([group, items]) => {
            const sorted = [...items].sort((x, y) => (y.excess_value ?? 0) - (x.excess_value ?? 0));
            const excess = sorted.reduce((s, a) => s + (a.excess_value ?? 0), 0);
            const text = [
                `🔺 CẢNH BÁO ĐỘT BIẾN TUẦN ${weekLabel(sorted[0].week_end)}`,
                `📦 Nhóm: ${group} — ${sorted.length} mã`,
                LINE,
                ...sorted.flatMap(itemLines),
                LINE,
                ...(excess > 0 ? [`Tổng vượt: ${money(excess)}`] : []),
                '👉 Kiểm tra tồn và đơn chờ; báo lại nếu là đơn dự án / đơn lớn một lần.',
            ].join('\n');
            return { group, count: sorted.length, excess, text };
        })
        .sort((x, y) => y.excess - x.excess);
};
