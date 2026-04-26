// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { SaldoScreen } from './SaldoScreen.js';
import type { SaldoComparisonResponse } from '../../../shared/ipc-contracts/saldo.js';

vi.mock('../../services/saldoApi.js', () => ({
  getSaldoComparison: vi.fn(),
}));

import { getSaldoComparison } from '../../services/saldoApi.js';

const CURRENT_YEAR = new Date().getFullYear();
const PRIOR_YEAR = CURRENT_YEAR - 1;

function makeResponse(overrides: Partial<SaldoComparisonResponse> = {}): SaldoComparisonResponse {
  return {
    currentPeriod: {
      start: `${CURRENT_YEAR}-01-01`,
      end: `${CURRENT_YEAR}-12-31`,
      totalIncome: 10000,
      totalExpense: 4000,
      netByCategory: [
        { categoryId: 'cat-a', categoryName: 'Donaciones', income: 8000, expense: 0 },
        { categoryId: 'cat-b', categoryName: 'Oficina', income: 0, expense: 3000 },
        { categoryId: 'cat-c', categoryName: 'Eventos', income: 2000, expense: 1000 },
      ],
      isPartial: false,
      daysElapsed: 365,
      daysInPeriod: 365,
      currentProjectedTotal: null,
    },
    priorPeriod: {
      start: `${PRIOR_YEAR}-01-01`,
      end: `${PRIOR_YEAR}-12-31`,
      totalIncome: 8000,
      totalExpense: 3500,
      netByCategory: [
        { categoryId: 'cat-a', categoryName: 'Donaciones', income: 6000, expense: 0 },
        { categoryId: 'cat-b', categoryName: 'Oficina', income: 0, expense: 2500 },
        { categoryId: 'cat-c', categoryName: 'Eventos', income: 1500, expense: 800 },
      ],
    },
    monthlySeries: [],
    priorMonthlySeries: [],
    monthlyIncome: Array.from({ length: 12 }, (_, i) => (i === 0 ? 1000 : i === 6 ? 2000 : 500)),
    monthlyExpense: Array.from({ length: 12 }, (_, i) => (i === 3 ? 400 : 200)),
    kpis: {
      netDelta: 0.25,
      incomeDelta: 0.25,
      expenseDelta: 0.14,
      biggestCategoryGrowth: null,
    },
    ...overrides,
  };
}

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <SaldoScreen />
    </I18nextProvider>,
  );
}

describe('SaldoScreen', () => {
  beforeEach(() => {
    vi.mocked(getSaldoComparison).mockReset();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('saldo.view.v2');
    }
  });

  it('renders the loading state initially', () => {
    let resolve: (v: SaldoComparisonResponse) => void = () => {};
    vi.mocked(getSaldoComparison).mockImplementation(
      () =>
        new Promise<SaldoComparisonResponse>((r) => {
          resolve = r;
        }),
    );
    renderWithI18n();
    const statuses = screen.getAllByRole('status');
    const loading = statuses.some((el) => /cargando|loading/i.test(el.textContent ?? ''));
    expect(loading).toBe(true);
    resolve(makeResponse());
  });

  it('renders exactly 3 KPI cards (income / expense / net) with big totals', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByTestId('saldo-kpi-net')).toBeDefined();
    });
    expect(screen.getByTestId('saldo-kpi-income')).toBeDefined();
    expect(screen.getByTestId('saldo-kpi-expense')).toBeDefined();

    expect(screen.queryByTestId('saldo-kpi-biggest-growth')).toBeNull();

    expect(screen.getByTestId('saldo-kpi-income').textContent ?? '').toMatch(/10[.,]000/);
    expect(screen.getByTestId('saldo-kpi-expense').textContent ?? '').toMatch(/4[.,]000/);
    expect(screen.getByTestId('saldo-kpi-net').textContent ?? '').toMatch(/6[.,]000/);

    // Net card carries the prior-year sublabel in compare mode.
    expect(screen.getByTestId('saldo-kpi-net').textContent ?? '').toMatch(
      new RegExp(`${PRIOR_YEAR}.*4[.,]500`),
    );
  });

  it('renders the mode segmented control with compare selected by default', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-mode-selector')).toBeDefined();
    });
    expect(screen.getByTestId('saldo-mode-compare').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('saldo-mode-single').getAttribute('aria-checked')).toBe('false');
    // Two year pickers in compare mode.
    expect(screen.getByTestId('saldo-year-current')).toBeDefined();
    expect(screen.getByTestId('saldo-year-prior')).toBeDefined();
  });

  it('switching to single mode hides delta chips and the prior-year picker', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-mode-single')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-mode-single'));
    await waitFor(() => {
      expect(screen.queryByTestId('saldo-year-prior')).toBeNull();
    });
    // KPI delta chips must NOT be present in single mode.
    expect(screen.queryByTestId('saldo-kpi-income-delta')).toBeNull();
    expect(screen.queryByTestId('saldo-kpi-expense-delta')).toBeNull();
    expect(screen.queryByTestId('saldo-kpi-net-delta')).toBeNull();
    // Single picker is present.
    expect(screen.getByTestId('saldo-year-current')).toBeDefined();
  });

  it('renders empty-year state when current year has no transactions', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: `${CURRENT_YEAR}-01-01`,
          end: `${CURRENT_YEAR}-12-31`,
          totalIncome: 0,
          totalExpense: 0,
          netByCategory: [],
          isPartial: false,
          daysElapsed: 365,
          daysInPeriod: 365,
          currentProjectedTotal: null,
        },
        priorPeriod: {
          start: `${PRIOR_YEAR}-01-01`,
          end: `${PRIOR_YEAR}-12-31`,
          totalIncome: 0,
          totalExpense: 0,
          netByCategory: [],
        },
      }),
    );
    renderWithI18n();
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      const matched = statuses.some((el) =>
        /sin movimientos|no transactions/i.test(el.textContent ?? ''),
      );
      expect(matched).toBe(true);
    });
    // KPI cards still rendered, but display zeros.
    expect(screen.getByTestId('saldo-kpi-net').textContent ?? '').toMatch(/0[.,]00/);
  });

  it('renders the monthly chart with 12 groups (income + expense series) and current year in the title', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('gbc-group-0')).toBeDefined();
    });
    // 12 monthly groups.
    expect(screen.getByTestId('gbc-group-0')).toBeDefined();
    expect(screen.getByTestId('gbc-group-11')).toBeDefined();
    expect(screen.queryByTestId('gbc-group-12')).toBeNull();

    // Title carries the current year.
    const title = document.getElementById('saldo-chart-title');
    expect(title?.textContent ?? '').toMatch(String(CURRENT_YEAR));

    // January group reflects both income + expense amounts from the fixture.
    const jan = screen.getByTestId('gbc-group-0').getAttribute('aria-label') ?? '';
    expect(jan).toMatch(/1[.,]000/); // income 1000 in Jan
    expect(jan).toMatch(/200/); // expense 200 in Jan
  });

  it('monthly chart stays rendered (always current year) after switching to single mode', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-mode-single')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-mode-single'));
    await waitFor(() => {
      expect(screen.queryByTestId('saldo-year-prior')).toBeNull();
    });
    // Monthly chart still has its 12 groups in single mode.
    expect(screen.getByTestId('gbc-group-0')).toBeDefined();
    expect(screen.getByTestId('gbc-group-11')).toBeDefined();
  });

  it('routes categories into Ingresos vs Gastos panels (mixed category appears in both)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-panel-income')).toBeDefined();
      expect(screen.getByTestId('saldo-panel-expense')).toBeDefined();
    });
    const income = screen.getByTestId('saldo-panel-income');
    const expense = screen.getByTestId('saldo-panel-expense');
    expect(within(income).getByText('Donaciones')).toBeDefined();
    expect(within(expense).queryByText('Donaciones')).toBeNull();
    expect(within(expense).getByText('Oficina')).toBeDefined();
    expect(within(income).queryByText('Oficina')).toBeNull();
    expect(within(income).getByText('Eventos')).toBeDefined();
    expect(within(expense).getByText('Eventos')).toBeDefined();
  });

  it('compare mode panel shows category delta with "vs <priorYear>" sublabel', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-income-cat-a')).toBeDefined();
    });
    const row = screen.getByTestId('saldo-row-income-cat-a');
    const delta = screen.getByTestId('saldo-row-income-cat-a-delta').textContent ?? '';
    expect(delta).toMatch(/↑/);
    expect(delta).toMatch(/33/);
    expect(row.textContent ?? '').toMatch(new RegExp(`vs\\s*${PRIOR_YEAR}`));
  });

  it('single mode panel shows % of total instead of delta', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-mode-single')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-mode-single'));
    await waitFor(() => {
      const row = screen.queryByTestId('saldo-row-income-cat-a');
      expect(row).not.toBeNull();
    });
    const row = screen.getByTestId('saldo-row-income-cat-a');
    // Donaciones income (8000) of total income (10000) = 80%.
    expect(row.textContent ?? '').toMatch(/80\s*%/);
  });
});
