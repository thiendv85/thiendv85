import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from './DataProvider';
import CurrentUserGuard from './CurrentUserGuard';

describe('CurrentUserGuard', () => {
  beforeEach(() => localStorage.clear());

  it('shows modal when currentUser empty', () => {
    render(<DataProvider><CurrentUserGuard><div>app</div></CurrentUserGuard></DataProvider>);
    expect(screen.getByRole('heading', { name: /Tên bạn/i })).toBeInTheDocument();
  });

  it('hides modal after user enters name', async () => {
    render(<DataProvider><CurrentUserGuard><div>app</div></CurrentUserGuard></DataProvider>);
    await userEvent.type(screen.getByPlaceholderText(/Tên bạn/i), 'NV A');
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }));
    expect(screen.queryByRole('heading', { name: /Tên bạn/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('backorder.currentUser')).toBe('NV A');
  });

  it('disables Lưu when name empty', () => {
    render(<DataProvider><CurrentUserGuard><div>app</div></CurrentUserGuard></DataProvider>);
    expect(screen.getByRole('button', { name: /Lưu/i })).toBeDisabled();
  });
});
