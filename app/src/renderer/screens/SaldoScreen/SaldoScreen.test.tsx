// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
        { categoryId: 'cat-c', categoryName: 'Eventos', income: 2000, expense: 0 },
      ],
    },
    monthlySeries: [
      { monthIso: '2026-01-01', netIncome: 1000, netExpense: 300 },
      { monthIso: '2026-02-01', netIncome: 900, netExpense: 400 },
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
    // Loading copy (es primary) — cargando…
    expect(screen.getByRole('status').textContent ?? '').toMatch(/cargando|loading/i);
    // Clean up the pending promise so React doesn't complain on teardown.
    resolve(makeResponse());
  });

  it('renders KPI values from the mocked response', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByTestId('saldo-kpi-net')).toBeDefined();
    });
    // 4 KPIs: net, income, expense, biggest-growth.
    expect(screen.getByTestId('saldo-kpi-income')).toBeDefined();
    expect(screen.getByTestId('saldo-kpi-expense')).toBeDefined();
    expect(screen.getByTestId('saldo-kpi-biggest-growth')).toBeDefined();
    // Biggest-growth value mixes the localized category name.
    expect(screen.getByTestId('saldo-kpi-biggest-growth').textContent ?? '').toMatch(/Donaciones/);
  });

  it('refetches with the new period when the selector changes', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();

    await waitFor(() => {
      expect(vi.mocked(getSaldoComparison).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    // Default period is 'ano'.
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

  it('renders the partial-period badge when isPartial=true', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
          totalIncome: 3000,
          totalExpense: 1000,
          netByCategory: [
            { categoryId: 'cat-a', categoryName: 'Donaciones', income: 3000, expense: 0 },
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
  });

  it('renders the projected sublabel on KPI cards when currentProjectedTotal is non-null', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
          totalIncome: 3000,
          totalExpense: 1000,
          netByCategory: [
            { categoryId: 'cat-a', categoryName: 'Donaciones', income: 3000, expense: 0 },
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
      expect(screen.getByTestId('saldo-kpi-net-projected')).toBeDefined();
    });
    // Projected sublabel copy (es = "Proyectado").
    expect(screen.getByTestId('saldo-kpi-net-projected').textContent ?? '').toMatch(
      /proyectado|projected/i,
    );
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
      // EmptyState renders via role="status".
      const statuses = screen.getAllByRole('status');
      const matched = statuses.some((el) =>
        /sin movimientos|no transactions/i.test(el.textContent ?? ''),
      );
      expect(matched).toBe(true);
    });
    // No KPI strip rendered when fully empty.
    expect(screen.queryByTestId('saldo-kpi-net')).toBeNull();
  });

  it('feeds the GroupedBarChart with the monthlySeries (smoke test)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      // GroupedBarChart renders group test-ids `gbc-group-<i>`.
      expect(screen.getByTestId('gbc-group-0')).toBeDefined();
      expect(screen.getByTestId('gbc-group-1')).toBeDefined();
    });
  });
});
