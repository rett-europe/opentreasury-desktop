// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  it('renders title only when body omitted', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeDefined();
  });

  it('renders body when provided', () => {
    render(<EmptyState title="T" body="Helpful description" />);
    expect(screen.getByText('Helpful description')).toBeDefined();
  });

  it('renders actions slot', () => {
    render(<EmptyState title="T" actions={<button type="button">Do it</button>} />);
    expect(screen.getByRole('button', { name: 'Do it' })).toBeDefined();
  });

  it('is announced via role=status', () => {
    render(<EmptyState title="T" />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});
