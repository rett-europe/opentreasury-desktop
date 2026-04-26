import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ChevronDown, ChevronUp, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { getSaldoComparison } from '../../services/saldoApi.js';
import type {
  SaldoCategoryNet,
  SaldoComparisonResponse,
} from '../../../shared/ipc-contracts/saldo.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import './SaldoScreen.css';

/**
 * SaldoScreen — per-category LY-vs-CY redesign.
 *
 * Spec: `.squad/decisions/inbox/niobe-saldo-redesign-spec.md`.
 * Sizing: `.squad/decisions/inbox/mouse-saldo-chart-sizing.md`.
 *
 * - Two modes: `compare` (default, two year pickers) and `single` (one year).
 * - Per-category bars (top-8 + Otras), color = type, shade = year (CY solid /
 *   LY 60% opacity), income left of a divider, expense right.
 * - KPI strip: 3 cards. Deltas only in compare mode.
 * - No projection UI anywhere. The Año/Trim/Mes period selector is removed.
 */

const VIEW_KEY = 'saldo.view.v2';

type ViewMode = 'compare' | 'single';
type ViewState = {
  mode: ViewMode;
  currentYear: number;
  priorYear?: number | undefined;
};

type YearData = {
  income: number;
  expense: number;
  netByCategory: ReadonlyArray<SaldoCategoryNet>;
  monthlyIncome: ReadonlyArray<number>;
  monthlyExpense: ReadonlyArray<number>;
};

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; current: YearData; prior?: YearData | undefined }
  | { kind: 'error'; message: string };

function resolveLocale(lng: string): string {
  return lng.startsWith('es') ? 'es-ES' : 'en-US';
}

function isoStartOfYear(year: number): string {
  return `${year}-01-01`;
}

function clampYear(year: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, year));
}

function loadView(maxYear: number, minYear: number): ViewState {
  const fallback: ViewState = {
    mode: 'compare',
    currentYear: maxYear,
    priorYear: maxYear - 1 >= minYear ? maxYear - 1 : maxYear,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    const mode: ViewMode = parsed.mode === 'single' ? 'single' : 'compare';
    const currentYear = clampYear(
      typeof parsed.currentYear === 'number' ? parsed.currentYear : maxYear,
      minYear,
      maxYear,
    );
    let priorYear: number | undefined;
    if (mode === 'compare') {
      const py = typeof parsed.priorYear === 'number' ? parsed.priorYear : currentYear - 1;
      priorYear = clampYear(py, minYear, Math.max(minYear, currentYear - 1));
    }
    return { mode, currentYear, priorYear };
  } catch {
    return fallback;
  }
}

function saveView(view: ViewState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // best-effort persistence; ignore quota / privacy-mode failures.
  }
}

function yearDataFromResponseCurrent(r: SaldoComparisonResponse): YearData {
  return {
    income: r.currentPeriod.totalIncome,
    expense: r.currentPeriod.totalExpense,
    netByCategory: r.currentPeriod.netByCategory,
    monthlyIncome: r.monthlyIncome,
    monthlyExpense: r.monthlyExpense,
  };
}

function yearDataFromResponsePrior(r: SaldoComparisonResponse): YearData {
  return {
    income: r.priorPeriod.totalIncome,
    expense: r.priorPeriod.totalExpense,
    netByCategory: r.priorPeriod.netByCategory,
    // The prior-year slot is only used by the panels / KPI strip (income +
    // expense totals + netByCategory). The monthly chart only renders the
    // currentYear, so zero-fill here — these arrays are never read.
    monthlyIncome: ZERO_12,
    monthlyExpense: ZERO_12,
  };
}

const ZERO_12: ReadonlyArray<number> = Object.freeze(Array.from({ length: 12 }, () => 0));

export function SaldoScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = resolveLocale(i18n.language);

  // Available year range: until a dedicated IPC exists, expose the last 6
  // calendar years. Storage values are clamped to this range on load.
  const maxYear = new Date().getFullYear();
  const minYear = maxYear - 5;
  const availableYears = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) out.push(y);
    return out;
  }, [maxYear, minYear]);

  const [view, setView] = useState<ViewState>(() => loadView(maxYear, minYear));
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  // WI-B (#67): subcategory drill-down toggle. Local-only state, default OFF
  // per UX-004a §5; resets on screen unmount (no persistence in v1).
  const [showSubcategories, setShowSubcategories] = useState(false);

  useEffect(() => {
    saveView(view);
  }, [view]);

  const fetchData = useCallback(async (v: ViewState): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      // Optimisation: a single fetch for `currentYear` already returns the
      // adjacent prior year. Otherwise (single mode, or compare with a
      // non-adjacent prior year) we issue separate fetches.
      const needSecondFetch =
        v.mode === 'compare' && v.priorYear !== undefined && v.priorYear !== v.currentYear - 1;

      const fetchYear = (year: number): Promise<SaldoComparisonResponse> =>
        getSaldoComparison({ period: 'ano', anchor: isoStartOfYear(year) });

      const cur = await fetchYear(v.currentYear);
      const current = yearDataFromResponseCurrent(cur);
      let prior: YearData | undefined;
      if (v.mode === 'compare' && v.priorYear !== undefined) {
        if (needSecondFetch) {
          const pri = await fetchYear(v.priorYear);
          prior = yearDataFromResponseCurrent(pri);
        } else {
          prior = yearDataFromResponsePrior(cur);
        }
      }
      setState({ kind: 'loaded', current, prior });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void fetchData(view);
  }, [view, fetchData]);

  const handleRetry = useCallback((): void => {
    void fetchData(view);
  }, [view, fetchData]);

  const onModeChange = useCallback(
    (mode: ViewMode): void => {
      setView((prev) => {
        if (prev.mode === mode) return prev;
        if (mode === 'compare') {
          return {
            mode,
            currentYear: prev.currentYear,
            priorYear: Math.max(minYear, prev.currentYear - 1),
          };
        }
        return { mode, currentYear: prev.currentYear };
      });
    },
    [minYear],
  );

  const onCurrentYearChange = useCallback(
    (y: number): void => {
      setView((prev) => {
        const next: ViewState = { ...prev, currentYear: y };
        if (prev.mode === 'compare') {
          const py = prev.priorYear ?? y - 1;
          // Year-anterior must be strictly less than current.
          next.priorYear = py >= y ? Math.max(minYear, y - 1) : py;
        }
        return next;
      });
    },
    [minYear],
  );

  const onPriorYearChange = useCallback(
    (y: number): void => {
      setView((prev) => {
        if (prev.mode !== 'compare') return prev;
        const clamped = y >= prev.currentYear ? prev.currentYear - 1 : y;
        return { ...prev, priorYear: Math.max(minYear, clamped) };
      });
    },
    [minYear],
  );

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('saldo.title')}</h1>
          <p className="ot-page-header__subtitle">{t('saldo.subtitle')}</p>
        </div>
      </header>

      <div className="ot-saldo-controls">
        <ModeSelector mode={view.mode} onChange={onModeChange} />
        <YearPickers
          mode={view.mode}
          currentYear={view.currentYear}
          priorYear={view.priorYear}
          available={availableYears}
          onCurrentChange={onCurrentYearChange}
          onPriorChange={onPriorYearChange}
        />
      </div>

      {state.kind === 'loading' ? (
        <div className="ot-skeleton" role="status" style={{ minHeight: 200 }}>
          {t('saldo.states.loading')}
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <EmptyState
          title={t('saldo.states.error.title')}
          body={t('saldo.states.error.body')}
          actions={
            <Button variant="primary" onClick={handleRetry}>
              {t('saldo.states.error.retry')}
            </Button>
          }
        />
      ) : null}

      {state.kind === 'loaded' ? (
        <SaldoLoadedView
          view={view}
          current={state.current}
          prior={state.prior}
          locale={locale}
          showSubcategories={showSubcategories}
          onShowSubcategoriesChange={setShowSubcategories}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcategory drill-down toggle (UX-004a §4, §7).
// ---------------------------------------------------------------------------

type SubcategoryToggleProps = {
  readonly on: boolean;
  readonly onChange: (next: boolean) => void;
  /**
   * Per amendment §2.2, the toggle now renders **inside each panel** with a
   * shared boolean state. Callers must provide a panel kind so the rendered
   * pill gets a unique testid (`saldo-subcategories-toggle-${kind}`) and the
   * `--inline` modifier wired up by Mouse's CSS recipe.
   */
  readonly kind: 'income' | 'expense';
};

function SubcategoryToggle({ on, onChange, kind }: SubcategoryToggleProps): JSX.Element {
  const { t } = useTranslation('common');
  const ariaLabel = on
    ? t('saldo.subcategories.toggleAriaOpen')
    : t('saldo.subcategories.toggleAriaClosed');
  return (
    <button
      type="button"
      className="ot-saldo-toggle-subcategories ot-saldo-toggle-subcategories--inline"
      aria-pressed={on}
      aria-label={ariaLabel}
      data-testid={`saldo-subcategories-toggle-${kind}`}
      onClick={() => onChange(!on)}
    >
      <span className="ot-saldo-toggle-subcategories__label">
        {t('saldo.subcategories.toggle')}
      </span>
      <span className="ot-saldo-toggle-subcategories__icon" aria-hidden="true">
        {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mode segmented control + year pickers.
// ---------------------------------------------------------------------------

type ModeSelectorProps = {
  readonly mode: ViewMode;
  readonly onChange: (m: ViewMode) => void;
};

function ModeSelector({ mode, onChange }: ModeSelectorProps): JSX.Element {
  const { t } = useTranslation('common');
  const opts: ReadonlyArray<{ value: ViewMode; key: string }> = [
    { value: 'compare', key: 'saldo.mode.compare' },
    { value: 'single', key: 'saldo.mode.single' },
  ];
  return (
    <div
      className="ot-saldo-mode"
      role="radiogroup"
      aria-label={t('saldo.mode.label')}
      data-testid="saldo-mode-selector"
    >
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={
              active ? 'ot-saldo-mode__btn ot-saldo-mode__btn--active' : 'ot-saldo-mode__btn'
            }
            onClick={() => onChange(o.value)}
            data-testid={`saldo-mode-${o.value}`}
          >
            {t(o.key)}
          </button>
        );
      })}
    </div>
  );
}

type YearPickersProps = {
  readonly mode: ViewMode;
  readonly currentYear: number;
  readonly priorYear?: number | undefined;
  readonly available: ReadonlyArray<number>;
  readonly onCurrentChange: (y: number) => void;
  readonly onPriorChange: (y: number) => void;
};

function YearPickers(props: YearPickersProps): JSX.Element {
  const { t } = useTranslation('common');
  const { mode, currentYear, priorYear, available, onCurrentChange, onPriorChange } = props;
  const compareNoteId = 'saldo-compare-note';

  if (mode === 'single') {
    return (
      <div className="ot-saldo-year-picker">
        <label htmlFor="saldo-year-current">{t('saldo.year.singleLabel')}</label>
        <select
          id="saldo-year-current"
          value={currentYear}
          onChange={(e) => onCurrentChange(Number.parseInt(e.target.value, 10))}
          data-testid="saldo-year-current"
        >
          {available.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const priorOptions = available.filter((y) => y < currentYear);
  return (
    <>
      <div className="ot-saldo-year-picker">
        <label htmlFor="saldo-year-current">{t('saldo.year.currentLabel')}</label>
        <select
          id="saldo-year-current"
          value={currentYear}
          aria-describedby={compareNoteId}
          onChange={(e) => onCurrentChange(Number.parseInt(e.target.value, 10))}
          data-testid="saldo-year-current"
        >
          {available.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="ot-saldo-year-picker">
        <label htmlFor="saldo-year-prior">{t('saldo.year.priorLabel')}</label>
        <select
          id="saldo-year-prior"
          value={priorYear ?? currentYear - 1}
          aria-describedby={compareNoteId}
          onChange={(e) => onPriorChange(Number.parseInt(e.target.value, 10))}
          data-testid="saldo-year-prior"
          disabled={priorOptions.length === 0}
        >
          {priorOptions.length === 0 ? (
            <option value={currentYear - 1}>{currentYear - 1}</option>
          ) : (
            priorOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))
          )}
        </select>
      </div>
      <span id={compareNoteId} className="ot-saldo-year-picker__compare-note">
        {t('saldo.year.comparingNote', {
          currentYear,
          priorYear: priorYear ?? currentYear - 1,
        })}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Loaded view.
// ---------------------------------------------------------------------------

type LoadedProps = {
  readonly view: ViewState;
  readonly current: YearData;
  readonly prior?: YearData | undefined;
  readonly locale: string;
  readonly showSubcategories: boolean;
  readonly onShowSubcategoriesChange: (next: boolean) => void;
};

function SaldoLoadedView({
  view,
  current,
  prior,
  locale,
  showSubcategories,
  onShowSubcategoriesChange,
}: LoadedProps): JSX.Element {
  const { t } = useTranslation('common');
  const isEmpty = current.income === 0 && current.expense === 0;

  // a11y announce: count of unique categories with ≥2 distinct subcategories.
  const expandedCount = useMemo(() => {
    if (!showSubcategories) return 0;
    let n = 0;
    for (const c of current.netByCategory) {
      const subs = c.subcategories ?? [];
      // Count subcategories with non-zero contribution in either kind.
      const meaningful = subs.filter((s) => s.income > 0 || s.expense > 0).length;
      if (meaningful >= 2) n += 1;
    }
    return n;
  }, [showSubcategories, current.netByCategory]);

  const announce = showSubcategories
    ? t('saldo.subcategories.expandedAnnounce', { count: expandedCount })
    : t('saldo.subcategories.collapsedAnnounce');

  return (
    <>
      <div
        className="ot-saldo-subcategories-announce"
        role="status"
        aria-live="polite"
        data-testid="saldo-subcategories-announce"
      >
        {announce}
      </div>
      <KpiStrip view={view} current={current} prior={prior} locale={locale} />
      <MonthlyChart view={view} current={current} locale={locale} />
      {isEmpty ? null : (
        <CategoryPanels
          view={view}
          current={current}
          prior={prior}
          locale={locale}
          showSubcategories={showSubcategories}
          onShowSubcategoriesChange={onShowSubcategoriesChange}
        />
      )}
      {isEmpty ? (
        <EmptyState
          title={t('saldo.states.emptyBoth.title')}
          body={t('saldo.states.emptyBoth.body')}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// KPI strip.
// ---------------------------------------------------------------------------

type KpiStripProps = {
  readonly view: ViewState;
  readonly current: YearData;
  readonly prior?: YearData | undefined;
  readonly locale: string;
};

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return (cur - prev) / prev;
}

function classifyDelta(delta: number | null): 'up' | 'down' | 'flat' | 'noPrior' {
  if (delta === null) return 'noPrior';
  if (Math.abs(delta) < 0.03) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function formatPct(delta: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(delta);
}

// Issue #78 — explicit sign prefix for category/subcategory rows whose signed
// net opposes the panel's intrinsic kind (refund-heavy expense → "+",
// negative-net income → "−"). Returns '' when not reversed so the existing
// magnitude-only label is preserved for the common case.
function reversedSignPrefix(reversed: boolean, kind: 'income' | 'expense'): string {
  if (!reversed) return '';
  return kind === 'expense' ? '+' : '\u2212';
}

function KpiStrip({ view, current, prior, locale }: KpiStripProps): JSX.Element {
  const { t } = useTranslation('common');
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');

  const curIncome = current.income;
  const curExpense = current.expense;
  const curNet = curIncome - curExpense;

  const compareMode = view.mode === 'compare' && prior !== undefined;
  const priorYear = view.priorYear;

  const incomeDelta = compareMode ? pctDelta(curIncome, prior!.income) : null;
  const expenseDelta = compareMode ? pctDelta(curExpense, prior!.expense) : null;
  const netDelta = compareMode ? pctDelta(curNet, prior!.income - prior!.expense) : null;

  const incomeCategoryCount = current.netByCategory.filter((c) => c.income > 0).length;
  const expenseCategoryCount = current.netByCategory.filter((c) => c.expense > 0).length;

  const incomeSublabel = compareMode
    ? t('saldo.kpi.sublabel.priorOnly', { priorYear, priorValue: fmt(prior!.income) })
    : t('saldo.kpi.sublabel.singleIncomeCount', { count: incomeCategoryCount });
  const expenseSublabel = compareMode
    ? t('saldo.kpi.sublabel.priorOnly', { priorYear, priorValue: fmt(prior!.expense) })
    : t('saldo.kpi.sublabel.singleExpenseCount', { count: expenseCategoryCount });
  const netSublabel = compareMode
    ? t('saldo.kpi.sublabel.priorOnly', {
        priorYear,
        priorValue: fmt(prior!.income - prior!.expense),
      })
    : t('saldo.kpi.sublabel.singleYear', { year: view.currentYear });

  return (
    <div className="ot-kpi-strip" role="status" aria-live="polite">
      <KpiCard
        testId="saldo-kpi-income"
        modifier="income"
        icon={<TrendingUp size={20} />}
        label={t('saldo.kpi.income.labelTotal')}
        value={fmt(curIncome)}
        sublabel={incomeSublabel}
        delta={incomeDelta}
        locale={locale}
      />
      <KpiCard
        testId="saldo-kpi-expense"
        modifier="expense"
        icon={<TrendingDown size={20} />}
        label={t('saldo.kpi.expense.labelTotal')}
        value={fmt(curExpense)}
        sublabel={expenseSublabel}
        delta={expenseDelta}
        locale={locale}
      />
      <KpiCard
        testId="saldo-kpi-net"
        modifier="net"
        icon={<Calculator size={20} />}
        label={t('saldo.kpi.net.labelTotal')}
        value={fmt(curNet)}
        sublabel={netSublabel}
        delta={netDelta}
        locale={locale}
      />
    </div>
  );
}

type KpiCardProps = {
  readonly testId: string;
  readonly modifier: 'income' | 'expense' | 'net';
  readonly icon: JSX.Element;
  readonly label: string;
  readonly value: string;
  readonly sublabel: string;
  readonly delta: number | null;
  readonly locale: string;
};

function KpiCard({
  testId,
  modifier,
  icon,
  label,
  value,
  sublabel,
  delta,
  locale,
}: KpiCardProps): JSX.Element {
  const kind = classifyDelta(delta);
  const showDelta = delta !== null && kind !== 'noPrior';
  return (
    <div className={`ot-kpi ot-kpi--${modifier}`} data-testid={testId}>
      <div className="ot-kpi__icon">{icon}</div>
      <div>
        <div className="ot-kpi__label">{label}</div>
        <div className="ot-kpi__value-row">
          <div className="ot-kpi__value">{value}</div>
          {showDelta ? (
            <div
              className={`ot-saldo-row__delta ot-saldo-row__delta--${kind}`}
              data-testid={`${testId}-delta`}
            >
              {kind === 'up' ? '↑ ' : kind === 'down' ? '↓ ' : ''}
              {formatPct(delta as number, locale)}
            </div>
          ) : null}
        </div>
        <div className="ot-kpi__sublabel">{sublabel}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly income-vs-expense chart (always current year).
//
// Pedro locked the chart scope to absolute monthly values for the selected
// `currentYear` — regardless of mode. YoY comparison lives in the per-category
// panels. 12 groups, 2 bars per group (income + expense); data comes straight
// from the `monthlyIncome` / `monthlyExpense` arrays on the IPC response.
// ---------------------------------------------------------------------------

function keyFor(id: string | null): string {
  return id ?? '__uncategorized__';
}

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

type MonthlyChartProps = {
  readonly view: ViewState;
  readonly current: YearData;
  readonly locale: string;
};

function MonthlyChart({ view, current, locale }: MonthlyChartProps): JSX.Element {
  const { t } = useTranslation('common');
  const year = view.currentYear;

  const series = MONTH_KEYS.map((key, i) => ({
    label: t(`saldo.chart.months.${key}`),
    values: [current.monthlyIncome[i] ?? 0, current.monthlyExpense[i] ?? 0],
    barClassNames: [
      'ot-grouped-bar-chart__bar--income-solo',
      'ot-grouped-bar-chart__bar--expense-solo',
    ],
  }));

  const legend = [
    {
      label: t('saldo.chart.legend.income'),
      className: 'ot-grouped-bar-chart__swatch--income-solo',
    },
    {
      label: t('saldo.chart.legend.expense'),
      className: 'ot-grouped-bar-chart__swatch--expense-solo',
    },
  ];

  const isEmpty = series.every((s) => s.values.every((v) => v === 0));

  return (
    <section className="ot-saldo-chart" aria-labelledby="saldo-chart-title">
      <div className="ot-saldo-chart__header">
        <div>
          <h2 className="ot-saldo-chart__title" id="saldo-chart-title">
            {t('saldo.chart.monthlyTitle', { year })}
          </h2>
          <p className="ot-saldo-chart__subtitle">{t('saldo.chart.monthlySubtitle')}</p>
        </div>
      </div>
      <GroupedBarChart
        series={series}
        legend={legend}
        locale={locale}
        ariaLabel={t('saldo.chart.monthlyAriaLabel', { year })}
        dataTableCaption={t('saldo.chart.dataTableCaption')}
        emptyLabel={isEmpty ? t('saldo.chart.emptyYear') : undefined}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Category panels (income + expense).
// ---------------------------------------------------------------------------

type CategoryPanelsProps = {
  readonly view: ViewState;
  readonly current: YearData;
  readonly prior?: YearData | undefined;
  readonly locale: string;
  readonly showSubcategories: boolean;
  readonly onShowSubcategoriesChange: (next: boolean) => void;
};

function CategoryPanels({
  view,
  current,
  prior,
  locale,
  showSubcategories,
  onShowSubcategoriesChange,
}: CategoryPanelsProps): JSX.Element {
  const { t } = useTranslation('common');
  const compareMode = view.mode === 'compare' && prior !== undefined;
  const incomeRows = useMemo(
    () =>
      buildPanelRows(
        current.netByCategory,
        compareMode ? prior!.netByCategory : undefined,
        'income',
      ),
    [current, prior, compareMode],
  );
  const expenseRows = useMemo(
    () =>
      buildPanelRows(
        current.netByCategory,
        compareMode ? prior!.netByCategory : undefined,
        'expense',
      ),
    [current, prior, compareMode],
  );

  return (
    <div className="ot-saldo-panels">
      <CategoryPanel
        kind="income"
        title={t('saldo.panel.income.title')}
        subtitle={t(compareMode ? 'saldo.panel.subtitle' : 'saldo.panel.subtitleSingle')}
        totalLabel={t('saldo.panel.income.totalLabel', { year: view.currentYear })}
        totalValue={current.income}
        rows={incomeRows}
        view={view}
        locale={locale}
        showSubcategories={showSubcategories}
        onShowSubcategoriesChange={onShowSubcategoriesChange}
      />
      <CategoryPanel
        kind="expense"
        title={t('saldo.panel.expense.title')}
        subtitle={t(compareMode ? 'saldo.panel.subtitle' : 'saldo.panel.subtitleSingle')}
        totalLabel={t('saldo.panel.expense.totalLabel', { year: view.currentYear })}
        totalValue={current.expense}
        rows={expenseRows}
        view={view}
        locale={locale}
        showSubcategories={showSubcategories}
        onShowSubcategoriesChange={onShowSubcategoriesChange}
      />
    </div>
  );
}

type SubPanelRow = {
  readonly id: string;
  readonly name: string | null;
  readonly prior: number;
  readonly current: number;
  readonly delta: number | null;
  readonly isOtras: boolean;
  readonly otrasNames: ReadonlyArray<string>;
  readonly otrasCount: number;
  // Issue #78 — sign-reversed indicators: true when the row was bucketed by
  // intrinsic kind but its signed net (income − expense) opposes the panel's
  // expected sign (e.g. refund-heavy expense category with positive net).
  // Renderer prepends an explicit "+" / "−" prefix on the value label.
  readonly currentReversed: boolean;
  readonly priorReversed: boolean;
};

type PanelRow = {
  readonly id: string;
  readonly name: string | null;
  readonly prior: number;
  readonly current: number;
  readonly delta: number | null;
  readonly subRows: ReadonlyArray<SubPanelRow>;
  // Original record count of distinct subcategories with non-zero contribution.
  // Used for the E1/E2 "render parent only" rule (UX-004a §4.3).
  readonly meaningfulSubcount: number;
  // Issue #78 — see SubPanelRow for semantics.
  readonly currentReversed: boolean;
  readonly priorReversed: boolean;
};

// Issue #78 — bucketing helper. A record is placed on `side` if its intrinsic
// `kind` matches `side`; otherwise (legacy / null kind) we fall back to the
// pre-#78 net-sign behaviour (gross income/expense > 0). When kind matches,
// the magnitude is |income − expense| and `reversed` flags whether the signed
// net opposes the panel's expected sign — refund-heavy expense (net > 0) or
// negative-net income (net < 0).
type Bucketed = { value: number; reversed: boolean };

function bucketValue(
  r: { income: number; expense: number; kind?: 'income' | 'expense' | null | undefined },
  side: 'income' | 'expense',
): Bucketed | null {
  if (r.kind == null) {
    const pick = side === 'income' ? r.income : r.expense;
    if (pick <= 0) return null;
    return { value: pick, reversed: false };
  }
  if (r.kind !== side) return null;
  const net = r.income - r.expense;
  const value = Math.abs(net);
  if (value <= 0) return null;
  const reversed = side === 'income' ? net < 0 : net > 0;
  return { value, reversed };
}

const SUBCATEGORY_TOP_N = 5;

function subKeyFor(id: string | null): string {
  return id ?? '__uncategorized_sub__';
}

function buildSubcategoryRows(
  currentParent: SaldoCategoryNet | undefined,
  priorParent: SaldoCategoryNet | undefined,
  kind: 'income' | 'expense',
): { rows: SubPanelRow[]; meaningfulCount: number } {
  const cur = currentParent?.subcategories ?? [];
  const prev = priorParent?.subcategories ?? [];

  const map = new Map<
    string,
    { name: string | null; cur: number; prev: number; curRev: boolean; prevRev: boolean }
  >();
  for (const r of cur) {
    const b = bucketValue(r, kind);
    if (b === null) continue;
    map.set(subKeyFor(r.subcategoryId), {
      name: r.subcategoryName,
      cur: b.value,
      prev: 0,
      curRev: b.reversed,
      prevRev: false,
    });
  }
  for (const r of prev) {
    const b = bucketValue(r, kind);
    if (b === null) continue;
    const k = subKeyFor(r.subcategoryId);
    const existing = map.get(k);
    if (existing) {
      map.set(k, { ...existing, prev: b.value, prevRev: b.reversed });
    } else {
      map.set(k, {
        name: r.subcategoryName,
        cur: 0,
        prev: b.value,
        curRev: false,
        prevRev: b.reversed,
      });
    }
  }

  type Entry = {
    id: string;
    name: string | null;
    prior: number;
    current: number;
    curRev: boolean;
    prevRev: boolean;
  };
  const all: Entry[] = [];
  for (const [id, v] of map) {
    all.push({
      id,
      name: v.name,
      prior: v.prev,
      current: v.cur,
      curRev: v.curRev,
      prevRev: v.prevRev,
    });
  }
  all.sort((a, b) => {
    const byCur = Math.abs(b.current) - Math.abs(a.current);
    if (byCur !== 0) return byCur;
    return (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff');
  });

  const meaningfulCount = all.length;

  const toRow = (e: Entry): SubPanelRow => ({
    id: e.id,
    name: e.name,
    prior: e.prior,
    current: e.current,
    delta: e.prior > 0 ? (e.current - e.prior) / e.prior : null,
    isOtras: false,
    otrasNames: [],
    otrasCount: 0,
    currentReversed: e.curRev,
    priorReversed: e.prevRev,
  });

  if (all.length <= SUBCATEGORY_TOP_N) {
    return { rows: all.map(toRow), meaningfulCount };
  }

  const top = all.slice(0, SUBCATEGORY_TOP_N).map(toRow);
  const rest = all.slice(SUBCATEGORY_TOP_N);
  const restPrior = rest.reduce((s, r) => s + r.prior, 0);
  const restCurrent = rest.reduce((s, r) => s + r.current, 0);
  if (restPrior === 0 && restCurrent === 0) {
    return { rows: top, meaningfulCount };
  }
  const otrasNames = rest
    .map((r) => r.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
    .slice(0, 3);
  top.push({
    id: '__otras__',
    name: null,
    prior: restPrior,
    current: restCurrent,
    delta: restPrior > 0 ? (restCurrent - restPrior) / restPrior : null,
    isOtras: true,
    otrasNames,
    otrasCount: rest.length,
    // Otras is a rollup; sign-reversal isn't meaningful for the aggregate.
    currentReversed: false,
    priorReversed: false,
  });
  return { rows: top, meaningfulCount };
}

function buildPanelRows(
  current: ReadonlyArray<SaldoCategoryNet>,
  prior: ReadonlyArray<SaldoCategoryNet> | undefined,
  kind: 'income' | 'expense',
): PanelRow[] {
  const map = new Map<
    string,
    {
      name: string | null;
      cur: number;
      prev: number;
      curRev: boolean;
      prevRev: boolean;
      curRec?: SaldoCategoryNet;
      prevRec?: SaldoCategoryNet;
    }
  >();

  for (const r of current) {
    const b = bucketValue(r, kind);
    if (b === null) continue;
    map.set(keyFor(r.categoryId), {
      name: r.categoryName,
      cur: b.value,
      prev: 0,
      curRev: b.reversed,
      prevRev: false,
      curRec: r,
    });
  }
  for (const r of prior ?? []) {
    const b = bucketValue(r, kind);
    if (b === null) continue;
    const k = keyFor(r.categoryId);
    const existing = map.get(k);
    if (existing) {
      map.set(k, { ...existing, prev: b.value, prevRev: b.reversed, prevRec: r });
    } else {
      map.set(k, {
        name: r.categoryName,
        cur: 0,
        prev: b.value,
        curRev: false,
        prevRev: b.reversed,
        prevRec: r,
      });
    }
  }

  const rows: PanelRow[] = [];
  for (const [k, v] of map) {
    const delta = v.prev > 0 ? (v.cur - v.prev) / v.prev : null;
    const { rows: subRows, meaningfulCount } = buildSubcategoryRows(v.curRec, v.prevRec, kind);
    rows.push({
      id: k,
      name: v.name,
      prior: v.prev,
      current: v.cur,
      delta,
      subRows,
      meaningfulSubcount: meaningfulCount,
      currentReversed: v.curRev,
      priorReversed: v.prevRev,
    });
  }
  rows.sort((a, b) => {
    const byCur = Math.abs(b.current) - Math.abs(a.current);
    if (byCur !== 0) return byCur;
    return (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff');
  });
  return rows;
}

type CategoryPanelProps = {
  readonly kind: 'income' | 'expense';
  readonly title: string;
  readonly subtitle: string;
  readonly totalLabel: string;
  readonly totalValue: number;
  readonly rows: ReadonlyArray<PanelRow>;
  readonly view: ViewState;
  readonly locale: string;
  readonly showSubcategories: boolean;
  readonly onShowSubcategoriesChange: (next: boolean) => void;
};

function CategoryPanel({
  kind,
  title,
  subtitle,
  totalLabel,
  totalValue,
  rows,
  view,
  locale,
  showSubcategories,
  onShowSubcategoriesChange,
}: CategoryPanelProps): JSX.Element {
  const { t } = useTranslation('common');
  const compareMode = view.mode === 'compare' && view.priorYear !== undefined;
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');
  const totalForShare = rows.reduce((acc, r) => acc + r.current, 0);

  // E1/E2 (UX-004a §4.3): only render subrows when category has ≥2 subcategories
  // with meaningful (non-zero) data. Single-subcategory and zero-subcategory
  // categories render parent-only — no degenerate nested rows.
  const shouldRenderSubrows = (row: PanelRow): boolean =>
    showSubcategories && row.meaningfulSubcount >= 2 && row.subRows.length > 0;

  // Amendment §3.1: shared per-panel scale. Bars in a panel scale against a
  // single denominator computed from all visible rows AND visible subrows.
  // This restores cross-row alignment when the toggle is ON. Clamp to ≥1 to
  // avoid division-by-zero for empty panels (defensive — early-return below
  // handles the empty case visually).
  const panelMaxAbs = useMemo(() => {
    let maxAbs = 1;
    for (const row of rows) {
      maxAbs = Math.max(maxAbs, Math.abs(row.prior), Math.abs(row.current));
      if (shouldRenderSubrows(row)) {
        for (const sub of row.subRows) {
          maxAbs = Math.max(maxAbs, Math.abs(sub.prior), Math.abs(sub.current));
        }
      }
    }
    return maxAbs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, showSubcategories]);

  return (
    <section
      className={`ot-saldo-panel ot-saldo-panel--${kind}`}
      data-testid={`saldo-panel-${kind}`}
      aria-labelledby={`saldo-panel-${kind}-title`}
    >
      <header className="ot-saldo-panel__header">
        <div>
          <h2 className="ot-saldo-panel__title" id={`saldo-panel-${kind}-title`}>
            {title}
          </h2>
          <p className="ot-saldo-panel__subtitle">{subtitle}</p>
        </div>
        <div className="ot-saldo-panel__total">
          <span className="ot-saldo-panel__total-label">{totalLabel}</span>
          <span className="ot-saldo-panel__total-value">{fmt(totalValue)}</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="ot-saldo-panel__empty" role="status">
          {t('saldo.panel.empty')}
        </div>
      ) : compareMode ? (
        <>
          <div
            className="ot-saldo-panel__columns ot-saldo-panel__columns--compare"
            aria-hidden="true"
          >
            <span>{t('saldo.panel.columns.category')}</span>
            <span className="ot-saldo-panel__col--right">{view.priorYear}</span>
            <span />
            <span className="ot-saldo-panel__col--right">{view.currentYear}</span>
            <span className="ot-saldo-panel__col--right">Δ</span>
          </div>
          <SubcategoryToggle
            on={showSubcategories}
            onChange={onShowSubcategoriesChange}
            kind={kind}
          />
          <div className="ot-saldo-panel__rows">
            {rows.map((row) => (
              <div key={row.id} role="group">
                <CompareRow
                  row={row}
                  kind={kind}
                  priorYear={view.priorYear ?? view.currentYear - 1}
                  locale={locale}
                  panelMaxAbs={panelMaxAbs}
                  ariaExpanded={row.meaningfulSubcount >= 2 ? showSubcategories : undefined}
                />
                {shouldRenderSubrows(row)
                  ? row.subRows.map((sub) => (
                      <CompareSubRow
                        key={sub.id}
                        sub={sub}
                        parent={row}
                        kind={kind}
                        priorYear={view.priorYear ?? view.currentYear - 1}
                        locale={locale}
                        panelMaxAbs={panelMaxAbs}
                      />
                    ))
                  : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            className="ot-saldo-panel__columns ot-saldo-panel__columns--single"
            aria-hidden="true"
          >
            <span>{t('saldo.panel.columns.category')}</span>
            <span className="ot-saldo-panel__col--right">{t('saldo.panel.columns.amount')}</span>
            <span className="ot-saldo-panel__col--right">{t('saldo.panel.columns.share')}</span>
          </div>
          <SubcategoryToggle
            on={showSubcategories}
            onChange={onShowSubcategoriesChange}
            kind={kind}
          />
          <div className="ot-saldo-panel__rows">
            {rows.map((row) => (
              <div key={row.id} role="group">
                <SingleRow
                  row={row}
                  kind={kind}
                  totalForShare={totalForShare}
                  locale={locale}
                  ariaExpanded={row.meaningfulSubcount >= 2 ? showSubcategories : undefined}
                />
                {shouldRenderSubrows(row)
                  ? row.subRows.map((sub) => (
                      <SingleSubRow
                        key={sub.id}
                        sub={sub}
                        parent={row}
                        kind={kind}
                        totalForShare={totalForShare}
                        locale={locale}
                      />
                    ))
                  : null}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type CompareRowProps = {
  readonly row: PanelRow;
  readonly kind: 'income' | 'expense';
  readonly priorYear: number;
  readonly locale: string;
  readonly panelMaxAbs: number;
  readonly ariaExpanded?: boolean | undefined;
};

function CompareRow({
  row,
  kind,
  priorYear,
  locale,
  panelMaxAbs,
  ariaExpanded,
}: CompareRowProps): JSX.Element {
  const { t } = useTranslation('common');
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');
  // Amendment §3.1: scale against the panel-shared denominator instead of the
  // per-row max. `panelMaxAbs` is clamped to ≥1 by the caller.
  const priorPct = (Math.abs(row.prior) / panelMaxAbs) * 100;
  const currentPct = (Math.abs(row.current) / panelMaxAbs) * 100;
  const deltaKind = classifyDelta(row.delta);
  const deltaText =
    deltaKind === 'noPrior'
      ? '—'
      : deltaKind === 'flat'
        ? formatPct(0, locale)
        : formatPct(row.delta as number, locale);
  return (
    <div
      className="ot-saldo-row ot-saldo-row--compare"
      data-testid={`saldo-row-${kind}-${row.id}`}
      {...(ariaExpanded === undefined ? {} : { 'aria-expanded': ariaExpanded })}
    >
      <span className="ot-saldo-row__name">{row.name ?? t('saldo.panel.uncategorized')}</span>
      <span className="ot-saldo-row__prior" data-testid={`saldo-row-${kind}-${row.id}-prior-value`}>
        {reversedSignPrefix(row.priorReversed, kind)}
        {fmt(row.prior)}
      </span>
      <div
        className="ot-saldo-row__bars"
        role="img"
        aria-label={t('saldo.panel.row.barsAria', {
          priorYear,
          priorValue: fmt(row.prior),
          currentValue: fmt(row.current),
        })}
      >
        <div className="ot-saldo-row__bar-track">
          <div
            className="ot-saldo-row__bar-fill ot-saldo-row__bar-fill--prior"
            style={{ width: `${priorPct}%` }}
          />
        </div>
        <div className="ot-saldo-row__bar-track">
          <div
            className="ot-saldo-row__bar-fill ot-saldo-row__bar-fill--current"
            style={{ width: `${currentPct}%` }}
          />
        </div>
      </div>
      <span
        className="ot-saldo-row__current"
        data-testid={`saldo-row-${kind}-${row.id}-current-value`}
      >
        {reversedSignPrefix(row.currentReversed, kind)}
        {fmt(row.current)}
      </span>
      <span
        className={`ot-saldo-row__delta ot-saldo-row__delta--${deltaKind}`}
        data-testid={`saldo-row-${kind}-${row.id}-delta`}
      >
        {deltaKind === 'up' ? '↑ ' : deltaKind === 'down' ? '↓ ' : ''}
        {deltaText}
      </span>
      <span className="ot-saldo-row__delta-sublabel">
        {t('saldo.panel.row.vs', { year: priorYear })}
      </span>
    </div>
  );
}

type SingleRowProps = {
  readonly row: PanelRow;
  readonly kind: 'income' | 'expense';
  readonly totalForShare: number;
  readonly locale: string;
  readonly ariaExpanded?: boolean | undefined;
};

function SingleRow({
  row,
  kind,
  totalForShare,
  locale,
  ariaExpanded,
}: SingleRowProps): JSX.Element {
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');
  const share = totalForShare > 0 ? row.current / totalForShare : 0;
  return (
    <div
      className="ot-saldo-row ot-saldo-row--single"
      data-testid={`saldo-row-${kind}-${row.id}`}
      {...(ariaExpanded === undefined ? {} : { 'aria-expanded': ariaExpanded })}
    >
      <span className="ot-saldo-row__name">{row.name}</span>
      <span
        className="ot-saldo-row__current"
        data-testid={`saldo-row-${kind}-${row.id}-current-value`}
      >
        {reversedSignPrefix(row.currentReversed, kind)}
        {fmt(row.current)}
      </span>
      <span className="ot-saldo-row__delta">
        {new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(share)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcategory rows (UX-004a §4.1, §4.2). Indented half-height variants of the
// parent row, rendered when the global toggle is ON. Class names follow the
// `.ot-saldo-subrow--compare/--single` BEM modifier pattern (paired with the
// CSS recipes Mouse owns in globals.css).
// ---------------------------------------------------------------------------

type CompareSubRowProps = {
  readonly sub: SubPanelRow;
  readonly parent: PanelRow;
  readonly kind: 'income' | 'expense';
  readonly priorYear: number;
  readonly locale: string;
  readonly panelMaxAbs: number;
};

function CompareSubRow({
  sub,
  parent,
  kind,
  priorYear,
  locale,
  panelMaxAbs,
}: CompareSubRowProps): JSX.Element {
  const { t } = useTranslation('common');
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');
  // Amendment §3.1: shared per-panel scale. `panelMaxAbs` is clamped to ≥1.
  const priorPct = (Math.abs(sub.prior) / panelMaxAbs) * 100;
  const currentPct = (Math.abs(sub.current) / panelMaxAbs) * 100;
  const deltaKind = classifyDelta(sub.delta);
  const deltaText =
    deltaKind === 'noPrior'
      ? '—'
      : deltaKind === 'flat'
        ? formatPct(0, locale)
        : formatPct(sub.delta as number, locale);
  const subName = sub.isOtras
    ? t('saldo.subcategories.otras.label')
    : (sub.name ?? t('saldo.subcategories.uncategorized'));
  const parentName = parent.name ?? t('saldo.panel.uncategorized');
  const tooltip = sub.isOtras
    ? t('saldo.subcategories.otras.tooltip', {
        count: sub.otrasCount,
        names: sub.otrasNames.join(', '),
      })
    : undefined;

  const ariaLabel = t('saldo.subcategories.row.aria', {
    subcategoryName: subName,
    categoryName: parentName,
    current: fmt(sub.current),
    prior: fmt(sub.prior),
    delta: deltaText,
  });

  const nameClass = sub.isOtras
    ? 'ot-saldo-subrow__name ot-saldo-subrow__name--otras'
    : 'ot-saldo-subrow__name';

  return (
    <div
      className="ot-saldo-subrow ot-saldo-subrow--compare"
      role="row"
      aria-level={2}
      aria-label={ariaLabel}
      data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}`}
      {...(tooltip ? { title: tooltip } : {})}
    >
      <span className={nameClass}>{subName}</span>
      <span
        className="ot-saldo-subrow__prior"
        data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}-prior-value`}
      >
        {reversedSignPrefix(sub.priorReversed, kind)}
        {fmt(sub.prior)}
      </span>
      <div
        className="ot-saldo-subrow__bars"
        role="img"
        aria-label={t('saldo.panel.row.barsAria', {
          priorYear,
          priorValue: fmt(sub.prior),
          currentValue: fmt(sub.current),
        })}
      >
        <div className="ot-saldo-subrow__bar-track">
          <div
            className="ot-saldo-subrow__bar-fill ot-saldo-subrow__bar-fill--prior"
            style={
              {
                width: `${priorPct}%`,
                '--saldo-subrow-bar-pct': `${priorPct}%`,
              } as React.CSSProperties
            }
          />
        </div>
        <div className="ot-saldo-subrow__bar-track">
          <div
            className="ot-saldo-subrow__bar-fill ot-saldo-subrow__bar-fill--current"
            style={
              {
                width: `${currentPct}%`,
                '--saldo-subrow-bar-pct': `${currentPct}%`,
              } as React.CSSProperties
            }
          />
        </div>
      </div>
      <span
        className="ot-saldo-subrow__current"
        data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}-current-value`}
      >
        {reversedSignPrefix(sub.currentReversed, kind)}
        {fmt(sub.current)}
      </span>
      <span
        className={`ot-saldo-subrow__delta ot-saldo-subrow__delta--${deltaKind}`}
        data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}-delta`}
      >
        {deltaKind === 'up' ? '↑ ' : deltaKind === 'down' ? '↓ ' : ''}
        {deltaText}
      </span>
      <span className="ot-saldo-subrow__delta-sublabel">
        {t('saldo.panel.row.vs', { year: priorYear })}
      </span>
    </div>
  );
}

type SingleSubRowProps = {
  readonly sub: SubPanelRow;
  readonly parent: PanelRow;
  readonly kind: 'income' | 'expense';
  readonly totalForShare: number;
  readonly locale: string;
};

function SingleSubRow({
  sub,
  parent,
  kind,
  totalForShare,
  locale,
}: SingleSubRowProps): JSX.Element {
  const { t } = useTranslation('common');
  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');
  const share = totalForShare > 0 ? sub.current / totalForShare : 0;
  const subName = sub.isOtras
    ? t('saldo.subcategories.otras.label')
    : (sub.name ?? t('saldo.subcategories.uncategorized'));
  const parentName = parent.name ?? t('saldo.panel.uncategorized');
  const tooltip = sub.isOtras
    ? t('saldo.subcategories.otras.tooltip', {
        count: sub.otrasCount,
        names: sub.otrasNames.join(', '),
      })
    : undefined;

  const ariaLabel = t('saldo.subcategories.row.aria', {
    subcategoryName: subName,
    categoryName: parentName,
    current: fmt(sub.current),
    prior: fmt(sub.prior),
    delta: new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(share),
  });

  const nameClass = sub.isOtras
    ? 'ot-saldo-subrow__name ot-saldo-subrow__name--otras'
    : 'ot-saldo-subrow__name';

  return (
    <div
      className="ot-saldo-subrow ot-saldo-subrow--single"
      role="row"
      aria-level={2}
      aria-label={ariaLabel}
      data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}`}
      {...(tooltip ? { title: tooltip } : {})}
    >
      <span className={nameClass}>{subName}</span>
      <span
        className="ot-saldo-subrow__current"
        data-testid={`saldo-subrow-${kind}-${parent.id}-${sub.id}-current-value`}
      >
        {reversedSignPrefix(sub.currentReversed, kind)}
        {fmt(sub.current)}
      </span>
      <span className="ot-saldo-subrow__delta">
        {new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(share)}
      </span>
    </div>
  );
}
