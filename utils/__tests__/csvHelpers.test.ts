import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseLine, safeCSV } from '../csv/helpers';

describe('detectDelimiter', () => {
    it('detects comma', () => {
        expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    });

    it('detects semicolon when no commas', () => {
        expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    });

    it('detects tab', () => {
        expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    });

    it('defaults to comma for empty input', () => {
        expect(detectDelimiter('')).toBe(',');
    });

    it('prefers comma when both comma and semicolon present', () => {
        expect(detectDelimiter('a,b;c')).toBe(',');
    });
});

describe('parseLine', () => {
    it('splits by comma', () => {
        expect(parseLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields', () => {
        expect(parseLine('"hello, world",b,c', ',')).toEqual(['hello, world', 'b', 'c']);
    });

    it('handles empty fields', () => {
        expect(parseLine('a,,c', ',')).toEqual(['a', '', 'c']);
    });

    it('splits by semicolon', () => {
        expect(parseLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
    });

    it('handles single field', () => {
        expect(parseLine('alone', ',')).toEqual(['alone']);
    });
});

describe('safeCSV', () => {
    it('returns empty string for null/undefined', () => {
        expect(safeCSV(null)).toBe('');
        expect(safeCSV(undefined)).toBe('');
    });

    it('returns number as plain string (no quotes)', () => {
        expect(safeCSV(42)).toBe('42');
        expect(safeCSV(0)).toBe('0');
    });

    it('wraps strings in quotes', () => {
        expect(safeCSV('hello')).toBe('"hello"');
    });

    it('escapes double quotes in strings', () => {
        expect(safeCSV('say "hi"')).toBe('"say ""hi"""');
    });

    it('handles empty string', () => {
        expect(safeCSV('')).toBe('""');
    });
});
