import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('DataProvider extended state', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('exposes annotations, archive, currentUser', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.annotations).toBeInstanceOf(Map);
    expect(Array.isArray(result.current.archive)).toBe(true);
    expect(typeof result.current.currentUser).toBe('string');
  });

  it('logReminder appends archive + updates annotation', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => {
      result.current.setCurrentUser('NV A');
    });
    act(() => {
      result.current.logReminder({
        doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
        channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending',
      });
    });
    expect(result.current.archive).toHaveLength(1);
    expect(result.current.archive[0].reminder_by).toBe('NV A');
    expect(result.current.annotations.size).toBe(1);
  });

  it('persists currentUser to localStorage', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => result.current.setCurrentUser('NV B'));
    expect(localStorage.getItem('backorder.currentUser')).toBe('NV B');
  });

  it('exportSnapshot returns csv + json blobs and updates lastExportAt', () => {
    const { result } = renderHook(() => useData(), { wrapper });
    act(() => result.current.setRows([
      {
        DocDate: '01/01/2026', DocNo: 'P', OPropertyName: 'Khẩn',
        ItemCode: 'I', ItemName: 'X', QuantityRemainClose: '1',
        KhoNo: 'K', 'SR-ĐL2': 'S',
      } as unknown as import('@/lib/transform').RawBOData,
    ]));
    let out: { csv: Blob; json: Blob } | null = null;
    act(() => { out = result.current.exportSnapshot(); });
    expect(out!.csv).toBeInstanceOf(Blob);
    expect(out!.json).toBeInstanceOf(Blob);
    expect(localStorage.getItem('backorder.lastExportAt')).toBeTruthy();
  });
});
