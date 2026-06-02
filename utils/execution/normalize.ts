import type { ShipMethod, OrderType } from '../../types/execution';

const collapse = (s?: string | null) => (s || '').trim().replace(/\s+/g, ' ');

export function normShipMethod(s?: string | null): ShipMethod | null {
  const v = collapse(s).toUpperCase();
  if (v === 'AIR') return 'AIR';
  if (v === 'SEA') return 'SEA';
  return null;
}

export function normOrderType(s?: string | null): OrderType | null {
  const v = collapse(s).toUpperCase();
  if (v === 'KHẨN' || v === 'KHAN') return 'KHAN';
  if (v.startsWith('DỰ TRỮ') || v === 'DU TRU') return 'DU_TRU';
  return null;
}

export function normPort(s?: string | null): string | null {
  const v = collapse(s).toUpperCase().replace(/,/g, '');
  return v || null;
}

const GROUP_FIX: Record<string, string> = { 'ĐỐNG SƠN': 'ĐỒNG SƠN' };
export function normGroup(s?: string | null): string | null {
  const v = collapse(s).toUpperCase();
  return v ? (GROUP_FIX[v] || v) : null;
}
