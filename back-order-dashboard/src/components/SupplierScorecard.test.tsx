import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import SupplierScorecard from './SupplierScorecard';
import { DataProvider, useData } from './DataProvider';
import type { ReactNode } from 'react';

function Seed() {
  const { logReminder, setCurrentUser } = useData();
  useEffect(() => {
    setCurrentUser('NV A');
    logReminder({ doc_no: 'P1', item_code: 'A', item_name: 'X', supplier: 'Van Kim', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'committed' });
    logReminder({ doc_no: 'P2', item_code: 'B', item_name: 'Y', supplier: 'PEU HN', channel: 'email', template_used: 'first-nudge', ncc_response_status: 'silent' });
  }, []);
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider><Seed />{children}</DataProvider>
);

describe('SupplierScorecard', () => {
  it('renders one row per supplier', () => {
    render(<SupplierScorecard />, { wrapper });
    expect(screen.getByText('Van Kim')).toBeInTheDocument();
    expect(screen.getByText('PEU HN')).toBeInTheDocument();
  });

  it('switching time window does not error', async () => {
    render(<SupplierScorecard />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /^7 ngày$/ }));
    expect(screen.getAllByTestId('supplier-row').length).toBeGreaterThan(0);
  });

  it('clicking a supplier opens drill-down', async () => {
    render(<SupplierScorecard />, { wrapper });
    await userEvent.click(screen.getByText('Van Kim'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows empty state when archive is empty', () => {
    render(<DataProvider><SupplierScorecard /></DataProvider>);
    expect(screen.getByText(/Chưa có lần nhắc/i)).toBeInTheDocument();
  });
});
