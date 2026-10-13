import { describe, it, expect } from 'vitest';
import {
    parseSpikeAlertCSV,
    buildSpikeAlertMap,
    buildZaloMessages,
    type SpikeAlert,
    type SpikeAlertNote,
} from '../spikeAlerts';

const HEADER = 'WeekEnd,ItemCode,AlertType,Qty28D,Qty7D,Normal28D,Ratio,UnitCost,ExcessValue';

describe('parseSpikeAlertCSV', () => {
    it('parses usp_WeeklySpikeAlert output with header', () => {
        const csv = [
            HEADER,
            '2026-09-30,92102q6830 ,ABOVE,61,12,27.2,2.2,32100000,1086065027',
            '2026-09-30,NEW001,NEW,25,25,0,NULL,NULL,NULL',
        ].join('\r\n');
        const { rows, error } = parseSpikeAlertCSV(csv);
        expect(error).toBeUndefined();
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({
            week_end: '2026-09-30',
            item_code: '92102Q6830',
            alert_type: 'ABOVE',
            qty_28d: 61,
            qty_7d: 12,
            normal_28d: 27.2,
            ratio: 2.2,
            unit_cost: 32100000,
            excess_value: 1086065027,
            brand_group: null,
        });
        expect(rows[1].ratio).toBeNull();
        expect(rows[1].unit_cost).toBeNull();
        expect(rows[1].alert_type).toBe('NEW');
    });

    it('accepts SSMS datetime and semicolon delimiter', () => {
        const csv = [HEADER.replace(/,/g, ';'), '2026-09-30 00:00:00.000;A1;ABOVE;80;30;29.1;2.7;1000;50900'].join(
            '\n',
        );
        const { rows } = parseSpikeAlertCSV(csv);
        expect(rows[0].week_end).toBe('2026-09-30');
        expect(rows[0].qty_28d).toBe(80);
    });

    it('reads decimal commas in a semicolon file (Vietnamese-locale export)', () => {
        const csv = [HEADER.replace(/,/g, ';'), '2026-09-30;A1;ABOVE;80;30;29,1;2,7;1000,5;50900'].join('\n');
        const { rows } = parseSpikeAlertCSV(csv);
        expect(rows[0].normal_28d).toBe(29.1);
        expect(rows[0].ratio).toBe(2.7);
        expect(rows[0].unit_cost).toBe(1000.5);
    });

    it('strips a UTF-8 BOM before the header', () => {
        const { rows, error } = parseSpikeAlertCSV(
            '\uFEFF' + HEADER + '\n2026-09-30,A1,ABOVE,80,30,29.1,2.7,1000,50900',
        );
        expect(error).toBeUndefined();
        expect(rows[0].item_code).toBe('A1');
    });

    it('rejects a file without the header row (SSMS default export)', () => {
        const { rows, error } = parseSpikeAlertCSV('2026-09-30,A1,ABOVE,80,30,29.1,2.7,1000,50900');
        expect(rows).toEqual([]);
        expect(error).toMatch(/tiêu đề/);
    });

    it('rejects a file mixing several weeks', () => {
        const csv = [HEADER, '2026-09-30,A1,ABOVE,80,30,29,2.7,1,1', '2026-10-07,A2,ABOVE,80,30,29,2.7,1,1'].join('\n');
        expect(parseSpikeAlertCSV(csv).error).toMatch(/1 tuần/);
    });

    it('keeps the last row when an item code repeats', () => {
        const csv = [HEADER, '2026-09-30,A1,ABOVE,80,30,29,2.7,1,1', '2026-09-30,a1,ABOVE,90,30,29,3.1,1,1'].join('\n');
        const { rows } = parseSpikeAlertCSV(csv);
        expect(rows).toHaveLength(1);
        expect(rows[0].qty_28d).toBe(90);
    });
});

describe('buildSpikeAlertMap', () => {
    it('keys alerts by item code and attaches notes of the same week', () => {
        const alerts = [{ week_end: '2026-09-30', item_code: 'A1' } as SpikeAlert];
        const notes = [
            { week_end: '2026-09-30', item_code: 'A1', conclusion: 'one_off' },
            { week_end: '2026-09-23', item_code: 'A1', conclusion: 'project' },
        ] as SpikeAlertNote[];
        const map = buildSpikeAlertMap(alerts, notes);
        expect(map.get('A1')?.note?.conclusion).toBe('one_off');
        expect(map.has('B2')).toBe(false);
    });
});

describe('BrandGroup column', () => {
    it('is read when present and trimmed', () => {
        const csv = [HEADER + ',BrandGroup', '2026-09-30,A1,ABOVE,80,30,29,2.7,1,1, Nội địa KIA '].join('\n');
        expect(parseSpikeAlertCSV(csv).rows[0].brand_group).toBe('Nội địa KIA');
    });
});

const alert = (code: string, group: string | null, excess: number | null, extra: Partial<SpikeAlert> = {}) =>
    ({
        week_end: '2026-09-30',
        item_code: code,
        alert_type: 'ABOVE',
        qty_28d: 61,
        qty_7d: 12,
        normal_28d: 27.2,
        ratio: 2.2,
        unit_cost: 1000,
        excess_value: excess,
        brand_group: group,
        ...extra,
    }) as SpikeAlert;

describe('buildZaloMessages', () => {
    it('makes one message per brand group, biggest excess first', () => {
        const msgs = buildZaloMessages([
            alert('K1', 'KIA', 5_600_000),
            alert('M1', 'MAZDA', 2_000_000_000),
            alert('K2', 'KIA', 1_000_000),
            alert('X1', null, null),
        ]);
        expect(msgs.map(m => [m.group, m.count])).toEqual([
            ['MAZDA', 1],
            ['KIA', 2],
            ['Khác', 1],
        ]);
    });

    it('formats header, numbered items, total and call to action', () => {
        const [kia] = buildZaloMessages([
            alert('K1', 'KIA', 5_600_000),
            alert('N1', 'KIA', null, { alert_type: 'NEW', qty_28d: 25, qty_7d: 25, normal_28d: 0, ratio: null }),
        ]);
        expect(kia.text).toBe(
            [
                '🔺 CẢNH BÁO ĐỘT BIẾN TUẦN 24/09–30/09/2026',
                '📦 Nhóm: KIA — 2 mã',
                '━━━━━━━━━━━━━━',
                '1. K1',
                '   28 ngày: 61 | thường: 27,2 (×2,2)',
                '   7 ngày: 12 | vượt ~5,6 tr đ',
                '2. N1 🆕 mã mới',
                '   28 ngày: 25 | 7 ngày: 25',
                '━━━━━━━━━━━━━━',
                'Tổng vượt: 5,6 tr đ',
                '👉 Kiểm tra tồn và đơn chờ; báo lại nếu là đơn dự án / đơn lớn một lần.',
            ].join('\n'),
        );
    });

    it('shows billions as tỷ đ', () => {
        expect(buildZaloMessages([alert('M1', 'MAZDA', 2_345_000_000)])[0].text).toContain('Tổng vượt: 2,3 tỷ đ');
    });
});
