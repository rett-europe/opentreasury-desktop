// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountBarRow } from './AccountBarRow.js';

const defaults = {
  accountId: 'acc-1',
  accountName: 'Caja Principal',
  accountColor: '#9b72cf',
  labels: { income: 'Ingresos', expense: 'Gastos' },
};

describe('AccountBarRow', () => {
  it('renders account name and both currency values', () => {
    render(
      <AccountBarRow
        {...defaults}
        incomeCents={150000}
        expenseCents={50000}
        maxTotalCents={400000}
      />,
    );
    expect(screen.getByText('Caja Principal')).toBeDefined();
    // Two formatted amounts (income 1.500,00 €  and expense 500,00 €).
    const matches = screen.getAllByText(/€/);
    expect(matches.length).toBe(2);
  });

  it('renders both stacked segments when both income and expense > 0', () => {
    const { container } = render(
      <AccountBarRow
        {...defaults}
        incomeCents={100000}
        expenseCents={50000}
        maxTotalCents={150000}
      />,
    );
    expect(container.querySelectorAll('.ot-account-bar-row__seg').length).toBe(2);
  });

  it('omits the segment for a zero side', () => {
    const { container } = render(
      <AccountBarRow {...defaults} incomeCents={100000} expenseCents={0} maxTotalCents={100000} />,
    );
    expect(container.querySelectorAll('.ot-account-bar-row__seg--income').length).toBe(1);
    expect(container.querySelectorAll('.ot-account-bar-row__seg--expense').length).toBe(0);
  });

  it('does not divide by zero when maxTotalCents is 0', () => {
    const { container } = render(
      <AccountBarRow {...defaults} incomeCents={0} expenseCents={0} maxTotalCents={0} />,
    );
    // Track width should be 0% but not NaN%.
    const track = container.querySelector('.ot-account-bar-row__bar-track') as HTMLElement | null;
    expect(track).not.toBeNull();
    expect(track?.style.width).not.toContain('NaN');
  });
});
