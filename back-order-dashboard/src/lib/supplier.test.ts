import { describe, it, expect } from 'vitest';
import { getSupplier } from './supplier';

describe('getSupplier', () => {
  it('returns SR-ĐL2 directly when present', () => {
    expect(getSupplier({ 'SR-ĐL2': 'PEU HN' } as unknown as import('./transform').RawBOData)).toEqual({ name: 'PEU HN', isInferred: false });
  });

  it('trims whitespace', () => {
    expect(getSupplier({ 'SR-ĐL2': '  Van Kim  ' } as unknown as import('./transform').RawBOData)).toEqual({ name: 'Van Kim', isInferred: false });
  });

  it('falls back to "(không rõ)" + isInferred when missing', () => {
    expect(getSupplier({ 'SR-ĐL2': '' } as unknown as import('./transform').RawBOData)).toEqual({ name: '(không rõ)', isInferred: true });
  });
});
