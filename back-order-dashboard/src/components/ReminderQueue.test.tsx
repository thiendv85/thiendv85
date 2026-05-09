import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import ReminderQueue from './ReminderQueue';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('ReminderQueue', () => {
  it('renders empty state when no data', () => {
    render(<ReminderQueue />, { wrapper });
    expect(screen.getByText(/Chưa có dữ liệu/i)).toBeInTheDocument();
  });

  it('orders by category strict (VOR > Bảo hành > Khẩn > Dự trữ > Khác)', () => {
    function Seed() {
      const { setRows } = useData();
      useEffect(() => {
        setRows([
          { DocDate: '01/01/2026', DocNo: 'D5', OPropertyName: 'Chiến dịch', ItemCode: 'I5', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D2', OPropertyName: 'Bảo hành',  ItemCode: 'I2', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D1', OPropertyName: 'Khẩn VOR',  ItemCode: 'I1', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D4', OPropertyName: 'Dự trữ',    ItemCode: 'I4', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
          { DocDate: '01/01/2026', DocNo: 'D3', OPropertyName: 'Khẩn',      ItemCode: 'I3', ItemName: 'X', QuantityRemainClose: '1', KhoNo: 'K', 'SR-ĐL2': 'S' } as any,
        ]);
      }, []);
      return null;
    }
    render(<DataProvider><Seed /><ReminderQueue /></DataProvider>);
    const cards = screen.getAllByTestId('reminder-card');
    const docs = cards.map(c => within(c).getByTestId('doc-no').textContent);
    expect(docs).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });
});
