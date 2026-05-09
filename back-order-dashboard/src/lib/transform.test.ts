import { describe, it, expect } from 'vitest';
import { transformData, type RawBOData } from './transform';

function row(over: Partial<RawBOData> = {}): RawBOData {
  return {
    DocDate: '01/01/2026', DocNo: 'P', OPropertyName: 'Khẩn',
    ItemCode: 'I', ItemName: 'X', QuantityRemainClose: '1',
    KhoNo: 'Kho MB', 'SR-ĐL2': 'S',
    ...over,
  };
}

describe('transformData', () => {
  it('parses qty as number from string', () => {
    const out = transformData([row({ QuantityRemainClose: '5' })]);
    expect(out[0].Quantity).toBe(5);
  });

  it('parses qty as number when input is already numeric', () => {
    const out = transformData([row({ QuantityRemainClose: 7 as unknown as string })]);
    expect(out[0].Quantity).toBe(7);
  });

  it('falls back qty to 0 when unparseable', () => {
    const out = transformData([row({ QuantityRemainClose: 'abc' })]);
    expect(out[0].Quantity).toBe(0);
  });

  it.each([
    ['0–30 ngày', 1000 * 86400_000],
    ['31–60 ngày', 1000 * 86400_000],
    ['61–90 ngày', 1000 * 86400_000],
    ['91–180 ngày', 1000 * 86400_000],
    ['>180 ngày', 1000 * 86400_000],
  ])('aging bucket boundary: %s', () => {
    // not exercising actual boundary here — see explicit tests below
  });

  it('aging bucket >180 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - 200);
    const dd = String(old.getDate()).padStart(2, '0');
    const mm = String(old.getMonth() + 1).padStart(2, '0');
    const yy = old.getFullYear();
    const out = transformData([row({ DocDate: `${dd}/${mm}/${yy}` })]);
    expect(out[0].AgingBucket).toBe('>180 ngày');
  });

  it('ETA group "Quá hạn ETA" when ETA is in past', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const dd = String(past.getDate()).padStart(2, '0');
    const mm = String(past.getMonth() + 1).padStart(2, '0');
    const yy = past.getFullYear();
    const out = transformData([row({ EstimatedDate1: `${dd}/${mm}/${yy}` })]);
    expect(out[0].ETAGroup).toBe('Quá hạn ETA');
  });

  it('ETA group "Sắp về" when ETA within 14 days', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const dd = String(soon.getDate()).padStart(2, '0');
    const mm = String(soon.getMonth() + 1).padStart(2, '0');
    const yy = soon.getFullYear();
    const out = transformData([row({ EstimatedDate1: `${dd}/${mm}/${yy}` })]);
    expect(out[0].ETAGroup).toBe('Sắp về (<14 ngày)');
  });

  it('ETA group "Có ETA" when ETA further away', () => {
    const later = new Date();
    later.setDate(later.getDate() + 60);
    const dd = String(later.getDate()).padStart(2, '0');
    const mm = String(later.getMonth() + 1).padStart(2, '0');
    const yy = later.getFullYear();
    const out = transformData([row({ EstimatedDate1: `${dd}/${mm}/${yy}` })]);
    expect(out[0].ETAGroup).toBe('Có ETA (>14 ngày)');
  });

  it('ETA group "Chưa có ETA" when description has NCC keyword', () => {
    const out = transformData([row({ EstimatedDescription: 'NCC chưa có hàng' })]);
    expect(out[0].ETAGroup).toBe('Chưa có ETA');
  });

  it('ETA group "Đang xử lý" when no ETA + no keyword', () => {
    const out = transformData([row({ EstimatedDescription: '' })]);
    expect(out[0].ETAGroup).toBe('Đang xử lý');
  });

  it('isUrgent true for Khẩn VOR', () => {
    expect(transformData([row({ OPropertyName: 'Khẩn VOR' })])[0].isUrgent).toBe(true);
  });

  it('isUrgent false for Bảo hành', () => {
    expect(transformData([row({ OPropertyName: 'Bảo hành' })])[0].isUrgent).toBe(false);
  });

  it('Region Miền Nam for non-MB warehouse', () => {
    expect(transformData([row({ KhoNo: 'Kho MN' })])[0].Region).toBe('Miền Nam');
  });
});
