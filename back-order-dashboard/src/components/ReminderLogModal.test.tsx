import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReminderLogModal from './ReminderLogModal';
import { DataProvider, useData } from './DataProvider';
import type { TransformedBOData } from '@/lib/transform';
import type { ReactNode } from 'react';

const sampleRow = {
  DocDate: '01/04/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn VOR',
  ItemCode: 'A1', ItemName: 'X', QuantityRemainClose: '1', Quantity: 1,
  KhoNo: 'K', 'SR-ĐL2': 'NCC1',
  ParsedDocDate: new Date(), AgingDays: 1, AgingBucket: '0–30 ngày',
  DaysUntilETA: null, ETAGroup: '', isUrgent: false, Region: '',
} as TransformedBOData;

function Probe({ children, onState }: { children: ReactNode; onState: (s: ReturnType<typeof useData>) => void }) {
  const s = useData();
  onState(s);
  return <>{children}</>;
}

describe('ReminderLogModal', () => {
  it('disables Save until kênh + status selected', () => {
    render(
      <DataProvider>
        <ReminderLogModal row={sampleRow} level="first-nudge" channel={'' as unknown as 'email'} onClose={() => {}} onSaved={() => {}} />
      </DataProvider>
    );
    const save = screen.getByRole('button', { name: /^Lưu$/i });
    expect(save).toBeDisabled();
  });

  it('saves reminder via logReminder when form valid', async () => {
    const onSaved = vi.fn();
    let stateRef: ReturnType<typeof useData> | null = null;
    render(
      <DataProvider>
        <Probe onState={s => { stateRef = s; }}>
          <ReminderLogModal row={sampleRow} level="first-nudge" channel="email" onClose={() => {}} onSaved={onSaved} />
        </Probe>
      </DataProvider>
    );
    await userEvent.click(screen.getByLabelText(/^pending$/i));
    await userEvent.click(screen.getByRole('button', { name: /^Lưu$/i }));
    expect(onSaved).toHaveBeenCalled();
    expect(stateRef!.archive).toHaveLength(1);
  });

  it('prevents double-submit', async () => {
    const onSaved = vi.fn();
    render(
      <DataProvider>
        <ReminderLogModal row={sampleRow} level="first-nudge" channel="email" onClose={() => {}} onSaved={onSaved} />
      </DataProvider>
    );
    await userEvent.click(screen.getByLabelText(/^pending$/i));
    const save = screen.getByRole('button', { name: /^Lưu$/i });
    await userEvent.dblClick(save);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
