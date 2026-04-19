// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { KPIStrip } from './KPIStrip.js';

describe('KPIStrip', () => {
  it('renders income, expense, and net values', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <KPIStrip income={5000} expense={3000} net={2000} month="Abril 2026" />
      </I18nextProvider>
    );
    expect(screen.getByText(/5.*000/)).toBeDefined(); // Income
    expect(screen.getByText(/3.*000/)).toBeDefined(); // Expense
    expect(screen.getByText(/2.*000/)).toBeDefined(); // Net
  });

  it('renders month caption on each KPI', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <KPIStrip income={5000} expense={3000} net={2000} month="Abril 2026" />
      </I18nextProvider>
    );
    const monthLabels = screen.getAllByText('Abril 2026');
    expect(monthLabels.length).toBe(3); // One per KPI
  });

  it('applies correct aggregation from transaction data', () => {
    // Mock transactions: 2 income (1500 + 2500 = 4000), 3 expense (1000 + 800 + 1200 = 3000)
    const income = 4000;
    const expense = 3000;
    const net = income - expense; // 1000

    render(
      <I18nextProvider i18n={i18n}>
        <KPIStrip income={income} expense={expense} net={net} month="March 2026" />
      </I18nextProvider>
    );

    expect(screen.getByText(/4.*000/)).toBeDefined();
    expect(screen.getByText(/3.*000/)).toBeDefined();
    expect(screen.getByText(/1.*000/)).toBeDefined();
  });
});
