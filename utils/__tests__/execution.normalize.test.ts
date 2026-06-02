import { describe, it, expect } from 'vitest';
import { normShipMethod, normOrderType, normPort, normGroup } from '../execution/normalize';

describe('normShipMethod', () => {
  it('gộp mọi biến thể AIR/SEA', () => {
    expect(normShipMethod('AIR')).toBe('AIR');
    expect(normShipMethod('Air')).toBe('AIR');
    expect(normShipMethod('SEA')).toBe('SEA');
    expect(normShipMethod('sea')).toBe('SEA');
    expect(normShipMethod(' Sea ')).toBe('SEA');
  });
  it('null cho giá trị lạ/rỗng/null', () => {
    expect(normShipMethod('')).toBeNull();
    expect(normShipMethod('xyz')).toBeNull();
    expect(normShipMethod(null)).toBeNull();
    expect(normShipMethod(undefined)).toBeNull();
  });
});

describe('normOrderType', () => {
  it('gộp Khẩn/KHẨN và Dự trữ', () => {
    expect(normOrderType('Khẩn')).toBe('KHAN');
    expect(normOrderType('KHẨN')).toBe('KHAN');
    expect(normOrderType('Dự trữ')).toBe('DU_TRU');
  });
  it('null cho null/undefined/lạ', () => {
    expect(normOrderType(null)).toBeNull();
    expect(normOrderType(undefined)).toBeNull();
    expect(normOrderType('abc')).toBeNull();
  });
});

describe('normPort', () => {
  it('gộp biến thể tên cảng theo hoa + bỏ dấu cách thừa + bỏ dấu phẩy', () => {
    expect(normPort('HẢI PHÒNG')).toBe('HẢI PHÒNG');
    expect(normPort('Cát Lái HCM')).toBe('CÁT LÁI HCM');
    expect(normPort('CÁT LÁI HCM')).toBe('CÁT LÁI HCM');
    expect(normPort('VICT hCM')).toBe('VICT HCM');
    expect(normPort('Tân Sơn Nhất, HCM')).toBe('TÂN SƠN NHẤT HCM');
  });
});

describe('normGroup', () => {
  it('sửa typo ĐỐNG SƠN → ĐỒNG SƠN', () => {
    expect(normGroup('ĐỐNG SƠN')).toBe('ĐỒNG SƠN');
    expect(normGroup('ĐỒNG SƠN')).toBe('ĐỒNG SƠN');
    expect(normGroup('MÁY GẦM ĐIỆN')).toBe('MÁY GẦM ĐIỆN');
  });
});
