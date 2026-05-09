import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';

describe('ulid', () => {
  it('generates 26-char string sortable by time', () => {
    const a = ulid();
    expect(a).toHaveLength(26);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
