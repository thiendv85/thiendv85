import { describe, it, expect } from 'vitest';
import { forecastDemand, ForecastResult } from '../demandForecast';

function expectValidResult(r: ForecastResult) {
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.accuracy).toBeGreaterThanOrEqual(0);
    expect(r.accuracy).toBeLessThanOrEqual(100);
    expect(r.error).toBeGreaterThanOrEqual(0);
    expect(typeof r.method).toBe('string');
    expect(typeof r.accuracyLabel).toBe('string');
}

describe('forecastDemand', () => {
    it('returns zero forecast for empty history', () => {
        const r = forecastDemand([], 'SMOOTH');
        expect(r.value).toBe(0);
        expect(r.method).toBe('None');
    });

    it('returns zero forecast for null history', () => {
        const r = forecastDemand(null as unknown as number[], 'SMOOTH');
        expect(r.value).toBe(0);
        expect(r.method).toBe('None');
    });

    describe('SMOOTH pattern → SES', () => {
        it('produces valid forecast', () => {
            const r = forecastDemand([100, 105, 98, 102, 100], 'SMOOTH');
            expectValidResult(r);
            expect(r.method).toBe('SES');
        });

        it('forecast near mean for stable series', () => {
            const r = forecastDemand([100, 100, 100, 100], 'SMOOTH');
            expect(r.value).toBeCloseTo(100, 0);
        });

        it('handles single value', () => {
            const r = forecastDemand([50], 'SMOOTH');
            expectValidResult(r);
            expect(r.value).toBe(50);
        });
    });

    describe('ERRATIC pattern → Holt', () => {
        it('uses Holt method for enough data', () => {
            const r = forecastDemand([10, 20, 30, 40, 50], 'ERRATIC');
            expectValidResult(r);
            expect(r.method).toBe('Holt');
        });

        it('falls back to SES for short history', () => {
            const r = forecastDemand([10, 20], 'ERRATIC');
            expect(r.method).toBe('SES');
        });

        it('captures upward trend', () => {
            const r = forecastDemand([10, 20, 30, 40, 50], 'ERRATIC');
            // Holt should forecast > last value for upward trend
            expect(r.value).toBeGreaterThan(40);
        });
    });

    describe('INTERMITTENT pattern → Croston/SBA', () => {
        it('uses Croston method', () => {
            const r = forecastDemand([0, 0, 10, 0, 0, 12, 0, 0, 0, 11], 'INTERMITTENT');
            expectValidResult(r);
            expect(r.method).toBe('Croston/SBA');
        });

        it('returns 0 for all-zero history', () => {
            const r = forecastDemand([0, 0, 0, 0], 'INTERMITTENT');
            expect(r.value).toBe(0);
        });

        it('handles sparse demand', () => {
            const r = forecastDemand([0, 0, 0, 0, 0, 0, 0, 0, 0, 5], 'INTERMITTENT');
            expectValidResult(r);
            expect(r.value).toBeGreaterThan(0);
        });
    });

    describe('LUMPY pattern → Croston/SBA', () => {
        it('uses Croston method', () => {
            const r = forecastDemand([0, 0, 5, 0, 0, 500, 0, 0, 2, 0, 0, 100], 'LUMPY');
            expectValidResult(r);
            expect(r.method).toBe('Croston/SBA');
        });
    });
});
