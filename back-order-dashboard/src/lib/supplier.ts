import type { RawBOData } from './transform';

export function getSupplier(row: RawBOData): { name: string; isInferred: boolean } {
  const direct = row['SR-ĐL2'];
  if (direct && direct.trim()) return { name: direct.trim(), isInferred: false };
  return { name: '(không rõ)', isInferred: true };
}
