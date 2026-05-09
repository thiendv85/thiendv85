import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import ExportBanner from './ExportBanner';
import { DataProvider, useData } from './DataProvider';

describe('ExportBanner', () => {
  beforeEach(() => localStorage.clear());

  it('hides when no reminders and no stale flag', () => {
    render(<DataProvider><ExportBanner /></DataProvider>);
    expect(screen.queryByTestId('export-banner')).not.toBeInTheDocument();
  });

  it('shows count when reminders exist after lastExportAt', () => {
    function Seed() {
      const { logReminder, setCurrentUser } = useData();
      useEffect(() => {
        setCurrentUser('A');
        logReminder({
          doc_no: 'P', item_code: 'A', item_name: 'X', supplier: 'S',
          channel: 'email', template_used: 'first-nudge', ncc_response_status: 'pending',
        });
      }, []);
      return null;
    }
    render(<DataProvider><Seed /><ExportBanner /></DataProvider>);
    expect(screen.getByTestId('export-banner')).toHaveTextContent(/1 reminder/);
  });
});
