// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { FormatPreferencesProvider } from '../../format/index.js';
import { AccountCard } from './AccountCard.js';

describe('AccountCard', () => {
  afterEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  it('renders account name and transaction count', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AccountCard shortName="BBVA" color="#0075BE" transactionCount={12} balance={1500.5} />
      </I18nextProvider>,
    );
    expect(screen.getByText('BBVA')).toBeDefined();
    expect(screen.getByText(/12/)).toBeDefined();
  });

  it('renders a non-negative balance in neutral text, not green', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard shortName="BBVA" color="#0075BE" transactionCount={12} balance={1500.5} />
      </I18nextProvider>,
    );
    const balanceEl = container.querySelector('.ot-account-card__balance');
    expect(balanceEl?.className).not.toContain('--negative');
    expect(balanceEl?.className).toContain('--neutral');
    expect(screen.getByText('Balance')).toBeDefined();
  });

  it('renders the period net below the balance with sign and direction', () => {
    const { container, rerender } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500.5}
          periodNet={240}
        />
      </I18nextProvider>,
    );
    const net = container.querySelector('.ot-account-card__net');
    expect(net?.textContent).toContain('↑');
    expect(net?.textContent).toContain('+');
    expect(net?.textContent).toContain('in 90 days');
    expect(net?.querySelector('.ot-account-card__net--positive')).not.toBeNull();

    rerender(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500.5}
          periodNet={-80}
        />
      </I18nextProvider>,
    );
    const negNet = container.querySelector('.ot-account-card__net');
    expect(negNet?.textContent).toContain('↓');
    expect(negNet?.querySelector('.ot-account-card__net--negative')).not.toBeNull();
  });

  it('omits the period net line when periodNet is not provided', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard shortName="BBVA" color="#0075BE" transactionCount={12} balance={1500.5} />
      </I18nextProvider>,
    );
    expect(container.querySelector('.ot-account-card__net')).toBeNull();
  });

  it('renders negative balance in red with negative class', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard shortName="Credit" color="#FF0000" transactionCount={5} balance={-250.75} />
      </I18nextProvider>,
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
      </I18nextProvider>,
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
      </I18nextProvider>,
    );
    expect(container.querySelector('.ot-account-card__sparkline-placeholder')).toBeNull();
  });

  it('uses number preference independently of UI language', async () => {
    await i18n.changeLanguage('es');
    localStorage.setItem('ot-number-format', 'us');

    render(
      <I18nextProvider i18n={i18n}>
        <FormatPreferencesProvider>
          <AccountCard shortName="BBVA" color="#0075BE" transactionCount={12} balance={1500.5} />
        </FormatPreferencesProvider>
      </I18nextProvider>,
    );

    expect(screen.getByText('1,500.50 €')).toBeDefined();
    expect(screen.queryByText('1.500,50 €')).toBeNull();
  });
});
