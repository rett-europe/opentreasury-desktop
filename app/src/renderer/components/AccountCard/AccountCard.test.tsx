// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AccountCard } from './AccountCard.js';

describe('AccountCard', () => {
  it('renders account name and transaction count', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500.5}
        />
      </I18nextProvider>
    );
    expect(screen.getByText('BBVA')).toBeDefined();
    expect(screen.getByText(/12/)).toBeDefined();
  });

  it('renders positive balance in green', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500.5}
        />
      </I18nextProvider>
    );
    const balanceEl = container.querySelector('.ot-account-card__balance');
    expect(balanceEl?.className).not.toContain('--negative');
  });

  it('renders negative balance in red with negative class', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="Credit"
          color="#FF0000"
          transactionCount={5}
          balance={-250.75}
        />
      </I18nextProvider>
    );
    const balanceEl = container.querySelector('.ot-account-card__balance');
    expect(balanceEl?.className).toContain('--negative');
  });

  it('renders sparkline placeholder when hasSparkline is true', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500.5}
          hasSparkline
        />
      </I18nextProvider>
    );
    expect(container.querySelector('.ot-account-card__sparkline-placeholder')).toBeDefined();
  });

  it('does not render sparkline when hasSparkline is false', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="New Account"
          color="#00AA00"
          transactionCount={2}
          balance={100}
          hasSparkline={false}
        />
      </I18nextProvider>
    );
    expect(container.querySelector('.ot-account-card__sparkline-placeholder')).toBeNull();
  });
});
