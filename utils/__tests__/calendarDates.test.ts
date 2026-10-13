import { describe, it, expect } from 'vitest';
import { TET_DATES, vnMonth, getVietnameseWorkingDays } from '../calendar';

describe('vnMonth', () => {
    it('uses Vietnam time, not UTC (00:00–07:00 on the 1st belongs to the new month)', () => {
        // 2026-10-01 01:00 in Vietnam = 2026-09-30 18:00 UTC
        expect(vnMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10');
        expect(vnMonth(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09');
    });
});

describe('TET_DATES', () => {
    it('covers every year up to 2032', () => {
        for (let y = 2024; y <= 2032; y++) expect(TET_DATES[y], `missing Tết ${y}`).toBeDefined();
    });

    it('Tết month has fewer working days than the month after it (2028 Tết is in January)', () => {
        expect(getVietnameseWorkingDays(0, 2028)).toBeLessThan(getVietnameseWorkingDays(2, 2028));
        expect(getVietnameseWorkingDays(1, 2029)).toBeLessThan(getVietnameseWorkingDays(2, 2029));
    });
});
