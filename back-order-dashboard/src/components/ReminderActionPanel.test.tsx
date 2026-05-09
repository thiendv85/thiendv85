import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReminderActionPanel from './ReminderActionPanel';
import { DataProvider } from './DataProvider';
import type { TransformedBOData } from '@/lib/transform';

const sampleRow = {
  DocDate: '01/04/2026', DocNo: 'PO-1', OPropertyName: 'Khẩn VOR',
  ItemCode: 'A1', ItemName: 'HỘP SỐ', QuantityRemainClose: '1', Quantity: 1,
  KhoNo: 'Kho MB', 'SR-ĐL2': 'Van Kim',
  ParsedDocDate: new Date('2026-04-01'),
  AgingDays: 40, AgingBucket: '31–60 ngày',
  DaysUntilETA: -5, ETAGroup: '', isUrgent: true, Region: '',
  EstimatedDate1: '29/06/2026',
} as TransformedBOData;

describe('ReminderActionPanel', () => {
  it('renders header with DocNo + Item', () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    // PO-1 + HỘP SỐ appear multiple times (header, template body) — assert at least once
    expect(screen.getAllByText(/PO-1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/HỘP SỐ/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows 3 template levels', () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    expect(screen.getByRole('button', { name: /first-nudge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /overdue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escalation/i })).toBeInTheDocument();
  });

  it('Copy email button writes to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    await userEvent.click(screen.getAllByRole('button', { name: /Copy email/i })[0]);
    expect(writeText).toHaveBeenCalled();
    const clipboard = writeText.mock.calls[0][0];
    expect(clipboard).toContain('PO-1');
  });

  it('"Đã gửi" opens log modal', async () => {
    render(
      <DataProvider>
        <ReminderActionPanel row={sampleRow} onClose={() => {}} />
      </DataProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /Đã gửi/i }));
    expect(screen.getByRole('heading', { name: /Ghi log/i })).toBeInTheDocument();
  });
});
