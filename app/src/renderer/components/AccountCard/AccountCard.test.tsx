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

  it('renders a 12-month balance line in the account colour', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="BBVA"
          color="#0075BE"
          transactionCount={12}
          balance={1500}
          balanceHistory={[1000, 1200, -100, 1500]}
        />
      </I18nextProvider>,
    );
    const svg = container.querySelector('svg.ot-account-card__spark');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('12 months');
    const line = svg?.querySelector('polyline');
    expect(line?.getAttribute('stroke')).toBe('#0075BE');
    expect(line?.getAttribute('points')?.split(' ')).toHaveLength(4);
    // Crosses zero → dashed zero reference line.
    expect(svg?.querySelector('.ot-account-card__spark-zero')).not.toBeNull();
  });

  it('draws a flat line without a zero line when the balance never changes', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="PayPal"
          color="#E8622B"
          transactionCount={0}
          balance={0}
          balanceHistory={[0, 0, 0]}
        />
      </I18nextProvider>,
    );
    const ys = container
      .querySelector('polyline')
      ?.getAttribute('points')
      ?.split(' ')
      .map((p) => p.split(',')[1]);
    expect(new Set(ys).size).toBe(1);
    expect(container.querySelector('.ot-account-card__spark-zero')).toBeNull();
  });

  it('omits the balance line without history', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="New Account"
          color="#00AA00"
          transactionCount={2}
          balance={100}
          balanceHistory={[100]}
        />
      </I18nextProvider>,
    );
    expect(container.querySelector('.ot-account-card__spark')).toBeNull();
  });

  it('shows a zero period net without arrow or colour', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <AccountCard
          shortName="PayPal"
          color="#E8622B"
          transactionCount={0}
          balance={0}
          periodNet={0}
        />
      </I18nextProvider>,
    );
    const net = container.querySelector('.ot-account-card__net');
    expect(net?.textContent).not.toMatch(/[↑↓+]/);
    expect(net?.querySelector('.ot-account-card__net--neutral')).not.toBeNull();
    expect(net?.querySelector('.ot-account-card__net--positive')).toBeNull();
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
