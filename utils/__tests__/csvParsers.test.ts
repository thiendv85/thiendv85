import { describe, it, expect } from 'vitest';
import { parseDealerStockCSV, parseBackorderCSV, parseMonthlyCSV } from '../csv/parsers';

describe('parseDealerStockCSV', () => {
    it('returns empty for empty/single-line input', () => {
        expect(parseDealerStockCSV('')).toEqual({});
        expect(parseDealerStockCSV('ItemCode,Qty')).toEqual({});
    });

    it('parses basic dealer stock CSV', () => {
        const csv = [
            'ItemCode,BranchName,Showroom,Qty',
            'ABC001,HCM,SR1,5',
            'ABC001,HN,SR2,3',
            'DEF002,HCM,SR1,10',
        ].join('\n');

        const result = parseDealerStockCSV(csv);
        expect(Object.keys(result)).toEqual(['ABC001', 'DEF002']);
        expect(result['ABC001']).toHaveLength(2);
        expect(result['ABC001'][0].Qty).toBe(5);
        expect(result['DEF002'][0].BranchName).toBe('HCM');
    });

    it('uppercases item codes', () => {
        const csv = 'ItemCode,Qty\nabc001,5';
        const result = parseDealerStockCSV(csv);
        expect(result['ABC001']).toBeDefined();
    });

    it('skips rows with qty <= 0', () => {
        const csv = 'ItemCode,Qty\nABC001,0\nDEF002,-1\nGHI003,5';
        const result = parseDealerStockCSV(csv);
        expect(result['ABC001']).toBeUndefined();
        expect(result['DEF002']).toBeUndefined();
        expect(result['GHI003']).toHaveLength(1);
    });

    it('returns empty when required columns missing', () => {
        const csv = 'Name,Price\nWidget,100';
        expect(parseDealerStockCSV(csv)).toEqual({});
    });

    it('handles Vietnamese column names', () => {
        const csv = 'Mã hàng,Số lượng\nABC001,10';
        const result = parseDealerStockCSV(csv);
        expect(result['ABC001']).toHaveLength(1);
    });

    it('handles semicolon delimiter', () => {
        const csv = 'ItemCode;Qty\nABC001;5';
        const result = parseDealerStockCSV(csv);
        expect(result['ABC001']).toHaveLength(1);
    });
});

describe('parseBackorderCSV', () => {
    it('returns empty for empty input', () => {
        expect(parseBackorderCSV('')).toEqual({});
    });

    it('parses basic backorder CSV', () => {
        const csv = [
            'Item Code,Quantity,Doc No,Warehouse',
            'ABC001,5,PO001,NB',
            'ABC001,3,PO002,BB',
            'DEF002,10,PO003,NB',
        ].join('\n');

        const result = parseBackorderCSV(csv);
        expect(Object.keys(result)).toEqual(['ABC001', 'DEF002']);
        expect(result['ABC001']).toHaveLength(2);
        expect(result['ABC001'][0].Qty).toBe(5);
        expect(result['ABC001'][0].DocNo).toBe('PO001');
    });

    it('skips rows with qty <= 0', () => {
        const csv = 'Item Code,Quantity\nABC001,0\nDEF002,5';
        const result = parseBackorderCSV(csv);
        expect(result['ABC001']).toBeUndefined();
        expect(result['DEF002']).toBeDefined();
    });

    it('returns empty when ItemCode column missing', () => {
        const csv = 'Name,Quantity\nWidget,10';
        expect(parseBackorderCSV(csv)).toEqual({});
    });

    it('handles BOM character in header', () => {
        const csv = '﻿Item Code,Quantity\nABC001,5';
        const result = parseBackorderCSV(csv);
        expect(result['ABC001']).toHaveLength(1);
    });
});

describe('parseMonthlyCSV', () => {
    it('returns empty for empty input', () => {
        expect(parseMonthlyCSV('')).toEqual({});
    });

    it('parses basic monthly data', () => {
        const csv = [
            'ItemCode,ItemName,AvgQty3M,AvgQty6M,BaseForecast,SafetyStock,ROPFinal',
            'ABC001,Widget,10,8,12,5,15',
        ].join('\n');

        const result = parseMonthlyCSV(csv);
        expect(result['ABC001']).toBeDefined();
        expect(result['ABC001'].AvgQty3M).toBe(10);
        expect(result['ABC001'].BaseForecast).toBe(12);
        expect(result['ABC001'].SafetyStock_Raw).toBe(5);
    });

    it('returns empty when ItemCode column missing', () => {
        const csv = 'Name,Value\nWidget,100';
        expect(parseMonthlyCSV(csv)).toEqual({});
    });

    it('handles Vietnamese column names', () => {
        const csv = 'Mã hàng,Tên hàng,Bán 3T\nABC001,Widget,10';
        const result = parseMonthlyCSV(csv);
        expect(result['ABC001']).toBeDefined();
        expect(result['ABC001'].AvgQty3M).toBe(10);
    });
});
