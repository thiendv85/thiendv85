import { describe, it, expect } from 'vitest';
import { getCategoryRank, comparePriority, sortByPriority } from './priority';
import type { TransformedBOData } from './transform';
import type { Annotation } from './types';

function row(over: Partial<TransformedBOData>): TransformedBOData {
  return {
    DocDate: '01/01/2026', DocNo: 'PO-A', OPropertyName: 'Khẩn',
    ItemCode: 'I1', ItemName: 'X', QuantityRemainClose: '1', Quantity: 1,
    KhoNo: 'Kho MB', 'SR-ĐL2': 'PEU HN',
    ParsedDocDate: new Date('2026-01-01'),
    AgingDays: 10, AgingBucket: '0–30 ngày',
    DaysUntilETA: null, ETAGroup: '', isUrgent: false, Region: '',
    ...over,
  } as TransformedBOData;
}

describe('priority.getCategoryRank', () => {
  it.each([
    ['Khẩn VOR', 1],
    ['Bảo hành', 2],
    ['Khẩn', 3],
    ['Dự trữ', 4],
    ['Chiến dịch', 5],
    ['', 5],
    ['totally unknown', 5],
  ])('rank("%s") === %i', (input, expected) => {
    expect(getCategoryRank(input)).toBe(expected);
  });
});

describe('priority.comparePriority', () => {
  it('Khẩn VOR aging 5d trumps Bảo hành aging 100d', () => {
    const vor = row({ OPropertyName: 'Khẩn VOR', AgingDays: 5 });
    const wrnt = row({ OPropertyName: 'Bảo hành', AgingDays: 100 });
    expect(comparePriority(vor, wrnt)).toBeLessThan(0);
  });

  it('within same category: older aging wins', () => {
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 50 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 10 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it('within same category + aging: more overdue ETA wins', () => {
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 30, DaysUntilETA: -10 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 30, DaysUntilETA: -2 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it('within same category + aging + ETA: longer since last reminder wins', () => {
    const annA: Annotation = { reminder_count: 1, ncc_response_status: 'pending', last_reminded_at: '2026-04-01T00:00:00Z' };
    const annB: Annotation = { reminder_count: 1, ncc_response_status: 'pending', last_reminded_at: '2026-05-08T00:00:00Z' };
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 30 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 30 });
    const today = new Date('2026-05-10');
    expect(comparePriority(a, b, { annA, annB, today })).toBeLessThan(0);
  });

  it('returns 0 for identical inputs', () => {
    const a = row({ OPropertyName: 'Khẩn', AgingDays: 10 });
    const b = row({ OPropertyName: 'Khẩn', AgingDays: 10 });
    expect(comparePriority(a, b)).toBe(0);
  });
});

describe('priority.sortByPriority', () => {
  it('returns 5 categories in correct order', () => {
    const rows = [
      row({ DocNo: 'D5', OPropertyName: 'Chiến dịch' }),
      row({ DocNo: 'D2', OPropertyName: 'Bảo hành' }),
      row({ DocNo: 'D1', OPropertyName: 'Khẩn VOR' }),
      row({ DocNo: 'D4', OPropertyName: 'Dự trữ' }),
      row({ DocNo: 'D3', OPropertyName: 'Khẩn' }),
    ];
    const sorted = sortByPriority(rows);
    expect(sorted.map(r => r.DocNo)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });

  it('does not mutate input', () => {
    const rows = [row({ DocNo: 'A', OPropertyName: 'Dự trữ' }), row({ DocNo: 'B', OPropertyName: 'Khẩn VOR' })];
    const snapshot = rows.map(r => r.DocNo).join();
    sortByPriority(rows);
    expect(rows.map(r => r.DocNo).join()).toBe(snapshot);
  });
});
