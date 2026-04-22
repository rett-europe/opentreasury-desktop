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

function makeResponse(overrides: Partial<SaldoComparisonResponse> = {}): SaldoComparisonResponse {
  return {
    currentPeriod: {
      start: '2026-01-01',
      end: '2026-12-31',
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
      start: '2025-01-01',
      end: '2025-12-31',
      totalIncome: 8000,
      totalExpense: 3500,
      netByCategory: [
        { categoryId: 'cat-a', categoryName: 'Donaciones', income: 6000, expense: 0 },
        { categoryId: 'cat-b', categoryName: 'Oficina', income: 0, expense: 2500 },
        { categoryId: 'cat-c', categoryName: 'Eventos', income: 1500, expense: 800 },
      ],
    },
    monthlySeries: [
      { monthIso: '2026-01-01', netIncome: 1000, netExpense: 300 },
      { monthIso: '2026-02-01', netIncome: 900, netExpense: 400 },
    ],
    priorMonthlySeries: [
      { monthIso: '2025-01-01', netIncome: 800, netExpense: 200 },
      { monthIso: '2025-02-01', netIncome: 700, netExpense: 350 },
    ],
    kpis: {
      netDelta: 0.25,
      incomeDelta: 0.25,
      expenseDelta: 0.14,
      biggestCategoryGrowth: {
        categoryId: 'cat-a',
        categoryName: 'Donaciones',
        deltaPct: 0.33,
      },
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
    expect(screen.getByRole('status').textContent ?? '').toMatch(/cargando|loading/i);
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

    // Old "biggest growth" card must no longer exist.
    expect(screen.queryByTestId('saldo-kpi-biggest-growth')).toBeNull();

    // Income card shows 10k €, expense 4k €, net 6k €. Locale-agnostic: 'es'
    // uses '10.000' and 'en' uses '10,000' — accept either thousands separator.
    expect(screen.getByTestId('saldo-kpi-income').textContent ?? '').toMatch(/10[.,]000/);
    expect(screen.getByTestId('saldo-kpi-expense').textContent ?? '').toMatch(/4[.,]000/);
    expect(screen.getByTestId('saldo-kpi-net').textContent ?? '').toMatch(/6[.,]000/);

    // Net card should carry only the prior-year sublabel (no projection line
    // per prototype).
    expect(screen.getByTestId('saldo-kpi-net').textContent ?? '').toMatch(/2025.*4[.,]500/);
  });

  it('renders the year chip with "2025 vs 2026"', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-year-chip')).toBeDefined();
    });
    expect(screen.getByTestId('saldo-year-chip').textContent ?? '').toMatch(/2025.*vs.*2026/);
  });

  it('refetches with the new period when the selector changes', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();

    await waitFor(() => {
      expect(vi.mocked(getSaldoComparison).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    expect(vi.mocked(getSaldoComparison).mock.calls[0]?.[0]?.period).toBe('ano');

    fireEvent.click(screen.getByTestId('saldo-period-mes'));

    await waitFor(() => {
      const lastCall =
        vi.mocked(getSaldoComparison).mock.calls[
          vi.mocked(getSaldoComparison).mock.calls.length - 1
        ];
      expect(lastCall?.[0]?.period).toBe('mes');
    });
  });

  it('renders the partial-period badge and projected KPI sublabel when isPartial=true', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
          totalIncome: 3000,
          totalExpense: 1000,
          netByCategory: [
            { categoryId: 'cat-a', categoryName: 'Donaciones', income: 3000, expense: 0 },
            { categoryId: 'cat-b', categoryName: 'Oficina', income: 0, expense: 1000 },
          ],
          isPartial: true,
          daysElapsed: 120,
          daysInPeriod: 365,
          currentProjectedTotal: { income: 9125, expense: 3041.67 },
        },
      }),
    );
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-projection-badge')).toBeDefined();
    });
    // Income card shows both prior and projected sublabel segments.
    const income = screen.getByTestId('saldo-kpi-income').textContent ?? '';
    expect(income).toMatch(/2025/);
    expect(income).toMatch(/proy\.?|proj\.?/i);
    expect(income).toMatch(/9[.,]125/);
  });

  it('renders the empty state when both periods are fully zero', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
          totalIncome: 0,
          totalExpense: 0,
          netByCategory: [],
          isPartial: false,
          daysElapsed: 365,
          daysInPeriod: 365,
          currentProjectedTotal: null,
        },
        priorPeriod: {
          start: '2025-01-01',
          end: '2025-12-31',
          totalIncome: 0,
          totalExpense: 0,
          netByCategory: [],
        },
        monthlySeries: [],
        priorMonthlySeries: [],
        kpis: {
          netDelta: null,
          incomeDelta: null,
          expenseDelta: null,
          biggestCategoryGrowth: null,
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
    expect(screen.queryByTestId('saldo-kpi-net')).toBeNull();
  });

  it('feeds the chart with both series (current + prior) — two groups, each exposing both values', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('gbc-group-0')).toBeDefined();
      expect(screen.getByTestId('gbc-group-1')).toBeDefined();
    });
    // Group 0: current net = 1000-300 = 700 (2026), prior net = 800-200 = 600 (2025).
    const group0Label = screen.getByTestId('gbc-group-0').getAttribute('aria-label') ?? '';
    expect(group0Label).toMatch(/2026/);
    expect(group0Label).toMatch(/2025/);
    expect(group0Label).toMatch(/700/);
    expect(group0Label).toMatch(/600/);
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

    // Donaciones only has income → income panel only.
    expect(within(income).getByText('Donaciones')).toBeDefined();
    expect(within(expense).queryByText('Donaciones')).toBeNull();

    // Oficina only has expense → expense panel only.
    expect(within(expense).getByText('Oficina')).toBeDefined();
    expect(within(income).queryByText('Oficina')).toBeNull();

    // Eventos is mixed → appears in both panels (prototype parity).
    expect(within(income).getByText('Eventos')).toBeDefined();
    expect(within(expense).getByText('Eventos')).toBeDefined();
  });

  it('renders category delta with "vs 2025" sublabel (or "proy. vs 2025" when partial)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-income-cat-a')).toBeDefined();
    });
    const row = screen.getByTestId('saldo-row-income-cat-a');
    // Donaciones: current 8000, prior 6000 → delta ≈ +33%.
    const delta = screen.getByTestId('saldo-row-income-cat-a-delta').textContent ?? '';
    expect(delta).toMatch(/↑/);
    expect(delta).toMatch(/33/);
    // Default period (non-partial) uses "vs 2025" (no "proy.").
    expect(row.textContent ?? '').toMatch(/vs\s*2025/);
  });

  it('uses projected sublabel "proy. vs 2025" when the current period is partial', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
          totalIncome: 3000,
          totalExpense: 1000,
          netByCategory: [
            { categoryId: 'cat-a', categoryName: 'Donaciones', income: 3000, expense: 0 },
            { categoryId: 'cat-b', categoryName: 'Oficina', income: 0, expense: 1000 },
          ],
          isPartial: true,
          daysElapsed: 120,
          daysInPeriod: 365,
          currentProjectedTotal: { income: 9125, expense: 3041.67 },
        },
      }),
    );
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-income-cat-a')).toBeDefined();
    });
    const row = screen.getByTestId('saldo-row-income-cat-a');
    // Match either 'proy.' (es) or 'proj.' (en).
    expect(row.textContent ?? '').toMatch(/pro[yj]\..*2025/i);
  });
});
