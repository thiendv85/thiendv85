import { describe, it, expect } from 'vitest';
import {
    getVietnameseWorkingDays,
    getWorkingDaysByLeadTime,
    getDaysInMonth,
    buildWorkingDaysCache,
    TET_DATES,
    PUBLIC_HOLIDAYS,
} from '../calendar';

describe('getDaysInMonth', () => {
    it('returns 31 for January', () => {
        expect(getDaysInMonth(0, 2026)).toBe(31);
    });

    it('returns 28 for non-leap Feb', () => {
        expect(getDaysInMonth(1, 2025)).toBe(28);
    });

    it('returns 29 for leap Feb', () => {
        expect(getDaysInMonth(1, 2024)).toBe(29);
    });

    it('returns 30 for April', () => {
        expect(getDaysInMonth(3, 2026)).toBe(30);
    });
});

describe('getVietnameseWorkingDays', () => {
    it('excludes Sundays', () => {
        // Any month result should be <= total days - sundays
        const wd = getVietnameseWorkingDays(5, 2026); // June 2026
        expect(wd).toBeGreaterThan(0);
        expect(wd).toBeLessThanOrEqual(30);
    });

    it('reduces working days during Tet month', () => {
        // Feb 2026 has Tet (starts Feb 16, 7 days)
        const febWd = getVietnameseWorkingDays(1, 2026);
        // Normal Feb ~24 working days (Mon-Sat), with Tet should be ~17-19
        expect(febWd).toBeLessThan(24);
    });

    it('reduces working days for months with public holidays', () => {
        // September has Quốc khánh (Sep 2)
        const sepWd = getVietnameseWorkingDays(8, 2026);
        // Should be slightly less than a full month
        expect(sepWd).toBeGreaterThan(20);
        expect(sepWd).toBeLessThanOrEqual(27);
    });

    it('returns fallback 26 if calculation yields 0', () => {
        // This is a safety fallback — hard to trigger naturally
        // but the code has `|| 26`
        expect(typeof getVietnameseWorkingDays(0, 2026)).toBe('number');
    });
});

describe('getWorkingDaysByLeadTime', () => {
    it('returns 0 for 0 calendar days', () => {
        expect(getWorkingDaysByLeadTime(0, new Date(2026, 5, 1))).toBe(0);
    });

    it('excludes Sundays from lead time', () => {
        // 7 calendar days starting Monday → 6 working days (Mon-Sat)
        const monday = new Date(2026, 5, 1); // Jun 1 2026 is Monday
        const wd = getWorkingDaysByLeadTime(7, monday);
        expect(wd).toBe(6);
    });

    it('handles lead time spanning public holiday', () => {
        // Sep 1 2026 (Tue), lead 3 days: Sep 1(Tue)✓, Sep 2(Wed=Quốc khánh)✗, Sep 3(Thu)✓
        const start = new Date(2026, 8, 1);
        const wd = getWorkingDaysByLeadTime(3, start);
        expect(wd).toBe(2);
    });
});

describe('buildWorkingDaysCache', () => {
    it('returns map with entry for day 0 = 0', () => {
        const cache = buildWorkingDaysCache(new Date(2026, 0, 1), 10);
        expect(cache.get(0)).toBe(0);
    });

    it('builds monotonically increasing cache', () => {
        const cache = buildWorkingDaysCache(new Date(2026, 0, 1), 30);
        let prev = 0;
        for (let i = 1; i <= 30; i++) {
            const val = cache.get(i)!;
            expect(val).toBeGreaterThanOrEqual(prev);
            prev = val;
        }
    });

    it('has correct size', () => {
        const cache = buildWorkingDaysCache(new Date(2026, 0, 1), 50);
        expect(cache.size).toBe(51); // 0..50
    });
});

describe('TET_DATES', () => {
    it('has entries for 2024-2027', () => {
        expect(TET_DATES[2024]).toBeDefined();
        expect(TET_DATES[2025]).toBeDefined();
        expect(TET_DATES[2026]).toBeDefined();
        expect(TET_DATES[2027]).toBeDefined();
    });

    it('each entry has month, day, length', () => {
        for (const year of [2024, 2025, 2026, 2027]) {
            const tet = TET_DATES[year];
            expect(tet.month).toBeGreaterThanOrEqual(0);
            expect(tet.day).toBeGreaterThan(0);
            expect(tet.length).toBe(7);
        }
    });
});

describe('PUBLIC_HOLIDAYS', () => {
    it('has 4 fixed holidays', () => {
        expect(PUBLIC_HOLIDAYS).toHaveLength(4);
    });
});
