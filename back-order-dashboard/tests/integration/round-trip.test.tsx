import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DataProvider, useData } from '@/components/DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('integration: round-trip', () => {
  it('upload → log reminder → export → re-import → state equivalent', async () => {
    const { result } = renderHook(() => useData(), { wrapper });

    act(() => {
      result.current.setCurrentUser('NV A');
      result.current.setRows([
        {
          DocDate: '01/01/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn',
          ItemCode: 'A1', ItemName: 'X', QuantityRemainClose: '1',
          KhoNo: 'K', 'SR-ĐL2': 'NCC1',
        } as any,
      ]);
    });

    act(() => {
      result.current.logReminder({
        doc_no: 'PO-1', item_code: 'A1', item_name: 'X', supplier: 'NCC1',
        channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending',
      });
    });

    expect(result.current.archive).toHaveLength(1);

    let out: { csv: Blob; json: Blob } | null = null;
    act(() => { out = result.current.exportSnapshot(); });
    const csvText = await out!.csv.text();
    const jsonText = await out!.json.text();

    const session2 = renderHook(() => useData(), { wrapper });
    await act(async () => {
      await session2.result.current.importHandoff(csvText, jsonText);
    });

    expect(session2.result.current.archive).toHaveLength(1);
    expect(session2.result.current.archive[0].doc_no).toBe('PO-1');
    expect(session2.result.current.annotations.size).toBe(1);
  });
});
