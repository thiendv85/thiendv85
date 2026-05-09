import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HandoffModal from './HandoffModal';
import { DataProvider } from './DataProvider';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

describe('HandoffModal', () => {
  beforeEach(() => {
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders Export and Import tab buttons', () => {
    render(<HandoffModal />, { wrapper });
    // Two "Export" buttons: tab + action. Two "Import" buttons: tab + (none, "Xác nhận merge" instead).
    expect(screen.getAllByRole('button', { name: /^Export$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeInTheDocument();
  });

  it('clicking Export action triggers download (URL.createObjectURL × 2)', async () => {
    const create = vi.fn(() => 'blob:mock');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    render(<HandoffModal />, { wrapper });
    // The action button is the second "Export" button (first is tab)
    const buttons = screen.getAllByRole('button', { name: /^Export$/i });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('switches to Import tab', async () => {
    render(<HandoffModal />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    expect(screen.getByText(/CSV file/i)).toBeInTheDocument();
    expect(screen.getByText(/JSON file/i)).toBeInTheDocument();
  });
});
