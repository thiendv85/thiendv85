import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import UnsavedGuard from './UnsavedGuard';
import { DataProvider } from './DataProvider';

describe('UnsavedGuard', () => {
  it('attaches beforeunload listener on mount', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    render(<DataProvider><UnsavedGuard /></DataProvider>);
    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    spy.mockRestore();
  });
});
