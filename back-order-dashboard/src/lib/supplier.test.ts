import { describe, it, expect } from 'vitest';
import { getSupplier } from './supplier';

describe('getSupplier', () => {
  it('returns SR-ĐL2 directly when present', () => {
    expect(getSupplier({ 'SR-ĐL2': 'PEU HN' } as any)).toEqual({ name: 'PEU HN', isInferred: false });
  });

  it('trims whitespace', () => {
    expect(getSupplier({ 'SR-ĐL2': '  Van Kim  ' } as any)).toEqual({ name: 'Van Kim', isInferred: false });
  });

  it('falls back to "(không rõ)" + isInferred when missing', () => {
    expect(getSupplier({ 'SR-ĐL2': '' } as any)).toEqual({ name: '(không rõ)', isInferred: true });
  });
});
