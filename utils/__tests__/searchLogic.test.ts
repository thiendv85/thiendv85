import { describe, test, expect } from 'vitest';
import { parseInventorySearch, matchSearch } from '../searchLogic';

// ── parseInventorySearch ────────────────────────────────────────────────────

describe('parseInventorySearch', () => {
  test('empty input returns EMPTY type', () => {
    const result = parseInventorySearch('');
    expect(result.type).toBe('EMPTY');
  });

  test('whitespace-only returns EMPTY', () => {
    const result = parseInventorySearch('   ');
    expect(result.type).toBe('EMPTY');
  });

  test('comma-separated → CONTEXT_LIST (Excel paste)', () => {
    const result = parseInventorySearch('KIA001,KIA002,KIA003');
    expect(result.type).toBe('CONTEXT_LIST');
    expect(result.tokens.length).toBe(3);
  });

  test('newline-separated → CONTEXT_LIST', () => {
    const result = parseInventorySearch('KIA001\nKIA002\nKIA003');
    expect(result.type).toBe('CONTEXT_LIST');
    expect(result.tokens.length).toBe(3);
  });

  test('space-separated codes → CONTEXT_LIST', () => {
    const result = parseInventorySearch('YL000622ZD YL00539680');
    expect(result.type).toBe('CONTEXT_LIST');
    expect(result.tokens.length).toBe(2);
  });

  test('multi-word text → TEXT_PHRASE', () => {
    const result = parseInventorySearch('brake pad front');
    expect(result.type).toBe('TEXT_PHRASE');
    expect(result.tokens.length).toBe(3);
  });

  test('single short token → CONTEXT_FRAGMENT', () => {
    const result = parseInventorySearch('KIA');
    expect(result.type).toBe('CONTEXT_FRAGMENT');
  });

  test('long concatenated string → auto-batch CONTEXT_LIST', () => {
    // 3 codes of 8 chars each = 24 chars no spaces
    const result = parseInventorySearch('KIA00001KIA00002KIA00003');
    expect(result.type).toBe('CONTEXT_LIST');
    expect(result.tokens.length).toBeGreaterThanOrEqual(2);
  });
});

// ── matchSearch ─────────────────────────────────────────────────────────────

describe('matchSearch', () => {
  const makeItem = (code: string, name: string) => ({
    ItemCode: code,
    ItemName: name,
    TypeCar: '',
    BrandName: 'Kia',
    SourceId: '',
    BackorderBreakdown: [],
  } as any);

  test('EMPTY search matches everything', () => {
    const item = makeItem('KIA001', 'Brake Pad');
    const search = parseInventorySearch('');
    expect(matchSearch(item, search)).toBe(true);
  });

  test('CONTEXT_LIST matches by item code', () => {
    const item = makeItem('KIA00123', 'Brake Pad');
    const search = parseInventorySearch('KIA00123,BMW00456');
    expect(matchSearch(item, search)).toBe(true);
  });

  test('CONTEXT_LIST does not match unrelated item', () => {
    const item = makeItem('MAZ99999', 'Oil Filter');
    const search = parseInventorySearch('KIA00123,BMW00456');
    expect(matchSearch(item, search)).toBe(false);
  });

  test('TEXT_PHRASE matches when all tokens present in text', () => {
    const item = makeItem('KIA001', 'Brake Pad Front Left');
    const search = parseInventorySearch('brake front');
    expect(matchSearch(item, search)).toBe(true);
  });

  test('TEXT_PHRASE fails when not all tokens match', () => {
    const item = makeItem('KIA001', 'Brake Pad Front');
    const search = parseInventorySearch('brake rear');
    expect(matchSearch(item, search)).toBe(false);
  });

  test('CONTEXT_FRAGMENT matches by prefix', () => {
    const item = makeItem('KIA00123', 'Something');
    const search = parseInventorySearch('KIA001');
    expect(matchSearch(item, search)).toBe(true);
  });
});
