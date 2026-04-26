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

  // -------------------------------------------------------------------------
  // WI-B (#67) — subcategory drill-down toggle. Spec: UX-004a.
  // -------------------------------------------------------------------------

  function makeResponseWithSubs(): SaldoComparisonResponse {
    // cat-a (Donaciones, income): 3 subcategories — small enough to skip Otras.
    // cat-c (Eventos, income): 10 subcategories — exercises the top-5 + Otras
    //                          rollup rule (amendment §3.2 narrowed from top-8).
    // cat-b (Oficina, expense): 1 subcategory — exercises the E2 "render parent
    //                          only" suppression for single-subcategory cats.
    const eventosSubsCur = Array.from({ length: 10 }, (_, i) => ({
      subcategoryId: `evt-sub-${i}`,
      subcategoryName: `Evt ${i}`,
      // Descending so the sort by current-period abs(amount) is unambiguous.
      income: 1000 - i * 50,
      expense: 0,
    }));
    return makeResponse({
      currentPeriod: {
        start: `${CURRENT_YEAR}-01-01`,
        end: `${CURRENT_YEAR}-12-31`,
        totalIncome: 10000,
        totalExpense: 4000,
        netByCategory: [
          {
            categoryId: 'cat-a',
            categoryName: 'Donaciones',
            income: 8000,
            expense: 0,
            subcategories: [
              { subcategoryId: 'sub-socios', subcategoryName: 'Socios', income: 4000, expense: 0 },
              {
                subcategoryId: 'sub-empresas',
                subcategoryName: 'Empresas',
                income: 3000,
                expense: 0,
              },
              {
                subcategoryId: 'sub-eventos',
                subcategoryName: 'Eventos',
                income: 1000,
                expense: 0,
              },
            ],
          },
          {
            categoryId: 'cat-b',
            categoryName: 'Oficina',
            income: 0,
            expense: 3000,
            subcategories: [
              { subcategoryId: 'ofi-only', subcategoryName: 'Material', income: 0, expense: 3000 },
            ],
          },
          {
            categoryId: 'cat-c',
            categoryName: 'Eventos',
            income: 2000,
            expense: 1000,
            subcategories: eventosSubsCur,
          },
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
          {
            categoryId: 'cat-a',
            categoryName: 'Donaciones',
            income: 6000,
            expense: 0,
            subcategories: [
              { subcategoryId: 'sub-socios', subcategoryName: 'Socios', income: 3000, expense: 0 },
              {
                subcategoryId: 'sub-empresas',
                subcategoryName: 'Empresas',
                income: 2500,
                expense: 0,
              },
              { subcategoryId: 'sub-eventos', subcategoryName: 'Eventos', income: 500, expense: 0 },
            ],
          },
          {
            categoryId: 'cat-b',
            categoryName: 'Oficina',
            income: 0,
            expense: 2500,
            subcategories: [
              { subcategoryId: 'ofi-only', subcategoryName: 'Material', income: 0, expense: 2500 },
            ],
          },
          {
            categoryId: 'cat-c',
            categoryName: 'Eventos',
            income: 1500,
            expense: 800,
            subcategories: eventosSubsCur.map((s) => ({ ...s, income: s.income - 100 })),
          },
        ],
      },
    });
  }

  it('renders the Show subcategories toggle off by default with no subrows', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    const toggleIncome = screen.getByTestId('saldo-subcategories-toggle-income');
    const toggleExpense = screen.getByTestId('saldo-subcategories-toggle-expense');
    expect(toggleIncome.getAttribute('aria-pressed')).toBe('false');
    expect(toggleExpense.getAttribute('aria-pressed')).toBe('false');
    // No subrows rendered while toggle is OFF.
    expect(screen.queryByTestId('saldo-subrow-income-cat-a-sub-socios')).toBeNull();
    // Old single-pill testid is retired (amendment §2.2).
    expect(screen.queryByTestId('saldo-subcategories-toggle')).toBeNull();
  });

  it('renders subrows in compare mode when toggle is on', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    // Donaciones (cat-a) has 3 subcategories — all should render.
    expect(screen.getByTestId('saldo-subrow-income-cat-a-sub-socios')).toBeDefined();
    expect(screen.getByTestId('saldo-subrow-income-cat-a-sub-empresas')).toBeDefined();
    expect(screen.getByTestId('saldo-subrow-income-cat-a-sub-eventos')).toBeDefined();
    // Compare modifier class on subrow.
    expect(screen.getByTestId('saldo-subrow-income-cat-a-sub-socios').className).toMatch(
      /ot-saldo-subrow--compare/,
    );
    // E2: Oficina (cat-b) has only 1 subcategory → render parent only.
    expect(screen.queryByTestId('saldo-subrow-expense-cat-b-ofi-only')).toBeNull();
  });

  it('applies top-5 + Otras rollup rule for categories with >5 subcategories (amendment §3.2)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    // Eventos (cat-c) has 10 income subcategories → top-5 + Otras.
    for (let i = 0; i < 5; i += 1) {
      expect(screen.getByTestId(`saldo-subrow-income-cat-c-evt-sub-${i}`)).toBeDefined();
    }
    // Subcategories ranked 6..10 collapsed into a single Otras row.
    expect(screen.queryByTestId('saldo-subrow-income-cat-c-evt-sub-5')).toBeNull();
    expect(screen.queryByTestId('saldo-subrow-income-cat-c-evt-sub-9')).toBeNull();
    expect(screen.getByTestId('saldo-subrow-income-cat-c-__otras__')).toBeDefined();
  });

  it('renders subrows in single mode with the single modifier class', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-mode-single')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-mode-single'));
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(screen.queryByTestId('saldo-subrow-income-cat-a-sub-socios')).not.toBeNull();
    });
    expect(screen.getByTestId('saldo-subrow-income-cat-a-sub-socios').className).toMatch(
      /ot-saldo-subrow--single/,
    );
  });

  it('handles undefined subcategories field gracefully (no crash, no subrows)', async () => {
    // Simulates pre-projection-extension data: subcategories is undefined.
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    // Toggle is on but no subcategories arrived → no subrows rendered.
    expect(screen.queryByTestId('saldo-subrow-income-cat-a-sub-socios')).toBeNull();
    // Parent rows still render normally.
    expect(screen.getByTestId('saldo-row-income-cat-a')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Amendment 1 (#78): F1 — shared toggle state between income & expense pills.
  // F2 — panel-shared bar scale.
  // -------------------------------------------------------------------------

  it('shares toggle state across both panel pills (clicking one flips both, amendment §F1)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    const income = screen.getByTestId('saldo-subcategories-toggle-income');
    const expense = screen.getByTestId('saldo-subcategories-toggle-expense');
    expect(income.getAttribute('aria-pressed')).toBe('false');
    expect(expense.getAttribute('aria-pressed')).toBe('false');

    // Click the expense-side pill — both should flip to pressed.
    fireEvent.click(expense);
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    expect(
      screen.getByTestId('saldo-subcategories-toggle-expense').getAttribute('aria-pressed'),
    ).toBe('true');

    // Single announce node remains a single element regardless of pill clicked.
    expect(screen.getAllByTestId('saldo-subcategories-announce')).toHaveLength(1);

    // Clicking the income pill flips both back.
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('false');
    });
    expect(
      screen.getByTestId('saldo-subcategories-toggle-expense').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('scales subrow bars against the panel-shared denominator (amendment §F2)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    // Income panel: parent Donaciones=8000 (largest), subrow Eventos under
    // Donaciones=1000. With shared scale, the subrow's current bar must render
    // narrower than the parent row's current bar — not equal-width as the
    // legacy per-row scale produced.
    const parentRow = screen.getByTestId('saldo-row-income-cat-a');
    const parentCurrent = parentRow.querySelector(
      '.ot-saldo-row__bar-fill--current',
    ) as HTMLElement;
    const subRow = screen.getByTestId('saldo-subrow-income-cat-a-sub-eventos');
    const subCurrent = subRow.querySelector('.ot-saldo-subrow__bar-fill--current') as HTMLElement;
    expect(parentCurrent).not.toBeNull();
    expect(subCurrent).not.toBeNull();
    const pct = (el: HTMLElement): number => Number.parseFloat(el.style.width.replace('%', ''));
    const parentPct = pct(parentCurrent);
    const subPct = pct(subCurrent);
    // Parent (8000) is the panel max, so it should be ~100%.
    expect(parentPct).toBeGreaterThan(95);
    // Sub (1000) is 1/8 of the parent; should be ~12.5%, definitely <50%.
    expect(subPct).toBeLessThan(50);
    expect(subPct).toBeLessThan(parentPct);
    // Subrow also exposes the panel-shared scale via a CSS custom property
    // that Mouse's CSS recipe can consume in parallel.
    expect(subCurrent.style.getPropertyValue('--saldo-subrow-bar-pct')).toMatch(/%$/);
  });

  it('aligns compare-mode subrow bars across subcategories via panel-level column widths (#78 follow-up)', async () => {
    // Pedro 2026-04-30: "each group of 2 bars (in the comparison between 2
    // years) per each subcategory are not aligned, 'Captación de fondos' bars
    // are a bit more on the left compared with bars of 'Donación Particular'".
    // Root cause: each `.ot-saldo-subrow--compare` was its own grid container
    // with `auto`-sized prior/current/delta columns → variable text widths
    // across rows shifted the `1fr` bars column. Fix exposes panel-level CSS
    // custom props (`--saldo-col-prior` / `--saldo-col-current` /
    // `--saldo-col-delta`) so every row uses identical column widths.
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('saldo-subcategories-toggle-income'));
    await waitFor(() => {
      expect(
        screen.getByTestId('saldo-subcategories-toggle-income').getAttribute('aria-pressed'),
      ).toBe('true');
    });

    // The panel-rows wrapper carries the shared column widths. Both subrows
    // under cat-a inherit them, so their grid templates collapse to the SAME
    // computed column widths and the bars column anchors at the same x.
    const incomePanel = screen.getByTestId('saldo-panel-income');
    const rowsWrapper = incomePanel.querySelector(
      '.ot-saldo-panel__rows--compare',
    ) as HTMLElement | null;
    expect(rowsWrapper).not.toBeNull();
    const colPrior = rowsWrapper!.style.getPropertyValue('--saldo-col-prior');
    const colCurrent = rowsWrapper!.style.getPropertyValue('--saldo-col-current');
    const colDelta = rowsWrapper!.style.getPropertyValue('--saldo-col-delta');
    expect(colPrior).toMatch(/^\d+ch$/);
    expect(colCurrent).toMatch(/^\d+ch$/);
    expect(colDelta).toMatch(/^\d+ch$/);

    // The widest formatted value in the income panel under cat-a is "8.000 €"
    // (parent current) and "6.000 €" (parent prior) — both 7 chars. The fix
    // adds +1ch breathing room, so prior/current widths must be ≥ 8ch.
    const num = (s: string): number => Number.parseInt(s.replace('ch', ''), 10);
    expect(num(colPrior)).toBeGreaterThanOrEqual(8);
    expect(num(colCurrent)).toBeGreaterThanOrEqual(8);

    // Two subrows with very different values share the wrapper → both their
    // bar pcts scale to the SAME panel denominator (panelMaxAbs), so the
    // larger-value subrow gets a strictly larger pct. Combined with identical
    // grid columns above, this is what visually aligns the two-bar groups.
    const sociosBar = screen
      .getByTestId('saldo-subrow-income-cat-a-sub-socios')
      .querySelector('.ot-saldo-subrow__bar-fill--current') as HTMLElement;
    const eventosBar = screen
      .getByTestId('saldo-subrow-income-cat-a-sub-eventos')
      .querySelector('.ot-saldo-subrow__bar-fill--current') as HTMLElement;
    const pct = (el: HTMLElement): number => Number.parseFloat(el.style.width.replace('%', ''));
    // Socios current = 4000, Eventos current = 1000 → socios pct must be ~4×.
    expect(pct(sociosBar)).toBeGreaterThan(pct(eventosBar) * 3);
  });

  it('renders the inline toggle pill with the --inline modifier class (amendment §F1)', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponseWithSubs());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-subcategories-toggle-income')).toBeDefined();
    });
    expect(screen.getByTestId('saldo-subcategories-toggle-income').className).toMatch(
      /ot-saldo-toggle-subcategories--inline/,
    );
  });

  // -------------------------------------------------------------------------
  // Issue #78 F3 visual fix — bucket panels by intrinsic category kind, not by
  // the period's net sign. Sign-reversed rows render with a "+" / "−" prefix.
  // -------------------------------------------------------------------------

  it('places a refund-heavy expense category in the EXPENSE panel with "+" prefixed net', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: `${CURRENT_YEAR}-01-01`,
          end: `${CURRENT_YEAR}-12-31`,
          totalIncome: 600,
          totalExpense: 500,
          netByCategory: [
            // Refund-heavy expense category: refunds (income=600) outweigh
            // expenses (expense=500) → net=+100 but kind='expense' pins it to
            // the expense panel and the renderer must show "+€100".
            {
              categoryId: 'cat-refund',
              categoryName: 'Reembolsos Oficina',
              income: 600,
              expense: 500,
              kind: 'expense',
            },
          ],
          isPartial: false,
          daysElapsed: 365,
          daysInPeriod: 365,
          currentProjectedTotal: null,
        },
        priorPeriod: {
          start: `${PRIOR_YEAR}-01-01`,
          end: `${PRIOR_YEAR}-12-31`,
          totalIncome: 0,
          totalExpense: 200,
          netByCategory: [
            {
              categoryId: 'cat-refund',
              categoryName: 'Reembolsos Oficina',
              income: 0,
              expense: 200,
              kind: 'expense',
            },
          ],
        },
      }),
    );
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-expense-cat-refund')).toBeDefined();
    });
    const incomePanel = screen.getByTestId('saldo-panel-income');
    const expensePanel = screen.getByTestId('saldo-panel-expense');
    // Bucketed by kind: present on expense side, absent from income side even
    // though gross income (600) > 0.
    expect(within(expensePanel).getByText('Reembolsos Oficina')).toBeDefined();
    expect(within(incomePanel).queryByText('Reembolsos Oficina')).toBeNull();
    // Sign-reversed: net=+100 on the expense panel renders with a leading "+".
    const value = screen.getByTestId('saldo-row-expense-cat-refund-current-value');
    expect(value.textContent ?? '').toMatch(/^\+/);
    expect(value.textContent ?? '').toMatch(/100/);
  });

  it('places a negative-net income category in the INCOME panel with "−" prefixed net', async () => {
    vi.mocked(getSaldoComparison).mockResolvedValue(
      makeResponse({
        currentPeriod: {
          start: `${CURRENT_YEAR}-01-01`,
          end: `${CURRENT_YEAR}-12-31`,
          totalIncome: 200,
          totalExpense: 300,
          netByCategory: [
            // Reversed-deposit income category: chargebacks (expense=300)
            // outweigh deposits (income=200) → net=−100 but kind='income'
            // keeps it on the income panel with "−€100".
            {
              categoryId: 'cat-deposits',
              categoryName: 'Donaciones (revertidas)',
              income: 200,
              expense: 300,
              kind: 'income',
            },
          ],
          isPartial: false,
          daysElapsed: 365,
          daysInPeriod: 365,
          currentProjectedTotal: null,
        },
        priorPeriod: {
          start: `${PRIOR_YEAR}-01-01`,
          end: `${PRIOR_YEAR}-12-31`,
          totalIncome: 500,
          totalExpense: 0,
          netByCategory: [
            {
              categoryId: 'cat-deposits',
              categoryName: 'Donaciones (revertidas)',
              income: 500,
              expense: 0,
              kind: 'income',
            },
          ],
        },
      }),
    );
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-income-cat-deposits')).toBeDefined();
    });
    const incomePanel = screen.getByTestId('saldo-panel-income');
    const expensePanel = screen.getByTestId('saldo-panel-expense');
    expect(within(incomePanel).getByText('Donaciones (revertidas)')).toBeDefined();
    expect(within(expensePanel).queryByText('Donaciones (revertidas)')).toBeNull();
    const value = screen.getByTestId('saldo-row-income-cat-deposits-current-value');
    // Minus sign is U+2212 to match typographic convention used in the helper.
    expect(value.textContent ?? '').toMatch(/^\u2212/);
    expect(value.textContent ?? '').toMatch(/100/);
  });

  it('falls back to net-sign bucketing when category kind is null (legacy fixtures)', async () => {
    // Legacy makeResponse() omits `kind` on every category; cat-c (Eventos)
    // has BOTH income=2000 and expense=1000, so under the legacy net-sign
    // fallback it must still appear in BOTH panels — and without any "+/−"
    // sign prefix on either side.
    vi.mocked(getSaldoComparison).mockResolvedValue(makeResponse());
    renderWithI18n();
    await waitFor(() => {
      expect(screen.getByTestId('saldo-row-income-cat-c')).toBeDefined();
    });
    expect(screen.getByTestId('saldo-row-expense-cat-c')).toBeDefined();
    const incomeValue = screen.getByTestId('saldo-row-income-cat-c-current-value');
    const expenseValue = screen.getByTestId('saldo-row-expense-cat-c-current-value');
    // Legacy fallback keeps the gross magnitude with no sign prefix.
    expect(incomeValue.textContent ?? '').not.toMatch(/^[+\u2212]/);
    expect(expenseValue.textContent ?? '').not.toMatch(/^[+\u2212]/);
    expect(incomeValue.textContent ?? '').toMatch(/2[.,]000/);
    expect(expenseValue.textContent ?? '').toMatch(/1[.,]000/);
  });
});
