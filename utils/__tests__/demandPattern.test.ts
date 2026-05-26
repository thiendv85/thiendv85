import { describe, it, expect } from 'vitest';
import { avg, stdDev, classifyDemandPattern, detectAnomaly } from '../demandPattern';

describe('avg', () => {
    it('returns 0 for empty array', () => {
        expect(avg([])).toBe(0);
    });

    it('computes mean of values', () => {
        expect(avg([10, 20, 30])).toBe(20);
    });

    it('handles single value', () => {
        expect(avg([42])).toBe(42);
    });
});

describe('stdDev', () => {
    it('returns 0 for fewer than 2 values', () => {
        expect(stdDev([])).toBe(0);
        expect(stdDev([5])).toBe(0);
    });

    it('returns 0 for identical values', () => {
        expect(stdDev([10, 10, 10])).toBe(0);
    });

    it('computes population std dev', () => {
        // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, sd=2
        expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    });
});

describe('classifyDemandPattern', () => {
    it('returns SMOOTH for null/empty', () => {
        expect(classifyDemandPattern([])).toBe('SMOOTH');
        expect(classifyDemandPattern(null as unknown as number[])).toBe('SMOOTH');
    });

    it('returns INTERMITTENT when all zeros', () => {
        expect(classifyDemandPattern([0, 0, 0, 0])).toBe('INTERMITTENT');
    });

    it('returns SMOOTH for low CV and low zero ratio', () => {
        // Stable demand: low variation, few zeros
        expect(classifyDemandPattern([100, 105, 98, 102, 100, 97])).toBe('SMOOTH');
    });

    it('returns ERRATIC for high CV and low zero ratio', () => {
        // High variation but consistent non-zero demand
        expect(classifyDemandPattern([10, 100, 5, 200, 15, 150])).toBe('ERRATIC');
    });

    it('returns INTERMITTENT for high zero ratio and low CV', () => {
        // Many zeros but when demand occurs it's consistent
        expect(classifyDemandPattern([0, 0, 10, 0, 0, 0, 12, 0, 0, 0, 11, 0])).toBe('INTERMITTENT');
    });

    it('returns LUMPY for high zero ratio AND high CV', () => {
        // Many zeros + wild variation when demand occurs
        expect(classifyDemandPattern([0, 0, 5, 0, 0, 0, 500, 0, 0, 0, 2, 0])).toBe('LUMPY');
    });
});

describe('detectAnomaly', () => {
    it('returns NORMAL for short history', () => {
        expect(detectAnomaly([])).toBe('NORMAL');
        expect(detectAnomaly([10, 20])).toBe('NORMAL');
    });

    it('returns NORMAL for stable series', () => {
        expect(detectAnomaly([100, 105, 98, 102, 100])).toBe('NORMAL');
    });

    it('detects SPIKE when latest >> mean + 2.5*sd', () => {
        // Base: [10, 10, 10, 10], mean=10, sd=0 → latest=1000 >> 10
        expect(detectAnomaly([10, 10, 10, 10, 1000])).toBe('SPIKE');
    });

    it('detects DROP when mean > 2 and latest is 0', () => {
        expect(detectAnomaly([50, 60, 55, 45, 0])).toBe('DROP');
    });

    it('returns NORMAL when latest is 0 but mean <= 2', () => {
        expect(detectAnomaly([1, 1, 2, 0])).toBe('NORMAL');
    });
});
