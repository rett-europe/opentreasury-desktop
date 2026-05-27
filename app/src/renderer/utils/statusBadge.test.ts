import { describe, it, expect } from 'vitest';
import { getStatusBadgeClass } from './statusBadge.js';

describe('getStatusBadgeClass', () => {
  it('maps pending to ot-badge--pending', () => {
    expect(getStatusBadgeClass('pending')).toBe('ot-badge ot-badge--pending');
  });

  it('maps approved to ot-badge--approved', () => {
    expect(getStatusBadgeClass('approved')).toBe('ot-badge ot-badge--approved');
  });

  it('maps rejected to ot-badge--rejected', () => {
    expect(getStatusBadgeClass('rejected')).toBe('ot-badge ot-badge--rejected');
  });
});
